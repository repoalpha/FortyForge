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
});
