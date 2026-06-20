import { describe, expect, it } from "vitest";

import type { Cell, TeletextRow } from "../model/types";
import { getControlCodeByByte } from "../standards/controlCodes";
import { renderLevel1Row } from "./renderLevel1";

function emptyCell(column: number): Cell {
  return {
    column,
    kind: "empty",
    byte: 0x20,
    annotations: []
  };
}

function characterCell(column: number, value: string): Cell {
  return {
    column,
    kind: "character",
    byte: value.charCodeAt(0),
    character: {
      value,
      charset: "G0"
    },
    annotations: []
  };
}

function controlCell(column: number, byte: number): Cell {
  const controlCode = getControlCodeByByte(byte);

  if (!controlCode) {
    throw new Error(`Missing control code ${byte}`);
  }

  return {
    column,
    kind: "control",
    byte,
    controlCode,
    annotations: []
  };
}

function mosaicCell(column: number): Cell {
  return {
    column,
    kind: "mosaic",
    byte: 0x7f,
    mosaic: {
      separated: false,
      sixelMask: 0x3f,
      foreground: { palette: "level1", index: 2 },
      background: { palette: "level1", index: 0 }
    },
    annotations: []
  };
}

function rowWith(cells: Cell[]): TeletextRow {
  const rowCells = Array.from({ length: 40 }, (_, column) => emptyCell(column));

  for (const cell of cells) {
    rowCells[cell.column] = cell;
  }

  return {
    index: 1,
    cells: rowCells,
    locked: false,
    label: "Row 1"
  };
}

describe("renderLevel1Row", () => {
  it("applies control-code state left-to-right", () => {
    const row = rowWith([
      controlCell(0, 0x01),
      characterCell(1, "H"),
      characterCell(2, "E"),
      characterCell(3, "L"),
      characterCell(4, "L"),
      characterCell(5, "O"),
      controlCell(6, 0x12),
      mosaicCell(7)
    ]);

    const rendered = renderLevel1Row(row);

    expect(rendered.cells[0]).toEqual(
      expect.objectContaining({
        visible: false,
        mode: "text"
      })
    );
    expect(rendered.cells[1]).toEqual(
      expect.objectContaining({
        visible: true,
        value: "H",
        mode: "text",
        foreground: { palette: "level1", index: 1 }
      })
    );
    expect(rendered.cells[6]).toEqual(
      expect.objectContaining({
        visible: false,
        mode: "graphics"
      })
    );
    expect(rendered.cells[7]).toEqual(
      expect.objectContaining({
        visible: true,
        mode: "graphics",
        foreground: { palette: "level1", index: 2 },
        holdGraphics: false
      })
    );
  });

  it("marks characters after double-height controls", () => {
    const row = rowWith([
      controlCell(0, 0x0d),
      characterCell(1, "H"),
      controlCell(2, 0x0c),
      characterCell(3, "N")
    ]);

    const rendered = renderLevel1Row(row);

    expect(rendered.cells[1]).toEqual(
      expect.objectContaining({
        doubleHeight: true,
        value: "H"
      })
    );
    expect(rendered.cells[3]).toEqual(
      expect.objectContaining({
        doubleHeight: false,
        value: "N"
      })
    );
  });

  it("uses current foreground as the new background colour", () => {
    const row = rowWith([
      controlCell(0, 0x01),
      controlCell(1, 0x1d),
      characterCell(2, "R")
    ]);

    const rendered = renderLevel1Row(row);

    expect(rendered.cells[2]).toEqual(
      expect.objectContaining({
        background: { palette: "level1", index: 1 },
        foreground: { palette: "level1", index: 1 },
        value: "R"
      })
    );
  });
});
