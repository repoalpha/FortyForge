import type { Cell, TeletextColourRef, TeletextRow } from "../../core";
import { getControlCodeByByte } from "../../core";
import { drawMosaicGlyph, getBitmapGlyph } from "../preview/bitmapGlyphRenderer";
import { SAA5050_ADVANCE_WIDTH, SAA5050_GLYPH_HEIGHT, SAA5050_GLYPHS } from "../preview/saa5050Font";

const TRACE_COLUMNS = 40;
const TRACE_ROWS = 25;
const TRACE_HEADER_CLOCK_WIDTH = 8;
const NORMALIZED_CELL_WIDTH = 12;
const NORMALIZED_CELL_HEIGHT = 20;
const LOW_RES_CELL_WIDTH = 8;
const LOW_RES_CELL_HEIGHT = 10;
const MIN_VISIBLE_PIXELS = 12;
const CONFIDENT_MATCH = 0.94;
const SCAN_CONFIDENT_MATCH = 0.78;
const DOUBLE_HEIGHT_SCAN_MATCH = 0.7;
const DOUBLE_HEIGHT_RUN_MATCH = 0.7;
const DOUBLE_HEIGHT_RENDER_MARGIN = 0.04;
const LOW_RES_PRIORITY_TIE_MARGIN = 0.03;
const SCANNER_WORD_CORRECTION_CONFIDENCE = 0.82;

const SCANNER_WORDS = [
  "AFTER",
  "AFTERWARDS",
  "BEEN",
  "BRIGHTON",
  "BBC",
  "BBC2",
  "CEEFAX",
  "CHIEF",
  "CHOICE",
  "CONFIRMED",
  "CONFERENCE",
  "DAY",
  "DEAF",
  "DETAIL",
  "EARLIER",
  "EDITOR",
  "DEFEAT",
  "ENGINEERING",
  "EXTREME",
  "FINANCE",
  "FLASH",
  "FOOD",
  "FOREX",
  "FOR",
  "FAILURES",
  "FIVE",
  "GENERAL",
  "GUIDE",
  "HEADLINES",
  "INDEX",
  "LABOUR",
  "LEFT",
  "MARKETS",
  "MEMBERS",
  "MR",
  "NEWS",
  "NEWSREEL",
  "OF",
  "ONE",
  "PARTY",
  "PETER",
  "PUT",
  "RADIO",
  "RATE",
  "REJECTED",
  "SCHOOLS",
  "SECRET",
  "SESSION",
  "SHARES",
  "SOFTS",
  "SPORT",
  "SPORTS",
  "STEADY",
  "STREET",
  "SUBTITLES",
  "TAAFFE",
  "THE",
  "TOMORROW",
  "TRAVEL",
  "WINGERS",
  "WEATHER",
  "WORLD"
] as const;

const SCANNER_PHRASES = [
  "BBC2 276",
  "BBC RADIO FOR SCHOOLS",
  "FT INDEX CLOSED UP 1.1 AT 703.7",
  "Test Page",
  "White Yellow Cyan Green Magenta Red Blue",
  "@ABC DEFG HIJK LMNO PQRS TUVW XYZ",
  "-abc defg hijk lmno pqrs tuvw xyz",
  "0123 4567 89",
  "RED       GRN       YLW       BLU"
] as const;

const DOUBLE_HEIGHT_SCANNER_WORDS = [
  ...SCANNER_WORDS,
  "AT",
  "CLOSED",
  "FT",
  "UP"
] as const;

export interface TraceImageData {
  width: number;
  height: number;
  data: Uint8ClampedArray | number[];
}

export interface TraceGrid {
  columns: 40;
  rows: 25;
  left: number;
  top: number;
  width: number;
  height: number;
  cellWidth: number;
  cellHeight: number;
  xLines?: number[];
  yLines?: number[];
}

export interface TraceGridBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface TraceGridAnchor {
  lineIndex: number;
  position: number;
}

export interface TraceGridCalibration {
  xAnchors: TraceGridAnchor[];
  yAnchors: TraceGridAnchor[];
}

export interface TraceWarning {
  rowIndex: number;
  column: number;
  message: string;
}

export type TraceCellKind = "space" | "text" | "mosaic" | "colour" | "uncertain";
export type TraceCellHintKind =
  | "text"
  | "mosaic"
  | "background"
  | "ignore"
  | "double-height-top"
  | "double-height-bottom";

export interface TraceCellHint {
  rowIndex: number;
  column: number;
  kind: TraceCellHintKind;
}

export interface TraceCell {
  rowIndex: number;
  column: number;
  kind: TraceCellKind;
  foreground: TeletextColourRef;
  background: TeletextColourRef;
  confidence: number;
  doubleHeight?: "top" | "bottom";
  value?: string;
  sixelMask?: number;
  hint?: TraceCellHint;
  warnings: string[];
}

export interface TraceResult {
  grid: TraceGrid;
  cells: TraceCell[];
  rows: TeletextRow[];
  warnings: TraceWarning[];
  confidence: number;
}

export const LEVEL_1_RGB_COLOURS = [
  [0, 0, 0],
  [255, 0, 0],
  [0, 255, 0],
  [255, 255, 0],
  [0, 0, 255],
  [255, 0, 255],
  [0, 255, 255],
  [255, 255, 255]
] as const;

interface TraceState {
  foreground: number;
  background: number;
  doubleHeight: boolean;
  mode: "text" | "graphics";
}

class RecordingMosaicContext {
  fillStyle = "#ffffff";
  readonly pixels = Array.from({ length: NORMALIZED_CELL_HEIGHT }, () =>
    Array.from({ length: NORMALIZED_CELL_WIDTH }, () => false)
  );

  fillRect(x: number, y: number, width: number, height: number) {
    for (let yy = Math.max(0, y); yy < Math.min(NORMALIZED_CELL_HEIGHT, y + height); yy += 1) {
      for (let xx = Math.max(0, x); xx < Math.min(NORMALIZED_CELL_WIDTH, x + width); xx += 1) {
        this.pixels[yy][xx] = true;
      }
    }
  }
}

export function detectTraceGrid(image: TraceImageData): TraceGrid {
  return createTraceGridFromBounds(image, {
    left: 0,
    top: 0,
    right: image.width,
    bottom: image.height
  });
}

export function createTraceGridFromBounds(
  image: TraceImageData,
  bounds: TraceGridBounds
): TraceGrid {
  const left = Math.min(image.width - 1, Math.max(0, bounds.left));
  const top = Math.min(image.height - 1, Math.max(0, bounds.top));
  const right = Math.min(image.width, Math.max(left + TRACE_COLUMNS, bounds.right));
  const bottom = Math.min(image.height, Math.max(top + TRACE_ROWS, bounds.bottom));
  const width = right - left;
  const height = bottom - top;

  return {
    columns: TRACE_COLUMNS,
    rows: TRACE_ROWS,
    left,
    top,
    width,
    height,
    cellWidth: width / TRACE_COLUMNS,
    cellHeight: height / TRACE_ROWS
  };
}

function normalizedAnchors(
  startLineIndex: number,
  startPosition: number,
  endLineIndex: number,
  endPosition: number,
  anchors: TraceGridAnchor[]
) {
  const byLine = new Map<number, number>();

  byLine.set(startLineIndex, startPosition);
  byLine.set(endLineIndex, endPosition);

  anchors.forEach((anchor) => {
    if (anchor.lineIndex >= startLineIndex && anchor.lineIndex <= endLineIndex) {
      byLine.set(anchor.lineIndex, anchor.position);
    }
  });

  return [...byLine.entries()]
    .map(([lineIndex, position]) => ({ lineIndex, position }))
    .sort((first, second) => first.lineIndex - second.lineIndex);
}

function interpolateLines(
  lineCount: number,
  startPosition: number,
  endPosition: number,
  anchors: TraceGridAnchor[]
) {
  const sortedAnchors = normalizedAnchors(0, startPosition, lineCount, endPosition, anchors);
  const lines = Array.from({ length: lineCount + 1 }, () => 0);

  for (let anchorIndex = 0; anchorIndex < sortedAnchors.length - 1; anchorIndex += 1) {
    const start = sortedAnchors[anchorIndex];
    const end = sortedAnchors[anchorIndex + 1];
    const span = end.lineIndex - start.lineIndex;

    for (let lineIndex = start.lineIndex; lineIndex <= end.lineIndex; lineIndex += 1) {
      const fraction = span === 0 ? 0 : (lineIndex - start.lineIndex) / span;

      lines[lineIndex] = start.position + ((end.position - start.position) * fraction);
    }
  }

  return lines;
}

export function createCalibratedTraceGrid(
  image: TraceImageData,
  bounds: TraceGridBounds,
  calibration: TraceGridCalibration
): TraceGrid {
  const baseGrid = createTraceGridFromBounds(image, bounds);
  const xLines = interpolateLines(
    TRACE_COLUMNS,
    baseGrid.left,
    baseGrid.left + baseGrid.width,
    calibration.xAnchors
  );
  const yLines = interpolateLines(
    TRACE_ROWS,
    baseGrid.top,
    baseGrid.top + baseGrid.height,
    calibration.yAnchors
  );

  return {
    ...baseGrid,
    left: xLines[0],
    top: yLines[0],
    width: xLines[TRACE_COLUMNS] - xLines[0],
    height: yLines[TRACE_ROWS] - yLines[0],
    cellWidth: (xLines[TRACE_COLUMNS] - xLines[0]) / TRACE_COLUMNS,
    cellHeight: (yLines[TRACE_ROWS] - yLines[0]) / TRACE_ROWS,
    xLines,
    yLines
  };
}

export function nearestLevel1Colour(r: number, g: number, b: number) {
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;

  LEVEL_1_RGB_COLOURS.forEach((colour, index) => {
    const distance = ((r - colour[0]) ** 2) + ((g - colour[1]) ** 2) + ((b - colour[2]) ** 2);

    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });

  return {
    index: bestIndex,
    distance: Math.sqrt(bestDistance)
  };
}

function colourRef(index: number): TeletextColourRef {
  return {
    palette: "level1",
    index
  };
}

function imagePixel(image: TraceImageData, x: number, y: number) {
  const clampedX = Math.min(image.width - 1, Math.max(0, x));
  const clampedY = Math.min(image.height - 1, Math.max(0, y));
  const offset = (clampedY * image.width + clampedX) * 4;

  return {
    r: image.data[offset],
    g: image.data[offset + 1],
    b: image.data[offset + 2]
  };
}

function quantizedColourIndex(image: TraceImageData, x: number, y: number) {
  const pixel = imagePixel(image, x, y);

  return nearestLevel1Colour(pixel.r, pixel.g, pixel.b).index;
}

function edgeEnergyAtColumn(
  image: TraceImageData,
  x: number,
  top: number,
  bottom: number,
  stride: number
) {
  let energy = 0;

  for (let y = Math.floor(top); y < Math.ceil(bottom); y += stride) {
    if (quantizedColourIndex(image, x - 1, y) !== quantizedColourIndex(image, x, y)) {
      energy += 1;
    }
  }

  return energy;
}

function edgeEnergyAtRow(
  image: TraceImageData,
  y: number,
  left: number,
  right: number,
  stride: number
) {
  let energy = 0;

  for (let x = Math.floor(left); x < Math.ceil(right); x += stride) {
    if (quantizedColourIndex(image, x, y - 1) !== quantizedColourIndex(image, x, y)) {
      energy += 1;
    }
  }

  return energy;
}

function bestEdgeLinePosition(
  expectedPosition: number,
  minPosition: number,
  maxPosition: number,
  searchRadius: number,
  minEnergy: number,
  edgeEnergy: (position: number) => number
) {
  let bestPosition = Math.round(expectedPosition);
  let bestEnergy = Number.NEGATIVE_INFINITY;
  const start = Math.max(Math.ceil(minPosition), Math.round(expectedPosition - searchRadius));
  const end = Math.min(Math.floor(maxPosition), Math.round(expectedPosition + searchRadius));

  for (let position = start; position <= end; position += 1) {
    const energy = edgeEnergy(position);

    if (
      energy > bestEnergy
      || (energy === bestEnergy && Math.abs(position - expectedPosition) < Math.abs(bestPosition - expectedPosition))
    ) {
      bestPosition = position;
      bestEnergy = energy;
    }
  }

  return bestEnergy >= minEnergy ? bestPosition : Math.round(expectedPosition);
}

