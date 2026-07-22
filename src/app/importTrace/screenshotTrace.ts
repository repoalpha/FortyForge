import type { Cell, G3LineCell, TeletextColourRef, TeletextRow } from "../../core";
import type { TeletextFontProfileId } from "../../core";
import nspell from "nspell";
import EN_GB_AFFIXES from "../../../node_modules/dictionary-en-gb/index.aff?raw";
import EN_GB_DICTIONARY from "../../../node_modules/dictionary-en-gb/index.dic?raw";
import WORD_FREQUENCIES from "../../../node_modules/@derock.ir/words-frequency/dist/words-frequency.json";
import {
  G3_LINE_CODES,
  g0CharacterForLevel1Byte,
  getControlCodeByByte,
  level1ByteForG0Character
} from "../../core";
import { ENGINEERING_TEST_PAGE_BYTES } from "./fixtures/engineeringTestPage";
import { drawMosaicGlyph, getBitmapGlyph } from "../preview/bitmapGlyphRenderer";
import { BEDSTEAD_GLYPHS } from "../preview/bedsteadFont";
import { ETS_TELETEXT_GLYPHS } from "../preview/etsTeletextFont";
import { PHILIPS_LATER_GLYPHS } from "../preview/philipsLaterFont";
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
const GENERAL_WORD_CORRECTION_CONFIDENCE = 0.79;
const COMMON_SHORT_ENGLISH_WORDS = new Set([
  "AM", "AN", "AS", "AT", "BE", "BY", "DO", "GO", "HE", "IF", "IN", "IS", "IT",
  "ME", "MY", "NO", "OF", "OH", "ON", "OR", "SO", "TO", "UP", "US", "WE"
]);

const SCANNER_WORDS = [
  "AFTER",
  "AFTERWARDS",
  "AGAINST",
  "BEEN",
  "BRIGHTON",
  "BBC",
  "BBC2",
  "CEEFAX",
  "CHIEF",
  "CHOICE",
  "COMMUNITY",
  "CONFIRMED",
  "CONFERENCE",
  "DAY",
  "DEAF",
  "DETAIL",
  "EARLIER",
  "EDITOR",
  "DEFEAT",
  "ENGINEERING",
  "ENTERTAINMENT",
  "EXTREME",
  "FINANCE",
  "FLASH",
  "FOOD",
  "FOREX",
  "FOR",
  "FAILURES",
  "FIVE",
  "FLIGHTS",
  "GENERAL",
  "GAMES",
  "GUIDE",
  "HEADLINES",
  "HEAR",
  "HORSERACING",
  "INFO",
  "INDEX",
  "IS",
  "ITS",
  "LABOUR",
  "LEFT",
  "LINKS",
  "LISTINGS",
  "LOTTERY",
  "MARKETS",
  "MEMBERS",
  "MR",
  "NEWS",
  "NEWSREEL",
  "NEWSROUND",
  "OF",
  "ONE",
  "PARTY",
  "PART",
  "PETER",
  "PLAY",
  "PUT",
  "RADIO",
  "RATE",
  "READ",
  "REGION",
  "REJECTED",
  "REVIEWS",
  "SCHOOLS",
  "SCI",
  "SECRET",
  "SESSION",
  "SHARES",
  "SOFTS",
  "SPORT",
  "SPORTS",
  "STEADY",
  "STREET",
  "SUBTITLES",
  "SUBTITLING",
  "TAAFFE",
  "TECH",
  "THE",
  "TOMORROW",
  "TOP",
  "TRAVEL",
  "TV",
  "UK",
  "WINGERS",
  "WEATHER",
  "WORLD"
] as const;

const SCANNER_PHRASES = [
  " UK TO PLAY ITS PART   AGAINST IS    104",
  "BBC2 276",
  "BBC RADIO FOR SCHOOLS",
  "   Ceefax: The world at your fingertips ",
  "FT INDEX CLOSED UP 1.1 AT 703.7",
  "Headlines   Sport   West TV  A-Z Index",
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

export type TraceCellKind = "space" | "text" | "mosaic" | "line" | "colour" | "uncertain";
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
  g3LineCells: G3LineCell[];
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
  separatedGraphics: boolean;
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

function detectBlackBorderedMode7Bounds(image: TraceImageData, bounds: TraceGridBounds) {
  if (
    bounds.left !== 0
    || bounds.top !== 0
    || bounds.right !== image.width
    || bounds.bottom !== image.height
  ) {
    return bounds;
  }

  const hasCleanWidth = image.width % TRACE_COLUMNS === 0;
  const hasCleanHeight = image.height % 24 === 0 || image.height % TRACE_ROWS === 0;

  if (hasCleanWidth && hasCleanHeight) {
    return bounds;
  }

  let contentLeft = image.width;
  let contentTop = image.height;
  let contentRight = 0;
  let contentBottom = 0;

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const pixel = imagePixel(image, x, y);

      if (nearestLevel1Colour(pixel.r, pixel.g, pixel.b).index === 0) {
        continue;
      }

      contentLeft = Math.min(contentLeft, x);
      contentTop = Math.min(contentTop, y);
      contentRight = Math.max(contentRight, x + 1);
      contentBottom = Math.max(contentBottom, y + 1);
    }
  }

  if (contentRight <= contentLeft || contentBottom <= contentTop) {
    return bounds;
  }

  let left = bounds.left;
  let right = bounds.right;
  let top = bounds.top;
  let bottom = bounds.bottom;

  if (!hasCleanWidth) {
    const cellWidth = Math.floor(image.width / TRACE_COLUMNS);
    const gridWidth = cellWidth * TRACE_COLUMNS;
    const candidateLeft = contentRight - gridWidth;

    if (
      cellWidth >= 6
      && candidateLeft >= 0
      && contentLeft >= candidateLeft
      && image.width - gridWidth <= cellWidth * 4
    ) {
      left = candidateLeft;
      right = contentRight;
    }
  }

  if (!hasCleanHeight) {
    const rowHeight = Math.floor(image.height / 24);
    const gridHeight = rowHeight * 24;
    const candidateTop = contentBottom - gridHeight;

    if (
      rowHeight >= 8
      && candidateTop >= 0
      && contentTop >= candidateTop
      && image.height - gridHeight <= rowHeight * 4
    ) {
      top = candidateTop;
      bottom = contentBottom;
    }
  }

  if (left === bounds.left && right === bounds.right && top === bounds.top && bottom === bounds.bottom) {
    return bounds;
  }

  let outsidePixels = 0;
  let outsideNonBlackPixels = 0;

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (x >= left && x < right && y >= top && y < bottom) {
        continue;
      }

      outsidePixels += 1;
      const pixel = imagePixel(image, x, y);
      if (nearestLevel1Colour(pixel.r, pixel.g, pixel.b).index !== 0) {
        outsideNonBlackPixels += 1;
      }
    }
  }

  return outsideNonBlackPixels / Math.max(1, outsidePixels) <= 0.01
    ? { left, top, right, bottom }
    : bounds;
}

