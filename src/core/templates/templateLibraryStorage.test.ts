import { describe, expect, it } from "vitest";

import { createDefaultProject } from "../model/projectFactory";
import { saveCurrentPageAsTemplateCommand } from "../model/commands";
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
});