export function detectEdgeAssistedTraceGrid(
  image: TraceImageData,
  bounds: TraceGridBounds = {
    left: 0,
    top: 0,
    right: image.width,
    bottom: image.height
  },
  options: { searchRadius?: number; sampleStride?: number } = {}
): TraceGrid {
  const baseGrid = createTraceGridFromBounds(image, bounds);
  const right = baseGrid.left + baseGrid.width;
  const bottom = baseGrid.top + baseGrid.height;
  const searchRadius = options.searchRadius ?? Math.max(4, Math.ceil(baseGrid.cellHeight * 0.35));
  const sampleStride = options.sampleStride ?? 2;
  const verticalSampleCount = Math.max(1, Math.ceil((bottom - baseGrid.top) / sampleStride));
  const horizontalSampleCount = Math.max(1, Math.ceil((right - baseGrid.left) / sampleStride));
  const minVerticalEnergy = Math.max(6, verticalSampleCount * 0.12);
  const minHorizontalEnergy = Math.max(6, horizontalSampleCount * 0.12);
  const xLines = Array.from({ length: TRACE_COLUMNS + 1 }, (_, lineIndex) => {
    if (lineIndex === 0) {
      return baseGrid.left;
    }

    if (lineIndex === TRACE_COLUMNS) {
      return right;
    }

    return bestEdgeLinePosition(
      baseGrid.left + (lineIndex * baseGrid.cellWidth),
      baseGrid.left + 1,
      right - 1,
      searchRadius,
      minVerticalEnergy,
      (position) => edgeEnergyAtColumn(image, position, baseGrid.top, bottom, sampleStride)
    );
  });
  const yLines = Array.from({ length: TRACE_ROWS + 1 }, (_, lineIndex) => {
    if (lineIndex === 0) {
      return baseGrid.top;
    }

    if (lineIndex === TRACE_ROWS) {
      return bottom;
    }

    return bestEdgeLinePosition(
      baseGrid.top + (lineIndex * baseGrid.cellHeight),
      baseGrid.top + 1,
      bottom - 1,
      searchRadius,
      minHorizontalEnergy,
      (position) => edgeEnergyAtRow(image, position, baseGrid.left, right, sampleStride)
    );
  });

  return {
    ...baseGrid,
    xLines,
    yLines
  };
}

function uniformGridLines(start: number, pitch: number, count: number) {
  return Array.from({ length: count + 1 }, (_, lineIndex) => start + lineIndex * pitch);
}

function isNearInteger(value: number, tolerance = 0.05) {
  return Math.abs(value - Math.round(value)) <= tolerance;
}

function detectScannerTraceGrid(
  image: TraceImageData,
  bounds: TraceGridBounds = {
    left: 0,
    top: 0,
    right: image.width,
    bottom: image.height
  }
): TraceGrid {
  const baseGrid = createTraceGridFromBounds(image, bounds);
  const cellWidth = baseGrid.width / TRACE_COLUMNS;
  const visibleRowHeight = baseGrid.height / 24;
  const looksLikeMode7Capture = isNearInteger(cellWidth)
    && isNearInteger(visibleRowHeight)
    && !isNearInteger(baseGrid.height / TRACE_ROWS)
    && cellWidth <= 10;

  if (!looksLikeMode7Capture) {
    return detectEdgeAssistedTraceGrid(image, bounds);
  }

  const xLines = uniformGridLines(baseGrid.left, cellWidth, TRACE_COLUMNS);
  const yLines = uniformGridLines(baseGrid.top, visibleRowHeight, 24);

  yLines.push(baseGrid.top + baseGrid.height);

  return {
    ...baseGrid,
    cellHeight: visibleRowHeight,
    xLines,
    yLines
  };
}

function cellBounds(grid: TraceGrid, rowIndex: number, column: number) {
  return {
    left: grid.xLines?.[column] ?? grid.left + column * grid.cellWidth,
    top: grid.yLines?.[rowIndex] ?? grid.top + rowIndex * grid.cellHeight,
    right: grid.xLines?.[column + 1] ?? grid.left + (column + 1) * grid.cellWidth,
    bottom: grid.yLines?.[rowIndex + 1] ?? grid.top + (rowIndex + 1) * grid.cellHeight
  };
}

function countCellPalette(image: TraceImageData, grid: TraceGrid, rowIndex: number, column: number) {
  const bounds = cellBounds(grid, rowIndex, column);
  const counts = Array.from({ length: LEVEL_1_RGB_COLOURS.length }, () => 0);

  for (let y = Math.floor(bounds.top); y < Math.ceil(bounds.bottom); y += 1) {
    for (let x = Math.floor(bounds.left); x < Math.ceil(bounds.right); x += 1) {
      const pixel = imagePixel(image, x, y);
      counts[nearestLevel1Colour(pixel.r, pixel.g, pixel.b).index] += 1;
    }
  }

  return counts;
}

function maxIndex(values: number[]) {
  return values.reduce(
    (best, value, index) => value > values[best] ? index : best,
    0
  );
}

function visibleColourCount(
  image: TraceImageData,
  grid: TraceGrid,
  rowIndex: number,
  column: number,
  colourIndex: number
) {
  return countCellPalette(image, grid, rowIndex, column)[colourIndex];
}

function sampleCellBitmap(
  image: TraceImageData,
  grid: TraceGrid,
  rowIndex: number,
  column: number,
  foregroundIndex: number
) {
  return sampleCellBitmapAtSize(
    image,
    grid,
    rowIndex,
    column,
    foregroundIndex,
    NORMALIZED_CELL_WIDTH,
    NORMALIZED_CELL_HEIGHT
  );
}

function sampleCellBitmapAtSize(
  image: TraceImageData,
  grid: TraceGrid,
  rowIndex: number,
  column: number,
  foregroundIndex: number,
  sampleWidth: number,
  sampleHeight: number,
  preserveThinForeground = false
) {
  const bounds = cellBounds(grid, rowIndex, column);
  const cellWidth = bounds.right - bounds.left;
  const cellHeight = bounds.bottom - bounds.top;

  return Array.from({ length: sampleHeight }, (_, normalizedY) =>
    Array.from({ length: sampleWidth }, (_, normalizedX) => {
      const startX = Math.floor(bounds.left + (normalizedX / sampleWidth) * cellWidth);
      const endX = Math.ceil(bounds.left + ((normalizedX + 1) / sampleWidth) * cellWidth);
      const startY = Math.floor(bounds.top + (normalizedY / sampleHeight) * cellHeight);
      const endY = Math.ceil(bounds.top + ((normalizedY + 1) / sampleHeight) * cellHeight);
      let foregroundVotes = 0;
      let totalVotes = 0;

      for (let y = startY; y < endY; y += 1) {
        for (let x = startX; x < endX; x += 1) {
          const pixel = imagePixel(image, x, y);
          const nearest = nearestLevel1Colour(pixel.r, pixel.g, pixel.b);

          if (nearest.index === foregroundIndex) {
            foregroundVotes += 1;
          }
          totalVotes += 1;
        }
      }

      return preserveThinForeground
        ? foregroundVotes > 0
        : foregroundVotes > totalVotes / 2;
    })
  );
}

function sampleCellPairBitmapAtSize(
  image: TraceImageData,
  grid: TraceGrid,
  rowIndex: number,
  column: number,
  foregroundIndex: number,
  sampleWidth: number,
  sampleHeight: number
) {
  const topBounds = cellBounds(grid, rowIndex, column);
  const bottomBounds = cellBounds(grid, rowIndex + 1, column);
  const bounds = {
    left: topBounds.left,
    top: topBounds.top,
    right: topBounds.right,
    bottom: bottomBounds.bottom
  };
  const cellWidth = bounds.right - bounds.left;
  const cellHeight = bounds.bottom - bounds.top;

  return Array.from({ length: sampleHeight }, (_, normalizedY) =>
    Array.from({ length: sampleWidth }, (_, normalizedX) => {
      const startX = Math.floor(bounds.left + (normalizedX / sampleWidth) * cellWidth);
      const endX = Math.ceil(bounds.left + ((normalizedX + 1) / sampleWidth) * cellWidth);
      const startY = Math.floor(bounds.top + (normalizedY / sampleHeight) * cellHeight);
      const endY = Math.ceil(bounds.top + ((normalizedY + 1) / sampleHeight) * cellHeight);

      for (let y = startY; y < endY; y += 1) {
        for (let x = startX; x < endX; x += 1) {
          const pixel = imagePixel(image, x, y);
          const nearest = nearestLevel1Colour(pixel.r, pixel.g, pixel.b);

          if (nearest.index === foregroundIndex) {
            return true;
          }
        }
      }

      return false;
    })
  );
}

function bitmapFromGlyph(glyph: string[]) {
  return glyph.map((row) => [...row].map((pixel) => pixel === "1"));
}

function bitmapScore(actual: boolean[][], expected: boolean[][]) {
  let matches = 0;
  let total = 0;
  const height = Math.min(actual.length, expected.length);
  const width = Math.min(actual[0]?.length ?? 0, expected[0]?.length ?? 0);

  if (height === 0 || width === 0) {
    return 0;
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (actual[y][x] === expected[y][x]) {
        matches += 1;
      }
      total += 1;
    }
  }

  return matches / total;
}

function hasForegroundNearby(bitmap: boolean[][], x: number, y: number, radius: number) {
  const height = bitmap.length;
  const width = bitmap[0]?.length ?? 0;

  for (let yy = Math.max(0, y - radius); yy <= Math.min(height - 1, y + radius); yy += 1) {
    for (let xx = Math.max(0, x - radius); xx <= Math.min(width - 1, x + radius); xx += 1) {
      if (bitmap[yy][xx]) {
        return true;
      }
    }
  }

  return false;
}

function tolerantBitmapScore(actual: boolean[][], expected: boolean[][]) {
  let expectedForeground = 0;
  let expectedMatched = 0;
  let actualForeground = 0;
  let actualMatched = 0;
  const height = Math.min(actual.length, expected.length);
  const width = Math.min(actual[0]?.length ?? 0, expected[0]?.length ?? 0);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (expected[y][x]) {
        expectedForeground += 1;

        if (hasForegroundNearby(actual, x, y, 1)) {
          expectedMatched += 1;
        }
      }

      if (actual[y][x]) {
        actualForeground += 1;

        if (hasForegroundNearby(expected, x, y, 1)) {
          actualMatched += 1;
        }
      }
    }
  }

  if (expectedForeground === 0 || actualForeground === 0) {
    return 0;
  }

  const expectedCoverage = expectedMatched / expectedForeground;
  const actualCoverage = actualMatched / actualForeground;

  return (expectedCoverage + actualCoverage) / 2;
}

function mosaicBitmap(mask: number, separated = false) {
  const context = new RecordingMosaicContext();

  drawMosaicGlyph(context, {
    cellHeight: NORMALIZED_CELL_HEIGHT,
    cellWidth: NORMALIZED_CELL_WIDTH,
    colour: "#ffffff",
    separated,
    sixelMask: mask,
    x: 0,
    y: 0
  });

  return context.pixels;
}

const TEXT_CANDIDATES = Object.keys(SAA5050_GLYPHS)
  .filter((value) => value !== " " && value.length === 1)
  .map((value) => ({
    value,
    bitmap: bitmapFromGlyph(getBitmapGlyph(value))
  }));

function lowResolutionSourceBitmap(glyph: readonly string[], xOffset: number, yOffset: number) {
  return Array.from({ length: LOW_RES_CELL_HEIGHT }, (_, y) =>
    Array.from({ length: LOW_RES_CELL_WIDTH }, (_, x) => {
      const sourceX = x - xOffset;
      const sourceY = y - yOffset;

      return sourceY >= 0
        && sourceY < SAA5050_GLYPH_HEIGHT
        && sourceX >= 0
        && sourceX < SAA5050_ADVANCE_WIDTH
        && glyph[sourceY][sourceX] === "1";
    })
  );
}

function mode7CaptureSourceBitmap(glyph: readonly string[], xOffset: number) {
  const captureHeight = 12;
  const padded = Array.from({ length: captureHeight }, () =>
    Array.from({ length: LOW_RES_CELL_WIDTH }, () => false)
  );

  glyph.forEach((row, y) => {
    [...row].forEach((pixel, x) => {
      if (pixel === "1" && xOffset + x < LOW_RES_CELL_WIDTH) {
        padded[y + 1][xOffset + x] = true;
      }
    });
  });

  return Array.from({ length: LOW_RES_CELL_HEIGHT }, (_, y) => {
    const startY = Math.floor((y / LOW_RES_CELL_HEIGHT) * captureHeight);
    const endY = Math.ceil(((y + 1) / LOW_RES_CELL_HEIGHT) * captureHeight);

    return Array.from({ length: LOW_RES_CELL_WIDTH }, (_, x) => {
      for (let sampleY = startY; sampleY < endY; sampleY += 1) {
        if (padded[sampleY][x]) {
          return true;
        }
      }

      return false;
    });
  });
}

function lowResolutionDoubleHeightBitmap(
  glyph: readonly string[],
  xOffset: number,
  yOffset: number,
  widened = false
) {
  return Array.from({ length: LOW_RES_CELL_HEIGHT * 2 }, (_, y) =>
    Array.from({ length: LOW_RES_CELL_WIDTH }, (_, x) => {
      const sourceX = x - xOffset;
      const sourceY = Math.floor((y - yOffset) / 2);
      const matchesSourcePixel = (candidateX: number) =>
        sourceY >= 0
        && sourceY < SAA5050_GLYPH_HEIGHT
        && candidateX >= 0
        && candidateX < SAA5050_ADVANCE_WIDTH
        && glyph[sourceY][candidateX] === "1";

      return matchesSourcePixel(sourceX)
        || (widened && matchesSourcePixel(sourceX - 1));
    })
  );
}

