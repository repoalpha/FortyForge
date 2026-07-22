import { describe, expect, it } from "vitest";

import { BUILT_IN_TEMPLATES } from "./builtInTemplates";
import { exportTemplatePackage, importTemplatePackage } from "./templatePackage";

describe("Pixelcast template packages", () => {
  it("round-trips a versioned portable template", () => {
    const template = BUILT_IN_TEMPLATES.find((item) => item.id === "finance-page")!;
    const bytes = exportTemplatePackage(template, "2026-07-19T00:00:00.000Z");
    const imported = importTemplatePackage(bytes);

    expect(imported.id).toBe("finance-page");
    expect(imported.templateVersion).toBe("1.0.0");
    expect(imported.regions[0].blockKind).toBe("key-value-table");
  });

  it("rejects a non-package payload", () => {
    expect(() => importTemplatePackage(new Uint8Array([1, 2, 3]))).toThrow();
  });
});
