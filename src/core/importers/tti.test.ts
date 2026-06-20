import { describe, expect, it } from "vitest";

import { exportTti } from "../exporters/tti";
import { addSubpageCommand } from "../model/commands";
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

    const tti = exportTti(project, { now: new Date(2026, 5, 20, 3, 4) });
    const imported = importTti(tti);
    const importedPage = imported.services[0].pages[0];
    const importedRows = importedPage.subpages[0].rows;

    expect(tti).toContain("PN,10000");
    expect(tti).toContain("OL,0,P100 INDEX");
    expect(tti).toContain("03:04");
    expect(tti.match(/^OL,/gm)).toHaveLength(25);
    expect(importedPage.pageNumber).toBe("100");
    expect(importedPage.metadata.header.clockMode).toBe("original");
    expect(importedRows).toHaveLength(25);
    expect(importedRows[1].cells).toHaveLength(40);
    expect(
      importedRows[1].cells
        .slice(0, text.length)
        .map((cell) => cell.character?.value ?? " ")
        .join("")
    ).toBe(text);
  });

  it("exports an explicitly selected subpage", () => {
    let project = createDefaultProject();
    const service = project.services[0];
    const page = service.pages[0];
    project = addSubpageCommand(service.id, page.id).apply(project);
    const secondSubpage = project.services[0].pages[0].subpages[1];

    secondSubpage.rows[1].cells[0] = {
      column: 0,
      kind: "character",
      byte: 90,
      character: {
        value: "Z",
        charset: "G0"
      },
      annotations: []
    };

    const tti = exportTti(project, {
      pageId: page.id,
      serviceId: service.id,
      subpageId: secondSubpage.id
    });

    expect(tti).toContain("PN,10001");
    expect(tti).toContain("SC,0001");
    expect(tti).toContain("OL,1,Z");
  });
});