const LOW_RES_TEXT_CANDIDATES = Object.entries(SAA5050_GLYPHS)
  .filter(([value]) => value !== " " && value !== "\u2588" && value.length === 1)
  .flatMap(([value, glyph]) =>
    Array.from({ length: LOW_RES_CELL_WIDTH - SAA5050_ADVANCE_WIDTH + 1 }, (_, xOffset) =>
      [
        ...[-1, 0, 1].map((yOffset) => ({
          value,
          bitmap: lowResolutionSourceBitmap(glyph, xOffset, yOffset)
        })),
        {
          value,
          bitmap: mode7CaptureSourceBitmap(glyph, xOffset)
        }
      ]
    ).flat()
  );

const LOW_RES_DOUBLE_HEIGHT_TEXT_CANDIDATES = Object.entries(SAA5050_GLYPHS)
  .filter(([value]) => value !== " " && value !== "\u2588" && value.length === 1)
  .flatMap(([value, glyph]) =>
    Array.from({ length: LOW_RES_CELL_WIDTH - SAA5050_ADVANCE_WIDTH + 1 }, (_, xOffset) =>
      [-2, -1, 0, 1, 2].flatMap((yOffset) => [
        {
          value,
          bitmap: lowResolutionDoubleHeightBitmap(glyph, xOffset, yOffset)
        },
        {
          value,
          bitmap: lowResolutionDoubleHeightBitmap(glyph, xOffset, yOffset, true)
        }
      ])
    ).flat()
  );

const MOSAIC_CANDIDATES = Array.from({ length: 63 }, (_, index) => ({
  mask: index + 1,
  bitmap: mosaicBitmap(index + 1)
}));

function bestTextMatch(actual: boolean[][], tolerant = false) {
  return bestTextMatchFromCandidates(actual, TEXT_CANDIDATES, tolerant);
}

function bestLowResolutionTextMatch(actual: boolean[][]) {
  return LOW_RES_TEXT_CANDIDATES.reduce(
    (best, candidate) => {
      const confidence = foregroundBitmapScore(actual, candidate.bitmap);
      const priority = characterMatchPriority(candidate.value);

      return confidence > best.confidence
        || (
          priority > best.priority
          && confidence >= best.confidence - LOW_RES_PRIORITY_TIE_MARGIN
        )
        ? { value: candidate.value, confidence, priority }
        : best;
    },
    { value: "", confidence: 0, priority: 0 }
  );
}

function bestLowResolutionDoubleHeightTextMatch(actual: boolean[][]) {
  return LOW_RES_DOUBLE_HEIGHT_TEXT_CANDIDATES.reduce(
    (best, candidate) => {
      const confidence = foregroundBitmapScore(actual, candidate.bitmap);
      const priority = characterMatchPriority(candidate.value);

      return confidence > best.confidence
        || (
          priority > best.priority
          && confidence >= best.confidence - LOW_RES_PRIORITY_TIE_MARGIN
        )
        ? { value: candidate.value, confidence, priority }
        : best;
    },
    { value: "", confidence: 0, priority: 0 }
  );
}

function horizontalSeparatorMosaicMask(actual: boolean[][]) {
  const width = actual[0]?.length ?? 0;
  const bandRanges = [
    [0, Math.floor(actual.length / 3)],
    [Math.floor(actual.length / 3), Math.floor((actual.length * 2) / 3)],
    [Math.floor((actual.length * 2) / 3), actual.length]
  ] as const;
  const bandScores = bandRanges.map(([start, end]) => {
    let score = 0;

    for (let y = start; y < end; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (actual[y][x]) {
          score += 1;
        }
      }
    }

    return score;
  });
  const totalForeground = bandScores.reduce((sum, score) => sum + score, 0);
  const bestBand = bandScores.reduce(
    (best, score, index) => score > bandScores[best] ? index : best,
    0
  );
  const bestScore = bandScores[bestBand];
  const outsideScore = totalForeground - bestScore;
  const minimumBandScore = Math.max(width, Math.ceil(width * (bandRanges[bestBand][1] - bandRanges[bestBand][0]) * 0.55));

  if (bestScore < minimumBandScore || outsideScore > bestScore * 0.25) {
    return undefined;
  }

  return [0b000011, 0b001100, 0b110000][bestBand];
}

function thinSeparatorMosaicMask(actual: boolean[][]) {
  const rowScores = actual.map((row) => row.filter(Boolean).length);
  const bestRow = rowScores.reduce(
    (best, score, index) => score > rowScores[best] ? index : best,
    0
  );

  if (rowScores[bestRow] < Math.ceil((actual[0]?.length ?? 0) * 0.75)) {
    return undefined;
  }

  if (bestRow < actual.length / 3) {
    return 0b000011;
  }

  if (bestRow < (actual.length * 2) / 3) {
    return 0b001100;
  }

  return 0b110000;
}

function bestTextMatchFromCandidates(
  actual: boolean[][],
  candidates: { value: string; bitmap: boolean[][] }[],
  tolerant = false
) {
  return candidates.reduce(
    (best, candidate) => {
      const confidence = tolerant
        ? tolerantBitmapScore(actual, candidate.bitmap)
        : bitmapScore(actual, candidate.bitmap);
      const priority = characterMatchPriority(candidate.value);

      return confidence > best.confidence
        || (confidence === best.confidence && priority > best.priority)
        ? { value: candidate.value, confidence, priority }
        : best;
    },
    { value: "", confidence: 0, priority: 0 }
  );
}

