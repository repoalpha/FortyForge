import type { Project, TeletextRow } from "../model/types";

export interface PacketPreviewRecord {
  magazine: number;
  row: number;
  packetNumber: number;
  mragBytes: number[];
  payloadBytes: number[];
  coding: "preview";
}

export interface PacketPreview {
  pageNumber: string;
  subcode: string;
  packets: PacketPreviewRecord[];
}

function rowPayloadBytes(row: TeletextRow): number[] {
  return row.cells.map((cell) => cell.byte).slice(0, 40).concat(
    Array.from({ length: Math.max(0, 40 - row.cells.length) }, () => 0x20)
  );
}

function previewMragBytes(magazine: number, row: number): number[] {
  const magazineBits = magazine === 8 ? 0 : magazine;
  return [magazineBits & 0x07, row & 0x1f];
}

export function exportPacketPreview(project: Project): PacketPreview {
  const page = project.services[0].pages[0];
  const subpage = page.subpages[0];

  return {
    pageNumber: page.pageNumber,
    subcode: subpage.subcode,
    packets: subpage.rows.map((row) => ({
      magazine: page.magazine,
      row: row.index,
      packetNumber: row.index,
      mragBytes: previewMragBytes(page.magazine, row.index),
      payloadBytes: rowPayloadBytes(row),
      coding: "preview"
    }))
  };
}
