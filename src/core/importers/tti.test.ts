import { describe, expect, it } from "vitest";

import { exportTti } from "../exporters/tti";
import { createDefaultProject } from "../model/projectFactory";
import { importTti } from "./tti";

describe("TTI import/export subset", () => {
  it("round-trips page metadata and 25 fixed-width rows", () => {
    const project = createDefaultProject();
    const row = project.services[0].pages[0].subpages[0].rows[1];
    const text = "HELLO FORTYFORGE";

    for (const [index, value] of [...text].entries()) {
      row.cells[index] = {
        column: index,
        kind: "character",
        byte: value.charCodeAt(0),
        character: {
          value,
          charset: "G0"
        },
        annotations: []
      };
    }

    const tti = exportTti(project);
    const imported = importTti(tti);
    const importedPage = imported.services[0].pages[0];
    const importedRows = importedPage.subpages[0].rows;

    expect(tti).toContain("PN,10000");
    expect(tti.match(/^OL,/gm)).toHaveLength(25);
    expect(importedPage.pageNumber).toBe("100");
    expect(importedRows).toHaveLength(25);
    expect(importedRows[1].cells).toHaveLength(40);
    expect(
      importedRows[1].cells
        .slice(0, text.length)
        .map((cell) => cell.character?.value ?? " ")
        .join("")
    ).toBe(text);
  });
});