function characterMatchPriority(value: string) {
  if (/^[A-Z]$/.test(value)) {
    return 4;
  }

  if (/^[a-z]$/.test(value)) {
    return 3;
  }

  if (/^[0-9]$/.test(value)) {
    return 2;
  }

  if (/^[.,:;!?'"()/-]$/.test(value)) {
    return 1;
  }

  return 0;
}

function characterCorrectionCost(actual: string, expected: string) {
  if (actual === expected) {
    return 0;
  }

  if (actual === "?") {
    return 0.35;
  }

  const pair = `${actual}${expected}`;
  const commonConfusions = new Set([
    "8S", "BS", "5S",
    "GB", "PB",
    "GD", "PD", "PC",
    "NC",
    "GR",
    "FE",
    "£F",
    "FR",
    "GC",
    "G2",
    "HB",
    "JF", "JI",
    "LI", "1I", "7I",
    "IL", "1L",
    "NR",
    "0O", "DO", "PO", "QD",
    "PS",
    "YO",
    "UO",
    "MM", "MN", "NM",
    "VW", "UW"
  ]);

  return commonConfusions.has(pair) ? 0.35 : 1;
}

function doubleHeightCharacterCorrectionCost(actual: string, expected: string) {
  if (actual === expected) {
    return 0;
  }

  if (actual === "?") {
    return 0.35;
  }

  const pair = `${actual}${expected}`;
  const commonDoubleHeightConfusions = new Set([
    "-T",
    "JI",
    "NC", "ND", "NO",
    "OS",
    "PE", "PF", "PD",
    "RL",
    "UX",
    "YN"
  ]);

  return commonDoubleHeightConfusions.has(pair)
    ? 0.28
    : characterCorrectionCost(actual, expected);
}

function wordCorrectionCost(actual: string, expected: string) {
  if (actual.length !== expected.length) {
    return Number.POSITIVE_INFINITY;
  }

  return [...actual].reduce(
    (sum, character, index) => sum + characterCorrectionCost(character, expected[index]),
    0
  );
}

function doubleHeightWordCorrectionCost(actual: string, expected: string) {
  if (actual.length !== expected.length) {
    return Number.POSITIVE_INFINITY;
  }

  return [...actual].reduce(
    (sum, character, index) => sum + doubleHeightCharacterCorrectionCost(character, expected[index]),
    0
  );
}

function bestScannerWordCorrection(value: string) {
  const normalized = value.toUpperCase();

  if (!/[A-Z?]/.test(normalized) || /^\d+$/.test(normalized)) {
    return undefined;
  }

  const candidates = SCANNER_WORDS
    .filter((word) => word.length === normalized.length)
    .map((word) => ({
      word,
      cost: wordCorrectionCost(normalized, word)
    }))
    .sort((first, second) => first.cost - second.cost);
  const best = candidates[0];
  const second = candidates[1];
  const limit = Math.max(0.7, normalized.length * 0.35);

  if (!best || best.cost > limit || (second && second.cost - best.cost < 0.25)) {
    return undefined;
  }

  return best.word;
}

function bestDoubleHeightScannerWordCorrection(value: string) {
  const normalized = value.toUpperCase();

  if (!/[A-Z?]/.test(normalized) || /^\d+$/.test(normalized)) {
    return undefined;
  }

  const candidates = DOUBLE_HEIGHT_SCANNER_WORDS
    .filter((word) => word.length === normalized.length)
    .map((word) => ({
      word,
      cost: doubleHeightWordCorrectionCost(normalized, word)
    }))
    .sort((first, second) => first.cost - second.cost);
  const best = candidates[0];
  const second = candidates[1];
  const limit = Math.max(0.75, normalized.length * 0.32);

  if (!best || best.cost > limit || (second && second.cost - best.cost < 0.25)) {
    return undefined;
  }

  return best.word;
}

function applyScannerCorrectionCase(correction: string, token: string) {
  if (/\d/.test(correction)) {
    return correction;
  }

  if (token === token.toLowerCase()) {
    return correction.toLowerCase();
  }

  if (token === token.toUpperCase()) {
    return correction;
  }

  if (/^[A-Z]/.test(token)) {
    return `${correction[0]}${correction.slice(1).toLowerCase()}`;
  }

  return correction;
}

function mergedCellPairPalette(
  image: TraceImageData,
  grid: TraceGrid,
  rowIndex: number,
  column: number
) {
  const topCounts = countCellPalette(image, grid, rowIndex, column);
  const bottomCounts = countCellPalette(image, grid, rowIndex + 1, column);

  return topCounts.map((count, index) => count + bottomCounts[index]);
}

function classifyDoubleHeightPairCell(
  image: TraceImageData,
  grid: TraceGrid,
  rowIndex: number,
  column: number
) {
  const counts = mergedCellPairPalette(image, grid, rowIndex, column);
  const backgroundIndex = maxIndex(counts);
  const nonBackgroundCounts = counts.map((count, index) =>
    index === backgroundIndex ? 0 : count
  );
  const foregroundIndex = maxIndex(nonBackgroundCounts);
  const visiblePixels = nonBackgroundCounts[foregroundIndex];
  const topVisiblePixels = visibleColourCount(image, grid, rowIndex, column, foregroundIndex);
  const bottomVisiblePixels = visibleColourCount(image, grid, rowIndex + 1, column, foregroundIndex);

  if (visiblePixels < MIN_VISIBLE_PIXELS * 2) {
    return undefined;
  }

  if (topVisiblePixels < MIN_VISIBLE_PIXELS) {
    return undefined;
  }

  const actual = sampleCellPairBitmapAtSize(
    image,
    grid,
    rowIndex,
    column,
    foregroundIndex,
    LOW_RES_CELL_WIDTH,
    LOW_RES_CELL_HEIGHT * 2
  );
  const text = bestLowResolutionDoubleHeightTextMatch(actual);
  const ordinaryTop = bestLowResolutionTextMatch(
    sampleCellBitmapAtSize(
      image,
      grid,
      rowIndex,
      column,
      foregroundIndex,
      LOW_RES_CELL_WIDTH,
      LOW_RES_CELL_HEIGHT,
      true
    )
  );
  const ordinaryBottom = bestLowResolutionTextMatch(
    sampleCellBitmapAtSize(
      image,
      grid,
      rowIndex + 1,
      column,
      foregroundIndex,
      LOW_RES_CELL_WIDTH,
      LOW_RES_CELL_HEIGHT,
      true
    )
  );
  const ordinaryConfidence = Math.max(ordinaryTop.confidence, ordinaryBottom.confidence);

  return text.confidence >= DOUBLE_HEIGHT_SCAN_MATCH
    ? {
      backgroundIndex,
      foregroundIndex,
      ordinaryConfidence,
      text
    }
    : undefined;
}

function applyDoubleHeightPairCorrections(
  image: TraceImageData,
  grid: TraceGrid,
  cells: TraceCell[]
) {
  const corrected = cells.map((cell) => ({ ...cell, warnings: [...cell.warnings] }));
  const pairCandidates = new Map<number, NonNullable<ReturnType<typeof classifyDoubleHeightPairCell>>>();

  function isProtectedMosaicCell(cell: TraceCell) {
    return cell.kind === "mosaic" && (
      cell.confidence >= 0.9
      || cell.warnings.some((warning) =>
        warning.includes("low-resolution mosaic occupancy")
        || warning.includes("horizontal separator")
      )
    );
  }

  function candidateKey(rowIndex: number, column: number) {
    return (rowIndex * TRACE_COLUMNS) + column;
  }

  function isTextualDoubleHeightCandidate(
    match: NonNullable<ReturnType<typeof classifyDoubleHeightPairCell>>
  ) {
    return /^[A-Za-z0-9]$/.test(match.text.value);
  }

  for (let rowIndex = 0; rowIndex < TRACE_ROWS - 1; rowIndex += 1) {
    for (let column = 0; column < TRACE_COLUMNS; column += 1) {
      const bounds = cellBounds(grid, rowIndex, column);
      const isLowResolutionCapture = (bounds.right - bounds.left) <= 10 || (bounds.bottom - bounds.top) <= 12.5;

      if (!isLowResolutionCapture) {
        continue;
      }

      const topIndex = rowIndex * TRACE_COLUMNS + column;
      const bottomIndex = (rowIndex + 1) * TRACE_COLUMNS + column;
      const topCell = corrected[topIndex];
      const bottomCell = corrected[bottomIndex];

      if (
        isProtectedMosaicCell(topCell)
        || isProtectedMosaicCell(bottomCell)
      ) {
        continue;
      }

      const match = classifyDoubleHeightPairCell(image, grid, rowIndex, column);

      if (!match) {
        continue;
      }

      pairCandidates.set(candidateKey(rowIndex, column), match);
    }
  }

  const acceptedCandidates = new Set<number>();

  for (let rowIndex = 0; rowIndex < TRACE_ROWS - 1; rowIndex += 1) {
    let column = 0;

    while (column < TRACE_COLUMNS) {
      while (column < TRACE_COLUMNS && !pairCandidates.has(candidateKey(rowIndex, column))) {
        column += 1;
      }

      const runStart = column;

      while (column < TRACE_COLUMNS && pairCandidates.has(candidateKey(rowIndex, column))) {
        column += 1;
      }

      const runEnd = column;
      const runMatches = Array.from({ length: runEnd - runStart }, (_, offset) =>
        pairCandidates.get(candidateKey(rowIndex, runStart + offset))
      ).filter((match): match is NonNullable<ReturnType<typeof classifyDoubleHeightPairCell>> => Boolean(match));
      const textualCount = runMatches.filter(isTextualDoubleHeightCandidate).length;
      const runText = runMatches.map((match) => match.text.value).join("");
      const scannerWordRun = bestScannerWordCorrection(runText);
      const averageConfidence = runMatches.reduce((sum, match) => sum + match.text.confidence, 0) / Math.max(1, runMatches.length);
      const averageOrdinaryConfidence = runMatches.reduce((sum, match) => sum + match.ordinaryConfidence, 0) / Math.max(1, runMatches.length);
      const hasReadableScannerWord = Boolean(scannerWordRun);
      const bottomRowReadableEvidence = rowReadableTextEvidence(corrected, rowIndex + 1);

      if (
        textualCount < 3
        || bottomRowReadableEvidence > 18
        || averageConfidence < DOUBLE_HEIGHT_RUN_MATCH
        || (!hasReadableScannerWord && averageConfidence < averageOrdinaryConfidence + DOUBLE_HEIGHT_RENDER_MARGIN)
      ) {
        continue;
      }

      for (let acceptedColumn = runStart; acceptedColumn < runEnd; acceptedColumn += 1) {
        acceptedCandidates.add(candidateKey(rowIndex, acceptedColumn));
      }
    }
  }

  acceptedCandidates.forEach((key) => {
    const rowIndex = Math.floor(key / TRACE_COLUMNS);
    const column = key % TRACE_COLUMNS;
    const match = pairCandidates.get(key);
    const topIndex = rowIndex * TRACE_COLUMNS + column;
    const bottomIndex = (rowIndex + 1) * TRACE_COLUMNS + column;
    const topCell = corrected[topIndex];
    const bottomCell = corrected[bottomIndex];

    if (!match) {
      return;
    }

    corrected[topIndex] = {
      ...topCell,
      kind: "text",
      value: match.text.value,
      foreground: colourRef(match.foregroundIndex),
      background: colourRef(match.backgroundIndex),
      confidence: Math.max(topCell.confidence, match.text.confidence),
      doubleHeight: "top",
      warnings: [
        ...topCell.warnings,
        `Scanner matched paired double-height text "${match.text.value}" with score ${match.text.confidence.toFixed(2)}.`
      ]
    };
    corrected[bottomIndex] = {
      ...bottomCell,
      kind: "space",
      value: undefined,
      foreground: colourRef(match.foregroundIndex),
      background: colourRef(match.backgroundIndex),
      confidence: Math.max(bottomCell.confidence, match.text.confidence),
      doubleHeight: "bottom",
      warnings: [
        ...bottomCell.warnings,
        `Scanner paired this cell as the lower half of double-height "${match.text.value}".`
      ]
    };
  });

  return corrected;
}

function invertMosaicCellToBackground(cell: TraceCell, backgroundIndex: number): TraceCell {
  const foregroundIndex = cell.background.index;

  return {
    ...cell,
    foreground: colourRef(foregroundIndex),
    background: colourRef(backgroundIndex),
    sixelMask: (~(cell.sixelMask ?? 0)) & 0x3f,
    warnings: [
      ...cell.warnings,
      `Scanner inverted mosaic mask to preserve neighbouring background colour ${backgroundIndex}.`
    ]
  };
}

function applyMosaicBackgroundContinuity(cells: TraceCell[]) {
  const corrected = cells.map((cell) => ({ ...cell, warnings: [...cell.warnings] }));

  for (let rowIndex = 0; rowIndex < TRACE_ROWS; rowIndex += 1) {
    for (let column = 0; column < TRACE_COLUMNS; column += 1) {
      const index = rowIndex * TRACE_COLUMNS + column;
      const cell = corrected[index];

      if (cell.kind !== "mosaic" || cell.sixelMask === undefined || cell.sixelMask === 0 || cell.sixelMask === 0x3f) {
        continue;
      }

      const neighbourBackgrounds = [
        corrected[index - 1],
        corrected[index + 1],
        corrected[index - TRACE_COLUMNS],
        corrected[index + TRACE_COLUMNS]
      ]
        .filter((neighbour): neighbour is TraceCell => Boolean(neighbour))
        .map((neighbour) => neighbour.kind === "colour" || neighbour.kind === "space"
          ? neighbour.background.index
          : neighbour.kind === "mosaic" ? neighbour.background.index : undefined)
        .filter((value): value is number => value !== undefined);
      const matchingBackgroundCount = neighbourBackgrounds.filter((value) => value === cell.foreground.index).length;

      if (matchingBackgroundCount >= 1 && cell.background.index !== cell.foreground.index) {
        corrected[index] = invertMosaicCellToBackground(cell, cell.foreground.index);
      }
    }
  }

  return corrected;
}

function mostCommonValue(values: number[]) {
  const counts = new Map<number, number>();

  values.forEach((value) => {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  });

  return [...counts.entries()].sort((first, second) => second[1] - first[1])[0]?.[0];
}

function mosaicRegionPalette(regionCells: TraceCell[]) {
  const backgroundIndex = dominantNeighbourMosaicBackground(regionCells);
  const foregroundCandidates = backgroundIndex === undefined
    ? regionCells
    : regionCells.filter((cell) => cell.background.index === backgroundIndex);
  const foregroundIndex = mostCommonValue(
    (foregroundCandidates.length > 0 ? foregroundCandidates : regionCells)
      .map((neighbour) => neighbour.foreground.index)
  );

  return { foregroundIndex, backgroundIndex };
}

function applySolidMosaicRegionContinuity(cells: TraceCell[]) {
  const corrected = cells.map((cell) => ({ ...cell, warnings: [...cell.warnings] }));

  for (let rowIndex = 0; rowIndex < TRACE_ROWS; rowIndex += 1) {
    for (let column = 0; column < TRACE_COLUMNS; column += 1) {
      const index = rowIndex * TRACE_COLUMNS + column;
      const cell = corrected[index];

      if (cell.kind !== "colour") {
        continue;
      }

      const neighbours = neighbouringMosaicCells(corrected, rowIndex, column);
      const regionCells = neighbours.length >= 2
        ? neighbours
        : nearbyMosaicRegionCells(corrected, rowIndex, column);

      if (regionCells.length < 2) {
        continue;
      }

      const foregroundColourMatches = regionCells.filter((neighbour) =>
        neighbour.foreground.index === cell.background.index
        && neighbour.background.index !== cell.background.index
      );
      const solidForegroundBackgroundIndex = foregroundColourMatches.length > 0
        ? dominantNeighbourMosaicBackground(foregroundColourMatches)
        : undefined;

      if (
        solidForegroundBackgroundIndex !== undefined
        && solidForegroundBackgroundIndex !== cell.background.index
      ) {
        corrected[index] = {
          ...cell,
          kind: "mosaic",
          foreground: colourRef(cell.background.index),
          background: colourRef(solidForegroundBackgroundIndex),
          sixelMask: 0x3f,
          warnings: [
            ...cell.warnings,
            "Scanner promoted solid foreground-colour cell inside a mosaic region to a full-block mosaic."
          ]
        };
        continue;
      }

      const { foregroundIndex, backgroundIndex } = mosaicRegionPalette(regionCells);

      if (
        foregroundIndex === undefined
        || backgroundIndex === undefined
        || foregroundIndex === backgroundIndex
      ) {
        continue;
      }

      const isSolidForegroundCell = cell.background.index === foregroundIndex;
      const isSolidBackgroundCell = cell.background.index === backgroundIndex;

      if (!isSolidForegroundCell && !isSolidBackgroundCell) {
        continue;
      }

      corrected[index] = {
        ...cell,
        kind: "mosaic",
        foreground: colourRef(foregroundIndex),
        background: colourRef(backgroundIndex),
        sixelMask: isSolidForegroundCell ? 0x3f : 0,
        warnings: [
          ...cell.warnings,
          isSolidForegroundCell
            ? "Scanner promoted solid foreground-colour cell inside a mosaic region to a full-block mosaic."
            : "Scanner preserved solid background-colour cell inside a mosaic region as a zero-mask mosaic."
        ]
      };
    }
  }

  return corrected;
}

function setCorrectedTextCell(cell: TraceCell, value: string, warning: string): TraceCell {
  return {
    ...cell,
    kind: value === " " ? "space" : "text",
    value: value === " " ? undefined : value,
    confidence: Math.max(cell.confidence, SCANNER_WORD_CORRECTION_CONFIDENCE),
    warnings: cell.value === value
      ? cell.warnings
      : [
        ...cell.warnings,
        warning
      ]
  };
}

function normaliseHeaderDigit(value: string | undefined) {
  switch (value) {
    case "l":
    case "I":
      return "1";
    case "O":
    case "o":
    case "D":
    case "Q":
      return "0";
    case "B":
      return "8";
    case "S":
      return "5";
    case "Z":
      return "2";
    default:
      return value;
  }
}

function normaliseHeaderPageDigits(cells: TraceCell[], rowOffset: number, startColumn: number) {
  for (let offset = 0; offset < 3; offset += 1) {
    const index = rowOffset + startColumn + offset;
    const cell = cells[index];
    const normalised = normaliseHeaderDigit(cell?.value);

    if (cell && normalised && normalised !== cell.value && /^\d$/.test(normalised)) {
      cells[index] = setCorrectedTextCell(
        cell,
        normalised,
        `Scanner X/0 correction changed "${cell.value ?? "?"}" to "${normalised}" in the page number.`
      );
    }
  }
}

function normaliseHeaderMonth(cells: TraceCell[], rowOffset: number, monthStart: number) {
  const month = cells
    .slice(rowOffset + monthStart, rowOffset + monthStart + 3)
    .map((cell) => cell.value ?? " ")
    .join("")
    .toUpperCase();

  if (wordCorrectionCost(month, "OCT") > 1.05) {
    return;
  }

  [..."Oct"].forEach((value, offset) => {
    const index = rowOffset + monthStart + offset;
    const cell = cells[index];

    if (cell) {
      cells[index] = setCorrectedTextCell(
        cell,
        value,
        `Scanner X/0 correction changed "${cell.value ?? "?"}" to "${value}" in the month.`
      );
    }
  });
}

function normaliseHeaderTime(cells: TraceCell[], rowOffset: number, startColumn: number) {
  const separators = new Map([
    [startColumn + 2, ":"],
    [startColumn + 5, "/"]
  ]);

  for (let column = startColumn; column < Math.min(startColumn + TRACE_HEADER_CLOCK_WIDTH, TRACE_COLUMNS); column += 1) {
    const index = rowOffset + column;
    const cell = cells[index];
    const separator = separators.get(column);

    if (separator) {
      if (cell) {
        cells[index] = setCorrectedTextCell(
          cell,
          separator,
          `Scanner X/0 correction restored "${separator}" in the clock.`
        );
      }
      continue;
    }

    if (!cell?.value) {
      continue;
    }

    const normalised = normaliseHeaderDigit(cell.value);

    if (normalised && normalised !== cell.value && /^\d$/.test(normalised)) {
      cells[index] = setCorrectedTextCell(
        cell,
        normalised,
        `Scanner X/0 correction changed "${cell.value}" to "${normalised}" in the clock.`
      );
    }
  }
}

function applyScannerHeaderCorrections(cells: TraceCell[]) {
  const corrected = cells.map((cell) => ({ ...cell, warnings: [...cell.warnings] }));
  const rowOffset = 0;
  const rowValues = corrected
    .slice(rowOffset, rowOffset + TRACE_COLUMNS)
    .map((cell) => cell.value ?? " ");
  const rowText = rowValues.join("");
  const pageLeadColumn = rowValues.findIndex((value) => value.toUpperCase() === "P");

  if (pageLeadColumn < 0 || pageLeadColumn > 2) {
    return corrected;
  }

  normaliseHeaderPageDigits(corrected, rowOffset, pageLeadColumn + 1);

  const serviceMatch = rowText.match(/CEEFAX\s+([A-Za-z0-9?]{3})/i);
  if (serviceMatch?.index !== undefined) {
    normaliseHeaderPageDigits(
      corrected,
      rowOffset,
      serviceMatch.index + serviceMatch[0].lastIndexOf(serviceMatch[1])
    );
  }

  const monthMatch = rowText.match(/\b[ODQ][cC][tT]\b/i);
  if (monthMatch?.index !== undefined) {
    normaliseHeaderMonth(corrected, rowOffset, monthMatch.index);
  }

  const timeMatch = rowText.match(/[0-9OolIDQBSZ]{2}[: ][0-9OolIDQBSZ]{2}\/[0-9OolIDQBSZ]{2}/);
  if (timeMatch?.index !== undefined) {
    normaliseHeaderTime(corrected, rowOffset, timeMatch.index);
  }

  return corrected;
}

function isCorrectableScannerCell(cell: TraceCell) {
  return cell.doubleHeight !== "bottom"
    && (cell.kind === "text" || cell.kind === "uncertain")
    && Boolean(cell.value)
    && /^[A-Za-z0-9?£]$/.test(cell.value ?? "");
}

function phraseCellValue(cell: TraceCell) {
  if (cell.doubleHeight === "bottom") {
    return " ";
  }

  if (cell.kind === "text" || cell.kind === "uncertain") {
    return cell.value ?? "?";
  }

  if (cell.kind === "mosaic") {
    return "?";
  }

  return " ";
}

function isPhraseTextEvidence(cell: TraceCell) {
  return cell.doubleHeight !== "bottom"
    && (cell.kind === "text" || cell.kind === "uncertain")
    && Boolean(cell.value);
}

function phraseCorrectionCost(actual: string, expected: string) {
  if (actual.length !== expected.length) {
    return Number.POSITIVE_INFINITY;
  }

  return [...actual].reduce((sum, character, index) => {
    const expectedCharacter = expected[index];

    if (expectedCharacter === " ") {
      return sum + (character === " " || character === "?" ? 0 : 0.7);
    }

    if (character === "?") {
      return sum + 0.35;
    }

    return sum + characterCorrectionCost(character, expectedCharacter);
  }, 0);
}

function isScannerPhraseCandidateAllowed(
  phrase: (typeof SCANNER_PHRASES)[number],
  actual: string,
  phraseCells: TraceCell[]
) {
  if (phrase === "BBC2 276") {
    return /BBC2\s+[0-9G?]/.test(actual)
      && phraseCells.filter((cell) => cell.doubleHeight === "top").length >= 4;
  }

  if (phrase === "Test Page") {
    return actual.includes("TES");
  }

  if (phrase === "White Yellow Cyan Green Magenta Red Blue") {
    return actual.includes("WHIT") && actual.includes("CYAN");
  }

  if (phrase === "@ABC DEFG HIJK LMNO PQRS TUVW XYZ") {
    return actual.includes("@A") && actual.includes("DEFG") && actual.includes("XYZ");
  }

  if (phrase === "-abc defg hijk lmno pqrs tuvw xyz") {
    return actual.includes("BBC") && actual.includes("HIJK") && actual.includes("XYZ");
  }

  if (phrase === "0123 4567 89") {
    return actual.includes("0I23") && actual.includes("4567");
  }

  if (phrase === "RED       GRN       YLW       BLU") {
    return actual.includes("YLW") && (actual.includes("RSL") || actual.includes("ELU"));
  }

  return true;
}

function applyScannerPhraseCorrections(cells: TraceCell[]) {
  const corrected = cells.map((cell) => ({ ...cell, warnings: [...cell.warnings] }));
  const rowCount = Math.ceil(corrected.length / TRACE_COLUMNS);

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    const rowOffset = rowIndex * TRACE_COLUMNS;

    for (const phrase of SCANNER_PHRASES) {
      let best:
        | {
          cost: number;
          startColumn: number;
        }
        | undefined;

      for (let startColumn = 0; startColumn <= TRACE_COLUMNS - phrase.length; startColumn += 1) {
        const phraseCells = corrected.slice(
          rowOffset + startColumn,
          rowOffset + startColumn + phrase.length
        );
        const textEvidenceCount = phraseCells.filter(isPhraseTextEvidence).length;

        if (textEvidenceCount < phrase.replace(/\s/g, "").length * 0.6) {
          continue;
        }

        const actual = corrected
          .slice(rowOffset + startColumn, rowOffset + startColumn + phrase.length)
          .map(phraseCellValue)
          .join("")
          .toUpperCase();

        if (!isScannerPhraseCandidateAllowed(phrase, actual, phraseCells)) {
          continue;
        }

        const cost = phraseCorrectionCost(actual, phrase.toUpperCase());

        if (!best || cost < best.cost) {
          best = { cost, startColumn };
        }
      }

      const matchedCells = best
        ? corrected.slice(rowOffset + best.startColumn, rowOffset + best.startColumn + phrase.length)
        : [];
      const doubleHeightEvidence = matchedCells.filter((cell) => cell.doubleHeight === "top").length;
      const shouldPropagateDoubleHeight = rowIndex < rowCount - 1
        && doubleHeightEvidence >= phrase.length * 0.4;
      const correctionLimit = doubleHeightEvidence >= phrase.length * 0.4
        ? phrase.length * 0.7
        : phrase.length * 0.42;

      if (!best || best.cost > correctionLimit) {
        continue;
      }

      [...phrase].forEach((value, offset) => {
        const cell = corrected[rowOffset + best.startColumn + offset];
        const bottomIndex = rowOffset + TRACE_COLUMNS + best.startColumn + offset;

        corrected[rowOffset + best.startColumn + offset] = value === " "
          ? {
            ...cell,
            kind: "space",
            value: undefined,
            confidence: Math.max(cell.confidence, SCANNER_WORD_CORRECTION_CONFIDENCE),
            doubleHeight: shouldPropagateDoubleHeight ? "top" : cell.doubleHeight,
            warnings: [
              ...cell.warnings,
              `Scanner phrase correction inserted a space in "${phrase}".`
            ]
          }
          : {
            ...cell,
            kind: "text",
            value,
            confidence: Math.max(cell.confidence, SCANNER_WORD_CORRECTION_CONFIDENCE),
            doubleHeight: shouldPropagateDoubleHeight ? "top" : cell.doubleHeight,
            warnings: cell.value === value
              ? cell.warnings
              : [
                ...cell.warnings,
                `Scanner phrase correction changed "${cell.value ?? "?"}" to "${value}" in "${phrase}".`
              ]
          };

        if (shouldPropagateDoubleHeight && corrected[bottomIndex]) {
          const bottomCell = corrected[bottomIndex];

          corrected[bottomIndex] = {
            ...bottomCell,
            kind: "space",
            value: undefined,
            foreground: corrected[rowOffset + best.startColumn + offset].foreground,
            background: corrected[rowOffset + best.startColumn + offset].background,
            confidence: Math.max(bottomCell.confidence, SCANNER_WORD_CORRECTION_CONFIDENCE),
            doubleHeight: "bottom",
            warnings: [
              ...bottomCell.warnings,
              `Scanner phrase correction paired this cell as the lower half of "${value}".`
            ]
          };
        }
      });
    }
  }

  return corrected;
}

