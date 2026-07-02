import { describe, expect, it } from "vitest";

import { createDefaultProject } from "./projectFactory";
import { renderLevel1Row } from "../render/renderLevel1";
import {
  applyEditorCommand,
  applyTemplateCommand,
  createEditorHistory,
  deleteCustomTemplateCommand,
  editMosaicSixelCommand,
  deleteCellWithRowShiftCommand,
  insertBackgroundColourWithRowShiftCommand,
  insertBlankSpacerWithRowShiftCommand,
  insertControlCodeCommand,
  insertControlCodeWithRowShiftCommand,
  insertTextCommand,
  addSubpageCommand,
  captureMosaicGlyphCommand,
  clearCellRectangleCommand,
  clearRowCommand,
  copyCellsFromRectangle,
  paintMosaicCommand,
  paintCellBackgroundCommand,
  redo,
  replaceSubpageRowsCommand,
  saveCellBlockAsArtworkCommand,
  saveCurrentPageAsTemplateCommand,
  stampMosaicTextCommand,
  stampCellBlockCommand,
  setPageHeaderClockModeCommand,
  setCellCommand,
  undo
} from "./commands";
import type { Cell, MosaicAlphabet, TeletextRow } from "./types";

function emptyCell(column: number): Cell {
  return {
    column,
    kind: "empty",
    byte: 0x20,
    annotations: []
  };
}

function replacementRows(): TeletextRow[] {
  return Array.from({ length: 25 }, (_, rowIndex) => ({
    index: rowIndex,
    cells: Array.from({ length: 40 }, (_, column) => emptyCell(column)),
    locked: false,
    label: rowIndex === 0 ? "Header" : `Row ${rowIndex}`
  }));
}

const white = { palette: "level1" as const, index: 7 };
const black = { palette: "level1" as const, index: 0 };

function singleCellMosaicAlphabet(): MosaicAlphabet {
  return {
    id: "alphabet-pixelcast",
    name: "PIXELCAST test alphabet",
    description: "Single-cell glyphs for stamping command tests.",
    cellWidth: 1,
    cellHeight: 1,
    spacingColumns: 1,
    glyphs: Object.fromEntries(
      [..."PIXELCAST"].map((character, index) => [
        character,
        {
          character,
          width: 1,
          height: 1,
          source: "captured" as const,
          cells: [
            {
              sixelMask: index + 1,
              separated: false,
              foreground: white,
              background: black
            }
          ]
        }
      ])
    )
  };
}

