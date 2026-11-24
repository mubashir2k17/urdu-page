// Pure spacing metrics shared by the glyph-origin diff and its unit tests.
//
// Vector PDF output has no stable glyph identity, so matching is done in
// reading order: boxes are grouped into lines by baseline, sorted along x, and
// aligned by index. Per-glyph dx then measures drift directly instead of
// averaging it away with greedy nearest-centre matching.

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LineOriginDiff {
  baseline: number;
  glyphCount: number;
  referenceCount: number;
  generatedCount: number;
  /** Generated minus reference centre x for each aligned glyph. */
  deltas: number[];
  /** dx of the last aligned glyph minus dx of the first. */
  drift: number;
  referenceGaps: number[];
  generatedGaps: number[];
  gapDeltas: number[];
}

export interface GlyphMatch {
  referenceIndex: number;
  generatedIndex: number;
  dx: number;
}

export interface OriginMetrics {
  /** Number of glyphs paired by monotonic alignment. */
  glyphCount: number;
  unmatchedReference: number;
  unmatchedGenerated: number;
  p50AbsDx: number;
  p95AbsDx: number;
  maxAbsDx: number;
  meanDx: number;
  p95AbsDgap: number;
  meanAbsDrift: number;
}

export interface GapHistogram {
  binWidth: number;
  minimum: number;
  reference: number[];
  generated: number[];
  earthMover: number;
}

export interface PageOriginDiff {
  lines: LineOriginDiff[];
  metrics: OriginMetrics;
  histogram: GapHistogram;
}

function bottom(box: Box): number {
  return box.y + box.height;
}

function centerX(box: Box): number {
  return box.x + box.width / 2;
}

/** Group boxes into text lines by baseline proximity, then sort each line by x. */
export function groupIntoLines(boxes: readonly Box[], tolerance = 2): Box[][] {
  const sorted = [...boxes].sort((left, right) => bottom(left) - bottom(right));
  const lines: {baseline: number; boxes: Box[]}[] = [];
  for (const box of sorted) {
    const baseline = bottom(box);
    const line = lines.find((candidate) => Math.abs(candidate.baseline - baseline) <= tolerance);
    if (line) {
      line.boxes.push(box);
      line.baseline = (line.baseline * (line.boxes.length - 1) + baseline) / line.boxes.length;
    } else {
      lines.push({baseline, boxes: [box]});
    }
  }
  return lines
    .sort((left, right) => left.baseline - right.baseline)
    .map((line) => line.boxes.sort((left, right) => left.x - right.x));
}

/** Inter-glyph gaps (next left edge minus previous right edge). */
export function lineGaps(line: readonly Box[]): number[] {
  const gaps: number[] = [];
  for (let index = 1; index < line.length; index++) {
    gaps.push(line[index]!.x - (line[index - 1]!.x + line[index - 1]!.width));
  }
  return gaps;
}

export function percentile(values: readonly number[], fraction: number): number {
  if (values.length === 0) return 0;
  const ordered = [...values].sort((left, right) => left - right);
  const position = Math.min(ordered.length - 1, Math.max(0, (ordered.length - 1) * fraction));
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return ordered[lower]!;
  return ordered[lower]! + (ordered[upper]! - ordered[lower]!) * (position - lower);
}

/**
 * Monotonic alignment of two x-sorted glyph lists. Matching a pair costs its
 * centre-x distance; skipping either side costs a fixed penalty. This tolerates
 * insertions/deletions from different glyph segmentation without letting one
 * insertion shift every later pairing.
 */
