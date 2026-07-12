import { projectSchema } from "../model/schema";
import type { Project } from "../model/types";

function backfillReceiverFontProfile(project: Project): Project {
  for (const service of project.services) {
    for (const page of service.pages) {
      page.metadata.receiverFontProfileId ??= "saa5050-classic";
    }
  }

  return project;
}

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

  return backfillReceiverFontProfile(projectSchema.parse(parsed) as Project);
}