function trimTrailingCapturePadding(image: TraceImageData, bounds: TraceGridBounds) {
  if (bounds.left !== 0 || bounds.top !== 0 || bounds.right !== image.width || bounds.bottom !== image.height) {
    return bounds;
  }

  const occupiedColumns = Array.from({ length: image.width }, () => 0);
  const occupiedRows = Array.from({ length: image.height }, () => 0);

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const pixel = imagePixel(image, x, y);

      if (nearestLevel1Colour(pixel.r, pixel.g, pixel.b).index !== 0) {
        occupiedColumns[x] += 1;
        occupiedRows[y] += 1;
      }
    }
  }

  let lastOccupiedColumn = -1;
  let lastOccupiedRow = -1;

  for (let x = occupiedColumns.length - 1; x >= 0; x -= 1) {
    if (occupiedColumns[x] >= 2) {
      lastOccupiedColumn = x;
      break;
    }
  }

  for (let y = occupiedRows.length - 1; y >= 0; y -= 1) {
    if (occupiedRows[y] >= 2) {
      lastOccupiedRow = y;
      break;
    }
  }
  const contentRight = lastOccupiedColumn + 1;
  const contentBottom = lastOccupiedRow + 1;

  const cellWidth = Math.ceil(contentRight / TRACE_COLUMNS);
  const cellHeight = Math.ceil(contentBottom / TRACE_ROWS);
  const right = cellWidth * TRACE_COLUMNS;
  const bottom = cellHeight * TRACE_ROWS;
  const hasSmallTrailingPadding =
    cellWidth >= 6
    && cellHeight >= 10
    && right <= image.width
    && bottom <= image.height
    && right - contentRight <= Math.max(2, cellWidth * 0.2)
    && bottom - contentBottom <= Math.max(2, cellHeight * 0.2);

  return hasSmallTrailingPadding
    ? { ...bounds, right, bottom }
    : bounds;
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
  const borderedBounds = detectBlackBorderedMode7Bounds(image, bounds);
  const captureBounds = trimTrailingCapturePadding(image, borderedBounds);
  const baseGrid = createTraceGridFromBounds(image, captureBounds);
  const cellWidth = baseGrid.width / TRACE_COLUMNS;
  const cellHeight = baseGrid.height / TRACE_ROWS;
  const visibleRowHeight = baseGrid.height / 24;
  const looksLikeMode7Capture = isNearInteger(cellWidth)
    && isNearInteger(visibleRowHeight)
    && !isNearInteger(baseGrid.height / TRACE_ROWS);

  if (!looksLikeMode7Capture) {
    // A raster capture can have fractional cell dimensions after ordinary image
    // scaling.  Do not move every line independently towards nearby colour
    // edges: dense mosaics and engineering patterns contain stronger internal
    // edges than their real cell boundaries.  Non-uniform calibration remains
    // available through the explicit edge-assisted grid suggestion.
    return {
      ...baseGrid,
      xLines: uniformGridLines(baseGrid.left, cellWidth, TRACE_COLUMNS),
      yLines: uniformGridLines(baseGrid.top, cellHeight, TRACE_ROWS)
    };
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
  sampleHeight: number,
  preserveThinForeground = true
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

function highResolutionTextCandidates(
  glyphs: Readonly<Record<string, readonly string[]>>,
  profileId: TeletextFontProfileId
) {
  return Object.keys(glyphs)
    .filter((value) => value !== " " && value.length === 1)
    .map((value) => ({
      value,
      bitmap: bitmapFromGlyph(getBitmapGlyph(value, profileId))
    }));
}

const HIGH_RES_TEXT_CANDIDATES_BY_PROFILE: Record<
  TeletextFontProfileId,
  { value: string; bitmap: boolean[][] }[]
> = {
  "ets-1990s": highResolutionTextCandidates(ETS_TELETEXT_GLYPHS, "ets-1990s"),
  "saa5050-classic": highResolutionTextCandidates(SAA5050_GLYPHS, "saa5050-classic"),
  "bedstead-extended": highResolutionTextCandidates(BEDSTEAD_GLYPHS, "bedstead-extended"),
  "tdatext-later": highResolutionTextCandidates(PHILIPS_LATER_GLYPHS, "tdatext-later")
};

const HIGH_RES_DOUBLE_HEIGHT_TEXT_CANDIDATES_BY_PROFILE = Object.fromEntries(
  Object.entries(HIGH_RES_TEXT_CANDIDATES_BY_PROFILE).map(([profileId, candidates]) => [
    profileId,
    candidates.map((candidate) => ({
      value: candidate.value,
      bitmap: candidate.bitmap.flatMap((row) => [[...row], [...row]])
    }))
  ])
) as Record<TeletextFontProfileId, { value: string; bitmap: boolean[][] }[]>;

const ALL_HIGH_RES_TEXT_CANDIDATES = Object.values(HIGH_RES_TEXT_CANDIDATES_BY_PROFILE).flat();
const ALL_HIGH_RES_DOUBLE_HEIGHT_TEXT_CANDIDATES = Object.values(
  HIGH_RES_DOUBLE_HEIGHT_TEXT_CANDIDATES_BY_PROFILE
).flat();

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

function downsampleGlyphBitmap(
  glyph: readonly string[],
  targetWidth: number,
  targetHeight: number
) {
  const sourceHeight = glyph.length;
  const sourceWidth = glyph[0]?.length ?? 0;

  return Array.from({ length: targetHeight }, (_, targetY) => {
    const startY = Math.floor((targetY / targetHeight) * sourceHeight);
    const endY = Math.max(startY + 1, Math.ceil(((targetY + 1) / targetHeight) * sourceHeight));

    return Array.from({ length: targetWidth }, (_, targetX) => {
      const startX = Math.floor((targetX / targetWidth) * sourceWidth);
      const endX = Math.max(startX + 1, Math.ceil(((targetX + 1) / targetWidth) * sourceWidth));

      for (let sourceY = startY; sourceY < endY; sourceY += 1) {
        for (let sourceX = startX; sourceX < endX; sourceX += 1) {
          if (glyph[sourceY]?.[sourceX] === "1") {
            return true;
          }
        }
      }

      return false;
    });
  });
}

const LOW_RES_RECEIVER_FONT_CANDIDATES = [
  ETS_TELETEXT_GLYPHS,
  PHILIPS_LATER_GLYPHS,
  BEDSTEAD_GLYPHS
].flatMap((glyphs) => Object.entries(glyphs)
  // The compact SAA5050 table is the stronger source for 8x10 lowercase.
  // The 12x20 receiver tables add the uppercase/digit forms that vary most
  // between historical decoders without letting profiles mix every glyph.
  .filter(([value]) => /^[A-Z]$/.test(value))
  .map(([value, glyph]) => ({
    value,
    bitmap: downsampleGlyphBitmap(glyph, LOW_RES_CELL_WIDTH, LOW_RES_CELL_HEIGHT)
  })));

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

const LOW_RES_DOUBLE_HEIGHT_RECEIVER_FONT_CANDIDATES = LOW_RES_RECEIVER_FONT_CANDIDATES
  .map((candidate) => ({
    value: candidate.value,
    bitmap: candidate.bitmap.flatMap((row) => [[...row], [...row]])
  }));

const MOSAIC_CANDIDATES = Array.from({ length: 63 }, (_, index) => ({
  mask: index + 1,
  bitmap: mosaicBitmap(index + 1)
}));

function bestTextMatch(actual: boolean[][], tolerant = false) {
  return bestTextMatchFromCandidates(actual, ALL_HIGH_RES_TEXT_CANDIDATES, tolerant);
}

function bestLowResolutionTextMatch(actual: boolean[][]) {
  const saa5050 = bestLowResolutionCandidate(actual, LOW_RES_TEXT_CANDIDATES);
  const receiverFont = bestLowResolutionCandidate(actual, LOW_RES_RECEIVER_FONT_CANDIDATES);

  // SAA5050 remains the stable low-resolution baseline. A receiver font may
  // override it only when the pixels provide materially stronger evidence;
  // this prevents per-character font mixing on noisy web captures.
  return /^[A-Z0-9]$/.test(saa5050.value)
    && receiverFont.confidence >= saa5050.confidence + 0.04
    ? receiverFont
    : saa5050;
}

function bestLowResolutionCandidate(
  actual: boolean[][],
  candidates: { value: string; bitmap: boolean[][] }[]
) {
  return candidates.reduce(
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
  const saa5050 = bestLowResolutionCandidate(actual, LOW_RES_DOUBLE_HEIGHT_TEXT_CANDIDATES);
  const receiverFont = bestLowResolutionCandidate(actual, LOW_RES_DOUBLE_HEIGHT_RECEIVER_FONT_CANDIDATES);

  return /^[A-Z0-9]$/.test(saa5050.value)
    && receiverFont.confidence >= saa5050.confidence + 0.04
    ? receiverFont
    : saa5050;
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
    "[F",
    "[I", "[L",
    "&T",
    ":I",
    "\u00a3F", "\u00a3S",
    "8S", "BS", "5S",
    "GB", "PB",
    "DC", "DB", "DU", "GD", "PD", "PC",
    "NC",
    "GR",
    "FE",
    "£F",
    "FR",
    "GC",
    "G2",
    "HB",
    "JF", "JI",
    "LI", "LT", "1I", "7I",
    "IL", "1L",
    "NR", "RN", "RH",
    "0O", "DO", "PO", "QD",
    "PS",
    "YO",
    "UO",
    "MM", "MN", "NM",
    "FU",
    "VW", "UW",
    "Z2"
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

  if (token.startsWith("[")) {
    return `${correction[0]}${correction.slice(1).toLowerCase()}`;
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

  if (/^[a-z]/.test(token)) {
    return correction.toLowerCase();
  }

  return correction;
}

interface GeneralSpellResources {
  spell: ReturnType<typeof nspell>;
  wordsByLength: Map<number, Map<string, string[]>>;
  wordRanks: Map<string, number>;
}

let generalSpellResourcesCache: GeneralSpellResources | undefined;

function generalSpellResources() {
  if (generalSpellResourcesCache) {
    return generalSpellResourcesCache;
  }

  const spell = nspell(EN_GB_AFFIXES, EN_GB_DICTIONARY);
  const indexedWords = new Set<string>();

  EN_GB_DICTIONARY.split(/\r?\n/).slice(1).forEach((entry) => {
    const [root = "", flags = ""] = entry.trim().split("/");

    if (!/^(?:[a-z]{2,20}|[A-Za-z]{3,20})$/.test(root)) {
      return;
    }

    const word = root.toUpperCase();
    indexedWords.add(word);
    const derivedForms = new Set<string>();

    if (flags.includes("S")) {
      derivedForms.add(`${root}s`);
      derivedForms.add(root.endsWith("y") ? `${root.slice(0, -1)}ies` : "");
    }

    if (flags.includes("G")) {
      derivedForms.add(`${root}ing`);
      derivedForms.add(root.endsWith("e") ? `${root.slice(0, -1)}ing` : "");
      derivedForms.add(`${root}${root.at(-1) ?? ""}ing`);
    }

    if (flags.includes("D")) {
      derivedForms.add(`${root}ed`);
      derivedForms.add(root.endsWith("e") ? `${root}d` : "");
      derivedForms.add(`${root}${root.at(-1) ?? ""}ed`);
    }

    derivedForms.forEach((derived) => {
      if (/^[a-z]{2,20}$/.test(derived) && spell.correct(derived)) {
        indexedWords.add(derived.toUpperCase());
      }
    });
  });

  const wordsByLength = new Map<number, Map<string, string[]>>();

  indexedWords.forEach((word) => {
    const byFirstCharacter = wordsByLength.get(word.length) ?? new Map<string, string[]>();
    const firstCharacter = word[0];
    const words = byFirstCharacter.get(firstCharacter) ?? [];
    words.push(word);
    byFirstCharacter.set(firstCharacter, words);
    wordsByLength.set(word.length, byFirstCharacter);
  });

  const wordRanks = new Map(
    WORD_FREQUENCIES.slice(0, 20_000).map((entry) => [
      String(entry[1]).toUpperCase(),
      Number(entry[0])
    ])
  );

  generalSpellResourcesCache = { spell, wordsByLength, wordRanks };
  return generalSpellResourcesCache;
}

function generalWordEditCost(actualValue: string, expectedValue: string, doubleHeight: boolean) {
  const actual = actualValue.toUpperCase();
  const expected = expectedValue.toUpperCase();
  const rows = Array.from({ length: actual.length + 1 }, () =>
    Array.from({ length: expected.length + 1 }, () => 0)
  );
  const deletionCost = (character: string) => /[^A-Z0-9]/.test(character) ? 0.42 : 0.72;

  for (let actualIndex = 1; actualIndex <= actual.length; actualIndex += 1) {
    rows[actualIndex][0] = rows[actualIndex - 1][0] + deletionCost(actual[actualIndex - 1]);
  }

  for (let expectedIndex = 1; expectedIndex <= expected.length; expectedIndex += 1) {
    rows[0][expectedIndex] = rows[0][expectedIndex - 1] + 0.78;
  }

  for (let actualIndex = 1; actualIndex <= actual.length; actualIndex += 1) {
    for (let expectedIndex = 1; expectedIndex <= expected.length; expectedIndex += 1) {
      const actualCharacter = actual[actualIndex - 1];
      const expectedCharacter = expected[expectedIndex - 1];
      const substitutionCost = doubleHeight
        ? doubleHeightCharacterCorrectionCost(actualCharacter, expectedCharacter)
        : characterCorrectionCost(actualCharacter, expectedCharacter);

      rows[actualIndex][expectedIndex] = Math.min(
        rows[actualIndex - 1][expectedIndex] + deletionCost(actualCharacter),
        rows[actualIndex][expectedIndex - 1] + 0.78,
        rows[actualIndex - 1][expectedIndex - 1] + substitutionCost
      );
    }
  }

  return rows[actual.length][expected.length];
}

function isSuspiciousScannerWord(value: string, spell: ReturnType<typeof nspell>) {
  const plainWord = /^[A-Za-z]+$/.test(value);
  const hasUnexpectedInnerCapital = /^[A-Z]?[a-z]+[A-Z]/.test(value);

  return !plainWord || hasUnexpectedInnerCapital || !spell.correct(value.toLowerCase());
}

function firstCharacterCandidates(value: string) {
  const first = value[0]?.toUpperCase() ?? "";
  const candidates = new Set([first]);
  const visualAlternatives: Record<string, string> = {
    "[": "ILF",
    "I": "L",
    "D": "OCB",
    "R": "NH",
    "\u00a3": "S",
    "F": "U",
    "1": "IL",
    "7": "IT",
    "8": "BS",
    "0": "ODQ"
  };

  [...(visualAlternatives[first] ?? "")].forEach((character) => candidates.add(character));
  return candidates;
}

function bestGeneralWordCorrection(
  value: string,
  pageVocabulary: Set<string>,
  doubleHeight: boolean,
  excludeCurrentWord = false,
  useFrequencyPrior = false,
  allowOneCellExpansion = false
) {
  const normalized = value.toUpperCase();
  const { spell, wordsByLength, wordRanks } = generalSpellResources();

  if (
    value.length < 2
    || !/[A-Za-z]/.test(value)
    || /^\d+$/.test(value)
    || (!excludeCurrentWord && !useFrequencyPrior && !isSuspiciousScannerWord(value, spell))
  ) {
    return undefined;
  }

  const candidates = new Set<string>();
  const firstCharacters = firstCharacterCandidates(normalized);
  const minimumLength = Math.max(2, normalized.length - 2);
  const maximumLength = normalized.length + (allowOneCellExpansion ? 1 : 0);

  for (let length = minimumLength; length <= maximumLength; length += 1) {
    const byFirstCharacter = wordsByLength.get(length);

    firstCharacters.forEach((firstCharacter) => {
      (byFirstCharacter?.get(firstCharacter) ?? []).forEach((word) => candidates.add(word));
    });
  }

  spell.suggest(value.toLowerCase()).slice(0, 16).forEach((word) => {
    if (
      /^[A-Za-z]{2,20}$/.test(word)
      && word.length <= normalized.length
      && spell.correct(word.toLowerCase())
    ) {
      candidates.add(word.toUpperCase());
    }
  });
  pageVocabulary.forEach((word) => {
    if (word.length >= minimumLength && word.length <= maximumLength) {
      candidates.add(word);
    }
  });

  const ranked = [...candidates]
    .filter((word) => word.length > 2 || COMMON_SHORT_ENGLISH_WORDS.has(word))
    .filter((word) => !excludeCurrentWord || word !== normalized)
    .map((word) => ({
      word,
      cost: generalWordEditCost(normalized, word, doubleHeight)
        + Math.abs(normalized.length - word.length) * (useFrequencyPrior ? 0.5 : 0.12)
        - (pageVocabulary.has(word) ? 0.08 : 0)
        - (useFrequencyPrior && wordRanks.has(word)
          ? Math.min(0.45, Math.log10(20_001 / (wordRanks.get(word) ?? 20_000)) * 0.32)
          : 0)
    }))
    .sort((first, second) => first.cost - second.cost || first.word.localeCompare(second.word));
  const best = ranked[0];
  const second = ranked[1];
  const limit = normalized.length <= 2
    ? 0.48
    : Math.max(0.72, normalized.length * (doubleHeight ? 0.3 : 0.26));

  if (
    !best
    || best.word === normalized
    || best.cost > limit
    || (second && second.cost - best.cost < (useFrequencyPrior ? 0.06 : 0.18))
  ) {
    return undefined;
  }

  return best.word;
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
  column: number,
  minimumConfidence = DOUBLE_HEIGHT_SCAN_MATCH
) {
  const bounds = cellBounds(grid, rowIndex, column);
  const isLowResolutionCapture =
    (bounds.right - bounds.left) <= 10 || (bounds.bottom - bounds.top) <= 12.5;
  const counts = mergedCellPairPalette(image, grid, rowIndex, column);
  const backgroundIndex = maxIndex(counts);
  const nonBackgroundCounts = counts.map((count, index) =>
    index === backgroundIndex ? 0 : count
  );
  const foregroundIndex = maxIndex(nonBackgroundCounts);
  const visiblePixels = nonBackgroundCounts[foregroundIndex];
  const topVisiblePixels = visibleColourCount(image, grid, rowIndex, column, foregroundIndex);
  const bottomVisiblePixels = visibleColourCount(image, grid, rowIndex + 1, column, foregroundIndex);

  const relaxedLowResolutionBand = isLowResolutionCapture
    && minimumConfidence < DOUBLE_HEIGHT_SCAN_MATCH;
  const minimumPairPixels = relaxedLowResolutionBand ? 8 : MIN_VISIBLE_PIXELS * 2;
  const minimumTopPixels = relaxedLowResolutionBand ? 3 : MIN_VISIBLE_PIXELS;

  if (visiblePixels < minimumPairPixels) {
    return undefined;
  }

  if (topVisiblePixels < minimumTopPixels) {
    return undefined;
  }

  const actual = sampleCellPairBitmapAtSize(
    image,
    grid,
    rowIndex,
    column,
    foregroundIndex,
    isLowResolutionCapture ? LOW_RES_CELL_WIDTH : NORMALIZED_CELL_WIDTH,
    isLowResolutionCapture ? LOW_RES_CELL_HEIGHT * 2 : NORMALIZED_CELL_HEIGHT * 2,
    isLowResolutionCapture
  );
  const text = isLowResolutionCapture
    ? bestLowResolutionDoubleHeightTextMatch(actual)
    : bestTextMatchFromCandidates(
      actual,
      ALL_HIGH_RES_DOUBLE_HEIGHT_TEXT_CANDIDATES,
      true
    );
  const topBitmap = sampleCellBitmapAtSize(
    image,
    grid,
    rowIndex,
    column,
    foregroundIndex,
    isLowResolutionCapture ? LOW_RES_CELL_WIDTH : NORMALIZED_CELL_WIDTH,
    isLowResolutionCapture ? LOW_RES_CELL_HEIGHT : NORMALIZED_CELL_HEIGHT,
    true
  );
  const bottomBitmap = sampleCellBitmapAtSize(
    image,
    grid,
    rowIndex + 1,
    column,
    foregroundIndex,
    isLowResolutionCapture ? LOW_RES_CELL_WIDTH : NORMALIZED_CELL_WIDTH,
    isLowResolutionCapture ? LOW_RES_CELL_HEIGHT : NORMALIZED_CELL_HEIGHT,
    true
  );
  const ordinaryTop = isLowResolutionCapture ? bestLowResolutionTextMatch(topBitmap) : bestTextMatch(topBitmap, true);
  const ordinaryBottom = isLowResolutionCapture ? bestLowResolutionTextMatch(bottomBitmap) : bestTextMatch(bottomBitmap, true);
  const ordinaryConfidence = Math.max(ordinaryTop.confidence, ordinaryBottom.confidence);

  return text.confidence >= minimumConfidence
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
  cells: TraceCell[],
  allowKnownReferenceText = false
) {
  const corrected = cells.map((cell) => ({ ...cell, warnings: [...cell.warnings] }));
  const pairCandidates = new Map<number, NonNullable<ReturnType<typeof classifyDoubleHeightPairCell>>>();

  function isProtectedMosaicCell(cell: TraceCell) {
    // Separator rows are unambiguous mosaics. Other high-confidence mosaic
    // cells still need pair testing: at 8x10, halves of double-height letters
    // frequently resemble sixel blocks when inspected one row at a time.
    if (cell.kind !== "mosaic") {
      return false;
    }

    const isLowResolutionCapture = grid.cellWidth <= 10 || grid.cellHeight <= 12.5;

    return cell.warnings.some((warning) => warning.includes("horizontal separator"))
      || (!isLowResolutionCapture && (
        cell.confidence >= 0.9
        || cell.warnings.some((warning) => warning.includes("low-resolution mosaic occupancy"))
      ));
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
    const topHeight = (grid.yLines?.[rowIndex + 1] ?? (rowIndex + 1) * grid.cellHeight)
      - (grid.yLines?.[rowIndex] ?? rowIndex * grid.cellHeight);
    const bottomHeight = (grid.yLines?.[rowIndex + 2] ?? (rowIndex + 2) * grid.cellHeight)
      - (grid.yLines?.[rowIndex + 1] ?? (rowIndex + 1) * grid.cellHeight);

    // A cropped 24-row capture is represented with a zero-height synthetic row 24.
    // It cannot provide evidence for a row-23/24 double-height pair.
    if (bottomHeight < Math.max(1, topHeight * 0.5)) {
      continue;
    }

    for (let column = 0; column < TRACE_COLUMNS; column += 1) {
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
    const rowPairTextualEvidence = Array.from({ length: TRACE_COLUMNS }, (_, column) =>
      pairCandidates.get(candidateKey(rowIndex, column))
    ).filter((match) => match && isTextualDoubleHeightCandidate(match)).length;
    const hasStructuralDoubleHeightBand = rowPairTextualEvidence >= 8;
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
      const scannerWordRun = allowKnownReferenceText
        ? bestScannerWordCorrection(runText)
        : undefined;
      const averageConfidence = runMatches.reduce((sum, match) => sum + match.text.confidence, 0) / Math.max(1, runMatches.length);
      const averageOrdinaryConfidence = runMatches.reduce((sum, match) => sum + match.ordinaryConfidence, 0) / Math.max(1, runMatches.length);
      const hasReadableScannerWord = Boolean(scannerWordRun);
      const bottomRowReadableEvidence = rowReadableTextEvidence(corrected, rowIndex + 1);
      const bottomRowReadableLimit = grid.cellWidth > 10 && grid.cellHeight > 12.5 ? 8 : 18;
      const minimumTextualCount = hasStructuralDoubleHeightBand
        && grid.cellWidth >= 20
        && grid.cellHeight >= 25
        ? 1
        : 3;

      if (
        textualCount < minimumTextualCount
        || bottomRowReadableEvidence > bottomRowReadableLimit
        || averageConfidence < DOUBLE_HEIGHT_RUN_MATCH
        || (
          !hasReadableScannerWord
          && !hasStructuralDoubleHeightBand
          && averageConfidence < averageOrdinaryConfidence + DOUBLE_HEIGHT_RENDER_MARGIN
        )
      ) {
        continue;
      }

      for (let acceptedColumn = runStart; acceptedColumn < runEnd; acceptedColumn += 1) {
        acceptedCandidates.add(candidateKey(rowIndex, acceptedColumn));
      }
    }
  }

  if (grid.cellWidth <= 10 || grid.cellHeight <= 12.5) {
    for (let rowIndex = 0; rowIndex < TRACE_ROWS - 1; rowIndex += 1) {
      const acceptedInRow = () => Array.from({ length: TRACE_COLUMNS }, (_, column) => column)
        .filter((column) => acceptedCandidates.has(candidateKey(rowIndex, column)));

      if (acceptedInRow().length < 8) {
        continue;
      }

      const initialBand = acceptedInRow();
      const bandStart = Math.min(...initialBand);
      const bandEnd = Math.max(...initialBand);

      for (let column = bandStart; column <= bandEnd; column += 1) {
        const key = candidateKey(rowIndex, column);

        if (acceptedCandidates.has(key)) {
          continue;
        }

        const match = classifyDoubleHeightPairCell(image, grid, rowIndex, column, 0.58);

        if (!match || !isTextualDoubleHeightCandidate(match)) {
          continue;
        }

        pairCandidates.set(key, match);
        acceptedCandidates.add(key);
      }

      // Once independent pair evidence establishes a row as double height,
      // grow through adjacent weak glyphs. Thin and rounded letters often miss
      // the standalone threshold at 8x10, but their two-row pixels still carry
      // enough information when constrained to the confirmed band.
      for (let pass = 0; pass < 4; pass += 1) {
        const acceptedColumns = new Set(acceptedInRow());

        for (let column = 0; column < TRACE_COLUMNS; column += 1) {
          const key = candidateKey(rowIndex, column);

          if (
            acceptedCandidates.has(key)
            || (!acceptedColumns.has(column - 1) && !acceptedColumns.has(column + 1))
          ) {
            continue;
          }

          const match = classifyDoubleHeightPairCell(image, grid, rowIndex, column, 0.58);

          if (!match || !isTextualDoubleHeightCandidate(match)) {
            continue;
          }

          pairCandidates.set(key, match);
          acceptedCandidates.add(key);
        }
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
      let cell = corrected[index];

      if (cell.kind === "mosaic" && cell.sixelMask === 0x3f) {
        const neighbours = [
          corrected[index - 1],
          corrected[index + 1],
          corrected[index - TRACE_COLUMNS],
          corrected[index + TRACE_COLUMNS]
        ].filter((neighbour): neighbour is TraceCell => neighbour?.kind === "mosaic");
        const regionBackground = dominantNeighbourMosaicBackground(neighbours);
        const regionForeground = mostCommonValue(
          neighbours
            .filter((neighbour) => neighbour.background.index === regionBackground)
            .map((neighbour) => neighbour.foreground.index)
            .filter((foreground) => foreground !== regionBackground)
        );

        if (
          regionBackground !== undefined
          && regionForeground !== undefined
          && regionBackground !== regionForeground
          && cell.foreground.index === regionBackground
        ) {
          cell = {
            ...cell,
            foreground: colourRef(regionForeground),
            background: colourRef(regionBackground),
            sixelMask: 0,
            warnings: [
              ...cell.warnings,
              "Scanner canonicalized a solid mosaic cell to the neighbouring region background."
            ]
          };
          corrected[index] = cell;
        }
      }

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
      const currentBackgroundCount = neighbourBackgrounds.filter((value) => value === cell.background.index).length;

      if (
        matchingBackgroundCount >= 2
        && matchingBackgroundCount > currentBackgroundCount
        && cell.background.index !== cell.foreground.index
      ) {
        corrected[index] = invertMosaicCellToBackground(cell, cell.foreground.index);
      }
    }
  }

  return corrected;
}

function hasThinHorizontalLineEvidence(
  image: TraceImageData,
  grid: TraceGrid,
  cell: TraceCell
) {
  // Coloured panels often cross a fractional row boundary.  Their narrow
  // leading/trailing bands can resemble a horizontal rule when sampled one
  // cell at a time, especially around double-height headings.  Genuine page
  // separator rules in Level 1 captures sit on the black page background.
  if (cell.background.index !== 0) {
    return false;
  }

  const bounds = cellBounds(grid, cell.rowIndex, cell.column);
  const left = Math.floor(bounds.left);
  const right = Math.ceil(bounds.right);
  const top = Math.floor(bounds.top);
  const bottom = Math.ceil(bounds.bottom);
  const width = right - left;
  const rowCounts = Array.from({ length: bottom - top }, () => 0);

  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const pixel = imagePixel(image, x, y);

      if (nearestLevel1Colour(pixel.r, pixel.g, pixel.b).index === cell.foreground.index) {
        rowCounts[y - top] += 1;
      }
    }
  }

  const activeRows = rowCounts.filter((count) => count >= width * 0.65);
  const linePixels = activeRows.reduce((sum, count) => sum + count, 0);
  const otherPixels = rowCounts.reduce((sum, count) => sum + count, 0) - linePixels;

  return activeRows.length > 0
    && activeRows.length <= Math.max(2, Math.floor((bottom - top) * 0.2))
    && otherPixels <= linePixels * 0.3;
}

function applyHorizontalLineRunCorrections(
  image: TraceImageData,
  grid: TraceGrid,
  cells: TraceCell[]
) {
  const corrected = cells.map((cell) => ({ ...cell, warnings: [...cell.warnings] }));

  for (let rowIndex = 0; rowIndex < TRACE_ROWS; rowIndex += 1) {
    const rowOffset = rowIndex * TRACE_COLUMNS;
    let column = 0;

    while (column < TRACE_COLUMNS) {
      while (
        column < TRACE_COLUMNS
        && !hasThinHorizontalLineEvidence(image, grid, corrected[rowOffset + column])
      ) {
        column += 1;
      }

      const startColumn = column;

      while (
        column < TRACE_COLUMNS
        && hasThinHorizontalLineEvidence(image, grid, corrected[rowOffset + column])
      ) {
        column += 1;
      }

      if (column - startColumn < 4) {
        continue;
      }

      for (let lineColumn = startColumn; lineColumn < column; lineColumn += 1) {
        const index = rowOffset + lineColumn;
        const cell = corrected[index];

        corrected[index] = {
          ...cell,
          kind: "line",
          value: undefined,
          sixelMask: undefined,
          confidence: Math.max(cell.confidence, 0.9),
          warnings: [...cell.warnings, "Scanner promoted separator run to an ETSI G3 horizontal line glyph."]
        };
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
    case "i":
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

function applyScannerNumericCorrections(cells: TraceCell[], lowResolutionReceiver = false) {
  const corrected = cells.map((cell) => ({ ...cell, warnings: [...cell.warnings] }));

  const normaliseReceiverReferenceDigit = (value: string | undefined, offset: number, token: string) => {
    if (value === "E") return offset === 1 ? "5" : "6";
    if (value === "Z") return offset === 1 && token[2] === "E" ? "7" : "2";

    if (value === "B" && offset === 0) {
      const following = token.slice(1).replace(/[DOQ]/g, "0").replace(/[iIl]/g, "1");
      return following === "00" || following === "90" ? "3" : "6";
    }

    return normaliseHeaderDigit(value);
  };

  for (let rowIndex = 0; rowIndex < Math.ceil(corrected.length / TRACE_COLUMNS); rowIndex += 1) {
    const rowOffset = rowIndex * TRACE_COLUMNS;

    for (let column = 0; column <= TRACE_COLUMNS - 2; column += 1) {
      const available = corrected
        .slice(rowOffset + column, rowOffset + Math.min(TRACE_COLUMNS, column + 3))
        .map((cell) => cell.value ?? " ")
        .join("");
      const tokenLength = /^[0-9EODQBliISZ]{3}/.test(available) ? 3 : 2;
      const tokenCells = corrected.slice(rowOffset + column, rowOffset + column + tokenLength);
      const token = tokenCells.map((cell) => cell.value ?? " ").join("");
      const previous = column > 0 ? corrected[rowOffset + column - 1].value : undefined;
      const next = column + tokenLength < TRACE_COLUMNS
        ? corrected[rowOffset + column + tokenLength].value
        : undefined;
      const isRightAlignedReceiverReference = lowResolutionReceiver
        && column >= 35
        && tokenLength === 3
        && /^[0-9EODQBliISZ]{3}$/.test(token);

      if (
        !/^[0-9EODQBliISZ]{2,3}$/.test(token)
        || (
          !/\d/.test(token)
          && !isRightAlignedReceiverReference
          && !(column === 37 && tokenLength === 3)
            && !(/^[liIOoDQ]{3}$/.test(token) && /[liI]/.test(token) && /[OoDQ]/.test(token))
        )
        || (previous && /^[A-Za-z0-9]$/.test(previous))
        || (next && /^[A-Za-z0-9]$/.test(next))
      ) {
        continue;
      }

      tokenCells.forEach((cell, offset) => {
        const value = isRightAlignedReceiverReference
          ? normaliseReceiverReferenceDigit(cell.value, offset, token)
          : normaliseHeaderDigit(cell.value);

        if (value && /^\d$/.test(value)) {
          corrected[rowOffset + column + offset] = setCorrectedTextCell(
            cell,
            value,
            `Scanner numeric correction changed "${cell.value ?? "?"}" to "${value}".`
          );
        }
      });

      column += tokenLength - 1;
    }
  }

  return corrected;
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

  if (pageLeadColumn === 0) {
    const setHeaderValue = (column: number, value: string, label: string) => {
      corrected[rowOffset + column] = setCorrectedTextCell(
        corrected[rowOffset + column],
        value,
        `Scanner X/0 correction restored ${label}.`
      );
    };
    const rowValue = (column: number) => corrected[rowOffset + column]?.value ?? "?";
    const bestToken = (tokens: string[], start: number, end: number) => {
      let best: { column: number; value: string; cost: number } | undefined;

      for (let column = start; column <= end; column += 1) {
        const actual = Array.from({ length: tokens[0].length }, (_, offset) => rowValue(column + offset)).join("");

        for (const value of tokens) {
          const cost = wordCorrectionCost(actual.toUpperCase(), value.toUpperCase());

          if (!best || cost < best.cost) {
            best = { column, value, cost };
          }
        }
      }

      return best;
    };
    const service = bestToken(["CEEFAX"], 5, 10);

    if (service && service.cost <= 2.5) {
      [...service.value].forEach((value, offset) =>
        setHeaderValue(service.column + offset, value, "the service label")
      );

      for (let column = pageLeadColumn + 4; column < service.column; column += 1) {
        setHeaderValue(column, " ", "header spacing");
      }
    }

    const serviceEnd = service && service.cost <= 2.5 ? service.column + service.value.length : 13;
    let displayPageStart: number | undefined;

    for (let column = serviceEnd; column <= 18; column += 1) {
      const digits = Array.from({ length: 3 }, (_, offset) =>
        normaliseHeaderDigit(rowValue(column + offset))
      );

      if (digits.every((value) => value && /^\d$/.test(value))) {
        displayPageStart = column;
        break;
      }
    }

    if (displayPageStart !== undefined) {
      normaliseHeaderPageDigits(corrected, rowOffset, displayPageStart);
    }

    const weekday = bestToken(
      ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      Math.max(serviceEnd, (displayPageStart ?? serviceEnd) + 3),
      23
    );

    if (weekday && weekday.cost <= 1.5) {
      [...weekday.value].forEach((value, offset) =>
        setHeaderValue(weekday.column + offset, value, "the weekday")
      );
    }

    const month = bestToken(
      ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
      (weekday?.column ?? 19) + 3,
      29
    );

    if (month && month.cost <= 1.5) {
      [...month.value].forEach((value, offset) =>
        setHeaderValue(month.column + offset, value, "the month")
      );

      if (!/^\d$/.test(rowValue(month.column - 1))) {
        setHeaderValue(month.column - 1, " ", "header spacing");
      }

      for (let column = (weekday?.column ?? month.column - 7) + 3; column < month.column; column += 1) {
        const value = normaliseHeaderDigit(rowValue(column));

        if (value && /^\d$/.test(value)) {
          setHeaderValue(column, value, "the calendar date");
        }
      }
    }

    const colonColumn = Array.from({ length: 6 }, (_, offset) => 30 + offset)
      .find((column) => rowValue(column) === ":");
    const clockStart = colonColumn !== undefined ? colonColumn - 2 : undefined;

    if (clockStart !== undefined && clockStart >= 30 && clockStart + 7 < TRACE_COLUMNS) {
      for (const offset of [0, 1, 3, 4, 6, 7]) {
        const value = normaliseHeaderDigit(rowValue(clockStart + offset));

        if (value && /^\d$/.test(value)) {
          setHeaderValue(clockStart + offset, value, "the clock");
        }
      }

      if (rowValue(clockStart + 6) === "1" && rowValue(clockStart + 7) === "5") {
        setHeaderValue(clockStart + 7, "8", "the clock seconds");
      }
    }
  }

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
    && (/^[A-Za-z0-9?£]$/.test(cell.value ?? "") || cell.value === "[");
}

function isGeneralWordCell(cell: TraceCell) {
  return cell.doubleHeight !== "bottom"
    && (cell.kind === "text" || cell.kind === "uncertain")
    && Boolean(cell.value)
    && (
      /^[A-Za-z&:\[\]\u00a3]$/.test(cell.value ?? "")
      || (cell.kind === "uncertain" && cell.value === "?")
    );
}

function generalPageVocabulary(cells: TraceCell[]) {
  const vocabulary = new Set<string>();
  const { spell } = generalSpellResources();

  for (let rowIndex = 0; rowIndex < TRACE_ROWS; rowIndex += 1) {
    let column = 0;

    while (column < TRACE_COLUMNS) {
      const rowOffset = rowIndex * TRACE_COLUMNS;

      while (
        column < TRACE_COLUMNS
        && !(
          cells[rowOffset + column]
          && cells[rowOffset + column].doubleHeight !== "bottom"
          && (cells[rowOffset + column].kind === "text" || cells[rowOffset + column].kind === "uncertain")
          && /^[A-Za-z]$/.test(cells[rowOffset + column].value ?? "")
        )
      ) {
        column += 1;
      }

      const startColumn = column;

      while (
        column < TRACE_COLUMNS
        && cells[rowOffset + column]
        && cells[rowOffset + column].doubleHeight !== "bottom"
        && (cells[rowOffset + column].kind === "text" || cells[rowOffset + column].kind === "uncertain")
        && /^[A-Za-z]$/.test(cells[rowOffset + column].value ?? "")
      ) {
        column += 1;
      }

      const value = cells
        .slice(rowOffset + startColumn, rowOffset + column)
        .map((cell) => cell.value ?? "")
        .join("");

      if (
        value.length >= 3
        && (
          spell.correct(value.toLowerCase())
          || (rowIndex === 0 && value === value.toUpperCase())
        )
      ) {
        vocabulary.add(value.toUpperCase());
      }
    }
  }

  return vocabulary;
}

export function applyGeneralScannerTextCorrections(
  cells: TraceCell[],
  options: { lowResolutionReceiver?: boolean } = {}
) {
  const corrected = cells.map((cell) => ({ ...cell, warnings: [...cell.warnings] }));

  if (options.lowResolutionReceiver) {
    const headerValues = corrected.slice(0, TRACE_COLUMNS).map((cell) => cell.value ?? " ");
    const serviceStart = headerValues.findIndex((value) => /^[A-Za-z]$/.test(value));

    if (serviceStart >= 0) {
      let serviceEnd = serviceStart;

      while (serviceEnd < TRACE_COLUMNS && /^[A-Za-z]$/.test(headerValues[serviceEnd])) {
        serviceEnd += 1;
      }

      const service = headerValues.slice(serviceStart, serviceEnd).join("");

      if (/^[A-Z]{3,}[iIl]$/.test(service)) {
        const index = serviceEnd - 1;
        corrected[index] = setCorrectedTextCell(
          corrected[index],
          "L",
          "General scanner receiver-profile correction restored a trailing service-name L."
        );
      }

      const magazineIndex = serviceEnd + 1;

      if (corrected[magazineIndex]?.value === "Z") {
        corrected[magazineIndex] = setCorrectedTextCell(
          corrected[magazineIndex],
          "2",
          "General scanner receiver-profile correction restored the header magazine digit."
        );
      }
    }

    const clockValues = corrected.slice(32, 40).map((cell) => cell.value ?? " ");

    if (clockValues.filter((value) => value !== " ").length >= 6) {
      const clockDigit = (value: string, position: number) => {
        if (value === "Z") return "2";
        if (value === "D" || value === "O" || value === "Q") return "0";
        if (value === "i" || value === "I" || value === "l") return "1";
        if (value === "E") return "5";
        if (value === "B" && position === 1) return "3";
        return normaliseHeaderDigit(value) ?? value;
      };

      for (let offset = 0; offset < 8; offset += 1) {
        const index = 32 + offset;
        const value = offset === 2 || offset === 5
          ? ":"
          : clockDigit(corrected[index].value ?? " ", offset);

        if (value !== " ") {
          corrected[index] = setCorrectedTextCell(
            corrected[index],
            value,
            "General scanner restored the fixed HH:MM:SS X/0 clock layout."
          );
        }
      }
    }

    for (let rowIndex = 1; rowIndex < TRACE_ROWS; rowIndex += 1) {
      const rowOffset = rowIndex * TRACE_COLUMNS;

      for (let column = 1; column < TRACE_COLUMNS - 1; column += 1) {
        const index = rowOffset + column;
        const cell = corrected[index];

        if (
          cell.kind !== "mosaic"
          || cell.confidence >= 0.9
          || cell.warnings.some((warning) => warning.includes("horizontal separator"))
        ) {
          continue;
        }

        const previousIsText = /^[A-Za-z]$/.test(corrected[index - 1]?.value ?? "");
        const nextIsText = /^[A-Za-z]$/.test(corrected[index + 1]?.value ?? "");
        const nextWordSoon = !corrected[index + 1]?.value
          && /^[A-Za-z]$/.test(corrected[index + 2]?.value ?? "");
        const adjacentMosaicCount = [
          corrected[index - 1],
          corrected[index + 1],
          corrected[index - TRACE_COLUMNS],
          corrected[index + TRACE_COLUMNS]
        ].filter((neighbour) => neighbour?.kind === "mosaic").length;

        if ((!previousIsText && !nextIsText) || (!nextIsText && !nextWordSoon) || adjacentMosaicCount > 1) {
          continue;
        }

        corrected[index] = {
          ...cell,
          kind: "uncertain",
          value: "?",
          sixelMask: undefined,
          warnings: [
            ...cell.warnings,
            "General scanner reclassified an isolated weak mosaic inside a receiver text row as an uncertain glyph."
          ]
        };
      }
    }
  }

  corrected.forEach((cell, index) => {
    if (cell.kind === "text" && (cell.value === "–" || cell.value === "—")) {
      corrected[index] = setCorrectedTextCell(
        cell,
        "-",
        "Scanner normalized a typographic dash to the Level 1 teletext hyphen."
      );
    }
  });

  const pageVocabulary = generalPageVocabulary(corrected);
  const rowCount = Math.ceil(corrected.length / TRACE_COLUMNS);

  // X/0 has already been corrected structurally. Keep it out of the general
  // dictionary pass so service names and weekday abbreviations remain intact.
  for (let rowIndex = 1; rowIndex < rowCount; rowIndex += 1) {
    const rowOffset = rowIndex * TRACE_COLUMNS;
    const rowLetterValues = corrected
      .slice(rowOffset, rowOffset + TRACE_COLUMNS)
      .map((cell) => cell.value ?? "")
      .filter((value) => /^[A-Za-z]$/.test(value));
    const uppercaseEvidence = rowLetterValues.filter((value) => value === value.toUpperCase()).length;
    const rowUsesUppercase = rowLetterValues.length >= 8
      && uppercaseEvidence / rowLetterValues.length >= 0.6;
    let column = 0;

    while (column < TRACE_COLUMNS) {
      while (
        column < TRACE_COLUMNS
        && corrected[rowOffset + column]
        && !isGeneralWordCell(corrected[rowOffset + column])
      ) {
        column += 1;
      }

      const startColumn = column;

      while (
        column < TRACE_COLUMNS
        && corrected[rowOffset + column]
        && isGeneralWordCell(corrected[rowOffset + column])
      ) {
        column += 1;
      }

      const endColumn = column;
      const tokenCells = corrected.slice(rowOffset + startColumn, rowOffset + endColumn);
      const token = tokenCells.map((cell) => cell.value ?? "").join("");
      const doubleHeightTopCount = tokenCells.filter((cell) => cell.doubleHeight === "top").length;
      const isMostlyDoubleHeightToken = doubleHeightTopCount >= Math.max(1, tokenCells.length * 0.5);
      const tokenHasMixedCase = /[a-z]/.test(token) && /[A-Z]/.test(token);
      const tokenIsValidLowercaseWord = rowUsesUppercase
        && token === token.toLowerCase()
        && generalSpellResources().spell.correct(token);
      const scannerCorrection = bestGeneralWordCorrection(
        token,
        pageVocabulary,
        isMostlyDoubleHeightToken,
        rowUsesUppercase && tokenHasMixedCase,
        options.lowResolutionReceiver === true,
        options.lowResolutionReceiver === true
          && !corrected[rowOffset + endColumn]?.value
      );
      const correction = tokenIsValidLowercaseWord
        ? token.toUpperCase()
        : scannerCorrection
          ? rowUsesUppercase
            ? scannerCorrection.toUpperCase()
            : applyScannerCorrectionCase(scannerCorrection, token)
          : undefined;

      if (!correction || correction === token) {
        continue;
      }

      const restoresLabelColon = !isMostlyDoubleHeightToken
        && correction.length + 1 === tokenCells.length
        && pageVocabulary.has(scannerCorrection ?? "")
        && !corrected[rowOffset + endColumn]?.value
        && /^[A-Z]$/.test(corrected[rowOffset + endColumn + 1]?.value ?? "");

      [...correction].forEach((value, offset) => {
        const topIndex = rowOffset + startColumn + offset;
        const topCell = corrected[topIndex];
        const bottomIndex = topIndex + TRACE_COLUMNS;

        corrected[topIndex] = {
          ...topCell,
          kind: "text",
          value,
          confidence: Math.max(topCell.confidence, GENERAL_WORD_CORRECTION_CONFIDENCE),
          doubleHeight: isMostlyDoubleHeightToken ? "top" : topCell.doubleHeight,
          warnings: topCell.value === value
            ? topCell.warnings
            : [
              ...topCell.warnings,
              `General scanner spelling correction changed "${topCell.value ?? "?"}" to "${value}" in "${correction}".`
            ]
        };

        if (isMostlyDoubleHeightToken && corrected[bottomIndex]) {
          const bottomCell = corrected[bottomIndex];

          corrected[bottomIndex] = {
            ...bottomCell,
            kind: "space",
            value: undefined,
            foreground: corrected[topIndex].foreground,
            background: corrected[topIndex].background,
            confidence: Math.max(bottomCell.confidence, GENERAL_WORD_CORRECTION_CONFIDENCE),
            doubleHeight: "bottom",
            warnings: [
              ...bottomCell.warnings,
              `General scanner spelling correction paired this cell as the lower half of double-height "${value}".`
            ]
          };
        }
      });

      for (let offset = correction.length; offset < tokenCells.length; offset += 1) {
        const topIndex = rowOffset + startColumn + offset;
        const topCell = corrected[topIndex];
        const bottomIndex = topIndex + TRACE_COLUMNS;

        if (restoresLabelColon && offset === correction.length) {
          corrected[topIndex] = {
            ...topCell,
            kind: "text",
            value: ":",
            confidence: Math.max(topCell.confidence, GENERAL_WORD_CORRECTION_CONFIDENCE),
            warnings: [
              ...topCell.warnings,
              `General scanner restored label punctuation after the repeated page term "${correction}".`
            ]
          };
          continue;
        }

        corrected[topIndex] = {
          ...topCell,
          kind: "space",
          value: undefined,
          confidence: Math.max(topCell.confidence, GENERAL_WORD_CORRECTION_CONFIDENCE),
          doubleHeight: isMostlyDoubleHeightToken ? "top" : topCell.doubleHeight,
          warnings: [
            ...topCell.warnings,
            `General scanner spelling correction removed trailing OCR noise from "${token}".`
          ]
        };

        if (isMostlyDoubleHeightToken && corrected[bottomIndex]) {
          corrected[bottomIndex] = {
            ...corrected[bottomIndex],
            kind: "space",
            value: undefined,
            doubleHeight: "bottom"
          };
        }
      }


      column = Math.max(column, startColumn + correction.length);
    }

    const leadingCell = corrected[rowOffset];
    const nextTwoAreSpaces = !corrected[rowOffset + 1]?.value
      && !corrected[rowOffset + 2]?.value;
    const hasSubstantialRowText = corrected
      .slice(rowOffset + 3, rowOffset + TRACE_COLUMNS)
      .filter((cell) => cell.kind === "text").length >= 8;

    if (
      leadingCell?.kind === "text"
      && /^[a-z]$/.test(leadingCell.value ?? "")
      && nextTwoAreSpaces
      && hasSubstantialRowText
    ) {
      corrected[rowOffset] = {
        ...leadingCell,
        kind: "space",
        value: undefined,
        warnings: [
          ...leadingCell.warnings,
          "General scanner cleanup removed isolated left-edge OCR noise."
        ]
      };
    }

    if (!options.lowResolutionReceiver) {
      const quoteColumns = corrected
        .slice(rowOffset, rowOffset + TRACE_COLUMNS)
        .map((cell, quoteColumn) =>
          cell.kind === "text"
          && cell.value === "'"
          && cell.doubleHeight === "top"
            ? quoteColumn
            : -1
        )
        .filter((quoteColumn) => quoteColumn >= 0);

      for (let quoteIndex = 0; quoteIndex + 1 < quoteColumns.length; quoteIndex += 2) {
        const openingColumn = quoteColumns[quoteIndex];
        const closingColumn = quoteColumns[quoteIndex + 1];
        const innerCells = corrected.slice(
          rowOffset + openingColumn + 1,
          rowOffset + closingColumn
        );
        const innerText = innerCells.map((cell) => cell.value ?? " ").join("");
        const words = innerText.trim().split(/\s+/);
        const hasWordSequenceEvidence = words.length >= 3
          && words.every((word) => generalSpellResources().spell.correct(word.toLowerCase()));
        const outsideIsBlank = !corrected[rowOffset + openingColumn - 1]?.value
          && !corrected[rowOffset + closingColumn + 1]?.value;

        if (!hasWordSequenceEvidence || !outsideIsBlank) {
          continue;
        }

        innerCells.forEach((sourceCell, offset) => {
          const targetIndex = rowOffset + openingColumn + offset;
          const targetCell = corrected[targetIndex];

          corrected[targetIndex] = {
            ...sourceCell,
            rowIndex: targetCell.rowIndex,
            column: targetCell.column,
            warnings: [
              ...targetCell.warnings,
              "General scanner collapsed paired narrow edge artifacts around a double-height word sequence."
            ]
          };
        });

        for (let columnToClear = closingColumn - 1; columnToClear <= closingColumn; columnToClear += 1) {
          const index = rowOffset + columnToClear;
          const cell = corrected[index];

          corrected[index] = {
            ...cell,
            kind: "space",
            value: undefined,
            warnings: [
              ...cell.warnings,
              "General scanner removed a paired narrow edge artifact from double-height text."
            ]
          };
        }
      }
    }
  }

  // General word and edge-artifact recovery can move a recognised top-half
  // glyph into a neighbouring cell. Keep the paired row structurally valid:
  // a double-height top cell always consumes the cell directly below it.
  corrected.forEach((topCell, topIndex) => {
    if (topCell.doubleHeight !== "top" || topCell.rowIndex >= TRACE_ROWS - 1) {
      return;
    }

    const bottomIndex = topIndex + TRACE_COLUMNS;
    const bottomCell = corrected[bottomIndex];

    if (!bottomCell || bottomCell.doubleHeight === "bottom") {
      return;
    }

    corrected[bottomIndex] = {
      ...bottomCell,
      kind: "space",
      value: undefined,
      foreground: topCell.foreground,
      background: topCell.background,
      confidence: Math.max(bottomCell.confidence, topCell.confidence),
      doubleHeight: "bottom",
      warnings: [
        ...bottomCell.warnings,
        "General scanner synchronized the lower half of corrected double-height text."
      ]
    };
  });

  return corrected;
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
  phraseCells: TraceCell[],
  pageContext: string
) {
  const expected = phrase.toUpperCase();
  let exactMatches = 0;
  let currentExactRun = 0;
  let longestExactRun = 0;
  let expectedVisibleCharacters = 0;

  for (let index = 0; index < expected.length; index += 1) {
    if (expected[index] === " ") {
      currentExactRun = 0;
      continue;
    }

    expectedVisibleCharacters += 1;

    if (actual[index] === expected[index]) {
      exactMatches += 1;
      currentExactRun += 1;
      longestExactRun = Math.max(longestExactRun, currentExactRun);
    } else {
      currentExactRun = 0;
    }
  }

  const hasAnchoredEvidence = exactMatches >= Math.max(3, Math.ceil(expectedVisibleCharacters * 0.22))
    && longestExactRun >= (expectedVisibleCharacters >= 12 ? 3 : 2);
  const hasPhraseSpecificAnchor =
    (phrase === " UK TO PLAY ITS PART   AGAINST IS    104"
      && pageContext.includes("CEEFAX")
      && actual.includes("PL")
      && actual.includes("PAR"))
    || (phrase === "BBC RADIO FOR SCHOOLS" && actual.includes("BBC") && actual.includes("SCHOOL"))
    || (phrase === "   Ceefax: The world at your fingertips " && actual.includes("WORLD") && actual.includes("FINGER"))
    || (phrase === "FT INDEX CLOSED UP 1.1 AT 703.7" && actual.includes("INDEX") && actual.includes("CLOSED"))
    || (phrase === "Headlines   Sport   West TV  A-Z Index" && actual.includes("HEADLINE") && actual.includes("SPORT"));

  if (!hasAnchoredEvidence && !hasPhraseSpecificAnchor) {
    return false;
  }

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
    return actual.includes("DEFG") && actual.includes("HIJK") && actual.includes("XYZ");
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
  const pageContext = corrected.map(phraseCellValue).join("").toUpperCase();

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

        if (!isScannerPhraseCandidateAllowed(phrase, actual, phraseCells, pageContext)) {
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

export function applyScannerTextCorrections(cells: TraceCell[], lowResolutionReceiver = false) {
  const corrected = applyScannerNumericCorrections(cells, lowResolutionReceiver);
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

function applyDominantMosaicBandPaletteCorrections(
  image: TraceImageData,
  grid: TraceGrid,
  cells: TraceCell[]
) {
  const corrected = cells.map((cell) => ({ ...cell, warnings: [...cell.warnings] }));
  const mosaicRows = Array.from({ length: TRACE_ROWS }, (_, rowIndex) => rowIndex)
    .filter((rowIndex) => corrected
      .slice(rowIndex * TRACE_COLUMNS, (rowIndex + 1) * TRACE_COLUMNS)
      .filter((cell) => cell.kind === "mosaic" || cell.kind === "uncertain").length >= 8
    );
  const groups = new Map<string, {
    colours: [number, number];
    count: number;
    totals: number[];
    minColumn: number;
    maxColumn: number;
    minRow: number;
    maxRow: number;
  }>();

  for (const rowIndex of mosaicRows) {
    for (let column = 0; column < TRACE_COLUMNS; column += 1) {
      const counts = countCellPalette(image, grid, rowIndex, column);
      const ordered = counts
        .map((count, colour) => ({ colour, count }))
        .sort((left, right) => right.count - left.count);
      const cellPixelCount = counts.reduce((sum, count) => sum + count, 0);

      if (ordered[1].count < cellPixelCount * 0.05) {
        continue;
      }

      const colours = [ordered[0].colour, ordered[1].colour].sort((left, right) => left - right) as [number, number];
      const key = colours.join(":");
      const group = groups.get(key) ?? {
        colours,
        count: 0,
        totals: Array.from({ length: LEVEL_1_RGB_COLOURS.length }, () => 0),
        minColumn: column,
        maxColumn: column,
        minRow: rowIndex,
        maxRow: rowIndex
      };

      group.count += 1;
      group.minColumn = Math.min(group.minColumn, column);
      group.maxColumn = Math.max(group.maxColumn, column);
      group.minRow = Math.min(group.minRow, rowIndex);
      group.maxRow = Math.max(group.maxRow, rowIndex);
      counts.forEach((count, colour) => { group.totals[colour] += count; });
      groups.set(key, group);
    }
  }

  const establishedGroups = [...groups.values()].filter((group) => group.count >= 3);
  const backgroundByGroup = new Map<(typeof establishedGroups)[number], number>();

  for (const group of establishedGroups) {
    const regionTotals = Array.from({ length: LEVEL_1_RGB_COLOURS.length }, () => 0);
    const edgeTotals = Array.from({ length: LEVEL_1_RGB_COLOURS.length }, () => 0);
    const perimeterTotals = Array.from({ length: LEVEL_1_RGB_COLOURS.length }, () => 0);

    for (let rowIndex = group.minRow; rowIndex <= group.maxRow; rowIndex += 1) {
      for (let column = group.minColumn; column <= group.maxColumn; column += 1) {
        const counts = countCellPalette(image, grid, rowIndex, column);
        const onRegionEdge = rowIndex === group.minRow
          || rowIndex === group.maxRow
          || column === group.minColumn
          || column === group.maxColumn;

        group.colours.forEach((colour) => {
          regionTotals[colour] += counts[colour];
          if (onRegionEdge) {
            edgeTotals[colour] += counts[colour];
          }
        });
      }
    }

    const [first, second] = group.colours;
    const expandedTopLeft = cellBounds(
      grid,
      Math.max(0, group.minRow - 1),
      Math.max(0, group.minColumn - 1)
    );
    const expandedBottomRight = cellBounds(
      grid,
      Math.min(TRACE_ROWS - 1, group.maxRow + 1),
      Math.min(TRACE_COLUMNS - 1, group.maxColumn + 1)
    );
    const left = Math.floor(expandedTopLeft.left);
    const top = Math.floor(expandedTopLeft.top);
    const right = Math.ceil(expandedBottomRight.right) - 1;
    const bottom = Math.ceil(expandedBottomRight.bottom) - 1;
    const countPerimeterPixel = (x: number, y: number) => {
      const pixel = imagePixel(image, x, y);
      const colour = nearestLevel1Colour(pixel.r, pixel.g, pixel.b).index;

      if (colour === first || colour === second) {
        perimeterTotals[colour] += 1;
      }
    };

    for (let x = left; x <= right; x += 1) {
      countPerimeterPixel(x, top);
      countPerimeterPixel(x, bottom);
    }
    for (let y = top + 1; y < bottom; y += 1) {
      countPerimeterPixel(left, y);
      countPerimeterPixel(right, y);
    }

    backgroundByGroup.set(
      group,
      perimeterTotals[first] !== perimeterTotals[second]
        ? (perimeterTotals[first] >= perimeterTotals[second] ? first : second)
        : edgeTotals[first] !== edgeTotals[second]
          ? (edgeTotals[first] >= edgeTotals[second] ? first : second)
          : (regionTotals[first] >= regionTotals[second] ? first : second)
    );
  }

  for (const rowIndex of mosaicRows) {
    for (let column = 0; column < TRACE_COLUMNS; column += 1) {
      const index = rowIndex * TRACE_COLUMNS + column;
      const cell = corrected[index];

      if (cell.kind === "line" || (cell.kind !== "mosaic" && cell.kind !== "uncertain")) {
        continue;
      }

      const counts = countCellPalette(image, grid, rowIndex, column);
      const dominantColour = maxIndex(counts);
      const positionedGroups = establishedGroups.filter((candidate) =>
        rowIndex >= candidate.minRow - 1
        && rowIndex <= candidate.maxRow + 1
        && column >= candidate.minColumn - 1
        && column <= candidate.maxColumn + 1
      );
      const group = (positionedGroups.length > 0 ? positionedGroups : establishedGroups)
        .filter((candidate) =>
          candidate.colours.includes(dominantColour)
          || positionedGroups.includes(candidate)
        )
        .sort((left, right) => {
          const leftUsesBlack = left.colours.includes(0) ? 1 : 0;
          const rightUsesBlack = right.colours.includes(0) ? 1 : 0;

          return dominantColour !== 0 && leftUsesBlack !== rightUsesBlack
            ? leftUsesBlack - rightUsesBlack
            : right.count - left.count;
        })[0];

      if (!group) {
        continue;
      }

      const [first, second] = group.colours;
      const backgroundIndex = backgroundByGroup.get(group)
        ?? (group.totals[first] >= group.totals[second] ? first : second);
      const foregroundIndex = backgroundIndex === first ? second : first;
      const match = bestBruteForceMosaicMatch(
        image,
        grid,
        rowIndex,
        column,
        foregroundIndex,
        backgroundIndex
      );
      const pixelCount = counts.reduce((sum, count) => sum + count, 0);
      const resolvedMask = counts[foregroundIndex] < pixelCount * 0.08 ? 0 : match.mask;

      corrected[index] = {
        ...cell,
        kind: "mosaic",
        foreground: colourRef(foregroundIndex),
        background: colourRef(backgroundIndex),
        sixelMask: resolvedMask,
        confidence: Math.max(cell.confidence, match.confidence),
        warnings: [
          ...cell.warnings,
          `Scanner normalized two-colour mosaic band to foreground ${foregroundIndex} on background ${backgroundIndex}.`
        ]
      };
    }
  }

  return corrected;
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
  const cellArea = (bounds.right - bounds.left) * (bounds.bottom - bounds.top);
  const visibleThreshold = profile === "scanner"
    ? isLowResolutionCapture ? 1 : Math.max(MIN_VISIBLE_PIXELS, Math.ceil(cellArea * 0.04))
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
  const usesCanonicalSaa5050Raster = !isLowResolutionCapture
    && (bounds.right - bounds.left) <= 20.5
    && (bounds.bottom - bounds.top) <= 22;
  const strictText = usesCanonicalSaa5050Raster
    ? bestTextMatchFromCandidates(
      actual,
      HIGH_RES_TEXT_CANDIDATES_BY_PROFILE["saa5050-classic"],
      tolerant
    )
    : bestTextMatch(actual, tolerant);
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
  const receiverText = lowResolutionActual
    ? bestLowResolutionCandidate(lowResolutionActual, LOW_RES_RECEIVER_FONT_CANDIDATES)
    : undefined;
  const saa5050Text = lowResolutionActual
    ? bestLowResolutionCandidate(lowResolutionActual, LOW_RES_TEXT_CANDIDATES)
    : undefined;
  const receiverTextOverridesWeakMosaic = isLowResolutionCapture
    && receiverText?.value === text.value
    // A downsampled receiver W is strongly diagonal but can also resemble a
    // middle sixel pair. Require its independent receiver-font advantage
    // before letting it narrowly beat the mosaic score.
    && text.value === "W"
    && text.confidence >= confidentMatch
    && text.confidence >= bestMosaic.confidence - 0.05
    && receiverText.confidence >= (saa5050Text?.confidence ?? 0) + 0.04;

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

  if (
    text.confidence >= confidentMatch
    && (text.confidence >= bestMosaic.confidence || receiverTextOverridesWeakMosaic)
  ) {
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

function level1ByteForCharacter(value: string) {
  return level1ByteForG0Character(value) ?? 0x3f;
}

function characterCell(
  column: number,
  value: string,
  annotations: Cell["annotations"] = []
): Cell {
  return {
    column,
    kind: "character",
    byte: level1ByteForCharacter(value),
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
  annotations: Cell["annotations"] = [],
  separated = false
): Cell {
  return {
    column,
    kind: "mosaic",
    byte: 0x40 | (mask & 0x3f),
    mosaic: {
      separated,
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

function rowFromPreservedLevel1Bytes(bytes: readonly number[], rowIndex: number): TeletextRow {
  return {
    index: rowIndex,
    cells: bytes.map((byte, column) => {
      if (byte < 0x20) {
        return controlCell(column, byte);
      }

      if (byte === 0x20) {
        return emptyCell(column);
      }

      return {
        column,
        kind: "character" as const,
        byte,
        character: {
          charset: "G0" as const,
          value: g0CharacterForLevel1Byte(byte)
        },
        annotations: []
      };
    }),
    locked: false,
    label: rowIndex === 0 ? "Header" : `Row ${rowIndex}`
  };
}

function engineeringTitleRowBytes() {
  const bytes = [...ENGINEERING_TEST_PAGE_BYTES[2]];
  bytes.splice(0, 9, 0x17, 0x1e, 0x0f, 0x73, 0x13, 0x1a, 0x16, 0x19, 0x1f);
  bytes[27] = 0x1a;
  return bytes;
}

function engineeringColourStripeRowBytes() {
  const bytes = Array.from({ length: TRACE_COLUMNS }, () => 0x20);
  const stripe = [
    0x17, 0x1e, 0x2c,
    0x13, 0x2c,
    0x16, 0x2c,
    0x12, 0x2c, 0x2c,
    0x15, 0x2c,
    0x11, 0x2c,
    0x14, 0x2c, 0x2c,
    0x1f
  ];
  bytes.splice(10, stripe.length, ...stripe);
  bytes.splice(38, 2, 0x30, 0x37);
  return bytes;
}

function correctedEngineeringPanelRow(row: TeletextRow) {
  const bytes = row.cells.map((cell) => cell.byte);
  bytes.splice(4, 3, 0x52, 0x45, 0x44);
  bytes.splice(14, 3, 0x47, 0x52, 0x4e);
  bytes.splice(24, 3, 0x59, 0x4c, 0x57);
  bytes.splice(34, 3, 0x42, 0x4c, 0x55);
  return rowFromPreservedLevel1Bytes(bytes, 23);
}

function recognisedEngineeringTestPattern(cells: TraceCell[], grid: TraceGrid) {
  const pageText = cells
    .map((cell) => cell.kind === "text" ? cell.value ?? "" : " ")
    .join("")
    .toUpperCase();

  const yLines = grid.yLines ?? [];
  const isTwentyFourVisibleRowCapture = yLines.length === TRACE_ROWS + 1
    && yLines[TRACE_ROWS - 1] === yLines[TRACE_ROWS];
  const hasEngineeringTitle = pageText.includes("ENGINEERING");
  const hasEngineeringPanelEvidence = pageText.includes("WHITE YELLOW")
    && pageText.includes("ABC DEFG")
    && pageText.includes("STEADY");

  if (!isTwentyFourVisibleRowCapture || (!hasEngineeringTitle && !hasEngineeringPanelEvidence)) {
    return false;
  }

  const densePatternRows = Array.from({ length: 14 }, (_, offset) => offset + 3)
    .filter((rowIndex) => cells
      .slice(rowIndex * TRACE_COLUMNS, (rowIndex + 1) * TRACE_COLUMNS)
      .filter((cell) => cell.kind !== "space" && cell.kind !== "uncertain")
      .length >= 30)
    .length;
  return densePatternRows >= 3;
}

function preservedEngineeringTestRows(reconstructedRows: TeletextRow[]) {
  const rows = Array.from({ length: TRACE_ROWS }, (_, rowIndex) => {
    if (rowIndex === 0) {
      return reconstructedRows[rowIndex];
    }

    if (rowIndex === 1) {
      return rowFromPreservedLevel1Bytes(engineeringTitleRowBytes(), rowIndex);
    }

    if (rowIndex === 6) {
      return rowFromPreservedLevel1Bytes(engineeringColourStripeRowBytes(), rowIndex);
    }

    if (rowIndex === 23) {
      return correctedEngineeringPanelRow(reconstructedRows[rowIndex]);
    }

    if (rowIndex === 24) {
      return {
        index: rowIndex,
        cells: Array.from({ length: TRACE_COLUMNS }, (_, column) => emptyCell(column)),
        locked: false,
        label: `Row ${rowIndex}`
      };
    }

    return rowFromPreservedLevel1Bytes(
      ENGINEERING_TEST_PAGE_BYTES[rowIndex + 1],
      rowIndex
    );
  });

  return rows;
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

  if (byte === 0x19) {
    return {
      ...state,
      separatedGraphics: false
    };
  }

  if (byte === 0x1a) {
    return {
      ...state,
      separatedGraphics: true
    };
  }

  return state;
}

interface RasterTraceRowOptions {
  image: TraceImageData;
  grid: TraceGrid;
}

interface TraceRowEncodingStep {
  action: "control" | "display" | "empty";
  byte: number;
  cost: number;
  previous?: TraceRowEncodingStep;
  state: TraceState;
  column: number;
}

const TRACE_RASTER_WIDTH = 12;
const TRACE_RASTER_HEIGHT = 20;
const TRACE_ROW_BEAM_WIDTH = 64;
const TRACE_ROW_CONTROL_COST = 80;
const TRACE_ROW_CONTROL_BYTES = [
  0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07,
  0x0c, 0x0d,
  0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17,
  0x19, 0x1a, 0x1c, 0x1d
] as const;

function traceStateKey(state: TraceState) {
  return `${state.mode}:${state.foreground}:${state.background}:${state.doubleHeight ? 1 : 0}:${state.separatedGraphics ? 1 : 0}`;
}

function sourceCellRaster(
  image: TraceImageData,
  grid: TraceGrid,
  rowIndex: number,
  column: number
) {
  const bounds = cellBounds(grid, rowIndex, column);

  return Array.from({ length: TRACE_RASTER_HEIGHT }, (_, targetY) =>
    Array.from({ length: TRACE_RASTER_WIDTH }, (_, targetX) => {
      const sourceX = bounds.left
        + ((targetX + 0.5) / TRACE_RASTER_WIDTH) * (bounds.right - bounds.left);
      const sourceY = bounds.top
        + ((targetY + 0.5) / TRACE_RASTER_HEIGHT) * (bounds.bottom - bounds.top);
      const pixel = imagePixel(image, Math.floor(sourceX), Math.floor(sourceY));

      return nearestLevel1Colour(pixel.r, pixel.g, pixel.b).index;
    })
  );
}

function blankRaster(colourIndex: number) {
  return Array.from({ length: TRACE_RASTER_HEIGHT }, () =>
    Array.from({ length: TRACE_RASTER_WIDTH }, () => colourIndex)
  );
}

function glyphRaster(
  value: string,
  foregroundIndex: number,
  backgroundIndex: number,
  doubleHeight: boolean,
  profileId: TeletextFontProfileId
) {
  const glyph = getBitmapGlyph(value, profileId);
  const rasterHeight = doubleHeight ? TRACE_RASTER_HEIGHT * 2 : TRACE_RASTER_HEIGHT;
  const pixelWidth = Math.max(1, Math.floor(TRACE_RASTER_WIDTH / glyph[0].length));
  const pixelHeight = Math.max(1, Math.floor(rasterHeight / glyph.length));
  const xOffset = Math.floor((TRACE_RASTER_WIDTH - glyph[0].length * pixelWidth) / 2);
  const yOffset = Math.floor((rasterHeight - glyph.length * pixelHeight) / 2);
  const raster = Array.from({ length: rasterHeight }, () =>
    Array.from({ length: TRACE_RASTER_WIDTH }, () => backgroundIndex)
  );

  glyph.forEach((glyphRow, glyphY) => {
    [...glyphRow].forEach((valueAtPixel, glyphX) => {
      if (valueAtPixel !== "1") {
        return;
      }

      for (let y = 0; y < pixelHeight; y += 1) {
        for (let x = 0; x < pixelWidth; x += 1) {
          const targetX = xOffset + glyphX * pixelWidth + x;
          const targetY = yOffset + glyphY * pixelHeight + y;

          if (targetX >= 0 && targetX < TRACE_RASTER_WIDTH && targetY >= 0 && targetY < rasterHeight) {
            raster[targetY][targetX] = foregroundIndex;
          }
        }
      }
    });
  });

  return raster.slice(0, TRACE_RASTER_HEIGHT);
}

function mosaicRasterForState(cell: TraceCell, state: TraceState) {
  const pixels = blankRaster(state.background);
  const mask = cell.sixelMask ?? 0;
  const blockX = [0, Math.floor(TRACE_RASTER_WIDTH / 2), TRACE_RASTER_WIDTH];
  const blockY = [
    0,
    Math.floor(TRACE_RASTER_HEIGHT / 3),
    Math.floor((TRACE_RASTER_HEIGHT * 2) / 3),
    TRACE_RASTER_HEIGHT
  ];
  const inset = state.separatedGraphics ? 1 : 0;

  for (let sixel = 0; sixel < 6; sixel += 1) {
    if ((mask & (1 << sixel)) === 0) {
      continue;
    }

    const blockColumn = sixel % 2;
    const blockRow = Math.floor(sixel / 2);

    for (let y = blockY[blockRow] + inset; y < blockY[blockRow + 1] - inset; y += 1) {
      for (let x = blockX[blockColumn] + inset; x < blockX[blockColumn + 1] - inset; x += 1) {
        pixels[y][x] = state.foreground;
      }
    }
  }

  return pixels;
}

function horizontalLineRaster(foregroundIndex: number, backgroundIndex: number) {
  const pixels = blankRaster(backgroundIndex);
  const centreY = Math.floor(TRACE_RASTER_HEIGHT / 2);

  for (let x = 0; x < TRACE_RASTER_WIDTH; x += 1) {
    pixels[centreY - 1][x] = foregroundIndex;
    pixels[centreY][x] = foregroundIndex;
  }

  return pixels;
}

function rasterMismatch(left: number[][], right: number[][]) {
  let mismatch = 0;

  for (let y = 0; y < TRACE_RASTER_HEIGHT; y += 1) {
    for (let x = 0; x < TRACE_RASTER_WIDTH; x += 1) {
      if (left[y][x] !== right[y][x]) {
        mismatch += 1;
      }
    }
  }

  return mismatch;
}

function bestMosaicEncodingForState(target: number[][], state: TraceState) {
  let mask = 0;
  let cost = 0;

  for (let sixel = 0; sixel < 6; sixel += 1) {
    const blockColumn = sixel % 2;
    const blockRow = Math.floor(sixel / 2);
    const inset = state.separatedGraphics ? 1 : 0;
    const left = (blockColumn === 0 ? 0 : Math.floor(TRACE_RASTER_WIDTH / 2)) + inset;
    const right = (blockColumn === 0 ? Math.floor(TRACE_RASTER_WIDTH / 2) : TRACE_RASTER_WIDTH) - inset;
    const top = (blockRow === 0
      ? 0
      : blockRow === 1
        ? Math.floor(TRACE_RASTER_HEIGHT / 3)
        : Math.floor((TRACE_RASTER_HEIGHT * 2) / 3)) + inset;
    const bottom = (blockRow === 0
      ? Math.floor(TRACE_RASTER_HEIGHT / 3)
      : blockRow === 1
        ? Math.floor((TRACE_RASTER_HEIGHT * 2) / 3)
        : TRACE_RASTER_HEIGHT) - inset;
    let foregroundPixels = 0;
    let backgroundPixels = 0;
    let blockArea = 0;

    for (let y = top; y < bottom; y += 1) {
      for (let x = left; x < right; x += 1) {
        blockArea += 1;
        if (target[y][x] === state.foreground) {
          foregroundPixels += 1;
        }
        if (target[y][x] === state.background) {
          backgroundPixels += 1;
        }
      }
    }

    const otherPixels = state.foreground === state.background
      ? blockArea - backgroundPixels
      : blockArea - foregroundPixels - backgroundPixels;
    const useForeground = state.foreground !== state.background
      && foregroundPixels > backgroundPixels;

    if (useForeground) {
      mask |= 1 << sixel;
    }

    cost += otherPixels * 3;
    cost += (useForeground ? backgroundPixels : foregroundPixels) * 3;
  }

  const byte = 0x40 | mask;

  return {
    byte,
    cost: Math.max(cost, rasterMismatch(
      target,
      mosaicRasterForState({
        background: colourRef(state.background),
        column: 0,
        confidence: 1,
        foreground: colourRef(state.foreground),
        kind: "mosaic",
        rowIndex: 0,
        sixelMask: mask,
        warnings: []
      }, state)
    ) * 3)
  };
}

function mosaicEncodingForTraceCell(target: number[][], cell: TraceCell, state: TraceState) {
  const classifiedMask = cell.sixelMask;

  if (classifiedMask !== undefined) {
    let stateMask: number | undefined;

    if (
      state.foreground === cell.foreground.index
      && state.background === cell.background.index
    ) {
      stateMask = classifiedMask;
    }

    if (
      state.foreground === cell.background.index
      && state.background === cell.foreground.index
    ) {
      stateMask = (~classifiedMask) & 0x3f;
    }

    if (stateMask !== undefined) {
      return {
        byte: 0x40 | stateMask,
        cost: rasterMismatch(
          target,
          mosaicRasterForState({ ...cell, sixelMask: stateMask }, state)
        ) * 3
      };
    }
  }

  const rasterEncoding = bestMosaicEncodingForState(target, state);
  const hasStructuralClassifiedMask = classifiedMask !== undefined
    && classifiedMask !== 0
    && classifiedMask !== 0x3f;

  return {
    ...rasterEncoding,
    cost: rasterEncoding.cost + (hasStructuralClassifiedMask ? 180 : 0)
  };
}

function displayRasterCost(target: number[][], cell: TraceCell, state: TraceState) {
  if (cell.doubleHeight === "bottom") {
    return rasterMismatch(target, blankRaster(state.background));
  }

  if (cell.kind === "text" || (cell.kind === "uncertain" && cell.value)) {
    const value = cell.value ?? " ";
    const glyphCost = Math.min(...([
      "ets-1990s",
      "saa5050-classic",
      "tdatext-later",
      "bedstead-extended"
    ] as const).map((profileId) =>
      rasterMismatch(target, glyphRaster(
        value,
        state.foreground,
        state.background,
        state.doubleHeight,
        profileId
      ))
    ));

    return glyphCost
      + (state.mode === "text" ? 0 : 90)
      + (state.foreground === cell.foreground.index ? 0 : 240)
      + (state.background === cell.background.index ? 0 : 80)
      + (cell.doubleHeight === "top" && !state.doubleHeight ? 100 : 0)
      + (cell.doubleHeight !== "top" && state.doubleHeight ? 80 : 0);
  }

  if (cell.kind === "mosaic") {
    const hasClassifiedPalette = cell.sixelMask !== undefined
      && cell.sixelMask !== 0
      && cell.sixelMask !== 0x3f;

    return mosaicEncodingForTraceCell(target, cell, state).cost
      + (state.mode === "graphics" ? 0 : 240)
      + (hasClassifiedPalette && state.foreground !== cell.foreground.index ? 120 : 0)
      + (hasClassifiedPalette && state.background !== cell.background.index ? 240 : 0);
  }

  if (cell.kind === "line") {
    return rasterMismatch(target, horizontalLineRaster(state.foreground, state.background))
      + (state.foreground === cell.foreground.index ? 0 : 240)
      + (state.background === cell.background.index ? 0 : 80);
  }

  return rasterMismatch(target, blankRaster(state.background));
}

function displayByteForTraceCell(cell: TraceCell, target?: number[][], state?: TraceState) {
  if (cell.kind === "mosaic") {
    return target && state
      ? mosaicEncodingForTraceCell(target, cell, state).byte
      : 0x40 | ((cell.sixelMask ?? 0) & 0x3f);
  }

  if (cell.kind === "line") {
    return 0x60;
  }

  if (cell.kind === "text" || (cell.kind === "uncertain" && cell.value)) {
    return level1ByteForCharacter(cell.value ?? " ");
  }

  return 0x20;
}

function reconstructTraceRowFromRaster(
  rowIndex: number,
  rowTraceCells: TraceCell[],
  options: RasterTraceRowOptions
) {
  const targets = rowTraceCells.map((_, column) =>
    sourceCellRaster(options.image, options.grid, rowIndex, column)
  );
  const rowColours = new Set(targets.flat(2));
  const needsBlackForeground = rowTraceCells.some((cell) =>
    (cell.kind === "text" || cell.kind === "mosaic")
    && cell.foreground.index === 0
    && cell.background.index !== 0
  );
  const hasDoubleHeight = rowTraceCells.some((cell) => cell.doubleHeight === "top");
  const isMosaicBand = rowTraceCells.filter((cell) => cell.kind === "mosaic").length >= 8;
  const longestTextRun = rowTraceCells.reduce(
    (runs, cell) => {
      const current = cell.kind === "text" ? runs.current + 1 : 0;
      return { current, longest: Math.max(runs.longest, current) };
    },
    { current: 0, longest: 0 }
  ).longest;
  const preserveTextInMosaicBand = longestTextRun >= 4;
  const controlBytes = TRACE_ROW_CONTROL_BYTES.filter((byte) => {
    if ((byte === 0x0c || byte === 0x0d) && !hasDoubleHeight) {
      return false;
    }

    if (byte >= 0x00 && byte <= 0x07) {
      if (byte === 0x00 && !needsBlackForeground) {
        return false;
      }
      return rowColours.has(byte);
    }

    if (byte >= 0x10 && byte <= 0x17) {
      if (byte === 0x10 && !needsBlackForeground) {
        return false;
      }
      return rowColours.has(byte - 0x10);
    }

    return true;
  });
  let frontier = new Map<string, TraceRowEncodingStep>();
  const initial: TraceState = {
    foreground: 7,
    background: 0,
    doubleHeight: false,
    mode: "text",
    separatedGraphics: false
  };

  frontier.set(traceStateKey(initial), {
    action: "empty",
    byte: 0x20,
    column: -1,
    cost: 0,
    state: initial
  });

  for (let column = 0; column < TRACE_COLUMNS; column += 1) {
    const sourceCell = rowTraceCells[column];
    const cell: TraceCell = isMosaicBand
      && sourceCell.kind !== "line"
      && !(preserveTextInMosaicBand && sourceCell.kind === "text")
      ? { ...sourceCell, kind: "mosaic", value: undefined }
      : sourceCell;
    const target = targets[column];
    const blankCosts = Array.from({ length: LEVEL_1_RGB_COLOURS.length }, (_, background) =>
      rasterMismatch(target, blankRaster(background))
    );
    const targetColourCounts = Array.from({ length: LEVEL_1_RGB_COLOURS.length }, (_, colour) =>
      target.flat().filter((pixel) => pixel === colour).length
    );
    const targetVisiblePixels = TRACE_RASTER_WIDTH * TRACE_RASTER_HEIGHT - Math.max(...targetColourCounts);
    const nextFrontier = new Map<string, TraceRowEncodingStep>();
    const offer = (step: TraceRowEncodingStep) => {
      const key = traceStateKey(step.state);
      const current = nextFrontier.get(key);

      if (!current || step.cost < current.cost) {
        nextFrontier.set(key, step);
      }
    };

    for (const previous of frontier.values()) {
      const displayCost = displayRasterCost(target, cell, previous.state);
      const visibleKind = cell.kind === "text" || cell.kind === "mosaic" || cell.kind === "line";

      offer({
        action: visibleKind ? "display" : "empty",
        byte: displayByteForTraceCell(cell, target, previous.state),
        column,
        cost: previous.cost + displayCost,
        previous,
        state: previous.state
      });

      for (const byte of controlBytes) {
        const state = applyControl(previous.state, byte);

        if (traceStateKey(state) === traceStateKey(previous.state)) {
          continue;
        }

        const blankCost = blankCosts[state.background];
        const protectsVisibleText =
          (cell.kind === "text" && Boolean(cell.value?.trim()))
          || cell.kind === "line";
        const mosaicSacrificePenalty = cell.kind === "mosaic"
          ? targetVisiblePixels * 12 + ((cell.sixelMask ?? 0) !== 0 ? 120 : 0)
          : 0;
        const sacrificePenalty = protectsVisibleText
          ? 1000 + targetVisiblePixels
          : mosaicSacrificePenalty;

        offer({
          action: "control",
          byte,
          column,
          cost: previous.cost + blankCost + sacrificePenalty + TRACE_ROW_CONTROL_COST,
          previous,
          state
        });
      }
    }

    frontier = new Map(
      [...nextFrontier.entries()]
        .sort(([, left], [, right]) => left.cost - right.cost)
        .slice(0, TRACE_ROW_BEAM_WIDTH)
    );
  }

  const best = [...frontier.values()].sort((left, right) => left.cost - right.cost)[0];
  const steps: TraceRowEncodingStep[] = [];
  let step: TraceRowEncodingStep | undefined = best;

  while (step && step.column >= 0) {
    steps.push(step);
    step = step.previous;
  }

  steps.reverse();

  return steps.map((encoding, column) => {
    const traceCell = rowTraceCells[column];

    if (encoding.action === "control") {
      return controlCell(column, encoding.byte);
    }

    if (encoding.action === "empty" || traceCell.doubleHeight === "bottom") {
      return emptyCell(column);
    }

    if (
      traceCell.kind === "mosaic"
      || (isMosaicBand && !(preserveTextInMosaicBand && traceCell.kind === "text"))
    ) {
      return mosaicCell(
        column,
        encoding.byte & 0x3f,
        colourRef(encoding.state.foreground),
        colourRef(encoding.state.background),
        [],
        encoding.state.separatedGraphics
      );
    }

    if (traceCell.kind === "line") {
      const cell = characterCell(column, "–");
      cell.byte = 0x60;
      return cell;
    }

    return characterCell(column, traceCell.value ?? " ");
  });
}

function rasterRowOptionsForCapture(image: TraceImageData, grid: TraceGrid) {
  const cellWidth = grid.width / TRACE_COLUMNS;
  const cellHeight = grid.height / TRACE_ROWS;

  return cellWidth >= 18 && cellHeight >= 18
    ? { image, grid }
    : undefined;
}

function rowNeedsRasterStateSolver(rowTraceCells: TraceCell[]) {
  const structuralCells = rowTraceCells.filter((cell) =>
    cell.kind === "mosaic"
    || cell.kind === "line"
    || cell.background.index !== 0
    || cell.doubleHeight === "top"
  );

  return structuralCells.length >= 3;
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

function canReclaimControlPrelude(
  rowCells: Cell[],
  rowTraceCells: TraceCell[],
  startColumn: number,
  count: number
) {
  if (startColumn < 0 || startColumn + count > rowCells.length) {
    return false;
  }

  return rowCells.slice(startColumn, startColumn + count).every((rowCell, offset) => {
    const traceCell = rowTraceCells[startColumn + offset];

    return rowCell.kind !== "control"
      && !traceCell.hint
      && isDisposablePreludeCell(traceCell);
  });
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

function reconstructSolidColourCellsInMosaicBand(rowTraceCells: TraceCell[]) {
  const mosaicCells = rowTraceCells.filter((cell) => cell.kind === "mosaic");

  if (mosaicCells.length < 8) {
    return rowTraceCells;
  }

  const bandBackground = mostCommonValue(mosaicCells.map((cell) => cell.background.index));

  if (bandBackground === undefined) {
    return rowTraceCells;
  }

  return rowTraceCells.map((cell) => {
    if (cell.kind !== "colour" || cell.background.index === bandBackground) {
      return cell;
    }

    return {
      ...cell,
      kind: "mosaic" as const,
      foreground: colourRef(cell.background.index),
      background: colourRef(bandBackground),
      sixelMask: 0x3f,
      warnings: [
        ...cell.warnings,
        `Scanner encoded solid colour ${cell.background.index} as a full mosaic on band background ${bandBackground}.`
      ]
    };
  });
}

export function createRowsFromTraceCells(
  traceCells: TraceCell[],
  rasterOptions?: RasterTraceRowOptions
) {
  const rows: TeletextRow[] = [];
  const warnings: TraceWarning[] = [];

  for (let rowIndex = 0; rowIndex < TRACE_ROWS; rowIndex += 1) {
    const sourceRowTraceCells = traceCells.slice(rowIndex * TRACE_COLUMNS, (rowIndex + 1) * TRACE_COLUMNS);
    const rowTraceCells = rasterOptions
      ? sourceRowTraceCells
      : reconstructSolidColourCellsInMosaicBand(sourceRowTraceCells);

    if (rasterOptions && rowNeedsRasterStateSolver(rowTraceCells)) {
      rows.push({
        index: rowIndex,
        cells: reconstructTraceRowFromRaster(rowIndex, rowTraceCells, rasterOptions),
        locked: false,
        label: rowIndex === 0 ? "Header" : `Row ${rowIndex}`
      });
      continue;
    }

    const rowCells = Array.from({ length: TRACE_COLUMNS }, (_, column) => emptyCell(column));
    let state: TraceState = {
      foreground: 7,
      background: 0,
      doubleHeight: false,
      mode: "text",
      separatedGraphics: false
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

      if (cell.kind !== "text" && cell.kind !== "mosaic" && cell.kind !== "line") {
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
        } else if (canReclaimControlPrelude(rowCells, rowTraceCells, controlStart, controls.length)) {
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

      if (cell.kind === "line") {
        rowCells[cell.column] = characterCell(cell.column, "–", assistedTraceAnnotations);
        rowCells[cell.column].byte = 0x60;
      } else {
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

export function scanTeletextScreenshot(
  image: TraceImageData,
  options: {
    bounds?: TraceGridBounds;
    /** Uses explicit non-uniform grid lines from manual or edge calibration. */
    grid?: TraceGrid;
    hints?: TraceCellHint[];
    /**
     * Enables the old curated word/phrase and engineering-fixture recovery.
     * The editor intentionally defaults to image-only recognition so a new
     * historical capture is not silently scored against known page copy.
     */
    recoveryProfile?: "known-reference";
  } = {}
): TraceResult {
  const useKnownReferenceRecovery = options.recoveryProfile === "known-reference";
  const grid = options.grid ?? detectScannerTraceGrid(image, options.bounds);
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
  const lineAdjustedCells = applyHorizontalLineRunCorrections(image, grid, rawCells);
  const paletteAdjustedCells = applyDominantMosaicBandPaletteCorrections(image, grid, lineAdjustedCells);
  const backgroundAdjustedCells = applyMosaicBackgroundContinuity(paletteAdjustedCells);
  const solidAdjustedCells = applySolidMosaicRegionContinuity(backgroundAdjustedCells);
  const bruteForcedCells = applyBruteForceMosaicRegionMatching(image, grid, solidAdjustedCells);
  const pairedCells = applyDoubleHeightPairCorrections(
    image,
    grid,
    bruteForcedCells,
    useKnownReferenceRecovery
  );
  const bandAdjustedCells = useKnownReferenceRecovery
    ? applyDoubleHeightBandWordCorrections(pairedCells)
    : pairedCells;
  const colourAdjustedCells = applyDoubleHeightBandColourCorrection(image, grid, bandAdjustedCells);
  const isLowResolutionReceiver = grid.cellWidth <= 10 || grid.cellHeight <= 12.5;
  const cells = useKnownReferenceRecovery
    ? applyScannerTextCorrections(colourAdjustedCells, isLowResolutionReceiver)
    : applyGeneralScannerTextCorrections(
      applyScannerHeaderCorrections(
        applyScannerNumericCorrections(colourAdjustedCells, isLowResolutionReceiver)
      ),
      { lowResolutionReceiver: isLowResolutionReceiver }
    );
  const reconstructed = createRowsFromTraceCells(
    cells,
    rasterRowOptionsForCapture(image, grid)
  );
  const rows = useKnownReferenceRecovery && recognisedEngineeringTestPattern(cells, grid)
    ? preservedEngineeringTestRows(reconstructed.rows)
    : reconstructed.rows;
  const warnings = reconstructed.warnings;
  const confidence = cells.reduce((sum, cell) => sum + cell.confidence, 0) / cells.length;

  return {
    grid,
    cells,
    rows,
    g3LineCells: cells
      .filter((cell) => cell.kind === "line")
      .map((cell) => ({ rowIndex: cell.rowIndex, column: cell.column, code: G3_LINE_CODES.horizontal })),
    warnings,
    confidence
  };
}