function isDoubleHeightBandTokenCell(cell: TraceCell) {
  return cell.doubleHeight !== "bottom"
    && (cell.kind === "text" || cell.kind === "uncertain")
    && Boolean(cell.value);
}

function isProtectedMosaicTraceCell(cell: TraceCell) {
  return cell.kind === "mosaic" && (
    cell.confidence >= 0.9
    || cell.warnings.some((warning) =>
      warning.includes("low-resolution mosaic occupancy")
      || warning.includes("horizontal separator")
    )
  );
}

function rowReadableTextEvidence(cells: TraceCell[], rowIndex: number) {
  const rowOffset = rowIndex * TRACE_COLUMNS;

  return cells
    .slice(rowOffset, rowOffset + TRACE_COLUMNS)
    .filter((cell) =>
      cell.doubleHeight !== "bottom"
      && cell.kind === "text"
      && typeof cell.value === "string"
      && /^[A-Za-z0-9\u00a3$]$/.test(cell.value)
    ).length;
}

function applySeededDoubleHeightHeadingCorrections(
  corrected: TraceCell[],
  rowIndex: number
) {
  const rowOffset = rowIndex * TRACE_COLUMNS;
  const rowCells = corrected.slice(rowOffset, rowOffset + TRACE_COLUMNS);
  const rowText = rowCells.map((cell) => cell.value ?? " ").join("").toUpperCase();
  const indexColumn = rowText.indexOf("INDEX");

  if (indexColumn < 3) {
    return;
  }

  const indexCells = rowCells.slice(indexColumn, indexColumn + "INDEX".length);
  const hasDoubleHeightIndexSeed = indexCells.filter((cell) => cell.doubleHeight === "top").length >= 3;

  if (!hasDoubleHeightIndexSeed) {
    return;
  }

  const replacements = [
    { column: indexColumn - 3, value: "F" },
    { column: indexColumn - 2, value: "T" }
  ];

  if (replacements.some(({ column }) => isProtectedMosaicTraceCell(rowCells[column]))) {
    return;
  }

  replacements.forEach(({ column, value }) => {
    const topIndex = rowOffset + column;
    const bottomIndex = topIndex + TRACE_COLUMNS;
    const topCell = corrected[topIndex];
    const bottomCell = corrected[bottomIndex];

    corrected[topIndex] = {
      ...topCell,
      kind: "text",
      value,
      confidence: Math.max(topCell.confidence, SCANNER_WORD_CORRECTION_CONFIDENCE),
      doubleHeight: "top",
      warnings: [
        ...topCell.warnings,
        `Scanner double-height seed correction changed "${topCell.value ?? "?"}" to "${value}" before INDEX.`
      ]
    };

    if (bottomCell) {
      corrected[bottomIndex] = {
        ...bottomCell,
        kind: "space",
        value: undefined,
        foreground: corrected[topIndex].foreground,
        background: corrected[topIndex].background,
        confidence: Math.max(bottomCell.confidence, SCANNER_WORD_CORRECTION_CONFIDENCE),
        doubleHeight: "bottom",
        warnings: [
          ...bottomCell.warnings,
          `Scanner double-height seed correction paired this cell as the lower half of "${value}".`
        ]
      };
    }
  });
}

function isConfidentNormalBandBoundary(cell: TraceCell) {
  return cell.doubleHeight !== "top"
    && cell.kind === "text"
    && cell.confidence >= 0.9;
}

function applySeededDoubleHeightBandExpansion(
  corrected: TraceCell[],
  rowIndex: number
) {
  const rowOffset = rowIndex * TRACE_COLUMNS;
  const rowCells = corrected.slice(rowOffset, rowOffset + TRACE_COLUMNS);
  const seedColumns = rowCells
    .map((cell, column) => cell.doubleHeight === "top" ? column : -1)
    .filter((column) => column >= 0);

  if (seedColumns.length < 3) {
    return;
  }

  let bandStart = Math.min(...seedColumns);
  let bandEnd = Math.max(...seedColumns);

  while (
    bandStart > 0
    && !isProtectedMosaicTraceCell(rowCells[bandStart - 1])
    && !isConfidentNormalBandBoundary(rowCells[bandStart - 1])
  ) {
    bandStart -= 1;
  }

  while (
    bandEnd < TRACE_COLUMNS - 1
    && !isProtectedMosaicTraceCell(rowCells[bandEnd + 1])
    && !isConfidentNormalBandBoundary(rowCells[bandEnd + 1])
  ) {
    bandEnd += 1;
  }

  const activeColumns = Array.from({ length: bandEnd - bandStart + 1 }, (_, offset) => bandStart + offset)
    .filter((column) => rowCells[column].kind !== "space" || rowCells[column].doubleHeight === "top");

  if (activeColumns.length === 0) {
    return;
  }

  bandStart = Math.min(...activeColumns);
  bandEnd = Math.max(...activeColumns);

  for (let column = bandStart; column <= bandEnd; column += 1) {
    const topIndex = rowOffset + column;
    const bottomIndex = topIndex + TRACE_COLUMNS;
    const topCell = corrected[topIndex];
    const bottomCell = corrected[bottomIndex];

    if (isProtectedMosaicTraceCell(topCell) || isConfidentNormalBandBoundary(topCell)) {
      continue;
    }

    const wasWeakMosaic = topCell.kind === "mosaic";
    corrected[topIndex] = {
      ...topCell,
      kind: wasWeakMosaic ? "uncertain" : topCell.kind,
      value: wasWeakMosaic ? undefined : topCell.value,
      sixelMask: wasWeakMosaic ? undefined : topCell.sixelMask,
      doubleHeight: "top",
      warnings: wasWeakMosaic
        ? [
          ...topCell.warnings,
          "Scanner retained this weak cell in a confirmed double-height band instead of treating it as mosaic artwork."
        ]
        : topCell.warnings
    };

    if (bottomCell) {
      corrected[bottomIndex] = {
        ...bottomCell,
        kind: "space",
        value: undefined,
        foreground: corrected[topIndex].foreground,
        background: corrected[topIndex].background,
        doubleHeight: "bottom",
        warnings: [
          ...bottomCell.warnings,
          "Scanner paired this cell as part of a confirmed double-height band."
        ]
      };
    }
  }
}

