import { projectSchema } from "../model/schema";
import type { Project } from "../model/types";

export function importNativeProject(input: string): Project {
  const parsed = JSON.parse(input) as unknown;

  if (
    !parsed
    || typeof parsed !== "object"
    || !("schemaVersion" in parsed)
    || parsed.schemaVersion !== "1.0.0"
  ) {
    throw new Error("Unsupported project schema");
  }

  return projectSchema.parse(parsed) as Project;
}
