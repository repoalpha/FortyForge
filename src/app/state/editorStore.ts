import {
  BUILT_IN_TEMPLATES,
  commitEditorCommand,
  createDefaultProject,
  createEditorHistory,
  exportPacketPreview,
  redo,
  undo,
  validateProject
} from "../../core";
import type {
  EditorCommand,
  EditorHistory,
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

export interface CellSelection {
  rowIndex: number;
  column: number;
}

export function createInitialEditorHistory(): EditorHistory {
  return createEditorHistory(createDefaultProject());
}

export function commitEditorHistory(
  history: EditorHistory,
  command: EditorCommand
): EditorHistory {
  return commitEditorCommand(history, command);
}

export function undoEditorHistory(history: EditorHistory): EditorHistory {
  return undo(history);
}

export function redoEditorHistory(history: EditorHistory): EditorHistory {
  return redo(history);
}

export function createEditorViewModel(
  project = createDefaultProject(),
  activePageId?: string,
  activeSubpageId?: string
): EditorViewModel {
  const service = project.services[0];
  const page = service.pages.find((item) => item.id === activePageId) ?? service.pages[0];
  const subpage = page.subpages.find((item) => item.id === activeSubpageId) ?? page.subpages[0];

  return {
    project,
    service,
    page,
    subpage,
    templates: [...BUILT_IN_TEMPLATES, ...project.templates],
    validationIssues: validateProject(project),
    packetPreview: exportPacketPreview(project)
  };
}