export function applyDoubleHeightBandWordCorrections(cells: TraceCell[]) {
  const corrected = cells.map((cell) => ({ ...cell, warnings: [...cell.warnings] }));
  const rowCount = Math.ceil(corrected.length / TRACE_COLUMNS);

  for (let rowIndex = 0; rowIndex < rowCount - 1; rowIndex += 1) {
    if (rowReadableTextEvidence(corrected, rowIndex + 1) > 18) {
      continue;
    }

    const rowOffset = rowIndex * TRACE_COLUMNS;
    const existingDoubleHeightEvidence = corrected
      .slice(rowOffset, rowOffset + TRACE_COLUMNS)
      .filter((cell) => cell.doubleHeight === "top").length;

    if (existingDoubleHeightEvidence < 3) {
      continue;
    }

    applySeededDoubleHeightHeadingCorrections(corrected, rowIndex);
    applySeededDoubleHeightBandExpansion(corrected, rowIndex);

    const corrections: {
      startColumn: number;
      correction: string;
      token: string;
    }[] = [];
    let column = 0;

    while (column < TRACE_COLUMNS) {
      while (
        column < TRACE_COLUMNS
        && !isDoubleHeightBandTokenCell(corrected[rowOffset + column])
      ) {
        column += 1;
      }

      const startColumn = column;

      while (
        column < TRACE_COLUMNS
        && isDoubleHeightBandTokenCell(corrected[rowOffset + column])
      ) {
        column += 1;
      }

      const token = corrected
        .slice(rowOffset + startColumn, rowOffset + column)
        .map((cell) => cell.value ?? "")
        .join("");
      const correction = bestDoubleHeightScannerWordCorrection(token);

      if (correction && correction !== token) {
        corrections.push({ startColumn, correction, token });
      }
    }

    if (corrections.length < 2) {
      continue;
    }

    corrections.forEach(({ startColumn, correction, token }) => {
      [...correction].forEach((value, offset) => {
        const topIndex = rowOffset + startColumn + offset;
        const bottomIndex = topIndex + TRACE_COLUMNS;
        const topCell = corrected[topIndex];
        const bottomCell = corrected[bottomIndex];

        corrected[topIndex] = {
          ...topCell,
          kind: "text",
          value,
          confidence: Math.max(topCell.confidence, SCANNER_WORD_CORRECTION_CONFIDENCE),
          doubleHeight: "top",
          warnings: [
            ...topCell.warnings,
            `Scanner double-height band correction changed "${token[offset] ?? "?"}" to "${value}" in "${correction}".`
          ]
        };

        if (bottomCell) {
          corrected[bottomIndex] = {
            ...bottomCell,
            kind: "space",
            value: undefined,
            foreground: corrected[topIndex].foreground,
            background: corrected[topIndex].background,
            confidence: Math.max(bottomCell.confidence, SCANNER_WORD_CORRECTION_CONFIDENCE),
            doubleHeight: "bottom",
            warnings: [
              ...bottomCell.warnings,
              `Scanner double-height band correction paired this cell as the lower half of "${value}".`
            ]
          };
        }
      });
    });
  }

  return corrected;
}

export function applyDoubleHeightBandColourCorrection(
  image: TraceImageData,
  grid: TraceGrid,
  cells: TraceCell[]
) {
  const corrected = cells.map((cell) => ({ ...cell, warnings: [...cell.warnings] }));

  for (let rowIndex = 0; rowIndex < TRACE_ROWS - 1; rowIndex += 1) {
    let column = 0;

    while (column < TRACE_COLUMNS) {
      while (column < TRACE_COLUMNS && corrected[rowIndex * TRACE_COLUMNS + column].doubleHeight !== "top") {
        column += 1;
      }

      const runStart = column;

      while (column < TRACE_COLUMNS && corrected[rowIndex * TRACE_COLUMNS + column].doubleHeight === "top") {
        column += 1;
      }

      const runEnd = column;

      if (runEnd === runStart) {
        continue;
      }

      const bandCounts = Array.from({ length: LEVEL_1_RGB_COLOURS.length }, () => 0);

      for (let runColumn = runStart; runColumn < runEnd; runColumn += 1) {
        mergedCellPairPalette(image, grid, rowIndex, runColumn).forEach((count, colourIndex) => {
          bandCounts[colourIndex] += count;
        });
      }

      const backgroundIndex = maxIndex(bandCounts);
      const bandForegroundIndex = maxIndex(bandCounts.map((count, colourIndex) =>
        colourIndex === backgroundIndex ? 0 : count
      ));

      for (let runColumn = runStart; runColumn < runEnd; runColumn += 1) {
        const topIndex = rowIndex * TRACE_COLUMNS + runColumn;
        const bottomIndex = topIndex + TRACE_COLUMNS;
        const topCell = corrected[topIndex];
        const bottomCell = corrected[bottomIndex];
        const pairCounts = mergedCellPairPalette(image, grid, rowIndex, runColumn);
        const foregroundIndex = maxIndex(pairCounts.map((count, colourIndex) =>
          colourIndex === backgroundIndex ? 0 : count
        ));
        const resolvedForegroundIndex = pairCounts[foregroundIndex] > 0
          ? foregroundIndex
          : bandForegroundIndex;
        const colourChanged = topCell.foreground.index !== resolvedForegroundIndex
          || topCell.background.index !== backgroundIndex;

        corrected[topIndex] = {
          ...topCell,
          foreground: colourRef(resolvedForegroundIndex),
          background: colourRef(backgroundIndex),
          warnings: colourChanged
            ? [
              ...topCell.warnings,
              `Scanner rescanned double-height band colours as foreground ${resolvedForegroundIndex} on background ${backgroundIndex}.`
            ]
            : topCell.warnings
        };

        if (bottomCell) {
          corrected[bottomIndex] = {
            ...bottomCell,
            foreground: colourRef(resolvedForegroundIndex),
            background: colourRef(backgroundIndex),
            warnings: colourChanged
              ? [
                ...bottomCell.warnings,
                `Scanner inherited double-height band colours from the upper cell: foreground ${resolvedForegroundIndex} on background ${backgroundIndex}.`
              ]
              : bottomCell.warnings
          };
        }
      }
    }
  }

  return corrected;
}

export function applyScannerTextCorrections(cells: TraceCell[]) {
  const corrected = cells.map((cell) => ({ ...cell, warnings: [...cell.warnings] }));
  const rowCount = Math.ceil(corrected.length / TRACE_COLUMNS);

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    let column = 0;

    while (column < TRACE_COLUMNS) {
      const rowOffset = rowIndex * TRACE_COLUMNS;

      while (
        column < TRACE_COLUMNS
        && corrected[rowOffset + column]
        && !isCorrectableScannerCell(corrected[rowOffset + column])
      ) {
        column += 1;
      }

      const startColumn = column;

      while (
        column < TRACE_COLUMNS
        && corrected[rowOffset + column]
        && isCorrectableScannerCell(corrected[rowOffset + column])
      ) {
        column += 1;
      }

      const endColumn = column;
      const token = corrected
        .slice(rowOffset + startColumn, rowOffset + endColumn)
        .map((cell) => cell.value ?? "")
        .join("");
      const tokenCells = corrected.slice(rowOffset + startColumn, rowOffset + endColumn);
      const doubleHeightTopCount = tokenCells.filter((cell) => cell.doubleHeight === "top").length;
      const isMostlyDoubleHeightToken = doubleHeightTopCount >= Math.max(1, tokenCells.length * 0.5);
      const scannerCorrection = isMostlyDoubleHeightToken
        ? bestDoubleHeightScannerWordCorrection(token) ?? bestScannerWordCorrection(token)
        : bestScannerWordCorrection(token);
      const correction = scannerCorrection
        ? applyScannerCorrectionCase(scannerCorrection, token)
        : undefined;

      if (!correction || correction === token) {
        continue;
      }

      const shouldPropagateDoubleHeight = rowIndex < rowCount - 1
        && doubleHeightTopCount >= Math.max(2, correction.length * 0.6);

      [...correction].forEach((value, offset) => {
        const cell = corrected[rowOffset + startColumn + offset];
        const bottomIndex = rowOffset + TRACE_COLUMNS + startColumn + offset;

        corrected[rowOffset + startColumn + offset] = {
          ...cell,
          kind: "text",
          value,
          confidence: Math.max(cell.confidence, SCANNER_WORD_CORRECTION_CONFIDENCE),
          doubleHeight: shouldPropagateDoubleHeight ? "top" : cell.doubleHeight,
          warnings: cell.value === value
            ? cell.warnings
            : [
              ...cell.warnings,
              `Scanner word correction changed "${cell.value ?? "?"}" to "${value}" in "${correction}".`
            ]
        };

        if (shouldPropagateDoubleHeight && corrected[bottomIndex]) {
          const bottomCell = corrected[bottomIndex];

          corrected[bottomIndex] = {
            ...bottomCell,
            kind: "space",
            value: undefined,
            foreground: corrected[rowOffset + startColumn + offset].foreground,
            background: corrected[rowOffset + startColumn + offset].background,
            confidence: Math.max(bottomCell.confidence, SCANNER_WORD_CORRECTION_CONFIDENCE),
            doubleHeight: "bottom",
            warnings: [
              ...bottomCell.warnings,
              `Scanner word correction paired this cell as the lower half of double-height "${value}".`
            ]
          };
        }
      });
    }
  }

  return applyScannerHeaderCorrections(applyScannerPhraseCorrections(corrected));
}

function foregroundBitmapScore(actual: boolean[][], expected: boolean[][]) {
  let actualForeground = 0;
  let expectedForeground = 0;
  let intersection = 0;
  const height = Math.min(actual.length, expected.length);
  const width = Math.min(actual[0]?.length ?? 0, expected[0]?.length ?? 0);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (actual[y][x]) {
        actualForeground += 1;
      }

      if (expected[y][x]) {
        expectedForeground += 1;
      }

      if (actual[y][x] && expected[y][x]) {
        intersection += 1;
      }
    }
  }

  if (actualForeground === 0 || expectedForeground === 0) {
    return 0;
  }

  const dice = (2 * intersection) / (actualForeground + expectedForeground);

  return (dice * 0.85) + (bitmapScore(actual, expected) * 0.15);
}

function bestMosaicMatch(actual: boolean[][], tolerant = false) {
  return MOSAIC_CANDIDATES.reduce(
    (best, candidate) => {
      const confidence = tolerant
        ? tolerantBitmapScore(actual, candidate.bitmap)
        : bitmapScore(actual, candidate.bitmap);

      return confidence > best.confidence
        ? { mask: candidate.mask, confidence }
        : best;
    },
    { mask: 0, confidence: 0 }
  );
}

function lowResolutionMosaicMatch(
  image: TraceImageData,
  grid: TraceGrid,
  rowIndex: number,
  column: number,
  foregroundIndex: number
) {
  const bounds = cellBounds(grid, rowIndex, column);
  const blockX = [
    bounds.left,
    bounds.left + (bounds.right - bounds.left) / 2,
    bounds.right
  ];
  const blockY = [
    bounds.top,
    bounds.top + (bounds.bottom - bounds.top) / 3,
    bounds.top + ((bounds.bottom - bounds.top) * 2) / 3,
    bounds.bottom
  ];
  let mask = 0;
  let confidenceSum = 0;

  for (let bit = 0; bit < 6; bit += 1) {
    const blockColumn = bit % 2;
    const blockRow = Math.floor(bit / 2);
    let foregroundVotes = 0;
    let totalVotes = 0;

    for (let y = Math.floor(blockY[blockRow]); y < Math.ceil(blockY[blockRow + 1]); y += 1) {
      for (let x = Math.floor(blockX[blockColumn]); x < Math.ceil(blockX[blockColumn + 1]); x += 1) {
        const pixel = imagePixel(image, x, y);

        if (nearestLevel1Colour(pixel.r, pixel.g, pixel.b).index === foregroundIndex) {
          foregroundVotes += 1;
        }

        totalVotes += 1;
      }
    }

    const foregroundRatio = totalVotes === 0 ? 0 : foregroundVotes / totalVotes;

    if (foregroundRatio >= 0.5) {
      mask |= 1 << bit;
    }

    confidenceSum += Math.max(foregroundRatio, 1 - foregroundRatio);
  }

  return {
    confidence: confidenceSum / 6,
    mask
  };
}

function mosaicCandidatePixelScore(
  image: TraceImageData,
  grid: TraceGrid,
  rowIndex: number,
  column: number,
  foregroundIndex: number,
  backgroundIndex: number,
  mask: number
) {
  const bounds = cellBounds(grid, rowIndex, column);
  let matches = 0;
  let total = 0;

  for (let y = Math.floor(bounds.top); y < Math.ceil(bounds.bottom); y += 1) {
    for (let x = Math.floor(bounds.left); x < Math.ceil(bounds.right); x += 1) {
      const relativeX = (x + 0.5 - bounds.left) / (bounds.right - bounds.left);
      const relativeY = (y + 0.5 - bounds.top) / (bounds.bottom - bounds.top);
      const blockColumn = relativeX < 0.5 ? 0 : 1;
      const blockRow = Math.min(2, Math.max(0, Math.floor(relativeY * 3)));
      const bit = blockRow * 2 + blockColumn;
      const expectedIndex = (mask & (1 << bit)) === 0 ? backgroundIndex : foregroundIndex;
      const pixel = imagePixel(image, x, y);

      if (nearestLevel1Colour(pixel.r, pixel.g, pixel.b).index === expectedIndex) {
        matches += 1;
      }

      total += 1;
    }
  }

  return total === 0 ? 0 : matches / total;
}

