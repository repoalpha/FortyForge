import { describe, expect, it } from "vitest";

import { createDefaultProject } from "./projectFactory";
import { renderLevel1Row } from "../render/renderLevel1";
import {
  applyEditorCommand,
  applyTemplateCommand,
  createEditorHistory,
  editMosaicSixelCommand,
  deleteCellWithRowShiftCommand,
  insertBackgroundColourWithRowShiftCommand,
  insertControlCodeCommand,
  insertControlCodeWithRowShiftCommand,
  insertTextCommand,
  addSubpageCommand,
  paintMosaicCommand,
  redo,
  setPageHeaderClockModeCommand,
  setCellCommand,
  undo
} from "./commands";

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

  it("recomputes background and foreground when deleting generated background controls", () => {
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

    const withoutBlueForeground = applyEditorCommand(
      withText,
      deleteCellWithRowShiftCommand("service-default", "page-100", "page-100-subpage-0000", 4, 0)
    );
    const withoutNewBackground = applyEditorCommand(
      withText,
      deleteCellWithRowShiftCommand("service-default", "page-100", "page-100-subpage-0000", 4, 1)
    );
    const withoutForegroundRestore = applyEditorCommand(
      withText,
      deleteCellWithRowShiftCommand("service-default", "page-100", "page-100-subpage-0000", 4, 2)
    );

    expect(renderLevel1Row(withoutBlueForeground.services[0].pages[0].subpages[0].rows[4]).cells[2])
      .toEqual(expect.objectContaining({
        background: { palette: "level1", index: 7 },
        foreground: { palette: "level1", index: 7 },
        value: "A"
      }));
    expect(renderLevel1Row(withoutNewBackground.services[0].pages[0].subpages[0].rows[4]).cells[2])
      .toEqual(expect.objectContaining({
        background: { palette: "level1", index: 0 },
        foreground: { palette: "level1", index: 7 },
        value: "A"
      }));
    expect(renderLevel1Row(withoutForegroundRestore.services[0].pages[0].subpages[0].rows[4]).cells[2])
      .toEqual(expect.objectContaining({
        background: { palette: "level1", index: 4 },
        foreground: { palette: "level1", index: 4 },
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
