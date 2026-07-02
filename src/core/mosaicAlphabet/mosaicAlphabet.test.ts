import { describe, expect, it } from "vitest";

import type { MosaicAlphabet, TeletextRow } from "../model/types";
import {
  captureMosaicGlyph,
  layoutMosaicText
} from "./mosaicAlphabet";
import {
  createCitynewsCompactMastheadAlphabet,
  createCitynewsMastheadAlphabet
} from "./devPixelcastAlphabet";

const white = { palette: "level1" as const, index: 7 };
const black = { palette: "level1" as const, index: 0 };

function emptyRow(index: number): TeletextRow {
  return {
    index,
    locked: false,
    label: `Row ${index}`,
    cells: Array.from({ length: 40 }, (_, column) => ({
      column,
      kind: "empty" as const,
      byte: 0x20,
      background: black,
      annotations: []
    }))
  };
}

function mosaicRow(index: number, masks: number[]): TeletextRow {
  const row = emptyRow(index);

  masks.forEach((sixelMask, column) => {
    row.cells[column] = {
      column,
      kind: "mosaic",
      byte: 0x40 | sixelMask,
      mosaic: {
        separated: column % 2 === 1,
        sixelMask,
        foreground: white,
        background: black
      },
      annotations: []
    };
  });

  return row;
}

function glyph(character: string, mask: number) {
  return {
    character,
    width: 1,
    height: 1,
    source: "captured" as const,
    cells: [
      {
        sixelMask: mask,
        separated: false,
        foreground: white,
        background: black
      }
    ]
  };
}

function pixecastAlphabet(): MosaicAlphabet {
  const characters = "PIXELCAST";

  return {
    id: "mosaic-alphabet-test",
    name: "Test mosaic alphabet",
    description: "A small test alphabet for PIXELCAST layout.",
    cellWidth: 1,
    cellHeight: 1,
    spacingColumns: 1,
    glyphs: Object.fromEntries(
      [...characters].map((character, index) => [character, glyph(character, index + 1)])
    )
  };
}

function glyphMasks(alphabet: MosaicAlphabet, character: string) {
  return alphabet.glyphs[character].cells.map((cell) => cell.sixelMask);
}

