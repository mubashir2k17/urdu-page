import type { Paragraph, Story } from "@inpage/document-model";
import type { Mode } from "./charmap.js";
import { decodeLegacy } from "./legacy-decode.js";
import { DELIMITER, findDelimiter, type TextRegion } from "./records.js";

export function decodeStories(
  data: Uint8Array,
  regions: TextRegion[],
  mode: Mode,
): { stories: Story[]; paragraphs: Paragraph[] } {
  const stories: Story[] = [];
  const paragraphs: Paragraph[] = [];

  for (const [regionIndex, region] of regions.entries()) {
    let start = region.start;
    // Density windows can end in the middle of the final low-density story.
    // Continue through one window of trailing records, stopping before the
    // next detected region when there is one.
    const nextStart = regions[regionIndex + 1]?.start ?? data.length;
    const regionEnd = Math.min(nextStart, region.end + 2048);
    while (start < regionEnd) {
      const delimiter = findDelimiter(data, start);
      const end = delimiter >= start && delimiter < regionEnd ? delimiter + 1 : regionEnd;
      const decoded = decodeLegacy(data.subarray(start, end), { mode });
      const storyParagraphs = decoded.paragraphs.map((paragraph) => ({
        ...paragraph,
        index: paragraphs.length,
        startOffset: paragraph.startOffset + start,
        endOffset: paragraph.endOffset + start,
      }));
      if (decoded.paragraphs.length === 0 && (delimiter < start || delimiter >= regionEnd)) break;
      stories.push({
        index: stories.length,
        paragraphs: storyParagraphs,
        startOffset: start,
        endOffset: end,
      });
      paragraphs.push(...storyParagraphs);
      if (delimiter < start || delimiter >= regionEnd) break;
      start = delimiter + DELIMITER.length;
    }
  }

  return { stories, paragraphs };
}
