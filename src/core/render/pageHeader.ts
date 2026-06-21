import type { Cell, Page, Subpage, TeletextRow } from "../model/types";

const HEADER_WIDTH = 40;

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

function formatClock(now: Date): string {
  const hours = now.getHours().toString().padStart(2, "0");
  const minutes = now.getMinutes().toString().padStart(2, "0");

  return `${hours}:${minutes}`;
}

function makeHeaderText(page: Page, now: Date): string {
  const clock = formatClock(now);
  const identity = `P${page.pageNumber}`;
  const title = page.title.toUpperCase().replace(/\s+/g, " ").slice(0, 22);

  return `${identity} ${title}`.padEnd(HEADER_WIDTH - clock.length, " ") + clock;
}

function rowFromText(sourceRow: TeletextRow, text: string): TeletextRow {
  return {
    ...sourceRow,
    label: "X/0 Header",
    cells: text
      .padEnd(HEADER_WIDTH, " ")
      .slice(0, HEADER_WIDTH)
      .split("")
      .map((value, column) => textCell(column, value))
  };
}

function isAuthoredCell(cell: Cell) {
  return cell.kind !== "empty";
}

function rowFromTextPreservingAuthoredCells(sourceRow: TeletextRow, text: string): TeletextRow {
  const generated = rowFromText(sourceRow, text);

  return {
    ...generated,
    cells: generated.cells.map((cell, column) =>
      isAuthoredCell(sourceRow.cells[column])
        ? {
            ...sourceRow.cells[column],
            column
          }
        : cell
    )
  };
}

export function composePageHeaderRow(
  page: Page,
  _subpage: Subpage,
  sourceRow: TeletextRow,
  now = new Date()
): TeletextRow {
  const clockMode = page.metadata.header?.clockMode ?? "original";

  if (clockMode === "original") {
    return sourceRow;
  }

  return rowFromTextPreservingAuthoredCells(sourceRow, makeHeaderText(page, now));
}

export function composeExportRows(
  page: Page,
  subpage: Subpage,
  now = new Date()
): TeletextRow[] {
  return subpage.rows.map((row) =>
    row.index === 0 ? composePageHeaderRow(page, subpage, row, now) : row
  );
}
