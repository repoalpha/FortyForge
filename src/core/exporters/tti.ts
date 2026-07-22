import type { Cell, Project, TeletextRow } from "../model/types";
import { composeExportRows } from "../render/pageHeader";
import { encodeX26TtiPayload, orderedX26Packets } from "./x26";

const TTI_ESCAPE = 0x1b;

function cellToCharacter(cell: Cell): string {
  const byte = cell.kind === "empty" ? 0x20 : cell.byte;
  const level1Byte = byte & 0x7f;

  if (level1Byte < 0x20) {
    return String.fromCharCode(TTI_ESCAPE, level1Byte | 0x40);
  }

  return String.fromCharCode(level1Byte);
}

function rowToText(row: TeletextRow): string {
  const cells = row.cells.slice(0, 40);
  return cells.map(cellToCharacter).join("") + " ".repeat(Math.max(0, 40 - cells.length));
}

export interface TtiExportOptions {
  now?: Date;
  serviceId?: string;
  pageId?: string;
  subpageId?: string;
}

export function exportTti(project: Project, options: TtiExportOptions = {}): string {
  const service = project.services.find((item) => item.id === options.serviceId) ?? project.services[0];
  const page = service.pages.find((item) => item.id === options.pageId) ?? service.pages[0];
  const subpage = page.subpages.find((item) => item.id === options.subpageId) ?? page.subpages[0];
  const subpageSuffix = subpage.subcode.slice(-2);
  const rows = composeExportRows(page, subpage, options.now);
  const lines = [
    `DE,${page.title}`,
    `PN,${page.pageNumber}${subpageSuffix}`,
    `SC,${subpage.subcode}`,
    ...rows.map((row) => `OL,${row.index},${rowToText(row)}`),
    ...orderedX26Packets(subpage.enhancementPackets).map(
      (packet) => `OL,26,${encodeX26TtiPayload(packet)}`
    )
  ];

  return `${lines.join("\r\n")}\r\n`;
}
