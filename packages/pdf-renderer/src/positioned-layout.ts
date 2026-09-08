import type { InPageDocument, Story, TextStyle } from "@inpage/document-model";
import type { ShapedRun } from "@inpage/text-shaper";
import type { PdfBackend } from "./backend.js";
import { drawStyledStory } from "./styled-layout.js";

type Direction = "ltr" | "rtl";

export async function renderPositionedPage(
  document: InPageDocument,
  backend: PdfBackend,
  outputHeight: number,
  shape: (text: string, direction: Direction, style?: TextStyle) => ShapedRun,
): Promise<void> {
  const storyByReference = associateStoriesWithReferences(document);
  const imageByName = new Map(document.images.map((image) => [image.name.toLowerCase(), image]));

  for (const object of document.pageObjects) {
    const { xPoints: x, yPoints: top, widthPoints: width, heightPoints: height } = object.bounds;
    const bottom = outputHeight - top - height;

    if (object.kind === "image" && object.imageName) {
      const image = imageByName.get(object.imageName.toLowerCase());
      if (image && image.format !== "unknown") await backend.drawImage(image, x, bottom, width, height,0,object);
      continue;
    }
    if (object.kind === "line") {
      backend.drawLine(x, outputHeight - top, x + width, outputHeight - top - height);
      if (Math.abs(width) < 1 && x > 0) {
        const arrowY = outputHeight - top - height;
        backend.drawLine(x - 30, arrowY, x, arrowY);
        backend.drawLine(x - 30, arrowY, x - 22, arrowY + 7);
        backend.drawLine(x - 30, arrowY, x - 22, arrowY - 7);
      }
      continue;
    }
    if (object.kind === "graphic") {
      if (backend.drawGraphic) backend.drawGraphic(object,outputHeight);
      else backend.drawRectangle(x, bottom, width, height);
      continue;
    }
    if (object.kind !== "text" || object.storyReference === undefined) continue;
    if (backend.drawGraphic) backend.drawGraphic(object,outputHeight);
    else if (object.hasBorder) backend.drawRectangle(x, bottom, width, height);
    const story = storyByReference.get(object.storyReference);
    if (!story) continue;

    if (story.paragraphs.some(paragraph => paragraph.runs.some(run => run.style))) {
      drawStyledStory(story, object, backend, shape, outputHeight);
      continue;
    }

    drawStory(
      story,
      backend,
      shape,
      x,
      top,
      width,
      height,
      outputHeight,
      object.columnCount ?? 1,
      object.rotationDegrees ?? 0,
    );
  }
}

function associateStoriesWithReferences(document: InPageDocument): Map<number, Story> {
  const references = [...new Set(document.pageObjects
    .filter((object) => object.kind === "text" && object.storyReference !== undefined)
    .map((object) => object.storyReference!))].sort((left, right) => left - right);
  return new Map(references.map((reference, index) => [reference, document.stories[index]!]));
}

