import { projectSchema } from "../model/schema";
import { migrateProject } from "../model/migrateProject";
import type { Project } from "../model/types";

function backfillReceiverFontProfile(project: Project): Project {
  for (const service of project.services) {
    for (const page of service.pages) {
      page.metadata.receiverFontProfileId ??= "ets-1990s";
    }
  }

  return project;
}

export function importNativeProject(input: string): Project {
  const parsed = JSON.parse(input) as unknown;
  const migrated = migrateProject(parsed);

  return backfillReceiverFontProfile(projectSchema.parse(migrated) as Project);
}
