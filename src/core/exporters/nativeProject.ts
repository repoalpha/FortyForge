import type { Project } from "../model/types";

export function exportNativeProject(project: Project): string {
  return `${JSON.stringify(project, null, 2)}\n`;
}
