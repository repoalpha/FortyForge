import { applyTemplate } from "../templates/applyTemplate";
import { getControlCodeByByte } from "../standards/controlCodes";
import type { Cell, PageHeaderSettings, Project, Subpage, TeletextColourRef } from "./types";

export interface CellLocation {
  serviceId: string;
  pageId: string;
  subpageId: string;
  rowIndex: number;
  column: number;
}

export interface EditorCommand {
  id: string;
  label: string;
  apply(project: Project): Project;
}

export interface EditorHistory {
  past: Project[];
  present: Project;
  future: Project[];
}

function cloneProject(project: Project): Project {
  return structuredClone(project) as Project;
}

function updateCell(project: Project, location: CellLocation, cell: Cell): Project {
  const next = cloneProject(project);
  const service = next.services.find((item) => item.id === location.serviceId);
  const page = service?.pages.find((item) => item.id === location.pageId);
  const subpage = page?.subpages.find((item) => item.id === location.subpageId);
  const row = subpage?.rows.find((item) => item.index === location.rowIndex);

  if (!row || location.column < 0 || location.column >= row.cells.length) {
    return project;
  }

  row.cells[location.column] = {
    ...cell,
    column: location.column
  };

  return next;
}

function findMutableRow(project: Project, location: CellLocation) {
  const service = project.services.find((item) => item.id === location.serviceId);
  const page = service?.pages.find((item) => item.id === location.pageId);
  const subpage = page?.subpages.find((item) => item.id === location.subpageId);

  return subpage?.rows.find((item) => item.index === location.rowIndex);
}

function textCell(column: number, value: string): Cell {
  return {
    column,
    kind: "character",
    byte: value.charCodeAt(0),
    character: {
      value,
      charset: "G0"
    },
    annotations: []
  };
}

function emptyCell(column: number): Cell {
  return {
    column,
    kind: "empty",
    byte: 0x20,
    annotations: []
  };
}

function emptyRows() {
  return Array.from({ length: 25 }, (_, rowIndex) => ({
    index: rowIndex,
    cells: Array.from({ length: 40 }, (_, column) => emptyCell(column)),
    locked: false,
    label: rowIndex === 0 ? "Header" : `Row ${rowIndex}`
  }));
}

function makeSubpage(index: number): Subpage {
  const subcode = index.toString().padStart(4, "0");

  return {
    id: `subpage-${subcode}`,
    subcode,
    rows: emptyRows(),
    enhancementPackets: [],
    glyphReferences: [],
    carousel: {
      enabled: false,
      delaySeconds: 8,
      priority: "normal"
    }
  };
}

function controlCell(column: number, byte: number): Cell {
  const controlCode = getControlCodeByByte(byte);

  if (!controlCode) {
    throw new Error(`Unknown control code byte ${byte}`);
  }

  return {
    column,
    kind: "control",
    byte,
    controlCode,
    annotations: []
  };
}

export function setCellCommand(
  serviceId: string,
  pageId: string,
  subpageId: string,
  rowIndex: number,
  column: number,
  cell: Cell
): EditorCommand {
  return {
    id: "set-cell",
    label: "Set cell",
    apply: (project) =>
      updateCell(project, { serviceId, pageId, subpageId, rowIndex, column }, cell)
  };
}

export function insertTextCommand(
  serviceId: string,
  pageId: string,
  subpageId: string,
  rowIndex: number,
  column: number,
  text: string
): EditorCommand {
  return {
    id: "insert-text",
    label: "Insert text",
    apply: (project) => {
      return [...text].reduce(
        (currentProject, value, offset) =>
          updateCell(
            currentProject,
            {
              serviceId,
              pageId,
              subpageId,
              rowIndex,
              column: column + offset
            },
            textCell(column + offset, value)
          ),
        project
      );
    }
  };
}

export function insertControlCodeCommand(
  serviceId: string,
  pageId: string,
  subpageId: string,
  rowIndex: number,
  column: number,
  byte: number
): EditorCommand {
  return setCellCommand(serviceId, pageId, subpageId, rowIndex, column, controlCell(column, byte));
}

