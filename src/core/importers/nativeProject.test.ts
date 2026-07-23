import { describe, expect, it } from "vitest";

import { createDefaultProject } from "../model/projectFactory";
import { createPixelcastPocProject } from "../model/pocProjectFactory";
import { exportNativeProject } from "../exporters/nativeProject";
import { renderLevel1Row } from "../render/renderLevel1";
import { getControlCodeByByte } from "../standards/controlCodes";
import { importNativeProject } from "./nativeProject";

describe("native project import/export", () => {
  it("round-trips the default project through deterministic JSON", () => {
    const project = createDefaultProject();

    const exported = exportNativeProject(project);
    const imported = importNativeProject(exported);

    expect(exported).toContain('"schemaVersion": "2.0.0"');
    expect(imported.metadata.title).toBe(project.metadata.title);
    expect(imported.contentSources).toEqual([]);
    expect(imported.services[0].pages[0].pageNumber).toBe("100");
    expect(imported.services[0].pages[0].subpages[0].rows).toHaveLength(25);
    expect(imported.services[0].pages[0].subpages[0].rows[1].cells).toHaveLength(40);
  });

  it("rejects unsupported schema versions", () => {
    const project = createDefaultProject();
    const exported = exportNativeProject(project).replace(
      '"schemaVersion": "2.0.0"',
      '"schemaVersion": "9.0.0"'
    );

    expect(() => importNativeProject(exported)).toThrow("Unsupported project schema");
  });

  it("defaults older feed bindings to white text", () => {
    const legacyProject = JSON.parse(exportNativeProject(createPixelcastPocProject()));
    delete legacyProject.services[0].pages[1].contentBindings[0].transform.textColour;

    const imported = importNativeProject(JSON.stringify(legacyProject));

    expect(imported.services[0].pages[1].contentBindings[0].transform.textColour).toBe(7);
  });

  it("normalizes an inverted traced mosaic into equivalent PIT row bytes", () => {
    const project = createDefaultProject();
    const row = project.services[0].pages[0].subpages[0].rows[5];
    const control = (column: number, byte: number) => ({
      column,
      kind: "control" as const,
      byte,
      controlCode: getControlCodeByByte(byte)!,
      annotations: []
    });

    row.cells[0] = control(0, 0x14); // Graphics blue.
    row.cells[1] = control(1, 0x1d); // Blue background.
    row.cells[2] = control(2, 0x13); // Graphics yellow.
    row.cells[3] = {
      column: 3,
      kind: "mosaic",
      byte: 0x48,
      mosaic: {
        foreground: { palette: "level1", index: 4 },
        background: { palette: "level1", index: 3 },
        separated: false,
        sixelMask: 0x08
      },
      annotations: []
    };

    const imported = importNativeProject(exportNativeProject(project));
    const importedRow = imported.services[0].pages[0].subpages[0].rows[5];
    const normalized = importedRow.cells[3];

    expect(normalized).toEqual(expect.objectContaining({
      byte: 0x77,
      mosaic: expect.objectContaining({
        foreground: { palette: "level1", index: 3 },
        background: { palette: "level1", index: 4 },
        sixelMask: 0x37
      })
    }));
    expect(renderLevel1Row(importedRow).cells[3]).toEqual(expect.objectContaining({
      mode: "graphics",
      foreground: { palette: "level1", index: 3 },
      background: { palette: "level1", index: 4 }
    }));
  });

  it("migrates schema 1 projects without losing pages or custom templates", () => {
    const legacyProject = JSON.parse(exportNativeProject(createDefaultProject()));
    legacyProject.schemaVersion = "1.0.0";
    delete legacyProject.services[0].schedule;
    delete legacyProject.services[0].pages[0].metadata.header.showLocalDate;
    legacyProject.templates.push({
      id: "custom-template-legacy",
      name: "Legacy template",
      description: "Imported from FortyForge.",
      category: "blank",
      targetPresentationLevel: "1",
      rows: legacyProject.services[0].pages[0].subpages[0].rows,
      regions: []
    });

    const imported = importNativeProject(JSON.stringify(legacyProject));

    expect(imported.schemaVersion).toBe("2.0.0");
    expect(imported.services[0].pages[0].pageNumber).toBe("100");
    expect(imported.services[0].schedule).toEqual({
      enabled: false,
      defaultDwellSeconds: 8,
      entries: []
    });
    expect(imported.templates[0].templateVersion).toBe("1.0.0");
    expect(imported.services[0].pages[0].metadata.header.showLocalDate).toBe(false);
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

  it("defaults missing page receiver font profiles when importing older native projects", () => {
    const legacyProject = JSON.parse(exportNativeProject(createDefaultProject()));
    delete legacyProject.services[0].pages[0].metadata.receiverFontProfileId;

    const imported = importNativeProject(JSON.stringify(legacyProject));

    expect(imported.services[0].pages[0].metadata.receiverFontProfileId).toBe(
      "ets-1990s"
    );
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
