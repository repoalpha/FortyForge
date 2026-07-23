import { applyTemplate } from "../templates/applyTemplate";
import { getControlCodeByByte } from "../standards/controlCodes";
import { level1ByteForG0Character } from "../standards/g0Charset";
import { displaySubpageSubcode, MAX_DISPLAY_SUBPAGES } from "../standards/subpages";
import { captureMosaicGlyph, layoutMosaicText } from "../mosaicAlphabet/mosaicAlphabet";
import { renderLevel1Row } from "../render/renderLevel1";
import {
  extractG3LineCells,
  G3_LINE_CODES,
  replaceG3LineCells,
  type G3LineCode
} from "../enhancements/g3Lines";
import type {
  ArtworkBlock,
  ArtworkBlockCategory,
  CellRectangle,
  Cell,
  CellBlock,
  ContentBinding,
  ContentSnapshot,
  ContentSource,
  MosaicAlphabet,
  PageHeaderSettings,
  Project,
  Subpage,
  TeletextColourRef,
  TeletextFontProfileId,
  TeletextRow,
  Template,
  TemplateRegion
} from "./types";

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

export type MosaicSixelOperation = "set" | "clear" | "toggle";

export interface CaptureMosaicGlyphOptions {
  alphabetId?: string;
  alphabetName: string;
  character: string;
  bounds: CellRectangle;
  spacingColumns?: number;
}

export interface StampMosaicTextOptions {
  alphabetId: string;
  text: string;
  rowIndex: number;
  column: number;
}