export function insertControlCodeWithRowShiftCommand(
  serviceId: string,
  pageId: string,
  subpageId: string,
  rowIndex: number,
  column: number,
  byte: number
): EditorCommand {
  const insertedCell = controlCell(column, byte);

  return {
    id: "insert-control-row-shift",
    label: "Insert control code",
    apply: (project) => {
      const next = cloneProject(project);
      const row = findMutableRow(next, { serviceId, pageId, subpageId, rowIndex, column });

      if (!row || column < 0 || column >= row.cells.length) {
        return project;
      }

      row.cells = [
        ...row.cells.slice(0, column),
        insertedCell,
        ...row.cells.slice(column, -1)
      ].map((cell, cellColumn) => ({
        ...cell,
        column: cellColumn
      }));

      return next;
    }
  };
}

export function paintMosaicCommand(
  serviceId: string,
  pageId: string,
  subpageId: string,
  rowIndex: number,
  column: number,
  sixelMask: number,
  foreground: TeletextColourRef = { palette: "level1", index: 7 },
  background: TeletextColourRef = { palette: "level1", index: 0 }
): EditorCommand {
  return setCellCommand(serviceId, pageId, subpageId, rowIndex, column, {
    column,
    kind: "mosaic",
    byte: 0x40 | (sixelMask & 0x3f),
    mosaic: {
      separated: false,
      sixelMask,
      foreground,
      background
    },
    annotations: []
  });
}

export function applyTemplateCommand(
  serviceId: string,
  pageId: string,
  templateId: string
): EditorCommand {
  return {
    id: "apply-template",
    label: "Apply template",
    apply: (project) => applyTemplate(project, serviceId, pageId, templateId)
  };
}

export function saveCurrentPageAsTemplateCommand(
  serviceId: string,
  pageId: string
): EditorCommand {
  return {
    id: "save-current-page-as-template",
    label: "Save page as template",
    apply: (project) => {
      const service = project.services.find((item) => item.id === serviceId);
      const page = service?.pages.find((item) => item.id === pageId);
      const subpage = page?.subpages[0];

      if (!page || !subpage) {
        return project;
      }

      const next = cloneProject(project);
      const templateNumber = next.templates.length + 1;
      const templateId = `custom-template-${templateNumber}`;

      next.templates.push({
        id: templateId,
        name: `Custom template ${templateNumber}`,
        description: `Saved from page ${page.pageNumber}.`,
        category: "blank",
        targetPresentationLevel: page.metadata.targetPresentationLevel,
        rows: structuredClone(subpage.rows),
        regions: []
      });

      return next;
    }
  };
}

export function addSubpageCommand(serviceId: string, pageId: string): EditorCommand {
  return {
    id: "add-subpage",
    label: "Add subpage",
    apply: (project) => {
      const next = cloneProject(project);
      const service = next.services.find((item) => item.id === serviceId);
      const page = service?.pages.find((item) => item.id === pageId);

      if (!page) {
        return project;
      }

      page.subpages.push(makeSubpage(page.subpages.length));

      return next;
    }
  };
}

export function setPageHeaderClockModeCommand(
  serviceId: string,
  pageId: string,
  clockMode: PageHeaderSettings["clockMode"]
): EditorCommand {
  return {
    id: "set-page-header-clock-mode",
    label: "Set X/0 header clock mode",
    apply: (project) => {
      const next = cloneProject(project);
      const service = next.services.find((item) => item.id === serviceId);
      const page = service?.pages.find((item) => item.id === pageId);

      if (!page) {
        return project;
      }

      page.metadata.header = {
        ...page.metadata.header,
        clockMode
      };

      return next;
    }
  };
}

export function applyEditorCommand(project: Project, command: EditorCommand): Project {
  return command.apply(project);
}

export function createEditorHistory(project: Project): EditorHistory {
  return {
    past: [],
    present: project,
    future: []
  };
}

export function commitEditorCommand(history: EditorHistory, command: EditorCommand): EditorHistory {
  return {
    past: [...history.past, history.present],
    present: applyEditorCommand(history.present, command),
    future: []
  };
}

export function undo(history: EditorHistory): EditorHistory {
  const previous = history.past.at(-1);

  if (!previous) {
    return history;
  }

  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future]
  };
}

export function redo(history: EditorHistory): EditorHistory {
  const next = history.future[0];

  if (!next) {
    return history;
  }

  return {
    past: [...history.past, history.present],
    present: next,
    future: history.future.slice(1)
  };
}