export function alignMonotonic(
  reference: readonly Box[],
  generated: readonly Box[],
  gapPenalty = 1,
): GlyphMatch[] {
  const rows = reference.length + 1;
  const columns = generated.length + 1;
  const cost: number[][] = Array.from({length: rows}, () => new Array<number>(columns).fill(0));
  for (let row = 0; row < rows; row++) cost[row]![0] = row * gapPenalty;
  for (let column = 0; column < columns; column++) cost[0]![column] = column * gapPenalty;
  for (let row = 1; row < rows; row++) {
    for (let column = 1; column < columns; column++) {
      const match = cost[row - 1]![column - 1]! +
        Math.abs(centerX(reference[row - 1]!) - centerX(generated[column - 1]!));
      const skipReference = cost[row - 1]![column]! + gapPenalty;
      const skipGenerated = cost[row]![column - 1]! + gapPenalty;
      cost[row]![column] = Math.min(match, skipReference, skipGenerated);
    }
  }
  let row = reference.length;
  let column = generated.length;
  const reversed: GlyphMatch[] = [];
  while (row > 0 && column > 0) {
    const diagonal = cost[row - 1]![column - 1]! +
      Math.abs(centerX(reference[row - 1]!) - centerX(generated[column - 1]!));
    const current = cost[row]![column]!;
    if (Math.abs(current - diagonal) < 1e-9) {
      reversed.push({
        referenceIndex: row - 1,
        generatedIndex: column - 1,
        dx: centerX(generated[column - 1]!) - centerX(reference[row - 1]!),
      });
      row--;
      column--;
    } else if (Math.abs(current - (cost[row - 1]![column]! + gapPenalty)) < 1e-9) {
      row--;
    } else {
      column--;
    }
  }
  return reversed.reverse();
}

/**
 * Match reference/generated lines by nearest baseline, then align glyphs in
 * reading order. Returns one entry per matched line.
 */
export function compareReadingOrder(
  referenceBoxes: readonly Box[],
  generatedBoxes: readonly Box[],
  tolerance = 3,
): LineOriginDiff[] {
  const referenceLines = groupIntoLines(referenceBoxes);
  const generatedLines = groupIntoLines(generatedBoxes);
  const used = new Set<number>();
  const diffs: LineOriginDiff[] = [];
  for (const reference of referenceLines) {
    const referenceBaseline = bottom(reference[0]!);
    let best = -1;
    let bestDistance = Infinity;
    for (const [index, generated] of generatedLines.entries()) {
      if (used.has(index)) continue;
      const distance = Math.abs(bottom(generated[0]!) - referenceBaseline);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    }
    if (best < 0 || bestDistance > tolerance) continue;
    used.add(best);
    const generated = generatedLines[best]!;
    const matches = alignMonotonic(reference, generated);
    const deltas = matches.map((match) => match.dx);

    // Compare only gaps that are consecutive on both sides, so insertions do
    // not pair unrelated inter-word spaces.
    const referenceGaps: number[] = [];
    const generatedGaps: number[] = [];
    const gapDeltas: number[] = [];
    for (let index = 1; index < matches.length; index++) {
      const previous = matches[index - 1]!;
      const current = matches[index]!;
      if (current.referenceIndex !== previous.referenceIndex + 1) continue;
      if (current.generatedIndex !== previous.generatedIndex + 1) continue;
      const referenceGap = reference[current.referenceIndex]!.x -
        (reference[previous.referenceIndex]!.x + reference[previous.referenceIndex]!.width);
      const generatedGap = generated[current.generatedIndex]!.x -
        (generated[previous.generatedIndex]!.x + generated[previous.generatedIndex]!.width);
      referenceGaps.push(referenceGap);
      generatedGaps.push(generatedGap);
      gapDeltas.push(generatedGap - referenceGap);
    }

    diffs.push({
      baseline: referenceBaseline,
      glyphCount: matches.length,
      referenceCount: reference.length,
      generatedCount: generated.length,
      deltas,
      drift: deltas.length > 1 ? deltas.at(-1)! - deltas[0]! : 0,
      referenceGaps,
      generatedGaps,
      gapDeltas,
    });
  }
  return diffs;
}

export function summarizeOrigins(lines: readonly LineOriginDiff[]): OriginMetrics {
  const dx = lines.flatMap((line) => line.deltas);
  const dgap = lines.flatMap((line) => line.gapDeltas);
  const drifts = lines.filter((line) => line.deltas.length > 1).map((line) => line.drift);
  const referenceCount = lines.reduce((sum, line) => sum + line.referenceCount, 0);
  const generatedCount = lines.reduce((sum, line) => sum + line.generatedCount, 0);
  return {
    glyphCount: dx.length,
    unmatchedReference: Math.max(0, referenceCount - dx.length),
    unmatchedGenerated: Math.max(0, generatedCount - dx.length),
    p50AbsDx: percentile(dx.map(Math.abs), 0.5),
    p95AbsDx: percentile(dx.map(Math.abs), 0.95),
    maxAbsDx: dx.reduce((maximum, value) => Math.max(maximum, Math.abs(value)), 0),
    meanDx: dx.length ? dx.reduce((sum, value) => sum + value, 0) / dx.length : 0,
    p95AbsDgap: percentile(dgap.map(Math.abs), 0.95),
    meanAbsDrift: drifts.length ? drifts.reduce((sum, value) => sum + Math.abs(value), 0) / drifts.length : 0,
  };
}

