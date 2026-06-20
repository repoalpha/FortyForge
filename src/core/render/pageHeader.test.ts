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
      new Date(2026, 5, 20, 3, 4)
    );
    const text = header.cells.map((cell) => cell.character?.value ?? " ").join("");

    expect(header.index).toBe(0);
    expect(header.cells).toHaveLength(40);
    expect(text).toContain("P100");
    expect(text).toContain("INDEX");
    expect(text.endsWith("03:04")).toBe(true);
  });
});
