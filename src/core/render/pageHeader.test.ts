import { describe, expect, it } from "vitest";

import { createDefaultProject } from "../model/projectFactory";
import { setCellCommand, applyEditorCommand } from "../model/commands";
import { composePageHeaderRow } from "./pageHeader";

describe("composePageHeaderRow", () => {
  it("keeps the authored X/0 row in original mode", () => {
    const project = createDefaultProject();
    const page = project.services[0].pages[0];
    const withHeader = applyEditorCommand(
      project,
      setCellCommand("service-default", "page-100", "page-100-subpage-0000", 0, 0, {
        column: 0,
        kind: "character",
        byte: 79,
        character: { value: "O", charset: "G0" },
        annotations: []
      })
    );
    const authoredPage = withHeader.services[0].pages[0];

    authoredPage.metadata.header.clockMode = "original";

    const header = composePageHeaderRow(
      authoredPage,
      authoredPage.subpages[0],
      authoredPage.subpages[0].rows[0],
      new Date(2026, 5, 20, 3, 4)
    );

    expect(header.cells[0].character?.value).toBe("O");
  });

  it("generates X/0 display text from local time in local mode", () => {
    const project = createDefaultProject();
    const page = project.services[0].pages[0];
    const subpage = page.subpages[0];

    page.metadata.header.clockMode = "local";

    const header = composePageHeaderRow(
      page,
      subpage,
      subpage.rows[0],
      new Date(2026, 5, 20, 3, 4, 5)
    );
    const text = header.cells.map((cell) => cell.character?.value ?? " ").join("");

    expect(header.index).toBe(0);
    expect(header.cells).toHaveLength(40);
    expect(text).toContain("P100");
    expect(text).toContain("INDEX");
    expect(text.slice(32)).toBe("03:04/05");
  });

  it("optionally inserts the abbreviated local date before the clock", () => {
    const project = createDefaultProject();
    const page = project.services[0].pages[0];
    const subpage = page.subpages[0];
    page.metadata.header.clockMode = "local";
    page.metadata.header.showLocalDate = true;

    const header = composePageHeaderRow(
      page,
      subpage,
      subpage.rows[0],
      new Date(2022, 9, 3, 3, 4, 5)
    );
    const text = header.cells.map((cell) => cell.character?.value ?? " ").join("");

    expect(text.slice(22, 32)).toBe("Mon 3 Oct ");
    expect(text.slice(32)).toBe("03:04/05");
  });

  it("overlays only the date slot when the original X/0 row is retained", () => {
    const project = createDefaultProject();
    const page = project.services[0].pages[0];
    const subpage = page.subpages[0];
    page.metadata.header.clockMode = "original";
    page.metadata.header.showLocalDate = true;
    const originalFirstCell = subpage.rows[0].cells[0];
    const originalClock = subpage.rows[0].cells.slice(32).map((cell) => cell.byte);

    const header = composePageHeaderRow(
      page,
      subpage,
      subpage.rows[0],
      new Date(2022, 9, 3, 3, 4, 5)
    );
    const text = header.cells.map((cell) => cell.character?.value ?? " ").join("");

    expect(header.cells[0]).toEqual(originalFirstCell);
    expect(text.slice(22, 32)).toBe("Mon 3 Oct ");
    expect(header.cells.slice(32).map((cell) => cell.byte)).toEqual(originalClock);
  });

  it("can leave the X/0 clock slot blank when no generated clock is wanted", () => {
    const project = createDefaultProject();
    const page = project.services[0].pages[0];
    const subpage = page.subpages[0];

    page.metadata.header.clockMode = "none";

    const header = composePageHeaderRow(
      page,
      subpage,
      subpage.rows[0],
      new Date(2026, 5, 20, 3, 4, 5)
    );
    const text = header.cells.map((cell) => cell.character?.value ?? " ").join("");

    expect(text).toContain("P100");
    expect(text).toContain("INDEX");
    expect(text.slice(32)).toBe("        ");
  });

  it("preserves authored X/0 cells before the clock slot while filling empty cells in local mode", () => {
    const project = createDefaultProject();
    const withHeaderControl = applyEditorCommand(
      project,
      setCellCommand("service-default", "page-100", "page-100-subpage-0000", 0, 0, {
        column: 0,
        kind: "control",
        byte: 0x01,
        controlCode: {
          id: "alpha-red",
          byte: 0x01,
          mnemonic: "ALPHA_RED",
          category: "colour",
          label: "Alpha red",
          supportedLevels: ["1", "1.5", "2.5", "3.5"],
          description: "Select alphanumeric mode with red foreground."
        },
        annotations: []
      })
    );
    const page = withHeaderControl.services[0].pages[0];
    const subpage = page.subpages[0];

    page.metadata.header.clockMode = "local";

    const header = composePageHeaderRow(
      page,
      subpage,
      subpage.rows[0],
      new Date(2026, 5, 20, 3, 4, 5)
    );

    expect(header.cells[0]).toEqual(expect.objectContaining({
      kind: "control",
      byte: 0x01
    }));
    expect(header.cells[1].character?.value).toBe("1");
    expect(header.cells[39].character?.value).toBe("5");
  });

  it("lets local and no-clock modes own the X/0 clock slot over imported screenshot text", () => {
    const project = createDefaultProject();
    const clockText = "20:49/50";
    let withImportedClock = project;

    for (let index = 0; index < clockText.length; index += 1) {
      const value = clockText[index];

      withImportedClock = applyEditorCommand(
        withImportedClock,
        setCellCommand("service-default", "page-100", "page-100-subpage-0000", 0, 32 + index, {
          column: 32 + index,
          kind: "character",
          byte: value.charCodeAt(0),
          character: { value, charset: "G0" },
          annotations: []
        })
      );
    }

    const page = withImportedClock.services[0].pages[0];
    const subpage = page.subpages[0];

    page.metadata.header.clockMode = "local";

    const localHeader = composePageHeaderRow(
      page,
      subpage,
      subpage.rows[0],
      new Date(2026, 5, 20, 3, 4, 5)
    );
    const localText = localHeader.cells.map((cell) => cell.character?.value ?? " ").join("");

    expect(localText.slice(32)).toBe("03:04/05");

    page.metadata.header.clockMode = "none";

    const noClockHeader = composePageHeaderRow(
      page,
      subpage,
      subpage.rows[0],
      new Date(2026, 5, 20, 3, 4, 5)
    );
    const noClockText = noClockHeader.cells.map((cell) => cell.character?.value ?? " ").join("");

    expect(noClockText.slice(32)).toBe("        ");
  });

  it("lets local mode replace imported screenshot text before the clock slot", () => {
    const project = createDefaultProject();
    const importedText = "PP102IN";
    let withImportedHeader = project;

    for (let index = 0; index < importedText.length; index += 1) {
      const value = importedText[index];

      withImportedHeader = applyEditorCommand(
        withImportedHeader,
        setCellCommand("service-default", "page-100", "page-100-subpage-0000", 0, index, {
          column: index,
          kind: "character",
          byte: value.charCodeAt(0),
          character: { value, charset: "G0" },
          annotations: []
        })
      );
    }

    const page = withImportedHeader.services[0].pages[0];
    const subpage = page.subpages[0];

    page.metadata.header.clockMode = "local";

    const header = composePageHeaderRow(
      page,
      subpage,
      subpage.rows[0],
      new Date(2026, 5, 20, 3, 4, 5)
    );
    const text = header.cells.map((cell) => cell.character?.value ?? " ").join("");

    expect(text.startsWith("P100 INDEX")).toBe(true);
    expect(text).not.toContain("PP102IN");
  });
});