function drawStory(
  story: Story,
  backend: PdfBackend,
  shape: (text: string, direction: Direction) => ShapedRun,
  x: number,
  top: number,
  width: number,
  height: number,
  outputHeight: number,
  columns: number,
  rotationDegrees: number,
): void {
  const paragraphs = story.paragraphs
    .map((paragraph) => cleanFrameText(paragraph.runs.map((run) => run.text).join("")))
    .filter(Boolean);
  if (paragraphs.length === 0) return;
  const combined = paragraphs.join(" ");
  const direction = textDirection(combined);

  if (Math.abs(rotationDegrees) >= 45) {
    const fontSize = Math.max(6, Math.min(10, height * 0.8));
    const run = shape(combined, direction);
    backend.drawShapedRun(run, x, outputHeight - top, fontSize, rotationDegrees);
    return;
  }
  if (Math.abs(rotationDegrees) >= 1 && paragraphs.length === 1) {
    let fontSize = Math.min(48, height * 0.7);
    const run = shape(combined, direction);
    while (fontSize > 6 && backend.measureShapedRun(run, fontSize) > width) fontSize -= 0.5;
    const lineWidth = backend.measureShapedRun(run, fontSize);
    const drawX = direction === "rtl" ? x + width - lineWidth : x;
    backend.drawShapedRun(
      run,
      drawX,
      outputHeight - top - fontSize,
      fontSize,
      rotationDegrees,
    );
    return;
  }

  const gap = columns > 1 ? 9 : 0;
  const columnWidth = (width - gap * (columns - 1)) / columns;
  let chosenSize = 6;
  let chosenLines: string[] = [];
  let chosenLineHeight = 9;
  for (let fontSize = Math.min(36, Math.max(8, height * 0.55)); fontSize >= 6; fontSize -= 0.5) {
    const lines = paragraphs.flatMap((paragraph) =>
      wrap(paragraph, columnWidth, (text) => measureBidirectional(text, backend, shape, fontSize)),
    );
    const lineHeight = fontSize * 1.48;
    const capacity = Math.max(1, Math.floor(height / lineHeight)) * columns;
    if (lines.length <= capacity) {
      chosenSize = fontSize;
      chosenLines = lines;
      chosenLineHeight = lineHeight;
      break;
    }
    chosenSize = fontSize;
    chosenLines = lines;
    chosenLineHeight = lineHeight;
  }

  const linesPerColumn = Math.max(1, Math.floor(height / chosenLineHeight));
  for (const [index, line] of chosenLines.slice(0, linesPerColumn * columns).entries()) {
    const logicalColumn = Math.floor(index / linesPerColumn);
    const column = direction === "rtl" ? columns - 1 - logicalColumn : logicalColumn;
    const lineInColumn = index % linesPerColumn;
    const runDirection = textDirection(line);
    const lineWidth = measureBidirectional(line, backend, shape, chosenSize);
    const columnLeft = x + column * (columnWidth + gap);
    const drawX = runDirection === "rtl" ? columnLeft + columnWidth - lineWidth : columnLeft;
    const drawY = outputHeight - top - chosenSize - lineInColumn * chosenLineHeight;
    drawBidirectionalLine(line, runDirection, backend, shape, drawX, drawY, chosenSize);
  }
}

function measureBidirectional(
  text: string,
  backend: PdfBackend,
  shape: (text: string, direction: Direction) => ShapedRun,
  size: number,
): number {
  const tokens = text.split(/\s+/).filter(Boolean);
  const space = backend.measureShapedRun(shape(" ", "ltr"), size);
  return tokens.reduce(
    (total, token, index) =>
      total + backend.measureShapedRun(shape(token, textDirection(token)), size) + (index ? space : 0),
    0,
  );
}

function drawBidirectionalLine(
  text: string,
  baseDirection: Direction,
  backend: PdfBackend,
  shape: (text: string, direction: Direction) => ShapedRun,
  x: number,
  y: number,
  size: number,
): void {
  const tokens = text.split(/\s+/).filter(Boolean);
  const space = backend.measureShapedRun(shape(" ", "ltr"), size);
  let pen = baseDirection === "rtl" ? x + measureBidirectional(text, backend, shape, size) : x;
  for (const [index, token] of tokens.entries()) {
    const run = shape(token, textDirection(token));
    const width = backend.measureShapedRun(run, size);
    if (baseDirection === "rtl") {
      if (index) pen -= space;
      pen -= width;
      backend.drawShapedRun(run, pen, y, size);
    } else {
      if (index) pen += space;
      backend.drawShapedRun(run, pen, y, size);
      pen += width;
    }
  }
}

function cleanFrameText(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length < 8) return trimmed;
  return trimmed.replace(/^[A-Za-z#";+?%()'\-.]\s+(?=.)/, "");
}

function wrap(text: string, maxWidth: number, measure: (text: string) => number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && measure(candidate) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function textDirection(text: string): Direction {
  const arabic = text.match(/[\u0600-\u06ff\u0750-\u077f]/g)?.length ?? 0;
  const latin = text.match(/[A-Za-z]/g)?.length ?? 0;
  if (arabic === 0) return "ltr";
  return arabic >= latin ? "rtl" : "ltr";
}
