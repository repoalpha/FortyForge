import type { Cell, Project, TeletextRow } from "../model/types";

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

export function exportTti(project: Project): string {
  const service = project.services[0];
  const page = service.pages[0];
  const subpage = page.subpages[0];
  const subpageSuffix = subpage.subcode.slice(-2);
  const lines = [
    `DE,${page.title}`,
    `PN,${page.pageNumber}${subpageSuffix}`,
    `SC,${subpage.subcode}`,
    ...subpage.rows.map((row) => `OL,${row.index},${rowToText(row)}`)
  ];

  return `${lines.join("\n")}\n`;
}