export interface SaveCellBlockAsArtworkOptions {
  id?: string;
  name: string;
  description?: string;
  category: ArtworkBlockCategory;
  assignedCharacter?: string;
  now?: Date;
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

function findMutableSubpage(
  project: Project,
  serviceId: string,
  pageId: string,
  subpageId: string
) {
  const service = project.services.find((item) => item.id === serviceId);
  const page = service?.pages.find((item) => item.id === pageId);

  return page?.subpages.find((item) => item.id === subpageId);
}

function normalizedRectangle(bounds: CellRectangle) {
  return {
    startRow: Math.min(bounds.startRow, bounds.endRow),
    endRow: Math.max(bounds.startRow, bounds.endRow),
    startColumn: Math.min(bounds.startColumn, bounds.endColumn),
    endColumn: Math.max(bounds.startColumn, bounds.endColumn)
  };
}

function isRectangleInsidePage(bounds: ReturnType<typeof normalizedRectangle>) {
  return (
    bounds.startRow >= 0
    && bounds.startColumn >= 0
    && bounds.endRow < 25
    && bounds.endColumn < 40
  );
}

function cloneCellForColumn(cell: Cell, column: number): Cell {
  return {
    ...structuredClone(cell),
    column
  } as Cell;
}

function textCell(column: number, value: string, background?: TeletextColourRef): Cell {
  const byte = level1ByteForG0Character(value);
  const safeValue = byte === undefined ? "?" : value;
  return {
    column,
    kind: "character",
    byte: byte ?? 0x3f,
    character: {
      value: safeValue,
      charset: "G0"
    },
    background,
    annotations: []
  };
}

function emptyCell(column: number, background?: TeletextColourRef): Cell {
  return {
    column,
    kind: "empty",
    byte: 0x20,
    background,
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

function normalizeRows(rows: TeletextRow[]) {
  return rows.slice(0, 25).map((row, rowIndex) => ({
    ...row,
    index: rowIndex,
    label: row.label || (rowIndex === 0 ? "Header" : `Row ${rowIndex}`),
    cells: row.cells.slice(0, 40).map((cell, column) => ({
      ...cell,
      column
    }))
  }));
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

function shiftRowRightWithCells(rowCells: Cell[], column: number, insertedCells: Cell[]) {
  return [
    ...rowCells.slice(0, column),
    ...insertedCells,
    ...rowCells.slice(column, -insertedCells.length)
  ].map((cell, cellColumn) => ({
    ...cell,
    column: cellColumn
  }));
}

function shiftRowLeftFromColumn(rowCells: Cell[], column: number, count = 1) {
  return [
    ...rowCells.slice(0, column),
    ...rowCells.slice(column + count),
    ...Array.from({ length: count }, (_, offset) => emptyCell(rowCells.length - count + offset))
  ].map((cell, cellColumn) => ({
    ...cell,
    column: cellColumn
  }));
}

function foregroundControlByteForMode(mode: "text" | "graphics", colourIndex: number) {
  return mode === "graphics" ? 0x10 + colourIndex : colourIndex;
}

interface Level1TransmissionState {
  background: number;
  doubleHeight: boolean;
  foreground: number;
  mode: "text" | "graphics";
  separatedGraphics: boolean;
}

function transmissionStateAt(row: TeletextRow, column: number): Level1TransmissionState {
  const rendered = renderLevel1Row(row).cells[column];

  return {
    background: rendered.background.index,
    doubleHeight: rendered.doubleHeight,
    foreground: rendered.foreground.index,
    mode: rendered.mode,
    separatedGraphics: rendered.separatedGraphics
  };
}

function controlBytesForTransmissionState(
  current: Level1TransmissionState,
  target: Level1TransmissionState
) {
  const bytes: number[] = [];
  const state = { ...current };

  if (state.doubleHeight !== target.doubleHeight) {
    bytes.push(target.doubleHeight ? 0x0d : 0x0c);
    state.doubleHeight = target.doubleHeight;
  }

  if (state.background !== target.background) {
    if (target.background === 0) {
      bytes.push(0x1c);
    } else {
      bytes.push(foregroundControlByteForMode(state.mode, target.background), 0x1d);
      state.foreground = target.background;
    }
    state.background = target.background;
  }

  if (state.mode !== target.mode || state.foreground !== target.foreground) {
    bytes.push(foregroundControlByteForMode(target.mode, target.foreground));
    state.mode = target.mode;
    state.foreground = target.foreground;
  }

  if (state.separatedGraphics !== target.separatedGraphics) {
    bytes.push(target.separatedGraphics ? 0x1a : 0x19);
  }

  return bytes;
}

function cellsCanBecomeControls(row: TeletextRow, startColumn: number, bytes: number[]) {
  return startColumn >= 0
    && startColumn + bytes.length <= row.cells.length
    && row.cells.slice(startColumn, startColumn + bytes.length)
      .every((cell) => cell.kind === "empty" && cell.annotations.length === 0);
}

function writeControls(row: TeletextRow, startColumn: number, bytes: number[]) {
  bytes.forEach((byte, offset) => {
    row.cells[startColumn + offset] = controlCell(startColumn + offset, byte);
  });
}

function cellsMatchControls(row: TeletextRow, startColumn: number, bytes: number[]) {
  return startColumn >= 0
    && startColumn + bytes.length <= row.cells.length
    && bytes.every((byte, offset) => {
      const cell = row.cells[startColumn + offset];
      return cell.kind === "control" && cell.byte === byte;
    });
}

/**
 * Makes an editor-authored mosaic run reproducible by a Level 1 receiver.
 * Metadata colours are useful while drawing, but PIT only receives row bytes,
 * so free cells immediately around the run carry the required state changes.
 */
function synchronizeMosaicRunTransmission(
  row: TeletextRow,
  startColumn: number,
  endColumn: number,
  desired: Pick<Level1TransmissionState, "background" | "foreground" | "separatedGraphics">,
  options: { reclaimPrefix?: boolean; replacePrefixControls?: boolean } = {}
) {
  if (startColumn < 0 || endColumn < startColumn || endColumn >= row.cells.length) {
    return false;
  }

  const originalStartState = transmissionStateAt(row, startColumn);
  const desiredState: Level1TransmissionState = {
    ...originalStartState,
    background: desired.background,
    foreground: desired.foreground,
    mode: "graphics",
    separatedGraphics: desired.separatedGraphics
  };
  const originalFollowingState = endColumn + 1 < row.cells.length
    ? transmissionStateAt(row, endColumn + 1)
    : undefined;
  const prefixBytes = controlBytesForTransmissionState(originalStartState, desiredState);
  const prefixStart = startColumn - prefixBytes.length;

  const canReclaimPrefix = options.reclaimPrefix
    && prefixStart >= 0
    && prefixStart + prefixBytes.length <= row.cells.length
    && row.cells.slice(prefixStart, prefixStart + prefixBytes.length)
      .every((cell) => cell.kind !== "control" && cell.annotations.length === 0);
  const canReplacePrefixControls = options.replacePrefixControls
    && prefixStart >= 0
    && prefixStart + prefixBytes.length <= row.cells.length
    && row.cells.slice(prefixStart, prefixStart + prefixBytes.length)
      .every((cell) => cell.kind === "control" && cell.annotations.length === 0);

  if (
    !cellsCanBecomeControls(row, prefixStart, prefixBytes)
    && !canReclaimPrefix
    && !canReplacePrefixControls
  ) {
    return false;
  }

  const suffixStart = endColumn + 1;
  const suffixStartsWithAuthoredControl = row.cells[suffixStart]?.kind === "control";
  const suffixBytes = originalFollowingState && !suffixStartsWithAuthoredControl
    ? controlBytesForTransmissionState(desiredState, originalFollowingState)
    : [];
  const suffixAlreadyPresent = cellsMatchControls(row, suffixStart, suffixBytes);
  const canWriteSuffix = cellsCanBecomeControls(row, suffixStart, suffixBytes);

  if (suffixBytes.length > 0 && !suffixAlreadyPresent && !canWriteSuffix) {
    return false;
  }

  writeControls(row, prefixStart, prefixBytes);

  if (!originalFollowingState) {
    return true;
  }

  if (!suffixAlreadyPresent && canWriteSuffix) {
    writeControls(row, suffixStart, suffixBytes);
  }

  return suffixBytes.length === 0
    || suffixAlreadyPresent
    || cellsMatchControls(row, suffixStart, suffixBytes);
}

function isTextColourControl(byte: number) {
  return byte >= 0x00 && byte <= 0x07;
}

function isGraphicsColourControl(byte: number) {
  return byte >= 0x10 && byte <= 0x17;
}

function isSameModeColourControl(firstByte: number, secondByte: number) {
  return (
    isTextColourControl(firstByte) && isTextColourControl(secondByte)
  ) || (
    isGraphicsColourControl(firstByte) && isGraphicsColourControl(secondByte)
  );
}

function generatedBackgroundHelperStart(rowCells: Cell[], column: number) {
  for (const start of [column, column - 1, column - 2]) {
    if (start < 0 || start + 2 >= rowCells.length) {
      continue;
    }

    const backgroundColour = rowCells[start];
    const newBackground = rowCells[start + 1];
    const restoredForeground = rowCells[start + 2];

    if (
      backgroundColour.kind === "control" &&
      newBackground.kind === "control" &&
      restoredForeground.kind === "control" &&
      newBackground.byte === 0x1d &&
      isSameModeColourControl(backgroundColour.byte, restoredForeground.byte)
    ) {
      return start;
    }
  }

  return undefined;
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
        (currentProject, value, offset) => {
          const targetColumn = column + offset;
          const row = findMutableRow(currentProject, {
            serviceId,
            pageId,
            subpageId,
            rowIndex,
            column: targetColumn
          });
          const background = row?.cells[targetColumn]?.background;

          return updateCell(
            currentProject,
            {
              serviceId,
              pageId,
              subpageId,
              rowIndex,
              column: targetColumn
            },
            textCell(targetColumn, value, background)
          );
        },
        project
      );
    }
  };
}

export function insertCharacterByteCommand(
  serviceId: string,
  pageId: string,
  subpageId: string,
  rowIndex: number,
  column: number,
  byte: number,
  value: string
): EditorCommand {
  return {
    id: "insert-character-byte",
    label: "Insert character",
    apply: (project) => {
      const row = findMutableRow(project, {
        serviceId,
        pageId,
        subpageId,
        rowIndex,
        column
      });
      const cell = textCell(column, value, row?.cells[column]?.background);

      cell.byte = byte;

      return updateCell(project, { serviceId, pageId, subpageId, rowIndex, column }, cell);
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

      row.cells = shiftRowRightWithCells(row.cells, column, [insertedCell]);

      return next;
    }
  };
}

export function insertBlankSpacerWithRowShiftCommand(
  serviceId: string,
  pageId: string,
  subpageId: string,
  rowIndex: number,
  column: number
): EditorCommand {
  return {
    id: "insert-blank-spacer-row-shift",
    label: "Insert blank spacer",
    apply: (project) => {
      const next = cloneProject(project);
      const row = findMutableRow(next, { serviceId, pageId, subpageId, rowIndex, column });

      if (!row || column < 0 || column >= row.cells.length) {
        return project;
      }

      row.cells = shiftRowRightWithCells(row.cells, column, [emptyCell(column)]);

      return next;
    }
  };
}

export function insertBackgroundColourWithRowShiftCommand(
  serviceId: string,
  pageId: string,
  subpageId: string,
  rowIndex: number,
  column: number,
  colourIndex: number
): EditorCommand {
  return {
    id: "insert-background-colour-row-shift",
    label: "Insert background colour",
    apply: (project) => {
      const next = cloneProject(project);
      const row = findMutableRow(next, { serviceId, pageId, subpageId, rowIndex, column });

      if (!row || column < 0 || column >= row.cells.length) {
        return project;
      }

      const currentState = renderLevel1Row(row).cells[column];
      const insertedBytes = colourIndex === 0
        ? [0x1c]
        : [
            foregroundControlByteForMode(currentState.mode, colourIndex),
            0x1d,
            foregroundControlByteForMode(currentState.mode, currentState.foreground.index)
          ];
      const insertedCells = insertedBytes.map((byte, offset) => controlCell(column + offset, byte));

      row.cells = shiftRowRightWithCells(row.cells, column, insertedCells);

      return next;
    }
  };
}

export function paintCellBackgroundCommand(
  serviceId: string,
  pageId: string,
  subpageId: string,
  rowIndex: number,
  column: number,
  colourIndex: number
): EditorCommand {
  return {
    id: "paint-cell-background",
    label: "Paint cell background",
    apply: (project) => {
      const next = cloneProject(project);
      const row = findMutableRow(next, { serviceId, pageId, subpageId, rowIndex, column });

      if (!row || column < 0 || column >= row.cells.length) {
        return project;
      }

      row.cells[column] = {
        ...row.cells[column],
        background: {
          palette: "level1",
          index: colourIndex
        },
        ...(row.cells[column].kind === "mosaic" && row.cells[column].mosaic
          ? {
              mosaic: {
                ...row.cells[column].mosaic,
                background: { palette: "level1", index: colourIndex } as TeletextColourRef
              }
            }
          : {})
      };

      const painted = row.cells[column];
      if (
        painted.kind === "mosaic"
        && painted.mosaic?.foreground.palette === "level1"
        && painted.mosaic.background.palette === "level1"
      ) {
        synchronizeMosaicRunTransmission(row, column, column, {
          background: painted.mosaic.background.index,
          foreground: painted.mosaic.foreground.index,
          separatedGraphics: painted.mosaic.separated
        });
      }

      return next;
    }
  };
}

export function deleteCellWithRowShiftCommand(
  serviceId: string,
  pageId: string,
  subpageId: string,
  rowIndex: number,
  column: number
): EditorCommand {
  return {
    id: "delete-cell-row-shift",
    label: "Delete cell",
    apply: (project) => {
      const next = cloneProject(project);
      const row = findMutableRow(next, { serviceId, pageId, subpageId, rowIndex, column });

      if (!row || column < 0 || column >= row.cells.length) {
        return project;
      }

      const helperStart = generatedBackgroundHelperStart(row.cells, column);
      const current = row.cells[column];

      if (helperStart === undefined && current.background && current.kind !== "empty") {
        row.cells[column] = emptyCell(column, current.background);

        return next;
      }

      row.cells = helperStart === undefined
        ? shiftRowLeftFromColumn(row.cells, column)
        : shiftRowLeftFromColumn(row.cells, helperStart, 3);

      return next;
    }
  };
}

export function clearRowCommand(
  serviceId: string,
  pageId: string,
  subpageId: string,
  rowIndex: number
): EditorCommand {
  return {
    id: "clear-row",
    label: "Clear row",
    apply: (project) => {
      const next = cloneProject(project);
      const row = findMutableRow(next, {
        serviceId,
        pageId,
        subpageId,
        rowIndex,
        column: 0
      });

      if (!row) {
        return project;
      }

      row.cells = Array.from({ length: 40 }, (_, column) => emptyCell(column));

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
  background?: TeletextColourRef
): EditorCommand {
  return {
    id: "paint-mosaic",
    label: "Paint mosaic",
    apply: (project) => {
      const next = cloneProject(project);
      const row = findMutableRow(next, { serviceId, pageId, subpageId, rowIndex, column });

      if (!row || column < 0 || column >= row.cells.length) {
        return project;
      }

      const current = row.cells[column];
      const mosaicBackground = background ?? mosaicEditBackground(row, column, current);

      row.cells[column] = {
        column,
        kind: "mosaic",
        byte: 0x40 | (sixelMask & 0x3f),
        mosaic: {
          separated: false,
          sixelMask,
          foreground,
          background: mosaicBackground
        },
        annotations: []
      };
      synchronizeMosaicRunTransmission(row, column, column, {
        background: mosaicBackground.index,
        foreground: foreground.index,
        separatedGraphics: false
      });

      return next;
    }
  };
}

function mosaicMaskForCell(cell: Cell) {
  if (cell.kind === "mosaic" && cell.mosaic) {
    return cell.mosaic.sixelMask;
  }

  if (cell.kind === "character") {
    return cell.byte & 0x3f;
  }

  return 0;
}

function mosaicEditBackground(row: TeletextRow, column: number, current: Cell) {
  const rowState = renderLevel1Row(row, { useCellBackgroundColours: true }).cells[column];

  if (current.background || rowState.background.index !== 0) {
    return rowState.background;
  }

  return current.kind === "mosaic"
    ? current.mosaic?.background ?? rowState.background
    : rowState.background;
}

export function editMosaicSixelCommand(
  serviceId: string,
  pageId: string,
  subpageId: string,
  rowIndex: number,
  column: number,
  sixelIndex: number,
  operation: MosaicSixelOperation,
  foreground?: TeletextColourRef,
  background?: TeletextColourRef
): EditorCommand {
  const bit = 1 << sixelIndex;

  return {
    id: "edit-mosaic-sixel",
    label: "Edit mosaic sixel",
    apply: (project) => {
      const next = cloneProject(project);
      const row = findMutableRow(next, { serviceId, pageId, subpageId, rowIndex, column });

      if (!row || column < 0 || column >= row.cells.length || sixelIndex < 0 || sixelIndex > 5) {
        return project;
      }

      const current = row.cells[column];
      const currentState = renderLevel1Row(row).cells[column];
      const currentMask = mosaicMaskForCell(current);
      const nextMask = operation === "set"
        ? currentMask | bit
        : operation === "clear"
          ? currentMask & ~bit
          : currentMask ^ bit;
      const mosaic = current.kind === "mosaic" ? current.mosaic : undefined;

      row.cells[column] = {
        column,
        kind: "mosaic",
        byte: 0x40 | (nextMask & 0x3f),
        mosaic: {
          separated: mosaic?.separated ?? false,
          sixelMask: nextMask & 0x3f,
          foreground: foreground ?? mosaic?.foreground ?? currentState.foreground,
          background: background ?? mosaicEditBackground(row, column, current)
        },
        annotations: current.annotations ?? []
      };
      const nextMosaic = row.cells[column].mosaic;

      if (nextMosaic) {
        synchronizeMosaicRunTransmission(row, column, column, {
          background: nextMosaic.background.index,
          foreground: nextMosaic.foreground.index,
          separatedGraphics: nextMosaic.separated
        });
      }

      return next;
    }
  };
}

export function setMosaicForegroundCommand(
  serviceId: string,
  pageId: string,
  subpageId: string,
  rowIndex: number,
  column: number,
  foreground: TeletextColourRef
): EditorCommand {
  return {
    id: "set-mosaic-foreground",
    label: "Set mosaic foreground",
    apply: (project) => {
      const next = cloneProject(project);
      const row = findMutableRow(next, { serviceId, pageId, subpageId, rowIndex, column });

      if (!row || column < 0 || column >= row.cells.length) {
        return project;
      }

      const current = row.cells[column];

      if (current.kind !== "mosaic" || !current.mosaic) {
        return project;
      }

      row.cells[column] = {
        ...current,
        mosaic: {
          ...current.mosaic,
          foreground
        }
      };

      const updated = row.cells[column].mosaic;
      if (
        updated?.foreground.palette === "level1"
        && updated.background.palette === "level1"
      ) {
        synchronizeMosaicRunTransmission(row, column, column, {
          background: updated.background.index,
          foreground: updated.foreground.index,
          separatedGraphics: updated.separated
        }, { replacePrefixControls: true });
      }

      return next;
    }
  };
}

export function copyCellsFromRectangle(
  project: Project,
  serviceId: string,
  pageId: string,
  subpageId: string,
  bounds: CellRectangle
): CellBlock | undefined {
  const rectangle = normalizedRectangle(bounds);

  if (!isRectangleInsidePage(rectangle)) {
    return undefined;
  }

  const subpage = findMutableSubpage(project, serviceId, pageId, subpageId);

  if (!subpage) {
    return undefined;
  }

  const cells: Cell[][] = [];

  for (let rowIndex = rectangle.startRow; rowIndex <= rectangle.endRow; rowIndex += 1) {
    const row = subpage.rows.find((item) => item.index === rowIndex);

    if (!row) {
      return undefined;
    }

    cells.push(
      row.cells
        .slice(rectangle.startColumn, rectangle.endColumn + 1)
        .map((cell, columnOffset) => cloneCellForColumn(cell, columnOffset))
    );
  }

  return {
    width: rectangle.endColumn - rectangle.startColumn + 1,
    height: rectangle.endRow - rectangle.startRow + 1,
    cells,
    source: {
      rowIndex: rectangle.startRow,
      column: rectangle.startColumn
    }
  };
}

export function stampCellBlockCommand(
  serviceId: string,
  pageId: string,
  subpageId: string,
  block: CellBlock,
  target: { rowIndex: number; column: number }
): EditorCommand {
  return {
    id: "stamp-cell-block",
    label: "Stamp cell block",
    apply: (project) => {
      if (
        target.rowIndex < 0
        || target.column < 0
        || target.rowIndex + block.height > 25
        || target.column + block.width > 40
      ) {
        return project;
      }

      const next = cloneProject(project);
      const subpage = findMutableSubpage(next, serviceId, pageId, subpageId);

      if (!subpage) {
        return project;
      }

      for (let rowOffset = 0; rowOffset < block.height; rowOffset += 1) {
        const row = subpage.rows.find((item) => item.index === target.rowIndex + rowOffset);

        if (!row) {
          return project;
        }

        for (let columnOffset = 0; columnOffset < block.width; columnOffset += 1) {
          row.cells[target.column + columnOffset] = cloneCellForColumn(
            block.cells[rowOffset][columnOffset],
            target.column + columnOffset
          );
        }
      }

      return next;
    }
  };
}

export function clearCellRectangleCommand(
  serviceId: string,
  pageId: string,
  subpageId: string,
  bounds: CellRectangle
): EditorCommand {
  return {
    id: "clear-cell-rectangle",
    label: "Clear cell rectangle",
    apply: (project) => {
      const rectangle = normalizedRectangle(bounds);

      if (!isRectangleInsidePage(rectangle)) {
        return project;
      }

      const next = cloneProject(project);
      const subpage = findMutableSubpage(next, serviceId, pageId, subpageId);

      if (!subpage) {
        return project;
      }

      for (let rowIndex = rectangle.startRow; rowIndex <= rectangle.endRow; rowIndex += 1) {
        const row = subpage.rows.find((item) => item.index === rowIndex);

        if (!row) {
          return project;
        }

        for (
          let column = rectangle.startColumn;
          column <= rectangle.endColumn;
          column += 1
        ) {
          row.cells[column] = emptyCell(column);
        }
      }

      return next;
    }
  };
}

export function saveCellBlockAsArtworkCommand(
  block: CellBlock,
  options: SaveCellBlockAsArtworkOptions
): EditorCommand {
  return {
    id: "save-cell-block-as-artwork",
    label: "Save cell block as artwork",
    apply: (project) => {
      const next = cloneProject(project);
      const timestamp = (options.now ?? new Date()).toISOString();
      const artwork: ArtworkBlock = {
        id: options.id ?? `artwork-block-${next.artworkBlocks.length + 1}`,
        name: options.name,
        description: options.description,
        category: options.category,
        assignedCharacter: options.assignedCharacter,
        width: block.width,
        height: block.height,
        cells: block.cells.map((row) =>
          row.map((cell, column) => cloneCellForColumn(cell, column))
        ),
        source: {
          rowIndex: block.source.rowIndex,
          column: block.source.column
        },
        createdAt: timestamp,
        updatedAt: timestamp
      };

      next.artworkBlocks.push(artwork);

      return next;
    }
  };
}

function createMosaicAlphabet(
  id: string,
  name: string,
  glyphWidth: number,
  glyphHeight: number,
  spacingColumns: number
): MosaicAlphabet {
  return {
    id,
    name,
    description: "Captured mosaic lettering alphabet.",
    cellWidth: glyphWidth,
    cellHeight: glyphHeight,
    spacingColumns,
    glyphs: {}
  };
}

export function captureMosaicGlyphCommand(
  serviceId: string,
  pageId: string,
  subpageId: string,
  options: CaptureMosaicGlyphOptions
): EditorCommand {
  return {
    id: "capture-mosaic-glyph",
    label: "Capture mosaic glyph",
    apply: (project) => {
      const next = cloneProject(project);
      const subpage = findMutableSubpage(next, serviceId, pageId, subpageId);

      if (!subpage) {
        return project;
      }

      const glyph = captureMosaicGlyph(subpage.rows, options.bounds, options.character);
      const alphabetId = options.alphabetId ?? `mosaic-alphabet-${next.mosaicAlphabets.length + 1}`;
      let alphabet = next.mosaicAlphabets.find((item) => item.id === alphabetId);

      if (!alphabet) {
        alphabet = createMosaicAlphabet(
          alphabetId,
          options.alphabetName,
          glyph.width,
          glyph.height,
          options.spacingColumns ?? 1
        );
        next.mosaicAlphabets.push(alphabet);
      }

      alphabet.glyphs[glyph.character] = glyph;

      return next;
    }
  };
}

export function stampMosaicTextCommand(
  serviceId: string,
  pageId: string,
  subpageId: string,
  options: StampMosaicTextOptions
): EditorCommand {
  return {
    id: "stamp-mosaic-text",
    label: "Stamp mosaic text",
    apply: (project) => {
      const alphabet = project.mosaicAlphabets.find((item) => item.id === options.alphabetId);

      if (!alphabet) {
        return project;
      }

      const layout = layoutMosaicText(alphabet, options.text);

      if (
        layout.missing.length > 0
        || options.rowIndex < 0
        || options.column < 0
        || options.rowIndex + layout.height > 25
        || options.column + layout.width > 40
      ) {
        return project;
      }

      const next = cloneProject(project);
      const subpage = findMutableSubpage(next, serviceId, pageId, subpageId);

      if (!subpage) {
        return project;
      }

      for (const layoutCell of layout.cells) {
        const rowIndex = options.rowIndex + layoutCell.rowOffset;
        const column = options.column + layoutCell.columnOffset;
        const row = subpage.rows.find((item) => item.index === rowIndex);

        if (!row || column < 0 || column >= row.cells.length) {
          return project;
        }

        row.cells[column] = {
          column,
          kind: "mosaic",
          byte: 0x40 | (layoutCell.cell.sixelMask & 0x3f),
          mosaic: {
            separated: layoutCell.cell.separated,
            sixelMask: layoutCell.cell.sixelMask & 0x3f,
            foreground: layoutCell.cell.foreground,
            background: layoutCell.cell.background
          },
          annotations: []
        };
      }

      for (let rowOffset = 0; rowOffset < layout.height; rowOffset += 1) {
        const layoutRow = layout.cells.filter((cell) => cell.rowOffset === rowOffset);
        const firstCell = layoutRow[0]?.cell;

        if (!firstCell || firstCell.foreground.palette !== "level1" || firstCell.background.palette !== "level1") {
          continue;
        }

        const hasUniformState = layoutRow.every((cell) =>
          cell.cell.foreground.palette === "level1"
          && cell.cell.foreground.index === firstCell.foreground.index
          && cell.cell.background.palette === "level1"
          && cell.cell.background.index === firstCell.background.index
          && cell.cell.separated === firstCell.separated
        );
        const row = subpage.rows.find((item) => item.index === options.rowIndex + rowOffset);

        if (row && hasUniformState) {
          synchronizeMosaicRunTransmission(
            row,
            options.column,
            options.column + layout.width - 1,
            {
              background: firstCell.background.index,
              foreground: firstCell.foreground.index,
              separatedGraphics: firstCell.separated
            },
            { reclaimPrefix: true }
          );
        }
      }

      return next;
    }
  };
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
        regions: [],
        templateVersion: "1.0.0",
        requiredPixelcastVersion: "0.2.0",
        blocks: [],
        fixtures: []
      });

      return next;
    }
  };
}

