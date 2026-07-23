import { describe, expect, it } from "vitest";

import { createDefaultProject } from "../model/projectFactory";
import { saveCurrentPageAsTemplateCommand } from "../model/commands";
import { getControlCodeByByte } from "../standards/controlCodes";
import { exportTemplateLibrary, importTemplateLibrary } from "./templateLibraryStorage";

describe("saved template library storage", () => {
  it("round-trips reusable templates independently of the current project", () => {
    const project = saveCurrentPageAsTemplateCommand("service-default", "page-100")
      .apply(createDefaultProject());
    const restored = importTemplateLibrary(exportTemplateLibrary(project.templates));

    expect(restored).toHaveLength(1);
    expect(restored[0]).toMatchObject({ id: "custom-template-1", name: "Custom template 1" });
    expect(restored[0].rows).toHaveLength(25);
  });

  it("can salvage valid templates from a project document whose other fields are unusable", () => {
    const project = saveCurrentPageAsTemplateCommand("service-default", "page-100")
      .apply(createDefaultProject()) as unknown as Record<string, unknown>;
    project.services = "damaged";

    expect(importTemplateLibrary(JSON.stringify(project)).map((template) => template.id))
      .toEqual(["custom-template-1"]);
  });

  it("normalizes legacy mosaic palettes restored from the independent template library", () => {
    const project = saveCurrentPageAsTemplateCommand("service-default", "page-100")
      .apply(createDefaultProject());
    const row = project.templates[0].rows[5];
    const control = (column: number, byte: number) => ({
      column,
      kind: "control" as const,
      byte,
      controlCode: getControlCodeByByte(byte)!,
      annotations: []
    });

    row.cells[0] = control(0, 0x14);
    row.cells[1] = control(1, 0x1d);
    row.cells[2] = control(2, 0x13);
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

    const restored = importTemplateLibrary(exportTemplateLibrary(project.templates));

    expect(restored[0].rows[5].cells[3]).toEqual(expect.objectContaining({
      byte: 0x77,
      mosaic: expect.objectContaining({
        foreground: { palette: "level1", index: 3 },
        background: { palette: "level1", index: 4 },
        sixelMask: 0x37
      })
    }));
  });
});
