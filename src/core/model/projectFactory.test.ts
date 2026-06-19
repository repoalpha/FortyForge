import { describe, expect, it } from "vitest";
import { createDefaultProject } from "./projectFactory";

describe("createDefaultProject", () => {
  it("creates a versioned project with page 100 and a 40 by 25 teletext grid", () => {
    const project = createDefaultProject();
    const firstPage = project.services[0].pages[0];
    const firstSubpage = firstPage.subpages[0];

    expect(project.schemaVersion).toBe("1.0.0");
    expect(firstPage.pageNumber).toBe("100");
    expect(firstSubpage.rows).toHaveLength(25);
    expect(firstSubpage.rows[1].cells).toHaveLength(40);
  });

  it("uses space bytes for empty exportable cells", () => {
    const project = createDefaultProject();
    const bodyRows = project.services[0].pages[0].subpages[0].rows.slice(1);

    expect(bodyRows.every((row) => row.cells.every((cell) => cell.byte === 0x20))).toBe(
      true
    );
  });

  it("starts with empty dynamic content collections", () => {
    const project = createDefaultProject();
    const firstPage = project.services[0].pages[0];

    expect(project.contentSources).toEqual([]);
    expect(project.contentSnapshots).toEqual([]);
    expect(firstPage.contentBindings).toEqual([]);
  });
});
