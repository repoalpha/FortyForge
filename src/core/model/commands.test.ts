import { describe, expect, it } from "vitest";

import { createDefaultProject } from "./projectFactory";
import {
  applyEditorCommand,
  applyTemplateCommand,
  createEditorHistory,
  insertControlCodeCommand,
  insertControlCodeWithRowShiftCommand,
  insertTextCommand,
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
