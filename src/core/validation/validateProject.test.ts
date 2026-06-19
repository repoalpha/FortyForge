import { describe, expect, it } from "vitest";

import { createDefaultProject } from "../model/projectFactory";
import type { Page, Project } from "../model/types";
import { validateProject } from "./validateProject";

function cloneProject(project: Project): Project {
  return structuredClone(project) as Project;
}

describe("validateProject", () => {
  it("accepts the default project without export-blocking errors", () => {
    const issues = validateProject(createDefaultProject());

    expect(issues.filter((issue) => issue.severity === "error")).toHaveLength(0);
  });

  it("reports rows that do not contain exactly 40 cells", () => {
    const project = cloneProject(createDefaultProject());
    const row = project.services[0].pages[0].subpages[0].rows[1];
    row.cells = [...row.cells, { ...row.cells[0], column: 40 }];

    expect(validateProject(project)).toContainEqual(
      expect.objectContaining({
        id: "row-cell-count",
        scope: "row",
        severity: "error"
      })
    );
  });

  it("reports duplicate page addresses within a service", () => {
    const project = cloneProject(createDefaultProject());
    const pageCopy: Page = {
      ...structuredClone(project.services[0].pages[0]),
      id: "page-100-copy",
      title: "Duplicate 100"
    };
    project.services[0].pages.push(pageCopy);

    expect(validateProject(project)).toContainEqual(
      expect.objectContaining({
        id: "duplicate-page-address",
        scope: "page",
        severity: "error"
      })
    );
  });

  it("reports invalid page addresses", () => {
    const project = cloneProject(createDefaultProject());
    project.services[0].pages[0].pageNumber = "900";

    expect(validateProject(project)).toContainEqual(
      expect.objectContaining({
        id: "invalid-page-address",
        scope: "page",
        severity: "error"
      })
    );
  });

  it("reports invalid glyph dimensions", () => {
    const project = cloneProject(createDefaultProject());
    project.glyphSets.push({
      id: "glyph-set-bad",
      name: "Bad glyph set",
      scope: "global",
      source: "authored",
      glyphs: [
        {
          id: "glyph-bad",
          codePoint: 0x41,
          mode: "12x10x1",
          width: 12,
          height: 10,
          bitsPerPixel: 1,
          pixels: [0, 1]
        }
      ]
    });

    expect(validateProject(project)).toContainEqual(
      expect.objectContaining({
        id: "glyph-pixel-count",
        scope: "project",
        severity: "error"
      })
    );
  });

  it("reports export profiles without target formats", () => {
    const project = cloneProject(createDefaultProject());
    project.exportProfiles[0].targetFormats = [];

    expect(validateProject(project)).toContainEqual(
      expect.objectContaining({
        id: "export-profile-targets",
        scope: "export",
        severity: "error"
      })
    );
  });
});