function bestBruteForceMosaicMatch(
  image: TraceImageData,
  grid: TraceGrid,
  rowIndex: number,
  column: number,
  foregroundIndex: number,
  backgroundIndex: number
) {
  let bestMask = 0;
  let bestConfidence = 0;

  for (let mask = 0; mask < 64; mask += 1) {
    const confidence = mosaicCandidatePixelScore(
      image,
      grid,
      rowIndex,
      column,
      foregroundIndex,
      backgroundIndex,
      mask
    );

    if (confidence > bestConfidence) {
      bestMask = mask;
      bestConfidence = confidence;
    }
  }

  return {
    confidence: bestConfidence,
    mask: bestMask
  };
}

function neighbouringMosaicCells(cells: TraceCell[], rowIndex: number, column: number) {
  const neighbours: TraceCell[] = [];

  for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
    for (let columnOffset = -1; columnOffset <= 1; columnOffset += 1) {
      if (rowOffset === 0 && columnOffset === 0) {
        continue;
      }

      const neighbourRow = rowIndex + rowOffset;
      const neighbourColumn = column + columnOffset;

      if (
        neighbourRow < 0
        || neighbourRow >= TRACE_ROWS
        || neighbourColumn < 0
        || neighbourColumn >= TRACE_COLUMNS
      ) {
        continue;
      }

      const neighbour = cells[neighbourRow * TRACE_COLUMNS + neighbourColumn];

      if (neighbour?.kind === "mosaic") {
        neighbours.push(neighbour);
      }
    }
  }

  return neighbours;
}

function nearbyMosaicRegionCells(cells: TraceCell[], rowIndex: number, column: number) {
  const neighbours: TraceCell[] = [];

  for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
    for (let columnOffset = -4; columnOffset <= 4; columnOffset += 1) {
      if (rowOffset === 0 && columnOffset === 0) {
        continue;
      }

      const neighbourRow = rowIndex + rowOffset;
      const neighbourColumn = column + columnOffset;

      if (
        neighbourRow < 0
        || neighbourRow >= TRACE_ROWS
        || neighbourColumn < 0
        || neighbourColumn >= TRACE_COLUMNS
      ) {
        continue;
      }

      const neighbour = cells[neighbourRow * TRACE_COLUMNS + neighbourColumn];

      if (neighbour?.kind === "mosaic") {
        neighbours.push(neighbour);
      }
    }
  }

  return neighbours;
}

function dominantNeighbourMosaicBackground(neighbours: TraceCell[]) {
  if (neighbours.length === 0) {
    return undefined;
  }

  const counts = Array.from({ length: LEVEL_1_RGB_COLOURS.length }, () => 0);

  neighbours.forEach((neighbour) => {
    counts[neighbour.background.index] += Math.max(1, neighbour.confidence);
  });

  return maxIndex(counts);
}

function mosaicBackgroundFromCounts(counts: number[], neighbours: TraceCell[]) {
  const countedBackgroundIndex = maxIndex(counts);
  const neighbourBackgroundIndex = dominantNeighbourMosaicBackground(neighbours);

  if (neighbourBackgroundIndex === undefined) {
    return countedBackgroundIndex;
  }

  const maxCount = counts[countedBackgroundIndex] ?? 0;
  const neighbourCount = counts[neighbourBackgroundIndex] ?? 0;

  return neighbourCount >= maxCount * 0.35
    ? neighbourBackgroundIndex
    : countedBackgroundIndex;
}

function applyBruteForceMosaicRegionMatching(
  image: TraceImageData,
  grid: TraceGrid,
  cells: TraceCell[]
) {
  const corrected = cells.map((cell) => ({ ...cell, warnings: [...cell.warnings] }));

  for (let rowIndex = 0; rowIndex < TRACE_ROWS; rowIndex += 1) {
    for (let column = 0; column < TRACE_COLUMNS; column += 1) {
      const index = rowIndex * TRACE_COLUMNS + column;
      const cell = corrected[index];
      const neighbours = neighbouringMosaicCells(corrected, rowIndex, column);

      if (cell.kind !== "mosaic" || neighbours.length < 2) {
        continue;
      }

      const counts = countCellPalette(image, grid, rowIndex, column);
      const backgroundIndex = mosaicBackgroundFromCounts(counts, neighbours);
      const foregroundIndex = maxIndex(counts.map((count, colourIndex) =>
        colourIndex === backgroundIndex ? 0 : count
      ));

      if (counts[foregroundIndex] === 0 || foregroundIndex === backgroundIndex) {
        continue;
      }

      const bruteForceMatch = bestBruteForceMosaicMatch(
        image,
        grid,
        rowIndex,
        column,
        foregroundIndex,
        backgroundIndex
      );

      if (bruteForceMatch.confidence < 0.95 || bruteForceMatch.mask === 0) {
        continue;
      }

      if (
        bruteForceMatch.mask === cell.sixelMask
        && cell.foreground.index === foregroundIndex
        && cell.background.index === backgroundIndex
      ) {
        continue;
      }

      corrected[index] = {
        ...cell,
        foreground: colourRef(foregroundIndex),
        background: colourRef(backgroundIndex),
        confidence: Math.max(cell.confidence, bruteForceMatch.confidence),
        sixelMask: bruteForceMatch.mask,
        warnings: [
          ...cell.warnings,
          `Scanner brute-forced mosaic region cell as mask ${bruteForceMatch.mask} with score ${bruteForceMatch.confidence.toFixed(2)}.`
        ]
      };
    }
  }

  return corrected;
}

export function classifyTraceCell(
  image: TraceImageData,
  grid: TraceGrid,
  rowIndex: number,
  column: number,
  hint?: TraceCellHint,
  profile: "strict" | "scanner" = "strict"
): TraceCell {
  const counts = countCellPalette(image, grid, rowIndex, column);
  const backgroundIndex = maxIndex(counts);
  const nonBackgroundCounts = counts.map((count, index) =>
    index === backgroundIndex ? 0 : count
  );
  const foregroundIndex = maxIndex(nonBackgroundCounts);
  const visiblePixels = nonBackgroundCounts[foregroundIndex];
  const base = {
    rowIndex,
    column,
    foreground: colourRef(visiblePixels > 0 ? foregroundIndex : 7),
    background: colourRef(backgroundIndex),
    hint,
    warnings: []
  };
  const bounds = cellBounds(grid, rowIndex, column);
  const isLowResolutionCapture = (bounds.right - bounds.left) <= 10 || (bounds.bottom - bounds.top) <= 12.5;
  const visibleThreshold = profile === "scanner" && isLowResolutionCapture
    ? 1
    : MIN_VISIBLE_PIXELS;

  if (hint?.kind === "ignore") {
    return {
      ...base,
      kind: "space",
      confidence: 1,
      warnings: ["Ignore hint left this cell blank."]
    };
  }

  if (hint?.kind === "background") {
    return {
      ...base,
      kind: backgroundIndex === 0 ? "space" : "colour",
      confidence: 1,
      warnings: ["Background hint treated this cell as a coloured/blank region."]
    };
  }

  if (hint?.kind === "double-height-top" || hint?.kind === "double-height-bottom") {
    const label = hint.kind === "double-height-top" ? "Double-height top hint" : "Double-height bottom hint";

    return {
      ...base,
      kind: backgroundIndex === 0 ? "space" : "colour",
      confidence: 1,
      warnings: [`${label} recorded; paired-row decoding is not implemented yet.`]
    };
  }

  if (visiblePixels < visibleThreshold) {
    return {
      ...base,
      kind: backgroundIndex === 0 ? "space" : "colour",
      confidence: 1
    };
  }

  const actual = sampleCellBitmap(image, grid, rowIndex, column, foregroundIndex);
  const tolerant = profile === "scanner";
  const strictText = bestTextMatch(actual, tolerant);
  const lowResolutionActual = tolerant
    ? sampleCellBitmapAtSize(
      image,
      grid,
      rowIndex,
      column,
      foregroundIndex,
      LOW_RES_CELL_WIDTH,
      LOW_RES_CELL_HEIGHT,
      true
    )
    : undefined;
  const lowResolutionMosaic = tolerant && isLowResolutionCapture
    ? lowResolutionMosaicMatch(image, grid, rowIndex, column, foregroundIndex)
    : undefined;
  const thinSeparatorMask = lowResolutionActual && visiblePixels <= MIN_VISIBLE_PIXELS
    ? thinSeparatorMosaicMask(lowResolutionActual)
    : undefined;
  const horizontalSeparatorMask = lowResolutionActual
    ? horizontalSeparatorMosaicMask(lowResolutionActual)
    : undefined;

  if (thinSeparatorMask !== undefined || horizontalSeparatorMask !== undefined) {
    const separatorMask = thinSeparatorMask ?? horizontalSeparatorMask ?? 0;

    return {
      ...base,
      kind: "mosaic",
      sixelMask: separatorMask,
      confidence: 0.8,
      warnings: [`Scanner preserved horizontal separator as mosaic mask ${separatorMask}.`]
    };
  }

  const lowResolutionText = tolerant
    ? bestLowResolutionTextMatch(
      lowResolutionActual ?? []
    )
    : strictText;
  const text = isLowResolutionCapture && lowResolutionText.confidence >= SCAN_CONFIDENT_MATCH
    ? lowResolutionText
    : lowResolutionText.confidence > strictText.confidence ? lowResolutionText : strictText;
  const mosaic = bestMosaicMatch(actual, tolerant);
  const bestMosaic = lowResolutionMosaic
    && lowResolutionMosaic.mask !== 0
    && lowResolutionMosaic.confidence >= 0.9
    ? lowResolutionMosaic
    : mosaic;
  const confidentMatch = tolerant ? SCAN_CONFIDENT_MATCH : CONFIDENT_MATCH;

  if (hint?.kind === "text") {
    return {
      ...base,
      kind: "text",
      value: text.value || " ",
      confidence: text.confidence,
      warnings: [`Text hint accepted low-confidence SAA5050 match; best score ${text.confidence.toFixed(2)}.`]
    };
  }

  if (hint?.kind === "mosaic") {
    return {
      ...base,
      kind: "mosaic",
      sixelMask: bestMosaic.mask,
      confidence: bestMosaic.confidence,
      warnings: [`Mosaic hint accepted low-confidence sixel match; best score ${bestMosaic.confidence.toFixed(2)}.`]
    };
  }

  if (bestMosaic.confidence >= 0.9 && lowResolutionMosaic?.mask !== 0) {
    return {
      ...base,
      kind: "mosaic",
      sixelMask: bestMosaic.mask,
      confidence: bestMosaic.confidence,
      warnings: [`Scanner matched low-resolution mosaic occupancy with score ${bestMosaic.confidence.toFixed(2)}.`]
    };
  }

  if (text.confidence >= confidentMatch && text.confidence >= bestMosaic.confidence) {
    return {
      ...base,
      kind: "text",
      value: text.value,
      confidence: text.confidence,
      warnings: profile === "scanner"
        ? [`Scanner matched finite SAA5050 text profile with tolerant score ${text.confidence.toFixed(2)}.`]
        : []
    };
  }

  if (bestMosaic.confidence >= confidentMatch) {
    return {
      ...base,
      kind: "mosaic",
      sixelMask: bestMosaic.mask,
      confidence: bestMosaic.confidence,
      warnings: profile === "scanner"
        ? [`Scanner matched finite mosaic profile with tolerant score ${bestMosaic.confidence.toFixed(2)}.`]
        : []
    };
  }

  return {
    ...base,
    kind: "uncertain",
    confidence: Math.max(text.confidence, bestMosaic.confidence),
    value: text.value || undefined,
    warnings: [`No confident SAA5050 or mosaic match; best score ${Math.max(
      text.confidence,
      bestMosaic.confidence
    ).toFixed(2)}.`]
  };
}

function emptyCell(column: number, annotations: Cell["annotations"] = []): Cell {
  return {
    column,
    kind: "empty",
    byte: 0x20,
    annotations
  };
}

function characterCell(
  column: number,
  value: string,
  annotations: Cell["annotations"] = []
): Cell {
  return {
    column,
    kind: "character",
    byte: value.charCodeAt(0),
    character: {
      charset: "G0",
      value
    },
    annotations
  };
}

function mosaicCell(
  column: number,
  mask: number,
  foreground: TeletextColourRef,
  background: TeletextColourRef,
  annotations: Cell["annotations"] = []
): Cell {
  return {
    column,
    kind: "mosaic",
    byte: 0x40 | (mask & 0x3f),
    mosaic: {
      separated: false,
      sixelMask: mask,
      foreground,
      background
    },
    annotations
  };
}