describe("mosaic alphabets", () => {
  it("captures a rectangular mosaic glyph from authored cells", () => {
    const rows = [
      mosaicRow(8, [0x3f, 0x15]),
      mosaicRow(9, [0x2a, 0x00])
    ];

    const captured = captureMosaicGlyph(rows, {
      startRow: 8,
      startColumn: 0,
      endRow: 9,
      endColumn: 1
    }, "P");

    expect(captured).toEqual({
      character: "P",
      width: 2,
      height: 2,
      source: "captured",
      cells: [
        { sixelMask: 0x3f, separated: false, foreground: white, background: black },
        { sixelMask: 0x15, separated: true, foreground: white, background: black },
        { sixelMask: 0x2a, separated: false, foreground: white, background: black },
        { sixelMask: 0x00, separated: true, foreground: white, background: black }
      ]
    });
  });

  it("lays out PIXELCAST from known glyphs and spacing", () => {
    const layout = layoutMosaicText(pixecastAlphabet(), "PIXELCAST");

    expect(layout.missing).toEqual([]);
    expect(layout.width).toBe(17);
    expect(layout.height).toBe(1);
    expect(layout.cells.map((cell) => [
      cell.glyphCharacter,
      cell.columnOffset,
      cell.cell.sixelMask
    ])).toEqual([
      ["P", 0, 1],
      ["I", 2, 2],
      ["X", 4, 3],
      ["E", 6, 4],
      ["L", 8, 5],
      ["C", 10, 6],
      ["A", 12, 7],
      ["S", 14, 8],
      ["T", 16, 9]
    ]);
  });

  it("reports missing glyphs without silently substituting characters", () => {
    const alphabet = pixecastAlphabet();
    delete alphabet.glyphs.X;

    const layout = layoutMosaicText(alphabet, "PIXELCAST");

    expect(layout.missing).toEqual(["X"]);
    expect(layout.cells.map((cell) => cell.glyphCharacter)).toEqual([
      "P",
      "I",
      "E",
      "L",
      "C",
      "A",
      "S",
      "T"
    ]);
  });

  it("provides a CITYNEWS-style masthead alphabet with A-Z coverage", () => {
    const alphabet = createCitynewsMastheadAlphabet();

    expect(alphabet.name).toBe("CITYNEWS masthead alphabet");
    expect(Object.keys(alphabet.glyphs).sort()).toEqual([..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"]);
    expect(alphabet.glyphs.P).toEqual(expect.objectContaining({
      width: 3,
      height: 5,
      source: "generated"
    }));
  });

  it("lays out PIXELCAST in the masthead alphabet within one teletext row", () => {
    const layout = layoutMosaicText(createCitynewsMastheadAlphabet(), "PIXELCAST");

    expect(layout.missing).toEqual([]);
    expect(layout.width).toBe(35);
    expect(layout.height).toBe(5);
    expect(layout.cells).toEqual(expect.arrayContaining([
      expect.objectContaining({
        glyphCharacter: "P",
        rowOffset: 0,
        columnOffset: 0,
        cell: expect.objectContaining({ sixelMask: 0x3f })
      }),
      expect.objectContaining({
        glyphCharacter: "I",
        rowOffset: 0,
        columnOffset: 4,
        cell: expect.objectContaining({ sixelMask: 0x3f })
      }),
      expect.objectContaining({
        glyphCharacter: "T",
        rowOffset: 4,
        columnOffset: 34,
        cell: expect.objectContaining({ sixelMask: 0x00 })
      })
    ]));
  });

  it("preserves spaces as blank advances when laying out mosaic text", () => {
    const layout = layoutMosaicText(pixecastAlphabet(), " P");

    expect(layout.missing).toEqual([]);
    expect(layout.width).toBe(3);
    expect(layout.height).toBe(1);
    expect(layout.cells.map((cell) => [
      cell.glyphCharacter,
      cell.columnOffset,
      cell.cell.sixelMask
    ])).toEqual([
      ["P", 2, 1]
    ]);
  });

  it("provides a compact CITYNEWS masthead alphabet from two-row mosaic masks", () => {
    const layout = layoutMosaicText(createCitynewsCompactMastheadAlphabet(), "PIXELCAST");
    const alphabet = createCitynewsCompactMastheadAlphabet();

    expect(layout.missing).toEqual([]);
    expect(layout.width).toBeLessThan(layoutMosaicText(createCitynewsMastheadAlphabet(), "PIXELCAST").width);
    expect(layout.width).toBeLessThanOrEqual(31);
    expect(layout.height).toBe(2);
    expect(alphabet.name).toBe("CITYNEWS compact masthead");
    expect(alphabet.spacingColumns).toBe(0);
    expect(layoutMosaicText(alphabet, "CITYNEWS").width).toBe(26);
    expect(layoutMosaicText(alphabet, "PIXELCAST").width).toBe(29);
    expect(alphabet.glyphs.C).toEqual(expect.objectContaining({
      width: 3,
      height: 2
    }));
    expect(alphabet.glyphs.I).toEqual(expect.objectContaining({
      width: 1,
      height: 2
    }));
    expect(alphabet.glyphs.E.width).toBe(4);
    expect(alphabet.glyphs.W.width).toBe(4);
    expect(alphabet.glyphs.S.width).toBe(4);
    expect(alphabet.glyphs.P).toEqual(expect.objectContaining({
      width: 3,
      height: 2
    }));
    expect(alphabet.glyphs.X.width).toBe(3);
    expect(alphabet.glyphs.L.width).toBe(3);
    expect(alphabet.glyphs.A.width).toBe(3);
  });

  it("packs compact PIXELCAST from sixel-pixel letters with a CITYNEWS-style T", () => {
    const layout = layoutMosaicText(createCitynewsCompactMastheadAlphabet(), "PIXELCAST");
    const tCells = layout.cells
      .filter((cell) => cell.columnOffset >= 26)
      .map((cell) => [cell.rowOffset, cell.columnOffset, cell.cell.sixelMask]);

    expect(layout.missing).toEqual([]);
    expect(layout.width).toBe(29);
    expect(layout.height).toBe(2);
    expect(tCells).toEqual([
      [0, 26, 0x03],
      [0, 27, 0x3f],
      [0, 28, 0x03],
      [1, 26, 0x00],
      [1, 27, 0x0f],
      [1, 28, 0x00]
    ]);
  });

  it("uses the same compact pixel patterns for letters shared by CITYNEWS and PIXELCAST", () => {
    const alphabet = createCitynewsCompactMastheadAlphabet();
    const citynewsLayout = layoutMosaicText(alphabet, "CITYNEWS");
    const pixelcastLayout = layoutMosaicText(alphabet, "PIXELCAST");

    expect(citynewsLayout.missing).toEqual([]);
    expect(pixelcastLayout.missing).toEqual([]);

    for (const character of ["C", "I", "E", "S", "T"]) {
      expect(alphabet.pixelGlyphs?.[character]).toBeDefined();
      expect(alphabet.pixelGlyphs?.[character]?.length).toBe(6);
    }
  });
});
