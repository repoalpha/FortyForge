import { describe, expect, it } from "vitest";

import { createDefaultProject } from "../model/projectFactory";
import { exportNativeProject } from "../exporters/nativeProject";
import { importNativeProject } from "./nativeProject";

describe("native project import/export", () => {
  it("round-trips the default project through deterministic JSON", () => {
    const project = createDefaultProject();

    const exported = exportNativeProject(project);
    const imported = importNativeProject(exported);

    expect(exported).toContain('"schemaVersion": "1.0.0"');
    expect(imported.metadata.title).toBe(project.metadata.title);
    expect(imported.contentSources).toEqual([]);
    expect(imported.services[0].pages[0].pageNumber).toBe("100");
    expect(imported.services[0].pages[0].subpages[0].rows).toHaveLength(25);
    expect(imported.services[0].pages[0].subpages[0].rows[1].cells).toHaveLength(40);
  });

  it("rejects unsupported schema versions", () => {
    const project = createDefaultProject();
    const exported = exportNativeProject(project).replace(
      '"schemaVersion": "1.0.0"',
      '"schemaVersion": "9.0.0"'
    );

    expect(() => importNativeProject(exported)).toThrow("Unsupported project schema");
  });

  it("defaults missing mosaic alphabets when importing older native projects", () => {
    const legacyProject = JSON.parse(exportNativeProject(createDefaultProject()));
    delete legacyProject.mosaicAlphabets;

    const imported = importNativeProject(JSON.stringify(legacyProject));

    expect(imported.mosaicAlphabets).toEqual([]);
  });

  it("defaults missing artwork blocks when importing older native projects", () => {
    const legacyProject = JSON.parse(exportNativeProject(createDefaultProject()));
    delete legacyProject.artworkBlocks;

    const imported = importNativeProject(JSON.stringify(legacyProject));

    expect(imported.artworkBlocks).toEqual([]);
  });

  it("keeps custom templates when importing older projects that miss newer libraries", () => {
    const legacyProject = JSON.parse(exportNativeProject(createDefaultProject()));

    legacyProject.templates.push({
      id: "custom-template-1",
      name: "Custom template 1",
      description: "Saved from page 100.",
      category: "blank",
      targetPresentationLevel: "1",
      rows: legacyProject.services[0].pages[0].subpages[0].rows,
      regions: []
    });
    delete legacyProject.mosaicAlphabets;
    delete legacyProject.artworkBlocks;
    delete legacyProject.glyphSets;
    delete legacyProject.contentSources;
    delete legacyProject.contentSnapshots;
    delete legacyProject.exportProfiles;
    delete legacyProject.transmissionProfiles;

    const imported = importNativeProject(JSON.stringify(legacyProject));

    expect(imported.templates.map((template) => template.name)).toEqual(["Custom template 1"]);
    expect(imported.glyphSets).toEqual([]);
    expect(imported.contentSources).toEqual([]);
    expect(imported.contentSnapshots).toEqual([]);
    expect(imported.exportProfiles).toEqual([]);
    expect(imported.transmissionProfiles).toEqual([]);
  });

  it("preserves saved artwork blocks when importing native projects", () => {
    const project = createDefaultProject();

    project.artworkBlocks.push({
      id: "artwork-letter-e",
      name: "CITYNEWS E",
      category: "letter",
      assignedCharacter: "E",
      width: 1,
      height: 1,
      cells: [[{
        column: 0,
        kind: "empty",
        byte: 0x20,
        annotations: []
      }]],
      source: {
        rowIndex: 1,
        column: 0
      },
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z"
    });

    const imported = importNativeProject(exportNativeProject(project));

    expect(imported.artworkBlocks[0]).toEqual(expect.objectContaining({
      id: "artwork-letter-e",
      name: "CITYNEWS E",
      assignedCharacter: "E"
    }));
  });
});
