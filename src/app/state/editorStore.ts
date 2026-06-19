import {
  BUILT_IN_TEMPLATES,
  createDefaultProject,
  exportPacketPreview,
  validateProject
} from "../../core";
import type {
  PacketPreview,
  Page,
  Project,
  Service,
  Subpage,
  Template,
  ValidationIssue
} from "../../core";

export interface EditorViewModel {
  project: Project;
  service: Service;
  page: Page;
  subpage: Subpage;
  templates: Template[];
  validationIssues: ValidationIssue[];
  packetPreview: PacketPreview;
}

export function createEditorViewModel(project = createDefaultProject()): EditorViewModel {
  const service = project.services[0];
  const page = service.pages[0];
  const subpage = page.subpages[0];

  return {
    project,
    service,
    page,
    subpage,
    templates: BUILT_IN_TEMPLATES,
    validationIssues: validateProject(project),
    packetPreview: exportPacketPreview(project)
  };
}
