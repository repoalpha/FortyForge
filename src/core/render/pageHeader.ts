import type { Cell, Page, PageHeaderSettings, Subpage, TeletextRow } from "../model/types";

const HEADER_WIDTH = 40;
const CLOCK_WIDTH = 8;
const DATE_WIDTH = 10;
const CLOCK_START_COLUMN = HEADER_WIDTH - CLOCK_WIDTH;
const DATE_START_COLUMN = CLOCK_START_COLUMN - DATE_WIDTH;
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

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
  const seconds = now.getSeconds().toString().padStart(2, "0");

  return `${hours}:${minutes}/${seconds}`;
}

export function formatHeaderDate(now: Date): string {
  return `${DAY_NAMES[now.getDay()]} ${now.getDate()} ${MONTH_NAMES[now.getMonth()]}`;
}

function makeHeaderText(
  page: Page,
  now: Date,
  clockMode: Exclude<PageHeaderSettings["clockMode"], "original">,
  showLocalDate: boolean
): string {
  const clock = clockMode === "local" ? formatClock(now) : " ".repeat(CLOCK_WIDTH);
  const date = showLocalDate
    ? formatHeaderDate(now).padEnd(DATE_WIDTH, " ").slice(0, DATE_WIDTH)
    : "";
  const identity = `P${page.pageNumber}`;
  const titleWidth = Math.min(
    22,
    HEADER_WIDTH - CLOCK_WIDTH - date.length - identity.length - 1
  );
  const title = page.title.toUpperCase().replace(/\s+/g, " ").slice(0, Math.max(0, titleWidth));
  const headerTitle = `${identity} ${title}`;

  return headerTitle
    .padEnd(HEADER_WIDTH - CLOCK_WIDTH - date.length, " ")
    .slice(0, HEADER_WIDTH - CLOCK_WIDTH - date.length)
    + date
    + clock;
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

function isAuthoredHeaderControl(cell: Cell) {
  return cell.kind === "control";
}

function rowFromTextPreservingAuthoredCells(
  sourceRow: TeletextRow,
  text: string,
  showLocalDate: boolean
): TeletextRow {
  const generated = rowFromText(sourceRow, text);

  return {
    ...generated,
    cells: generated.cells.map((cell, column) =>
      column < CLOCK_START_COLUMN
        && !(showLocalDate && column >= DATE_START_COLUMN)
        && isAuthoredHeaderControl(sourceRow.cells[column])
        ? {
            ...sourceRow.cells[column],
            column
          }
        : cell
    )
  };
}

function rowWithLocalDate(sourceRow: TeletextRow, now: Date): TeletextRow {
  const cells = structuredClone(sourceRow.cells) as Cell[];
  const date = formatHeaderDate(now).padEnd(DATE_WIDTH, " ").slice(0, DATE_WIDTH);
  for (let offset = 0; offset < DATE_WIDTH; offset += 1) {
    cells[DATE_START_COLUMN + offset] = textCell(DATE_START_COLUMN + offset, date[offset]);
  }
  return { ...sourceRow, label: "X/0 Header", cells };
}

export function composePageHeaderRow(
  page: Page,
  _subpage: Subpage,
  sourceRow: TeletextRow,
  now = new Date()
): TeletextRow {
  const clockMode = page.metadata.header?.clockMode ?? "original";
  const showLocalDate = page.metadata.header?.showLocalDate ?? false;

  if (clockMode === "original") {
    return showLocalDate ? rowWithLocalDate(sourceRow, now) : sourceRow;
  }

  return rowFromTextPreservingAuthoredCells(
    sourceRow,
    makeHeaderText(page, now, clockMode, showLocalDate),
    showLocalDate
  );
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