describe("editor commands", () => {
  it("sets a cell immutably", () => {
    const project = createDefaultProject();

    const next = applyEditorCommand(
      project,
      setCellCommand("service-default", "page-100", "page-100-subpage-0000", 1, 0, {
        column: 0,
        kind: "character",
        byte: 65,
        character: { value: "A", charset: "G0" },
        annotations: []
      })
    );

    expect(next).not.toBe(project);
    expect(next.services[0].pages[0].subpages[0].rows[1].cells[0].character?.value).toBe("A");
    expect(project.services[0].pages[0].subpages[0].rows[1].cells[0].kind).toBe("empty");
  });

  it("inserts text across a row", () => {
    const project = createDefaultProject();
    const next = applyEditorCommand(
      project,
      insertTextCommand("service-default", "page-100", "page-100-subpage-0000", 2, 3, "HELLO")
    );

    expect(
      next.services[0].pages[0].subpages[0].rows[2].cells
        .slice(3, 8)
        .map((cell) => cell.character?.value)
        .join("")
    ).toBe("HELLO");
    expect(next.services[0].pages[0].subpages[0].rows[2].cells).toHaveLength(40);
  });

  it("inserts control codes and paints mosaics", () => {
    const project = createDefaultProject();
    const withControl = applyEditorCommand(
      project,
      insertControlCodeCommand(
        "service-default",
        "page-100",
        "page-100-subpage-0000",
        3,
        0,
        0x01
      )
    );
    const withMosaic = applyEditorCommand(
      withControl,
      paintMosaicCommand("service-default", "page-100", "page-100-subpage-0000", 3, 1, 0x3f)
    );

    expect(withMosaic.services[0].pages[0].subpages[0].rows[3].cells[0]).toEqual(
      expect.objectContaining({
        kind: "control",
        byte: 0x01,
        controlCode: expect.objectContaining({ mnemonic: "ALPHA_RED" })
      })
    );
    expect(withMosaic.services[0].pages[0].subpages[0].rows[3].cells[1]).toEqual(
      expect.objectContaining({
        kind: "mosaic",
        byte: 0x7f,
        mosaic: expect.objectContaining({ sixelMask: 0x3f })
      })
    );
  });

  it("sets, clears, and toggles individual mosaic sixels", () => {
    const project = createDefaultProject();
    const location = [
      "service-default",
      "page-100",
      "page-100-subpage-0000",
      5,
      4
    ] as const;

    const withTopLeft = applyEditorCommand(
      project,
      editMosaicSixelCommand(...location, 0, "set")
    );

    expect(withTopLeft.services[0].pages[0].subpages[0].rows[5].cells[4]).toEqual(
      expect.objectContaining({
        kind: "mosaic",
        byte: 0x41,
        mosaic: expect.objectContaining({ sixelMask: 0b000001 })
      })
    );

    const withBottomRight = applyEditorCommand(
      withTopLeft,
      editMosaicSixelCommand(...location, 5, "toggle")
    );

    expect(withBottomRight.services[0].pages[0].subpages[0].rows[5].cells[4].mosaic?.sixelMask)
      .toBe(0b100001);

    const clearedTopLeft = applyEditorCommand(
      withBottomRight,
      editMosaicSixelCommand(...location, 0, "clear")
    );

    expect(clearedTopLeft.services[0].pages[0].subpages[0].rows[5].cells[4].mosaic?.sixelMask)
      .toBe(0b100000);
    expect(clearedTopLeft.services[0].pages[0].subpages[0].rows[5].cells[4].byte)
      .toBe(0x60);
  });

  it("inherits the active row background when sixel editing creates a mosaic cell", () => {
    const project = createDefaultProject();
    const withBlueBackground = applyEditorCommand(
      project,
      insertBackgroundColourWithRowShiftCommand(
        "service-default",
        "page-100",
        "page-100-subpage-0000",
        5,
        0,
        4
      )
    );

    const withMosaicSixel = applyEditorCommand(
      withBlueBackground,
      editMosaicSixelCommand(
        "service-default",
        "page-100",
        "page-100-subpage-0000",
        5,
        3,
        0,
        "toggle"
      )
    );
    const row = withMosaicSixel.services[0].pages[0].subpages[0].rows[5];

    expect(row.cells[3]).toEqual(
      expect.objectContaining({
        kind: "mosaic",
        mosaic: expect.objectContaining({
          background: { palette: "level1", index: 4 }
        })
      })
    );
    expect(renderLevel1Row(row, { useMosaicCellColours: true }).cells[3]).toEqual(
      expect.objectContaining({
        background: { palette: "level1", index: 4 }
      })
    );
  });

  it("refreshes an existing mosaic cell background from the active row when sixel editing", () => {
    const project = createDefaultProject();
    const withMosaicOnBlack = applyEditorCommand(
      project,
      editMosaicSixelCommand(
        "service-default",
        "page-100",
        "page-100-subpage-0000",
        5,
        4,
        0,
        "toggle"
      )
    );
    const withBlueBackground = applyEditorCommand(
      withMosaicOnBlack,
      insertBackgroundColourWithRowShiftCommand(
        "service-default",
        "page-100",
        "page-100-subpage-0000",
        5,
        0,
        4
      )
    );

    const toggledAgain = applyEditorCommand(
      withBlueBackground,
      editMosaicSixelCommand(
        "service-default",
        "page-100",
        "page-100-subpage-0000",
        5,
        7,
        0,
        "toggle"
      )
    );
    const row = toggledAgain.services[0].pages[0].subpages[0].rows[5];

    expect(row.cells[7]).toEqual(
      expect.objectContaining({
        kind: "mosaic",
        mosaic: expect.objectContaining({
          sixelMask: 0,
          background: { palette: "level1", index: 4 }
        })
      })
    );
    expect(renderLevel1Row(row, { useMosaicCellColours: true }).cells[7].background)
      .toEqual({ palette: "level1", index: 4 });
  });

  it("keeps a painted cell background when all mosaic sixels are toggled off", () => {
    const project = createDefaultProject();
    const withPaintedBackground = applyEditorCommand(
      project,
      paintCellBackgroundCommand(
        "service-default",
        "page-100",
        "page-100-subpage-0000",
        5,
        4,
        4
      )
    );
    const withSixel = applyEditorCommand(
      withPaintedBackground,
      editMosaicSixelCommand(
        "service-default",
        "page-100",
        "page-100-subpage-0000",
        5,
        4,
        0,
        "toggle"
      )
    );

    const withoutSixel = applyEditorCommand(
      withSixel,
      editMosaicSixelCommand(
        "service-default",
        "page-100",
        "page-100-subpage-0000",
        5,
        4,
        0,
        "toggle"
      )
    );
    const row = withoutSixel.services[0].pages[0].subpages[0].rows[5];

    expect(row.cells[4]).toEqual(
      expect.objectContaining({
        kind: "mosaic",
        mosaic: expect.objectContaining({
          sixelMask: 0,
          background: { palette: "level1", index: 4 }
        })
      })
    );
    expect(renderLevel1Row(row, {
      useCellBackgroundColours: true,
      useMosaicCellColours: true
    }).cells[4].background).toEqual({ palette: "level1", index: 4 });
  });

  it("paints mosaic palette cells on the active row background", () => {
    const project = createDefaultProject();
    const withBlueBackground = applyEditorCommand(
      project,
      insertBackgroundColourWithRowShiftCommand(
        "service-default",
        "page-100",
        "page-100-subpage-0000",
        5,
        0,
        4
      )
    );

    const withPaintedMosaic = applyEditorCommand(
      withBlueBackground,
      paintMosaicCommand("service-default", "page-100", "page-100-subpage-0000", 5, 4, 0x3f)
    );
    const row = withPaintedMosaic.services[0].pages[0].subpages[0].rows[5];

    expect(row.cells[4]).toEqual(
      expect.objectContaining({
        kind: "mosaic",
        mosaic: expect.objectContaining({
          background: { palette: "level1", index: 4 }
        })
      })
    );
  });

  it("paints a blank mosaic cell on a painted background without turning it black", () => {
    const project = createDefaultProject();
    const withPaintedBackground = applyEditorCommand(
      project,
      paintCellBackgroundCommand(
        "service-default",
        "page-100",
        "page-100-subpage-0000",
        5,
        4,
        4
      )
    );

    const withBlankMosaic = applyEditorCommand(
      withPaintedBackground,
      paintMosaicCommand("service-default", "page-100", "page-100-subpage-0000", 5, 4, 0)
    );
    const row = withBlankMosaic.services[0].pages[0].subpages[0].rows[5];

    expect(row.cells[4]).toEqual(
      expect.objectContaining({
        kind: "mosaic",
        mosaic: expect.objectContaining({
          sixelMask: 0,
          background: { palette: "level1", index: 4 }
        })
      })
    );
    expect(renderLevel1Row(row, {
      useCellBackgroundColours: true,
      useMosaicCellColours: true
    }).cells[4].background).toEqual({ palette: "level1", index: 4 });
  });

  it("keeps mosaic foreground and background separate when painting full and empty patterns", () => {
    const project = createDefaultProject();
    const withBlueBackground = applyEditorCommand(
      project,
      paintCellBackgroundCommand(
        "service-default",
        "page-100",
        "page-100-subpage-0000",
        5,
        4,
        4
      )
    );
    const withFullYellow = applyEditorCommand(
      withBlueBackground,
      paintMosaicCommand(
        "service-default",
        "page-100",
        "page-100-subpage-0000",
        5,
        4,
        0x3f,
        { palette: "level1", index: 3 }
      )
    );
    const fullRow = withFullYellow.services[0].pages[0].subpages[0].rows[5];

    expect(fullRow.cells[4]).toEqual(expect.objectContaining({
      kind: "mosaic",
      mosaic: expect.objectContaining({
        sixelMask: 0x3f,
        foreground: { palette: "level1", index: 3 },
        background: { palette: "level1", index: 4 }
      })
    }));
    expect(renderLevel1Row(fullRow, {
      useCellBackgroundColours: true,
      useMosaicCellColours: true
    }).cells[4]).toEqual(expect.objectContaining({
      foreground: { palette: "level1", index: 3 },
      background: { palette: "level1", index: 4 }
    }));

    const withEmptyYellow = applyEditorCommand(
      withFullYellow,
      paintMosaicCommand(
        "service-default",
        "page-100",
        "page-100-subpage-0000",
        5,
        4,
        0,
        { palette: "level1", index: 3 }
      )
    );
    const emptyRow = withEmptyYellow.services[0].pages[0].subpages[0].rows[5];

    expect(emptyRow.cells[4]).toEqual(expect.objectContaining({
      kind: "mosaic",
      mosaic: expect.objectContaining({
        sixelMask: 0,
        foreground: { palette: "level1", index: 3 },
        background: { palette: "level1", index: 4 }
      })
    }));
    expect(renderLevel1Row(emptyRow, {
      useCellBackgroundColours: true,
      useMosaicCellColours: true
    }).cells[4]).toEqual(expect.objectContaining({
      foreground: { palette: "level1", index: 3 },
      background: { palette: "level1", index: 4 }
    }));
  });

  it("captures a mosaic glyph into a new alphabet", () => {
    const project = createDefaultProject();
    const painted = applyEditorCommand(
      project,
      paintMosaicCommand("service-default", "page-100", "page-100-subpage-0000", 6, 4, 0x3f)
    );

    const next = applyEditorCommand(
      painted,
      captureMosaicGlyphCommand(
        "service-default",
        "page-100",
        "page-100-subpage-0000",
        {
          alphabetName: "Page 120 masthead",
          character: "P",
          bounds: {
            startRow: 6,
            startColumn: 4,
            endRow: 6,
            endColumn: 4
          }
        }
      )
    );

    const capturedAlphabet = next.mosaicAlphabets.find(
      (alphabet) => alphabet.name === "Page 120 masthead"
    );

    expect(capturedAlphabet).toBeDefined();
    expect(capturedAlphabet?.glyphs.P.cells[0].sixelMask).toBe(0x3f);
  });

  it("copies a rectangular cell block as cloned cell data", () => {
    const project = createDefaultProject();
    const withMosaic = applyEditorCommand(
      project,
      paintMosaicCommand("service-default", "page-100", "page-100-subpage-0000", 6, 4, 0x3f)
    );
    const withText = applyEditorCommand(
      withMosaic,
      insertTextCommand("service-default", "page-100", "page-100-subpage-0000", 6, 5, "E")
    );

    const block = copyCellsFromRectangle(
      withText,
      "service-default",
      "page-100",
      "page-100-subpage-0000",
      { startRow: 6, startColumn: 4, endRow: 6, endColumn: 5 }
    );

    expect(block).toEqual(expect.objectContaining({ width: 2, height: 1 }));
    expect(block?.cells[0][0].mosaic?.sixelMask).toBe(0x3f);
    expect(block?.cells[0][1].character?.value).toBe("E");

    const sourceCell = withText.services[0].pages[0].subpages[0].rows[6].cells[4];
    expect(block?.cells[0][0]).not.toBe(sourceCell);
  });

  it("clears a rectangular cell block without shifting row content", () => {
    const project = createDefaultProject();
    const withText = applyEditorCommand(
      project,
      insertTextCommand("service-default", "page-100", "page-100-subpage-0000", 6, 4, "ABCDE")
    );

    const stripped = applyEditorCommand(
      withText,
      clearCellRectangleCommand(
        "service-default",
        "page-100",
        "page-100-subpage-0000",
        { startRow: 6, startColumn: 5, endRow: 6, endColumn: 6 }
      )
    );
    const row = stripped.services[0].pages[0].subpages[0].rows[6];

    expect(row.cells[4]).toEqual(expect.objectContaining({ kind: "character", byte: 65 }));
    expect(row.cells[5]).toEqual(expect.objectContaining({ kind: "empty", byte: 32 }));
    expect(row.cells[6]).toEqual(expect.objectContaining({ kind: "empty", byte: 32 }));
    expect(row.cells[7]).toEqual(expect.objectContaining({ kind: "character", byte: 68 }));
    expect(row.cells[8]).toEqual(expect.objectContaining({ kind: "character", byte: 69 }));
  });

  it("stamps a copied cell block exactly and keeps source columns normalized", () => {
    const project = createDefaultProject();
    const withMosaic = applyEditorCommand(
      project,
      paintMosaicCommand("service-default", "page-100", "page-100-subpage-0000", 6, 4, 0x2a)
    );
    const block = copyCellsFromRectangle(
      withMosaic,
      "service-default",
      "page-100",
      "page-100-subpage-0000",
      { startRow: 6, startColumn: 4, endRow: 6, endColumn: 4 }
    );

    if (!block) {
      throw new Error("Expected copied block");
    }

    const stamped = applyEditorCommand(
      withMosaic,
      stampCellBlockCommand(
        "service-default",
        "page-100",
        "page-100-subpage-0000",
        block,
        { rowIndex: 9, column: 10 }
      )
    );
    const target = stamped.services[0].pages[0].subpages[0].rows[9].cells[10];

    expect(target).toEqual(expect.objectContaining({
      column: 10,
      kind: "mosaic",
      byte: 0x6a,
      mosaic: expect.objectContaining({ sixelMask: 0x2a })
    }));
    expect(stamped.services[0].pages[0].subpages[0].rows[6].cells[4].mosaic?.sixelMask)
      .toBe(0x2a);
  });

  it("does not stamp a block outside the 40 by 25 page bounds", () => {
    const project = createDefaultProject();
    const block = {
      width: 2,
      height: 1,
      cells: [[
        { column: 0, kind: "empty" as const, byte: 0x20, annotations: [] },
        { column: 1, kind: "empty" as const, byte: 0x20, annotations: [] }
      ]],
      source: { rowIndex: 1, column: 1 }
    };

    const next = applyEditorCommand(
      project,
      stampCellBlockCommand(
        "service-default",
        "page-100",
        "page-100-subpage-0000",
        block,
        { rowIndex: 1, column: 39 }
      )
    );

    expect(next).toBe(project);
  });

  it("saves a copied cell block as a project artwork block", () => {
    const project = createDefaultProject();
    const block = {
      width: 1,
      height: 1,
      cells: [[
        { column: 0, kind: "empty" as const, byte: 0x20, annotations: [] }
      ]],
      source: { rowIndex: 2, column: 3 }
    };

    const next = applyEditorCommand(
      project,
      saveCellBlockAsArtworkCommand(block, {
        id: "artwork-letter-e",
        name: "CITYNEWS E",
        category: "letter",
        assignedCharacter: "E",
        now: new Date("2026-07-01T00:00:00.000Z")
      })
    );

    expect(next.artworkBlocks).toHaveLength(1);
    expect(next.artworkBlocks[0]).toEqual(expect.objectContaining({
      id: "artwork-letter-e",
      name: "CITYNEWS E",
      category: "letter",
      assignedCharacter: "E",
      width: 1,
      height: 1
    }));
    expect(next.artworkBlocks[0].cells[0][0]).not.toBe(block.cells[0][0]);
  });

  it("stamps PIXELCAST as mosaic cells without altering neighbouring cells", () => {
    const project = {
      ...createDefaultProject(),
      mosaicAlphabets: [singleCellMosaicAlphabet()]
    };

    const next = applyEditorCommand(
      project,
      stampMosaicTextCommand(
        "service-default",
        "page-100",
        "page-100-subpage-0000",
        {
          alphabetId: "alphabet-pixelcast",
          text: "PIXELCAST",
          rowIndex: 10,
          column: 2
        }
      )
    );

    const row = next.services[0].pages[0].subpages[0].rows[10];

    expect(row.cells[1].kind).toBe("empty");
    expect(row.cells[2].mosaic?.sixelMask).toBe(1);
    expect(row.cells[4].mosaic?.sixelMask).toBe(2);
    expect(row.cells[18].mosaic?.sixelMask).toBe(9);
    expect(row.cells[19].kind).toBe("empty");
  });

  it("does not stamp mosaic text when a required glyph is missing", () => {
    const alphabet = singleCellMosaicAlphabet();
    delete alphabet.glyphs.X;
    const project = {
      ...createDefaultProject(),
      mosaicAlphabets: [alphabet]
    };

    const next = applyEditorCommand(
      project,
      stampMosaicTextCommand(
        "service-default",
        "page-100",
        "page-100-subpage-0000",
        {
          alphabetId: "alphabet-pixelcast",
          text: "PIXELCAST",
          rowIndex: 10,
          column: 2
        }
      )
    );

    expect(next).toBe(project);
  });

  it("inserts a control code by shifting the row right", () => {
    const project = createDefaultProject();
    const withText = applyEditorCommand(
      project,
      insertTextCommand("service-default", "page-100", "page-100-subpage-0000", 4, 0, "ABCD")
    );

    const next = applyEditorCommand(
      withText,
      insertControlCodeWithRowShiftCommand(
        "service-default",
        "page-100",
        "page-100-subpage-0000",
        4,
        1,
        0x01
      )
    );
    const cells = next.services[0].pages[0].subpages[0].rows[4].cells;

    expect(next).not.toBe(withText);
    expect(cells).toHaveLength(40);
    expect(cells[0].character?.value).toBe("A");
    expect(cells[1]).toEqual(
      expect.objectContaining({
        column: 1,
        kind: "control",
        byte: 0x01,
        controlCode: expect.objectContaining({ mnemonic: "ALPHA_RED" })
      })
    );
    expect(cells[2].character?.value).toBe("B");
    expect(cells[3].character?.value).toBe("C");
    expect(cells[4].character?.value).toBe("D");
    expect(cells[39].column).toBe(39);
    expect(withText.services[0].pages[0].subpages[0].rows[4].cells[1].character?.value).toBe("B");
  });

  it("inserts a blank spacer by shifting the row right", () => {
    const project = createDefaultProject();
    const withText = applyEditorCommand(
      project,
      insertTextCommand("service-default", "page-100", "page-100-subpage-0000", 4, 0, "ABCD")
    );

    const next = applyEditorCommand(
      withText,
      insertBlankSpacerWithRowShiftCommand(
        "service-default",
        "page-100",
        "page-100-subpage-0000",
        4,
        1
      )
    );
    const cells = next.services[0].pages[0].subpages[0].rows[4].cells;

    expect(next).not.toBe(withText);
    expect(cells).toHaveLength(40);
    expect(cells[0].character?.value).toBe("A");
    expect(cells[1]).toEqual(expect.objectContaining({
      column: 1,
      kind: "empty",
      byte: 0x20
    }));
    expect(cells[2].character?.value).toBe("B");
    expect(cells[3].character?.value).toBe("C");
    expect(cells[4].character?.value).toBe("D");
    expect(cells[39].column).toBe(39);
  });

  it("deletes a cell by shifting the row left and blanking the final column", () => {
    const project = createDefaultProject();
    const withText = applyEditorCommand(
      project,
      insertTextCommand("service-default", "page-100", "page-100-subpage-0000", 4, 0, "ABCD")
    );
    const withControl = applyEditorCommand(
      withText,
      insertControlCodeWithRowShiftCommand(
        "service-default",
        "page-100",
        "page-100-subpage-0000",
        4,
        1,
        0x01
      )
    );

    const next = applyEditorCommand(
      withControl,
      deleteCellWithRowShiftCommand(
        "service-default",
        "page-100",
        "page-100-subpage-0000",
        4,
        1
      )
    );
    const cells = next.services[0].pages[0].subpages[0].rows[4].cells;

    expect(cells).toHaveLength(40);
    expect(cells[0].character?.value).toBe("A");
    expect(cells[1].character?.value).toBe("B");
    expect(cells[2].character?.value).toBe("C");
    expect(cells[3].character?.value).toBe("D");
    expect(cells[39]).toEqual(expect.objectContaining({
      column: 39,
      kind: "empty",
      byte: 0x20
    }));
    expect(withControl.services[0].pages[0].subpages[0].rows[4].cells[1].kind).toBe("control");
  });

  it("clears a whole row to empty cells", () => {
    const project = createDefaultProject();
    const withText = applyEditorCommand(
      project,
      insertTextCommand("service-default", "page-100", "page-100-subpage-0000", 4, 0, "ABCD")
    );

    const next = applyEditorCommand(
      withText,
      clearRowCommand("service-default", "page-100", "page-100-subpage-0000", 4)
    );
    const cells = next.services[0].pages[0].subpages[0].rows[4].cells;

    expect(next).not.toBe(withText);
    expect(cells).toHaveLength(40);
    expect(cells.every((cell, column) =>
      cell.column === column && cell.kind === "empty" && cell.byte === 0x20
    )).toBe(true);
    expect(withText.services[0].pages[0].subpages[0].rows[4].cells[0].character?.value).toBe("A");
  });

  it("inserts a background colour sequence by shifting the row right", () => {
    const project = createDefaultProject();
    const withText = applyEditorCommand(
      project,
      insertTextCommand("service-default", "page-100", "page-100-subpage-0000", 4, 0, "ABCD")
    );

    const next = applyEditorCommand(
      withText,
      insertBackgroundColourWithRowShiftCommand(
        "service-default",
        "page-100",
        "page-100-subpage-0000",
        4,
        1,
        1
      )
    );
    const cells = next.services[0].pages[0].subpages[0].rows[4].cells;

    expect(cells).toHaveLength(40);
    expect(cells[0].character?.value).toBe("A");
    expect(cells[1]).toEqual(
      expect.objectContaining({
        column: 1,
        kind: "control",
        byte: 0x01,
        controlCode: expect.objectContaining({ mnemonic: "ALPHA_RED" })
      })
    );
    expect(cells[2]).toEqual(
      expect.objectContaining({
        column: 2,
        kind: "control",
        byte: 0x1d,
        controlCode: expect.objectContaining({ mnemonic: "NEW_BACKGROUND" })
      })
    );
    expect(cells[3]).toEqual(
      expect.objectContaining({
        column: 3,
        kind: "control",
        byte: 0x07,
        controlCode: expect.objectContaining({ mnemonic: "ALPHA_WHITE" })
      })
    );
    expect(cells[4].character?.value).toBe("B");
    expect(cells[5].character?.value).toBe("C");
    expect(cells[6].character?.value).toBe("D");
  });

  it("paints a background behind existing text without shifting row content", () => {
    const project = createDefaultProject();
    const withText = applyEditorCommand(
      project,
      insertTextCommand("service-default", "page-100", "page-100-subpage-0000", 4, 0, "ABCD")
    );

    const next = applyEditorCommand(
      withText,
      paintCellBackgroundCommand(
        "service-default",
        "page-100",
        "page-100-subpage-0000",
        4,
        1,
        4
      )
    );
    const row = next.services[0].pages[0].subpages[0].rows[4];
    const rendered = renderLevel1Row(row, { useCellBackgroundColours: true });

    expect(row.cells[0].character?.value).toBe("A");
    expect(row.cells[1].character?.value).toBe("B");
    expect(row.cells[2].character?.value).toBe("C");
    expect(row.cells[3].character?.value).toBe("D");
    expect(row.cells[1].background).toEqual({ palette: "level1", index: 4 });
    expect(rendered.cells[1]).toEqual(expect.objectContaining({
      background: { palette: "level1", index: 4 },
      value: "B"
    }));
  });

  it("preserves a painted empty-cell background when text is inserted over it", () => {
    const project = createDefaultProject();
    const withBackground = applyEditorCommand(
      project,
      paintCellBackgroundCommand(
        "service-default",
        "page-100",
        "page-100-subpage-0000",
        4,
        0,
        4
      )
    );

    const next = applyEditorCommand(
      withBackground,
      insertTextCommand("service-default", "page-100", "page-100-subpage-0000", 4, 0, "A")
    );
    const row = next.services[0].pages[0].subpages[0].rows[4];
    const rendered = renderLevel1Row(row, { useCellBackgroundColours: true });

    expect(row.cells[0]).toEqual(expect.objectContaining({
      kind: "character",
      background: { palette: "level1", index: 4 },
      character: expect.objectContaining({ value: "A" })
    }));
    expect(rendered.cells[0]).toEqual(expect.objectContaining({
      background: { palette: "level1", index: 4 },
      value: "A"
    }));
  });

  it("clears content from a painted background cell without shifting the row", () => {
    const project = createDefaultProject();
    const withText = applyEditorCommand(
      project,
      insertTextCommand("service-default", "page-100", "page-100-subpage-0000", 4, 0, "AB")
    );
    const withBackground = applyEditorCommand(
      withText,
      paintCellBackgroundCommand(
        "service-default",
        "page-100",
        "page-100-subpage-0000",
        4,
        0,
        4
      )
    );

    const next = applyEditorCommand(
      withBackground,
      deleteCellWithRowShiftCommand("service-default", "page-100", "page-100-subpage-0000", 4, 0)
    );
    const row = next.services[0].pages[0].subpages[0].rows[4];

    expect(row.cells[0]).toEqual(expect.objectContaining({
      kind: "empty",
      background: { palette: "level1", index: 4 }
    }));
    expect(row.cells[1].character?.value).toBe("B");
  });

  it("restores the active text foreground after inserting a non-black background", () => {
    const project = createDefaultProject();
    const withText = applyEditorCommand(
      project,
      insertTextCommand("service-default", "page-100", "page-100-subpage-0000", 4, 0, "A")
    );

    const next = applyEditorCommand(
      withText,
      insertBackgroundColourWithRowShiftCommand(
        "service-default",
        "page-100",
        "page-100-subpage-0000",
        4,
        0,
        4
      )
    );
    const cells = next.services[0].pages[0].subpages[0].rows[4].cells;
    const rendered = renderLevel1Row(next.services[0].pages[0].subpages[0].rows[4]);

    expect(cells[0]).toEqual(expect.objectContaining({ kind: "control", byte: 0x04 }));
    expect(cells[1]).toEqual(expect.objectContaining({ kind: "control", byte: 0x1d }));
    expect(cells[2]).toEqual(expect.objectContaining({ kind: "control", byte: 0x07 }));
    expect(cells[3].character?.value).toBe("A");
    expect(rendered.cells[3]).toEqual(
      expect.objectContaining({
        background: { palette: "level1", index: 4 },
        foreground: { palette: "level1", index: 7 },
        value: "A"
      })
    );
  });

  it("preserves graphics mode and foreground when inserting a background behind mosaics", () => {
    const project = createDefaultProject();
    const inGraphicsMode = applyEditorCommand(
      project,
      insertControlCodeWithRowShiftCommand(
        "service-default",
        "page-100",
        "page-100-subpage-0000",
        4,
        0,
        0x12
      )
    );
    const withMosaic = applyEditorCommand(
      inGraphicsMode,
      paintMosaicCommand("service-default", "page-100", "page-100-subpage-0000", 4, 1, 0x3f)
    );

    const next = applyEditorCommand(
      withMosaic,
      insertBackgroundColourWithRowShiftCommand(
        "service-default",
        "page-100",
        "page-100-subpage-0000",
        4,
        1,
        4
      )
    );
    const cells = next.services[0].pages[0].subpages[0].rows[4].cells;
    const rendered = renderLevel1Row(next.services[0].pages[0].subpages[0].rows[4]);

    expect(cells[1]).toEqual(expect.objectContaining({ kind: "control", byte: 0x14 }));
    expect(cells[2]).toEqual(expect.objectContaining({ kind: "control", byte: 0x1d }));
    expect(cells[3]).toEqual(expect.objectContaining({ kind: "control", byte: 0x12 }));
    expect(rendered.cells[4]).toEqual(
      expect.objectContaining({
        mode: "graphics",
        background: { palette: "level1", index: 4 },
        foreground: { palette: "level1", index: 2 }
      })
    );
  });

  it("deletes a generated background helper sequence as one editor unit", () => {
    const project = createDefaultProject();
    const withBackground = applyEditorCommand(
      project,
      insertBackgroundColourWithRowShiftCommand(
        "service-default",
        "page-100",
        "page-100-subpage-0000",
        4,
        0,
        4
      )
    );
    const withText = applyEditorCommand(
      withBackground,
      insertTextCommand("service-default", "page-100", "page-100-subpage-0000", 4, 3, "A")
    );

    const withoutSequence = applyEditorCommand(
      withText,
      deleteCellWithRowShiftCommand("service-default", "page-100", "page-100-subpage-0000", 4, 0)
    );

    expect(withoutSequence.services[0].pages[0].subpages[0].rows[4].cells[0].character?.value)
      .toBe("A");
    expect(renderLevel1Row(withoutSequence.services[0].pages[0].subpages[0].rows[4]).cells[0])
      .toEqual(expect.objectContaining({
        background: { palette: "level1", index: 0 },
        foreground: { palette: "level1", index: 7 },
        value: "A"
      }));
  });

  it("deletes a generated background helper sequence when any helper byte is selected", () => {
    const project = createDefaultProject();
    const withBackground = applyEditorCommand(
      project,
      insertBackgroundColourWithRowShiftCommand(
        "service-default",
        "page-100",
        "page-100-subpage-0000",
        4,
        0,
        4
      )
    );
    const withText = applyEditorCommand(
      withBackground,
      insertTextCommand("service-default", "page-100", "page-100-subpage-0000", 4, 3, "A")
    );

    for (const selectedColumn of [0, 1, 2]) {
      const next = applyEditorCommand(
        withText,
        deleteCellWithRowShiftCommand(
          "service-default",
          "page-100",
          "page-100-subpage-0000",
          4,
          selectedColumn
        )
      );
      const rendered = renderLevel1Row(next.services[0].pages[0].subpages[0].rows[4]);

      expect(next.services[0].pages[0].subpages[0].rows[4].cells[0].character?.value)
        .toBe("A");
      expect(rendered.cells[0]).toEqual(expect.objectContaining({
        background: { palette: "level1", index: 0 },
        foreground: { palette: "level1", index: 7 },
        value: "A"
      }));
    }
  });

  it("returns to the start-of-row black background after all generated background controls are deleted", () => {
    const project = createDefaultProject();
    const withBackground = applyEditorCommand(
      project,
      insertBackgroundColourWithRowShiftCommand(
        "service-default",
        "page-100",
        "page-100-subpage-0000",
        4,
        0,
        4
      )
    );
    const withText = applyEditorCommand(
      withBackground,
      insertTextCommand("service-default", "page-100", "page-100-subpage-0000", 4, 3, "A")
    );

    const withoutControls = applyEditorCommand(
      withText,
      deleteCellWithRowShiftCommand(
        "service-default",
        "page-100",
        "page-100-subpage-0000",
        4,
        0
      )
    );
    const rendered = renderLevel1Row(withoutControls.services[0].pages[0].subpages[0].rows[4]);

    expect(withoutControls.services[0].pages[0].subpages[0].rows[4].cells[0].character?.value)
      .toBe("A");
    expect(rendered.cells[0]).toEqual(expect.objectContaining({
      background: { palette: "level1", index: 0 },
      foreground: { palette: "level1", index: 7 },
      value: "A"
    }));
  });

  it("applies templates through the command surface", () => {
    const project = createDefaultProject();
    const next = applyEditorCommand(
      project,
      applyTemplateCommand("service-default", "page-100", "index-page")
    );

    expect(next.services[0].pages[0].metadata.templateId).toBe("index-page");
    expect(next.services[0].pages[0].subpages[0].rows[1].cells[0].character?.value).toBe("F");
  });

  it("deletes custom templates without renumbering remaining template identities", () => {
    const project = createDefaultProject();
    const withFirstTemplate = applyEditorCommand(
      project,
      saveCurrentPageAsTemplateCommand("service-default", "page-100")
    );
    const withSecondTemplate = applyEditorCommand(
      withFirstTemplate,
      saveCurrentPageAsTemplateCommand("service-default", "page-100")
    );
    const withThirdTemplate = applyEditorCommand(
      withSecondTemplate,
      saveCurrentPageAsTemplateCommand("service-default", "page-100")
    );

    const next = applyEditorCommand(
      withThirdTemplate,
      deleteCustomTemplateCommand("custom-template-2")
    );

    expect(next.templates.map((template) => template.id)).toEqual([
      "custom-template-1",
      "custom-template-3"
    ]);
    expect(next.templates.map((template) => template.name)).toEqual([
      "Custom template 1",
      "Custom template 3"
    ]);
    expect(withThirdTemplate.templates).toHaveLength(3);
  });

  it("clears page template references when deleting a custom template", () => {
    const project = createDefaultProject();
    const withTemplate = applyEditorCommand(
      project,
      saveCurrentPageAsTemplateCommand("service-default", "page-100")
    );
    const withAppliedTemplate = applyEditorCommand(
      withTemplate,
      applyTemplateCommand("service-default", "page-100", "custom-template-1")
    );

    const next = applyEditorCommand(
      withAppliedTemplate,
      deleteCustomTemplateCommand("custom-template-1")
    );

    expect(next.templates).toEqual([]);
    expect(next.services[0].pages[0].metadata.templateId).toBeUndefined();
  });

  it("does not delete built-in template ids through the custom delete command", () => {
    const project = createDefaultProject();
    const withAppliedBuiltIn = applyEditorCommand(
      project,
      applyTemplateCommand("service-default", "page-100", "index-page")
    );

    const next = applyEditorCommand(
      withAppliedBuiltIn,
      deleteCustomTemplateCommand("index-page")
    );

    expect(next).toBe(withAppliedBuiltIn);
    expect(next.services[0].pages[0].metadata.templateId).toBe("index-page");
  });

  it("updates the page header clock mode", () => {
    const project = createDefaultProject();

    const next = applyEditorCommand(
      project,
      setPageHeaderClockModeCommand("service-default", "page-100", "original")
    );

    expect(next.services[0].pages[0].metadata.header.clockMode).toBe("original");
    expect(project.services[0].pages[0].metadata.header.clockMode).toBe("local");
  });

  it("adds fixed-width subpages to a page", () => {
    const project = createDefaultProject();

    const next = applyEditorCommand(
      project,
      addSubpageCommand("service-default", "page-100")
    );
    const subpages = next.services[0].pages[0].subpages;

    expect(subpages).toHaveLength(2);
    expect(subpages[1].subcode).toBe("0001");
    expect(subpages[1].rows).toHaveLength(25);
    expect(subpages[1].rows[1].cells).toHaveLength(40);
    expect(project.services[0].pages[0].subpages).toHaveLength(1);
  });

  it("replaces the current subpage rows with traced editable rows", () => {
    const project = createDefaultProject();
    const rows = replacementRows();
    rows[2].cells[3] = {
      column: 99,
      kind: "character",
      byte: 65,
      character: {
        charset: "G0",
        value: "A"
      },
      annotations: []
    };

    const next = applyEditorCommand(
      project,
      replaceSubpageRowsCommand(
        "service-default",
        "page-100",
        "page-100-subpage-0000",
        rows
      )
    );

    const replacedRows = next.services[0].pages[0].subpages[0].rows;
    expect(next).not.toBe(project);
    expect(replacedRows).toHaveLength(25);
    expect(replacedRows[2].cells).toHaveLength(40);
    expect(replacedRows[2].cells[3]).toEqual(
      expect.objectContaining({
        column: 3,
        kind: "character",
        byte: 65
      })
    );
    expect(project.services[0].pages[0].subpages[0].rows[2].cells[3].kind).toBe("empty");
  });

  it("supports undo and redo", () => {
    const project = createDefaultProject();
    const history = createEditorHistory(project);
    const afterText = applyEditorCommand(
      history.present,
      insertTextCommand("service-default", "page-100", "page-100-subpage-0000", 1, 0, "Z")
    );
    const withPast = {
      past: [history.present],
      present: afterText,
      future: []
    };

    const undone = undo(withPast);
    const redone = redo(undone);

    expect(undone.present.services[0].pages[0].subpages[0].rows[1].cells[0].kind).toBe("empty");
    expect(redone.present.services[0].pages[0].subpages[0].rows[1].cells[0].character?.value).toBe("Z");
  });
});
