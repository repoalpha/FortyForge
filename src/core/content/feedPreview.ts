import type {
  Cell,
  CellRectangle,
  NormalizedContentRecord,
  TeletextRow
} from "../model/types";
import { getControlCodeByByte } from "../standards/controlCodes";
import { level1ByteForG0Character, normalizeTextForLevel1 } from "../standards/g0Charset";

export interface FeedPreviewOptions {
  record: NormalizedContentRecord;
  bounds: CellRectangle;
  attribution: string;
  attributionGapRows?: number;
  baseRows?: TeletextRow[];
  includeTitle: boolean;
  includeSummary: boolean;
  includeBody: boolean;
  textColour?: number;
  pageNumber?: string;
  showPreviewHeader?: boolean;
}

export interface FeedPreviewPage {
  rows: TeletextRow[];
  pageIndex: number;
  pageCount: number;
  usedRows: number;
  capacityRows: number;
  unsupportedCharacterCount: number;
  controlColumns: number;
  printableColumns: number;
}

function emptyCell(column: number): Cell {
  return { column, kind: "empty", byte: 0x20, annotations: [] };
}

function alphaColourControlCell(column: number, colour: number): Cell {
  const controlCode = getControlCodeByByte(colour);
  if (!controlCode) throw new Error(`Unknown Level 1 alpha colour ${colour}`);
  return { column, kind: "control", byte: colour, controlCode, annotations: [] };
}

function normalizedTextColour(colour = 7) {
  return Number.isInteger(colour) && colour >= 1 && colour <= 7 ? colour : 7;
}

function emptyRows(): TeletextRow[] {
  return Array.from({ length: 25 }, (_, index) => ({
    index,
    cells: Array.from({ length: 40 }, (_, column) => emptyCell(column)),
    locked: false,
    label: index === 0 ? "Header" : `Row ${index}`
  }));
}

function previewRows(baseRows?: TeletextRow[]) {
  return baseRows && baseRows.length === 25
    ? structuredClone(baseRows) as TeletextRow[]
    : emptyRows();
}

function normalizeBounds(bounds: CellRectangle): CellRectangle {
  return {
    startRow: Math.max(1, Math.min(bounds.startRow, bounds.endRow)),
    endRow: Math.min(24, Math.max(bounds.startRow, bounds.endRow)),
    startColumn: Math.max(0, Math.min(bounds.startColumn, bounds.endColumn)),
    endColumn: Math.min(39, Math.max(bounds.startColumn, bounds.endColumn))
  };
}

function rowHasMosaicArtwork(row: TeletextRow | undefined, bounds: CellRectangle) {
  return row?.cells
    .slice(bounds.startColumn, bounds.endColumn + 1)
    .some((cell) => cell.kind === "mosaic" || cell.kind === "drcs") ?? false;
}

export function protectLeadingMosaicArtwork(
  rows: TeletextRow[],
  requestedBounds: CellRectangle,
  gapRows = 1
) {
  const bounds = normalizeBounds(requestedBounds);
  const initialScanEnd = Math.min(bounds.endRow, bounds.startRow + 2);
  let firstArtworkRow: number | undefined;

  for (let rowIndex = bounds.startRow; rowIndex <= initialScanEnd; rowIndex += 1) {
    if (rowHasMosaicArtwork(rows[rowIndex], bounds)) {
      firstArtworkRow = rowIndex;
      break;
    }
  }

  if (firstArtworkRow === undefined) {
    return { bounds, protectedThroughRow: undefined };
  }

  let protectedThroughRow = firstArtworkRow;
  let emptyRun = 0;
  for (let rowIndex = firstArtworkRow + 1; rowIndex <= bounds.endRow; rowIndex += 1) {
    if (rowHasMosaicArtwork(rows[rowIndex], bounds)) {
      protectedThroughRow = rowIndex;
      emptyRun = 0;
    } else {
      emptyRun += 1;
      if (emptyRun >= 2) break;
    }
  }

  return {
    bounds: {
      ...bounds,
      startRow: Math.min(
        bounds.endRow,
        Math.max(bounds.startRow, protectedThroughRow + 1 + Math.max(0, Math.min(3, gapRows)))
      )
    },
    protectedThroughRow
  };
}