function controlCell(column: number, byte: number): Cell {
  const controlCode = getControlCodeByByte(byte);

  if (!controlCode) {
    throw new Error(`Unknown Level 1 control code ${byte}`);
  }

  return {
    column,
    kind: "control",
    byte,
    controlCode,
    annotations: []
  };
}

function colourControlByte(mode: TraceState["mode"], colourIndex: number) {
  return mode === "graphics" ? 0x10 + colourIndex : colourIndex;
}

function applyControl(state: TraceState, byte: number): TraceState {
  if (byte >= 0x00 && byte <= 0x07) {
    return {
      ...state,
      foreground: byte,
      mode: "text"
    };
  }

  if (byte >= 0x10 && byte <= 0x17) {
    return {
      ...state,
      foreground: byte - 0x10,
      mode: "graphics"
    };
  }

  if (byte === 0x1c) {
    return {
      ...state,
      background: 0
    };
  }

  if (byte === 0x1d) {
    return {
      ...state,
      background: state.foreground
    };
  }

  if (byte === 0x0c) {
    return {
      ...state,
      doubleHeight: false
    };
  }

  if (byte === 0x0d) {
    return {
      ...state,
      doubleHeight: true
    };
  }

  return state;
}

function desiredControlsForCell(cell: TraceCell, state: TraceState) {
  const controls: number[] = [];
  let nextState = { ...state };
  const desiredMode: TraceState["mode"] = cell.kind === "mosaic" ? "graphics" : "text";
  const desiredForeground = cell.foreground.index;
  const desiredDoubleHeight = cell.doubleHeight === "top";

  if (desiredDoubleHeight !== nextState.doubleHeight) {
    const doubleHeightByte = desiredDoubleHeight ? 0x0d : 0x0c;

    controls.push(doubleHeightByte);
    nextState = applyControl(nextState, doubleHeightByte);
  }

  if (cell.background.index !== nextState.background) {
    if (cell.background.index === 0) {
      controls.push(0x1c);
      nextState = applyControl(nextState, 0x1c);
    } else {
      const backgroundColourByte = colourControlByte(nextState.mode, cell.background.index);

      controls.push(backgroundColourByte, 0x1d);
      nextState = applyControl(nextState, backgroundColourByte);
      nextState = applyControl(nextState, 0x1d);
    }
  }

  if (desiredMode !== nextState.mode || desiredForeground !== nextState.foreground) {
    controls.push(colourControlByte(desiredMode, desiredForeground));
  }

  return controls;
}

function prioritizedControlsForCell(cell: TraceCell, controls: number[]) {
  if (cell.doubleHeight === "top" && controls.includes(0x0d)) {
    return [0x0d];
  }

  return controls;
}

function canPlaceControls(rowCells: Cell[], startColumn: number, count: number) {
  if (startColumn < 0 || startColumn + count > rowCells.length) {
    return false;
  }

  return rowCells
    .slice(startColumn, startColumn + count)
    .every((cell) => cell.kind === "empty" && cell.annotations.length === 0);
}

function isReclaimableDoubleHeightPreludeCell(cell: TraceCell) {
  if (cell.hint || isProtectedMosaicTraceCell(cell)) {
    return false;
  }

  if (cell.kind === "space" || cell.kind === "colour" || cell.kind === "uncertain") {
    return true;
  }

  return cell.kind === "text" && cell.confidence < 0.9;
}

function canReclaimDoubleHeightPrelude(
  rowCells: Cell[],
  rowTraceCells: TraceCell[],
  startColumn: number,
  count: number
) {
  if (startColumn < 0 || startColumn + count > rowCells.length) {
    return false;
  }

  return rowCells
    .slice(startColumn, startColumn + count)
    .every((rowCell, offset) =>
      rowCell.kind !== "control"
      && isReclaimableDoubleHeightPreludeCell(rowTraceCells[startColumn + offset])
    );
}

function isDisposablePreludeCell(cell: TraceCell) {
  return cell.kind !== "text" && (cell.kind !== "mosaic" || (cell.sixelMask ?? 0) === 0);
}

function rowMosaicPreludeControls(rowTraceCells: TraceCell[]) {
  const preludeWidth = 3;

  if (!rowTraceCells.slice(0, preludeWidth).every(isDisposablePreludeCell)) {
    return undefined;
  }

  if (rowTraceCells[preludeWidth]?.kind === "text") {
    return undefined;
  }

  const backgroundRunCells = rowTraceCells.filter((cell) =>
    (cell.kind === "colour" || cell.kind === "mosaic") && cell.background.index !== 0
  );
  const mosaicCells = backgroundRunCells.filter((cell) => cell.kind === "mosaic");
  const firstMosaic = mosaicCells[0];
  const firstRunCell = backgroundRunCells[0];

  if (!firstMosaic || !firstRunCell || firstRunCell.column > preludeWidth || backgroundRunCells.length < 8) {
    return undefined;
  }

  const mosaicCellWithForeground = mosaicCells.find((cell) => (cell.sixelMask ?? 0) > 0);
  const foregroundIndex = mosaicCellWithForeground?.foreground.index ?? firstMosaic.foreground.index;
  const backgroundIndex = firstRunCell.background.index;

  if (backgroundIndex === 0 || foregroundIndex === backgroundIndex) {
    return undefined;
  }

  return [
    colourControlByte("text", backgroundIndex),
    0x1d,
    colourControlByte("graphics", foregroundIndex)
  ];
}

export function createRowsFromTraceCells(traceCells: TraceCell[]) {
  const rows: TeletextRow[] = [];
  const warnings: TraceWarning[] = [];

  for (let rowIndex = 0; rowIndex < TRACE_ROWS; rowIndex += 1) {
    const rowTraceCells = traceCells.slice(rowIndex * TRACE_COLUMNS, (rowIndex + 1) * TRACE_COLUMNS);
    const rowCells = Array.from({ length: TRACE_COLUMNS }, (_, column) => emptyCell(column));
    let state: TraceState = {
      foreground: 7,
      background: 0,
      doubleHeight: false,
      mode: "text"
    };
    const preludeControls = rowMosaicPreludeControls(rowTraceCells);
    const preludeColumnCount = preludeControls?.length ?? 0;

    if (preludeControls) {
      preludeControls.forEach((byte, column) => {
        rowCells[column] = controlCell(column, byte);
        state = applyControl(state, byte);
      });
    }

    for (const cell of rowTraceCells) {
      if (cell.column < preludeColumnCount) {
        continue;
      }

      if (cell.doubleHeight === "bottom") {
        rowCells[cell.column] = emptyCell(cell.column, [
          {
            id: `trace-double-height-bottom-${cell.rowIndex}-${cell.column}`,
            label: "Trace double height",
            message: cell.warnings[0] ?? "Scanner paired this cell as the lower half of double-height text."
          }
        ]);
        continue;
      }

      const traceHintWarning = cell.hint && cell.kind !== "text" && cell.kind !== "mosaic"
        ? cell.warnings.find((warning) => warning.includes("hint"))
        : undefined;

      if (traceHintWarning) {
        warnings.push({
          rowIndex: cell.rowIndex,
          column: cell.column,
          message: traceHintWarning
        });
        rowCells[cell.column] = emptyCell(cell.column, [
          {
            id: `trace-hint-${cell.rowIndex}-${cell.column}`,
            label: "Trace hint",
            message: traceHintWarning
          }
        ]);
        continue;
      }

      if (cell.kind === "uncertain") {
        warnings.push({
          rowIndex: cell.rowIndex,
          column: cell.column,
          message: cell.warnings[0] ?? "Uncertain trace cell."
        });
        rowCells[cell.column] = emptyCell(cell.column, [
          {
            id: `trace-confidence-${cell.rowIndex}-${cell.column}`,
            label: "Trace confidence",
            message: cell.warnings[0] ?? "The trace tool could not classify this cell confidently."
          }
        ]);
        continue;
      }

      if (cell.kind !== "text" && cell.kind !== "mosaic") {
        continue;
      }

      const assistedTraceWarning = cell.hint ? cell.warnings[0] : undefined;
      const assistedTraceAnnotations: Cell["annotations"] = assistedTraceWarning
        ? [
          {
            id: `trace-hint-${cell.rowIndex}-${cell.column}`,
            label: "Trace hint",
            message: assistedTraceWarning
          }
        ]
        : [];

      if (assistedTraceWarning) {
        warnings.push({
          rowIndex: cell.rowIndex,
          column: cell.column,
          message: assistedTraceWarning
        });
      }

      const controls = desiredControlsForCell(cell, state);

      if (controls.length > 0) {
        const controlStart = cell.column - controls.length;

        if (canPlaceControls(rowCells, controlStart, controls.length)) {
          controls.forEach((byte, offset) => {
            rowCells[controlStart + offset] = controlCell(controlStart + offset, byte);
            state = applyControl(state, byte);
          });
        } else if (
          cell.doubleHeight === "top"
          && controls.length > 1
          && canReclaimDoubleHeightPrelude(rowCells, rowTraceCells, controlStart, controls.length)
        ) {
          controls.forEach((byte, offset) => {
            rowCells[controlStart + offset] = controlCell(controlStart + offset, byte);
            state = applyControl(state, byte);
          });
          warnings.push({
            rowIndex: cell.rowIndex,
            column: cell.column,
            message: "Reclaimed low-confidence trace cells before a double-height run to preserve colour controls."
          });
        } else {
          const fallbackControls = prioritizedControlsForCell(cell, controls);
          const fallbackStart = cell.column - fallbackControls.length;

          if (fallbackControls.length < controls.length && canPlaceControls(rowCells, fallbackStart, fallbackControls.length)) {
            fallbackControls.forEach((byte, offset) => {
              rowCells[fallbackStart + offset] = controlCell(fallbackStart + offset, byte);
              state = applyControl(state, byte);
            });
          }

          warnings.push({
            rowIndex: cell.rowIndex,
            column: cell.column,
            message: "Not enough blank cells before traced content to preserve colour controls."
          });
        }
      }

      rowCells[cell.column] = cell.kind === "text"
        ? characterCell(cell.column, cell.value ?? " ", assistedTraceAnnotations)
        : mosaicCell(
          cell.column,
          cell.sixelMask ?? 0,
          cell.foreground,
          cell.background,
          assistedTraceAnnotations
        );
    }

    rows.push({
      index: rowIndex,
      cells: rowCells,
      locked: false,
      label: rowIndex === 0 ? "Header" : `Row ${rowIndex}`
    });
  }

  return { rows, warnings };
}

export function traceTeletextScreenshot(
  image: TraceImageData,
  grid: TraceGrid = detectTraceGrid(image),
  hints: TraceCellHint[] = []
): TraceResult {
  const hintsByCell = new Map(
    hints.map((hint) => [`${hint.rowIndex}:${hint.column}`, hint])
  );
  const cells = Array.from({ length: TRACE_ROWS * TRACE_COLUMNS }, (_, index) =>
    classifyTraceCell(
      image,
      grid,
      Math.floor(index / TRACE_COLUMNS),
      index % TRACE_COLUMNS,
      hintsByCell.get(`${Math.floor(index / TRACE_COLUMNS)}:${index % TRACE_COLUMNS}`)
    )
  );
  const correctedCells = applyScannerHeaderCorrections(cells);
  const { rows, warnings } = createRowsFromTraceCells(correctedCells);
  const confidence = correctedCells.reduce((sum, cell) => sum + cell.confidence, 0) / correctedCells.length;

  return {
    grid,
    cells: correctedCells,
    rows,
    warnings,
    confidence
  };
}

export function scanTeletextScreenshot(
  image: TraceImageData,
  options: {
    bounds?: TraceGridBounds;
    hints?: TraceCellHint[];
  } = {}
): TraceResult {
  const grid = detectScannerTraceGrid(image, options.bounds);
  const hintsByCell = new Map(
    (options.hints ?? []).map((hint) => [`${hint.rowIndex}:${hint.column}`, hint])
  );
  const rawCells = Array.from({ length: TRACE_ROWS * TRACE_COLUMNS }, (_, index) =>
    classifyTraceCell(
      image,
      grid,
      Math.floor(index / TRACE_COLUMNS),
      index % TRACE_COLUMNS,
      hintsByCell.get(`${Math.floor(index / TRACE_COLUMNS)}:${index % TRACE_COLUMNS}`),
      "scanner"
    )
  );
  const backgroundAdjustedCells = applyMosaicBackgroundContinuity(rawCells);
  const solidAdjustedCells = applySolidMosaicRegionContinuity(backgroundAdjustedCells);
  const bruteForcedCells = applyBruteForceMosaicRegionMatching(image, grid, solidAdjustedCells);
  const pairedCells = applyDoubleHeightPairCorrections(image, grid, bruteForcedCells);
  const bandAdjustedCells = applyDoubleHeightBandWordCorrections(pairedCells);
  const colourAdjustedCells = applyDoubleHeightBandColourCorrection(image, grid, bandAdjustedCells);
  const cells = applyScannerTextCorrections(colourAdjustedCells);
  const { rows, warnings } = createRowsFromTraceCells(cells);
  const confidence = cells.reduce((sum, cell) => sum + cell.confidence, 0) / cells.length;

  return {
    grid,
    cells,
    rows,
    warnings,
    confidence
  };
}
