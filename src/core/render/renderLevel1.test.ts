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
        mode: "text"
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

  it("applies real flash phases and conceal reveal modes", () => {
    const row = rowWith([
      controlCell(0, 0x08),
      characterCell(1, "F"),
      controlCell(2, 0x09),
      characterCell(3, "S"),
      controlCell(4, 0x18),
      characterCell(5, "C")
    ]);

    const visible = renderLevel1Row(row, { flashPhase: "on", revealMode: "show" });
    const hidden = renderLevel1Row(row, { flashPhase: "off", revealMode: "hide" });

    expect(visible.cells[1].visible).toBe(true);
    expect(visible.cells[5].visible).toBe(true);
    expect(hidden.cells[1].visible).toBe(false);
    expect(hidden.cells[3].visible).toBe(true);
    expect(hidden.cells[5].visible).toBe(false);
  });

  it("clears conceal on a following colour control", () => {
    const row = rowWith([
      controlCell(0, 0x18),
      characterCell(1, "H"),
      controlCell(2, 0x03),
      characterCell(3, "V")
    ]);

    const rendered = renderLevel1Row(row, { revealMode: "hide" });

    expect(rendered.cells[1].visible).toBe(false);
    expect(rendered.cells[3].visible).toBe(true);
  });

  it("replays the most recent mosaic into held graphics spaces", () => {
    const row = rowWith([
      controlCell(0, 0x12),
      mosaicCell(1),
      controlCell(2, 0x1e),
      emptyCell(3),
      controlCell(4, 0x1f),
      emptyCell(5)
    ]);

    const rendered = renderLevel1Row(row);

    expect(rendered.cells[3]).toEqual(expect.objectContaining({
      holdGraphics: true,
      source: expect.objectContaining({ byte: 0x7f, column: 3 }),
      visible: true
    }));
    expect(rendered.cells[5].visible).toBe(false);
  });

  it("replays held mosaics over controls using set-at and set-after timing", () => {
    const row = rowWith([
      controlCell(0, 0x17),
      characterCell(1, "f"),
      controlCell(2, 0x1e),
      characterCell(3, "9"),
      controlCell(4, 0x1a),
      controlCell(5, 0x1f),
      characterCell(6, "f")
    ]);

    const rendered = renderLevel1Row(row);

    expect(rendered.cells.slice(2, 6).map((cell) => ({
      byte: cell.source.byte,
      hold: cell.holdGraphics,
      separated: cell.separatedGraphics,
      visible: cell.visible
    }))).toEqual([
      { byte: 0x66, hold: true, separated: false, visible: true },
      { byte: 0x39, hold: true, separated: false, visible: true },
      { byte: 0x39, hold: true, separated: true, visible: true },
      { byte: 0x39, hold: true, separated: true, visible: true }
    ]);
    expect(rendered.cells[6]).toEqual(expect.objectContaining({
      holdGraphics: false,
      separatedGraphics: true,
      visible: true
    }));
  });
});