function cleanText(value: string) {
  return normalizeTextForLevel1(value)
    .replace(/\r/g, "")
    .replace(/[\t\f\v]+/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
}

export function wrapTeletextText(value: string, width: number): string[] {
  if (width < 1) return [];
  const paragraphs = cleanText(value).split("\n");
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }

    let line = "";
    for (const word of words) {
      if (word.length > width) {
        if (line) lines.push(line);
        for (let offset = 0; offset < word.length; offset += width) {
          lines.push(word.slice(offset, offset + width));
        }
        line = "";
      } else if (!line) {
        line = word;
      } else if (line.length + word.length + 1 <= width) {
        line += ` ${word}`;
      } else {
        lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
  }

  return lines;
}

function writeLine(
  rows: TeletextRow[],
  rowIndex: number,
  startColumn: number,
  width: number,
  value: string,
  textColour = 7
) {
  let unsupported = 0;
  const colour = normalizedTextColour(textColour);
  const controlColumns = colour === 7 ? 0 : 1;
  const printableWidth = Math.max(0, width - controlColumns);
  const line = value.padEnd(printableWidth, " ").slice(0, printableWidth);

  if (controlColumns > 0) {
    rows[rowIndex].cells[startColumn] = alphaColourControlCell(startColumn, colour);
  }

  for (let offset = 0; offset < printableWidth; offset += 1) {
    const column = startColumn + controlColumns + offset;
    const character = line[offset];
    const byte = level1ByteForG0Character(character);
    const unavailable = byte === undefined;
    if (unavailable) unsupported += 1;
    const safeCharacter = unavailable ? "?" : character;
    rows[rowIndex].cells[column] = safeCharacter === " "
      ? emptyCell(column)
      : {
          column,
          kind: "character",
          byte: byte ?? 0x3f,
          character: { value: safeCharacter, charset: "G0" },
          annotations: []
        };
  }

  return unsupported;
}

function clearBounds(rows: TeletextRow[], bounds: CellRectangle) {
  for (let rowIndex = bounds.startRow; rowIndex <= bounds.endRow; rowIndex += 1) {
    for (let column = bounds.startColumn; column <= bounds.endColumn; column += 1) {
      rows[rowIndex].cells[column] = emptyCell(column);
    }
  }
}

export function createBlankFeedPreviewRows(pageNumber = "000") {
  const rows = emptyRows();
  writeLine(rows, 0, 0, 40, `P${pageNumber} FEED PREVIEW`);
  return rows;
}

function recordCopy(record: NormalizedContentRecord, options: FeedPreviewOptions) {
  const sections: string[] = [];
  if (options.includeTitle && record.title.trim()) sections.push(record.title);
  if (options.includeSummary && record.summary?.trim()) sections.push(record.summary);
  if (
    options.includeBody
    && record.body?.trim()
    && record.body.trim() !== record.summary?.trim()
  ) {
    sections.push(record.body);
  }
  return sections.join("\n\n") || "No readable text was supplied by this record.";
}

export function createFeedPreviewPages(options: FeedPreviewOptions): FeedPreviewPage[] {
  const bounds = normalizeBounds(options.bounds);
  const width = bounds.endColumn - bounds.startColumn + 1;
  const textColour = normalizedTextColour(options.textColour);
  const controlColumns = textColour === 7 ? 0 : 1;
  const printableColumns = Math.max(1, width - controlColumns);
  const height = bounds.endRow - bounds.startRow + 1;
  const attributionLines = options.attribution.trim()
    ? wrapTeletextText(options.attribution, printableColumns)
    : [];
  const attributionGapRows = attributionLines.length > 0
    ? Math.max(0, Math.min(3, options.attributionGapRows ?? 1))
    : 0;
  const attributionCost = attributionLines.length + attributionGapRows;
  const contentCapacity = Math.max(1, height - attributionCost);
  const contentLines = wrapTeletextText(recordCopy(options.record, options), printableColumns);
  const pageCount = Math.max(1, Math.ceil(contentLines.length / contentCapacity));

  return Array.from({ length: pageCount }, (_, pageIndex) => {
    const rows = previewRows(options.baseRows);
    clearBounds(rows, bounds);
    const pageNumber = options.pageNumber ?? "000";
    const header = `P${pageNumber} FEED PREVIEW ${pageIndex + 1}/${pageCount}`;
    let unsupportedCharacterCount = options.showPreviewHeader === false
      ? 0
      : writeLine(rows, 0, 0, 40, header);
    const chunk = contentLines.slice(
      pageIndex * contentCapacity,
      (pageIndex + 1) * contentCapacity
    );

    chunk.forEach((line, index) => {
      unsupportedCharacterCount += writeLine(
        rows,
        bounds.startRow + index,
        bounds.startColumn,
        width,
        line,
        textColour
      );
    });

    if (attributionLines.length > 0) {
      const firstAttributionRow = bounds.startRow + chunk.length + attributionGapRows;
      attributionLines.forEach((line, index) => {
        unsupportedCharacterCount += writeLine(
          rows,
          firstAttributionRow + index,
          bounds.startColumn,
          width,
          line,
          textColour
        );
      });
    }

    return {
      rows,
      pageIndex,
      pageCount,
      usedRows: chunk.length + attributionCost,
      capacityRows: height,
      unsupportedCharacterCount,
      controlColumns,
      printableColumns
    };
  });
}
