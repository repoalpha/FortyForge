import type {
  MosaicGlyphCell,
  CellRectangle,
  MosaicAlphabet,
  MosaicGlyph,
  MosaicGlyphSource,
  TeletextColourRef,
  TeletextRow
} from "../model/types";

export interface MosaicTextLayout {
  width: number;
  height: number;
  missing: string[];
  cells: Array<{
    rowOffset: number;
    columnOffset: number;
    glyphCharacter: string;
    cell: MosaicGlyphCell;
  }>;
}

const defaultForeground: TeletextColourRef = { palette: "level1", index: 7 };
const defaultBackground: TeletextColourRef = { palette: "level1", index: 0 };

function normalizeCharacter(character: string) {
  return [...character][0]?.toUpperCase() ?? "";
}

function normalizedBounds(bounds: CellRectangle) {
  return {
    startRow: Math.min(bounds.startRow, bounds.endRow),
    endRow: Math.max(bounds.startRow, bounds.endRow),
    startColumn: Math.min(bounds.startColumn, bounds.endColumn),
    endColumn: Math.max(bounds.startColumn, bounds.endColumn)
  };
}

function emptyGlyphCell(): MosaicGlyphCell {
  return {
    sixelMask: 0,
    separated: false,
    foreground: defaultForeground,
    background: defaultBackground
  };
}

function colourSample(alphabet: MosaicAlphabet): MosaicGlyphCell {
  return Object.values(alphabet.glyphs)[0]?.cells[0] ?? emptyGlyphCell();
}

function layoutPixelMosaicText(
  alphabet: MosaicAlphabet,
  text: string
): MosaicTextLayout {
  const pixelGlyphs = alphabet.pixelGlyphs;

  if (!pixelGlyphs) {
    return {
      width: 0,
      height: 0,
      missing: [],
      cells: []
    };
  }

  const spacingPixels = alphabet.pixelSpacingColumns ?? 0;
  const missing: string[] = [];
  const rows: string[] = [];
  const columnCharacters: string[] = [];

  function ensureHeight(height: number) {
    while (rows.length < height) {
      rows.push("");
    }
  }

  function appendBlankPixelColumns(width: number) {
    for (let index = 0; index < rows.length; index += 1) {
      rows[index] += ".".repeat(width);
    }
    columnCharacters.push(...Array.from({ length: width }, () => " "));
  }

  for (const rawCharacter of text) {
    const character = normalizeCharacter(rawCharacter);

    if (character === " ") {
      ensureHeight(alphabet.cellHeight * 3);
      appendBlankPixelColumns((alphabet.cellWidth * 2) + spacingPixels);
      continue;
    }

    const glyph = pixelGlyphs[character];

    if (!glyph) {
      if (!missing.includes(character)) {
        missing.push(character);
      }
      continue;
    }

    ensureHeight(glyph.length);

    if (rows.some((row) => row.length > 0)) {
      appendBlankPixelColumns(spacingPixels);
    }

    const glyphWidth = Math.max(...glyph.map((row) => row.length));

    for (let index = 0; index < rows.length; index += 1) {
      rows[index] += (glyph[index] ?? "").padEnd(glyphWidth, ".");
    }

    columnCharacters.push(...Array.from({ length: glyphWidth }, () => character));
  }

  const pixelWidth = Math.max(0, ...rows.map((row) => row.length));
  const cellWidth = Math.ceil(pixelWidth / 2);
  const cellHeight = Math.ceil(rows.length / 3);
  const sample = colourSample(alphabet);
  const cells: MosaicTextLayout["cells"] = [];

  for (let rowOffset = 0; rowOffset < cellHeight; rowOffset += 1) {
    for (let columnOffset = 0; columnOffset < cellWidth; columnOffset += 1) {
      let sixelMask = 0;

      for (let sixelRow = 0; sixelRow < 3; sixelRow += 1) {
        for (let sixelColumn = 0; sixelColumn < 2; sixelColumn += 1) {
          const pixelRow = (rowOffset * 3) + sixelRow;
          const pixelColumn = (columnOffset * 2) + sixelColumn;

          if (rows[pixelRow]?.[pixelColumn] === "#") {
            sixelMask |= 1 << ((sixelRow * 2) + sixelColumn);
          }
        }
      }

      const glyphCharacter = columnCharacters[columnOffset * 2] ?? " ";

      if (sixelMask !== 0 || glyphCharacter !== " ") {
        cells.push({
          rowOffset,
          columnOffset,
          glyphCharacter,
          cell: {
            sixelMask,
            separated: sample.separated,
            foreground: sample.foreground,
            background: sample.background
          }
        });
      }
    }
  }

  return {
    width: cellWidth,
    height: cellHeight,
    missing,
    cells
  };
}

export function captureMosaicGlyph(
  rows: TeletextRow[],
  bounds: CellRectangle,
  character: string,
  source: MosaicGlyphSource = "captured"
): MosaicGlyph {
  const normalized = normalizedBounds(bounds);
  const width = normalized.endColumn - normalized.startColumn + 1;
  const height = normalized.endRow - normalized.startRow + 1;
  const cells: MosaicGlyphCell[] = [];

  for (let rowIndex = normalized.startRow; rowIndex <= normalized.endRow; rowIndex += 1) {
    const row = rows.find((item) => item.index === rowIndex);

    for (
      let column = normalized.startColumn;
      column <= normalized.endColumn;
      column += 1
    ) {
      const cell = row?.cells[column];

      if (cell?.kind === "mosaic" && cell.mosaic) {
        cells.push({
          sixelMask: cell.mosaic.sixelMask & 0x3f,
          separated: cell.mosaic.separated,
          foreground: cell.mosaic.foreground,
          background: cell.mosaic.background
        });
      } else {
        cells.push(emptyGlyphCell());
      }
    }
  }

  return {
    character: normalizeCharacter(character),
    width,
    height,
    cells,
    source
  };
}

export function layoutMosaicText(
  alphabet: MosaicAlphabet,
  text: string
): MosaicTextLayout {
  if (alphabet.pixelGlyphs) {
    return layoutPixelMosaicText(alphabet, text);
  }

  const cells: MosaicTextLayout["cells"] = [];
  const missing: string[] = [];
  let columnOffset = 0;
  let height = 0;

  for (const rawCharacter of text) {
    const character = normalizeCharacter(rawCharacter);

    if (character === " ") {
      columnOffset += alphabet.cellWidth + alphabet.spacingColumns;
      height = Math.max(height, alphabet.cellHeight);
      continue;
    }

    const glyph = alphabet.glyphs[character];

    if (!glyph) {
      if (!missing.includes(character)) {
        missing.push(character);
      }
      continue;
    }

    height = Math.max(height, glyph.height);

    for (let rowOffset = 0; rowOffset < glyph.height; rowOffset += 1) {
      for (let glyphColumn = 0; glyphColumn < glyph.width; glyphColumn += 1) {
        const glyphCell = glyph.cells[(rowOffset * glyph.width) + glyphColumn];

        if (!glyphCell) {
          continue;
        }

        cells.push({
          rowOffset,
          columnOffset: columnOffset + glyphColumn,
          glyphCharacter: glyph.character,
          cell: {
            ...glyphCell,
            sixelMask: glyphCell.sixelMask & 0x3f
          }
        });
      }
    }

    columnOffset += glyph.width + alphabet.spacingColumns;
  }

  return {
    width: cells.length === 0
      ? 0
      : Math.max(...cells.map((cell) => cell.columnOffset)) + 1,
    height,
    missing,
    cells
  };
}
