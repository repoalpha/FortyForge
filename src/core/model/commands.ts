import { applyTemplate } from "../templates/applyTemplate";
import { getControlCodeByByte } from "../standards/controlCodes";
import { captureMosaicGlyph, layoutMosaicText } from "../mosaicAlphabet/mosaicAlphabet";
import { renderLevel1Row } from "../render/renderLevel1";
import type {
  ArtworkBlock,
  ArtworkBlockCategory,
  CellRectangle,
  Cell,
  CellBlock,
  MosaicAlphabet,
  PageHeaderSettings,
  Project,
  Subpage,
  TeletextColourRef,
  TeletextRow
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
  return {
    column,
    kind: "character",
    byte: value.charCodeAt(0),
    character: {
      value,
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
        }
      };

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
      const currentState = renderLevel1Row(row).cells[column];

      row.cells[column] = {
        column,
        kind: "mosaic",
        byte: 0x40 | (sixelMask & 0x3f),
        mosaic: {
          separated: false,
          sixelMask,
          foreground,
          background: background ?? mosaicEditBackground(row, column, current)
        },
        annotations: []
      };

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
        regions: []
      });

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