export function addTemplateRegionCommand(
  templateId: string,
  region: TemplateRegion
): EditorCommand {
  return {
    id: "add-template-region",
    label: "Add template content slot",
    apply: (project) => {
      const next = cloneProject(project);
      const template = next.templates.find((item) => item.id === templateId);
      if (!template) return project;
      const overlaps = template.regions.some((item) => !(
        region.bounds.endRow < item.bounds.startRow
        || region.bounds.startRow > item.bounds.endRow
        || region.bounds.endColumn < item.bounds.startColumn
        || region.bounds.startColumn > item.bounds.endColumn
      ));
      if (overlaps) return project;
      template.regions.push(structuredClone(region));
      template.blocks.push({
        id: `block-${region.id}`,
        kind: region.blockKind,
        regionId: region.id,
        label: region.label,
        settings: {}
      });
      const [major, minor, patch = "0"] = template.templateVersion.split(".");
      template.templateVersion = `${major}.${minor}.${Number(patch) + 1}`;
      return next;
    }
  };
}

export function deleteCustomTemplateCommand(templateId: string): EditorCommand {
  return {
    id: "delete-custom-template",
    label: "Delete custom template",
    apply: (project) => {
      if (!project.templates.some((template) => template.id === templateId)) {
        return project;
      }

      const next = cloneProject(project);

      next.templates = next.templates.filter((template) => template.id !== templateId);
      next.services.forEach((service) => {
        service.pages.forEach((page) => {
          if (page.metadata.templateId === templateId) {
            page.metadata.templateId = undefined;
          }
        });
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

export function addPageCommand(serviceId: string, pageNumber: string): EditorCommand {
  const normalizedPageNumber = pageNumber.trim().toUpperCase();

  return {
    id: "add-page",
    label: `Add page ${normalizedPageNumber}`,
    apply: (project) => {
      if (!/^[1-8][0-9A-F]{2}$/.test(normalizedPageNumber)) return project;
      const next = cloneProject(project);
      const service = next.services.find((item) => item.id === serviceId);
      if (!service || service.pages.some((page) => page.pageNumber === normalizedPageNumber)) {
        return project;
      }

      const subpage = makeSubpage(0);
      subpage.id = `page-${normalizedPageNumber}-subpage-0000`;
      service.pages.push({
        id: `page-${normalizedPageNumber}`,
        magazine: Number(normalizedPageNumber[0]) as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8,
        pageNumber: normalizedPageNumber,
        title: "Untitled",
        subpages: [subpage],
        contentBindings: [],
        metadata: {
          description: `Pixelcast page ${normalizedPageNumber}.`,
          tags: [],
          publicationState: "draft",
          targetPresentationLevel: service.defaultPresentationLevel,
          receiverFontProfileId: "ets-1990s",
          header: { clockMode: "local", showLocalDate: false }
        },
        links: []
      });
      service.pages.sort((left, right) => left.pageNumber.localeCompare(right.pageNumber));
      next.metadata.updatedAt = new Date().toISOString();
      return next;
    }
  };
}

export function replacePageWithCarouselCommand(
  serviceId: string,
  pageId: string,
  frameRows: TeletextRow[][],
  delaySeconds: number,
  sourceSubpageId?: string
): EditorCommand {
  if (frameRows.length < 1 || frameRows.length > MAX_DISPLAY_SUBPAGES) {
    throw new Error(`A display carousel requires between 1 and ${MAX_DISPLAY_SUBPAGES} subpages.`);
  }

  const safeDelaySeconds = Math.max(1, Math.min(120, delaySeconds));

  return {
    id: "replace-page-with-carousel",
    label: frameRows.length === 1 ? "Place feed snapshot" : "Place feed story carousel",
    apply(project) {
      const next = cloneProject(project);
      const service = next.services.find((item) => item.id === serviceId);
      const page = service?.pages.find((item) => item.id === pageId);
      if (!page) return project;

      const sourceSubpage = page.subpages.find((item) => item.id === sourceSubpageId)
        ?? page.subpages[0];
      if (!sourceSubpage) return project;

      const carouselEnabled = frameRows.length > 1;
      page.subpages = frameRows.map((rows, pageIndex) => {
        const subcode = displaySubpageSubcode(pageIndex, frameRows.length);
        return {
          id: `${page.id}-subpage-${subcode}`,
          subcode,
          rows: normalizeRows(structuredClone(rows) as TeletextRow[]),
          enhancementPackets: structuredClone(sourceSubpage.enhancementPackets),
          glyphReferences: structuredClone(sourceSubpage.glyphReferences),
          carousel: {
            enabled: carouselEnabled,
            delaySeconds: safeDelaySeconds,
            priority: sourceSubpage.carousel.priority
          }
        };
      });

      return next;
    }
  };
}

export function setPageCarouselEnabledCommand(
  serviceId: string,
  pageId: string,
  enabled: boolean
): EditorCommand {
  return {
    id: enabled ? "enable-page-carousel" : "disable-page-carousel",
    label: enabled ? "Enable page carousel" : "Disable page carousel",
    apply(project) {
      const sourcePage = project.services
        .find((service) => service.id === serviceId)
        ?.pages.find((page) => page.id === pageId);
      if (!sourcePage || sourcePage.subpages.every((subpage) => subpage.carousel.enabled === enabled)) {
        return project;
      }

      const next = cloneProject(project);
      const page = next.services
        .find((service) => service.id === serviceId)
        ?.pages.find((candidatePage) => candidatePage.id === pageId);
      if (!page) return project;
      for (const subpage of page.subpages) subpage.carousel.enabled = enabled;
      return next;
    }
  };
}

export function replaceSubpageRowsCommand(
  serviceId: string,
  pageId: string,
  subpageId: string,
  rows: TeletextRow[]
): EditorCommand {
  return {
    id: "replace-subpage-rows",
    label: "Replace subpage rows",
    apply: (project) => {
      if (rows.length !== 25 || rows.some((row) => row.cells.length !== 40)) {
        return project;
      }

      const next = cloneProject(project);
      const service = next.services.find((item) => item.id === serviceId);
      const page = service?.pages.find((item) => item.id === pageId);
      const subpage = page?.subpages.find((item) => item.id === subpageId);

      if (!subpage) {
        return project;
      }

      subpage.rows = normalizeRows(structuredClone(rows) as TeletextRow[]);

      return next;
    }
  };
}

export function storeContentSnapshotCommand(
  source: ContentSource,
  snapshot: ContentSnapshot,
  binding?: ContentBinding
): EditorCommand {
  return {
    id: binding ? "bind-content-source" : "store-content-snapshot",
    label: binding ? "Bind content source" : "Store content snapshot",
    apply: (project) => {
      if (snapshot.sourceId !== source.id || (binding && binding.sourceId !== source.id)) {
        return project;
      }

      const next = cloneProject(project);
      const sourceIndex = next.contentSources.findIndex((item) => item.id === source.id);
      if (sourceIndex >= 0) next.contentSources[sourceIndex] = structuredClone(source);
      else next.contentSources.push(structuredClone(source));

      next.contentSnapshots = [
        ...next.contentSnapshots.filter((item) => item.id !== snapshot.id),
        structuredClone(snapshot)
      ];
      const snapshotsForSource = next.contentSnapshots
        .filter((item) => item.sourceId === source.id)
        .sort((left, right) => right.capturedAt.localeCompare(left.capturedAt));
      const retainedIds = new Set(
        snapshotsForSource.slice(0, source.cachePolicy.keepSnapshots).map((item) => item.id)
      );
      next.contentSnapshots = next.contentSnapshots.filter((item) =>
        item.sourceId !== source.id || retainedIds.has(item.id)
      );

      if (binding) {
        const page = next.services
          .flatMap((service) => service.pages)
          .find((item) => item.id === binding.targetPageId);
        if (!page) return project;
        const bindingIndex = page.contentBindings.findIndex((item) => item.id === binding.id);
        if (bindingIndex >= 0) page.contentBindings[bindingIndex] = structuredClone(binding);
        else page.contentBindings.push(structuredClone(binding));
      }

      return next;
    }
  };
}

export function removeContentBindingCommand(pageId: string, bindingId: string): EditorCommand {
  return {
    id: "remove-content-binding",
    label: "Disconnect content source",
    apply: (project) => {
      const existingPage = project.services
        .flatMap((service) => service.pages)
        .find((page) => page.id === pageId);
      if (!existingPage?.contentBindings.some((binding) => binding.id === bindingId)) return project;

      const next = cloneProject(project);
      const page = next.services
        .flatMap((service) => service.pages)
        .find((candidatePage) => candidatePage.id === pageId);
      if (!page) return project;
      page.contentBindings = page.contentBindings.filter((binding) => binding.id !== bindingId);
      return next;
    }
  };
}

export function upsertContentSourceCommand(source: ContentSource): EditorCommand {
  return {
    id: "upsert-content-source",
    label: "Save data source",
    apply: (project) => {
      const next = cloneProject(project);
      const sourceIndex = next.contentSources.findIndex((item) => item.id === source.id);

      if (sourceIndex >= 0) next.contentSources[sourceIndex] = structuredClone(source);
      else next.contentSources.push(structuredClone(source));

      next.metadata.updatedAt = new Date().toISOString();
      return next;
    }
  };
}

export function upsertTemplateCommand(template: Template): EditorCommand {
  return {
    id: "upsert-template",
    label: `Import template ${template.name}`,
    apply: (project) => {
      const next = cloneProject(project);
      const templateIndex = next.templates.findIndex((item) => item.id === template.id);

      if (templateIndex >= 0) next.templates[templateIndex] = structuredClone(template);
      else next.templates.push(structuredClone(template));

      next.metadata.updatedAt = new Date().toISOString();
      return next;
    }
  };
}

export function paintG3LineCommand(
  serviceId: string,
  pageId: string,
  subpageId: string,
  rowIndex: number,
  column: number,
  code: G3LineCode | undefined,
  level1Fallback: boolean
): EditorCommand {
  return {
    id: "paint-g3-line",
    label: code === undefined ? "Erase G3 line glyph" : "Paint G3 line glyph",
    apply: (project) => {
      if (rowIndex < 1 || rowIndex > 24 || column < 0 || column > 39) {
        return project;
      }

      const next = cloneProject(project);
      const subpage = findMutableSubpage(next, serviceId, pageId, subpageId);

      if (!subpage) {
        return project;
      }

      const lines = new Map(
        extractG3LineCells(subpage.enhancementPackets).map((cell) => [
          `${cell.rowIndex}:${cell.column}`,
          cell
        ])
      );
      const key = `${rowIndex}:${column}`;
      const previous = lines.get(key);

      if (code === undefined) {
        lines.delete(key);
      } else {
        lines.set(key, { rowIndex, column, code });
      }

      try {
        subpage.enhancementPackets = replaceG3LineCells(
          subpage.enhancementPackets,
          [...lines.values()]
        );
      } catch {
        return project;
      }

      const row = subpage.rows[rowIndex];

      if (level1Fallback && code === G3_LINE_CODES.horizontal) {
        row.cells[column] = textCell(column, "\u2013", row.cells[column].background);
        row.cells[column].byte = 0x60;
      } else if (
        level1Fallback
        && code === undefined
        && previous?.code === G3_LINE_CODES.horizontal
        && row.cells[column].byte === 0x60
      ) {
        row.cells[column] = emptyCell(column, row.cells[column].background);
      }

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

export function setPageHeaderLocalDateCommand(
  serviceId: string,
  pageId: string,
  showLocalDate: boolean
): EditorCommand {
  return {
    id: "set-page-header-local-date",
    label: "Set X/0 live date",
    apply: (project) => {
      const next = cloneProject(project);
      const service = next.services.find((item) => item.id === serviceId);
      const page = service?.pages.find((item) => item.id === pageId);

      if (!page) {
        return project;
      }

      page.metadata.header = {
        ...page.metadata.header,
        showLocalDate
      };

      return next;
    }
  };
}

export function setPageReceiverFontProfileCommand(
  serviceId: string,
  pageId: string,
  profileId: TeletextFontProfileId
): EditorCommand {
  return {
    id: "set-page-receiver-font-profile",
    label: "Set receiver font profile",
    apply: (project) => {
      const next = cloneProject(project);
      const service = next.services.find((item) => item.id === serviceId);
      const page = service?.pages.find((item) => item.id === pageId);

      if (!page) {
        return project;
      }

      page.metadata.receiverFontProfileId = profileId;

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
