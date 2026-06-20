import type { Cell, Project, TeletextRow } from "../model/types";
import { composeExportRows } from "../render/pageHeader";

function cellToCharacter(cell: Cell): string {
  if (cell.kind === "empty") {
    return " ";
  }

  if (cell.kind === "character") {
    return cell.character?.value ?? String.fromCharCode(cell.byte);
  }

  return String.fromCharCode(cell.byte);
}

function rowToText(row: TeletextRow): string {
  return row.cells.map(cellToCharacter).join("").padEnd(40, " ").slice(0, 40);
}

export interface TtiExportOptions {
  now?: Date;
}

export function exportTti(project: Project, options: TtiExportOptions = {}): string {
  const service = project.services[0];
  const page = service.pages[0];
  const subpage = page.subpages[0];
  const subpageSuffix = subpage.subcode.slice(-2);
  const rows = composeExportRows(page, subpage, options.now);
  const lines = [
    `DE,${page.title}`,
    `PN,${page.pageNumber}${subpageSuffix}`,
    `SC,${subpage.subcode}`,
    ...rows.map((row) => `OL,${row.index},${rowToText(row)}`)
  ];

  return `${lines.join("\n")}\n`;
}
