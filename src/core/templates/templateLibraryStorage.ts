import { templateSchema } from "../model/schema";
import { normalizeMosaicTransmissionRows } from "../model/normalizeMosaicTransmission";
import type { Template } from "../model/types";

interface StoredTemplateLibrary {
  format: "pixelcast-template-library";
  formatVersion: "1";
  templates: Template[];
}

export function exportTemplateLibrary(templates: Template[]) {
  const library: StoredTemplateLibrary = {
    format: "pixelcast-template-library",
    formatVersion: "1",
    templates: structuredClone(templates) as Template[]
  };
  return JSON.stringify(library);
}

export function importTemplateLibrary(input: string): Template[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input) as unknown;
  } catch {
    return [];
  }

  const candidates = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && Array.isArray((parsed as { templates?: unknown }).templates)
      ? (parsed as { templates: unknown[] }).templates
      : [];

  return candidates.flatMap((candidate) => {
    const result = templateSchema.safeParse(candidate);
    if (!result.success) return [];

    const template = result.data as Template;
    normalizeMosaicTransmissionRows(template.rows);
    return [template];
  });
}