/** Normalised inter-word-gap histogram and earth-mover distance between them. */
export function gapHistogram(
  referenceGaps: readonly number[],
  generatedGaps: readonly number[],
  binWidth = 0.25,
): GapHistogram {
  const all = [...referenceGaps, ...generatedGaps];
  if (all.length === 0) {
    return {binWidth, minimum: 0, reference: [], generated: [], earthMover: 0};
  }
  const minimum = Math.min(...all);
  const maximum = Math.max(...all);
  const count = Math.max(1, Math.ceil((maximum - minimum) / binWidth));
  const reference = new Array<number>(count + 1).fill(0);
  const generated = new Array<number>(count + 1).fill(0);
  const add = (bins: number[], gaps: readonly number[]): void => {
    for (const gap of gaps) {
      const index = Math.min(count, Math.max(0, Math.floor((gap - minimum) / binWidth)));
      bins[index] = bins[index]! + 1;
    }
    const total = gaps.length;
    if (total > 0) for (let index = 0; index < bins.length; index++) bins[index] = bins[index]! / total;
  };
  add(reference, referenceGaps);
  add(generated, generatedGaps);
  let earthMover = 0;
  let cumulative = 0;
  for (let index = 0; index < reference.length; index++) {
    cumulative += reference[index]! - generated[index]!;
    earthMover += Math.abs(cumulative) * binWidth;
  }
  return {binWidth, minimum, reference, generated, earthMover};
}

export function comparePageOrigins(
  referenceBoxes: readonly Box[],
  generatedBoxes: readonly Box[],
): PageOriginDiff {
  const lines = compareReadingOrder(referenceBoxes, generatedBoxes);
  const referenceGaps = lines.flatMap((line) => line.referenceGaps);
  const generatedGaps = lines.flatMap((line) => line.generatedGaps);
  return {
    lines,
    metrics: summarizeOrigins(lines),
    histogram: gapHistogram(referenceGaps, generatedGaps),
  };
}

export interface LagResult {
  /** Lag in samples (pixels) that maximises correlation. */
  lag: number;
  correlation: number;
  /** Number of lags within 90% of the peak correlation. */
  width: number;
}

/** Pearson cross-correlation of two 1-D ink projections over a lag window. */
export function crossCorrelationLag(
  reference: ArrayLike<number>,
  generated: ArrayLike<number>,
  maxLag: number,
): LagResult {
  const length = Math.min(reference.length, generated.length);
  if (length === 0) return {lag: 0, correlation: 0, width: 0};
  const values: {lag: number; correlation: number}[] = [];
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    let sumR = 0;
    let sumG = 0;
    let sumRR = 0;
    let sumGG = 0;
    let sumRG = 0;
    let count = 0;
    for (let index = 0; index < length; index++) {
      const other = index + lag;
      if (other < 0 || other >= length) continue;
      const r = reference[index]!;
      const g = generated[other]!;
      sumR += r;
      sumG += g;
      sumRR += r * r;
      sumGG += g * g;
      sumRG += r * g;
      count++;
    }
    if (count < 2) continue;
    const numerator = count * sumRG - sumR * sumG;
    const denominator = Math.sqrt(
      Math.max(0, count * sumRR - sumR * sumR) * Math.max(0, count * sumGG - sumG * sumG),
    );
    values.push({lag, correlation: denominator > 0 ? numerator / denominator : 0});
  }
  let best = {lag: 0, correlation: 0};
  for (const value of values) if (value.correlation > best.correlation) best = value;
  const width = values.filter((value) => value.correlation >= best.correlation * 0.9).length;
  return {lag: best.lag, correlation: best.correlation, width};
}
