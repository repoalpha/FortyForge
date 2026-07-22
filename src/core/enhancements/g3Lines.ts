import type { EnhancementPacket, EnhancementTriplet } from "../model/types";
import { isX26TerminationTriplet, X26_TERMINATION_TRIPLET } from "../exporters/x26";

export const G3_LINE_CODES = {
  vertical: 0x50,
  horizontal: 0x51,
  topLeft: 0x52,
  topRight: 0x53,
  bottomLeft: 0x54,
  bottomRight: 0x55,
  teeRight: 0x56,
  teeLeft: 0x57,
  teeDown: 0x58,
  teeUp: 0x59,
  cross: 0x5a
} as const;

export type G3LineCode = typeof G3_LINE_CODES[keyof typeof G3_LINE_CODES];

export interface G3LineCell {
  rowIndex: number;
  column: number;
  code: G3LineCode;
}

const GENERATED_LABEL_PREFIX = "Pixelcast G3 line";
const X26_PACKET_CAPACITY = 13;
const X26_PACKET_LIMIT = 16;

export function isG3LineCode(value: number): value is G3LineCode {
  return value >= G3_LINE_CODES.vertical && value <= G3_LINE_CODES.cross;
}

function orderedPackets(packets: readonly EnhancementPacket[]) {
  return packets
    .filter((packet) => packet.packetType === "X/26")
    .sort((left, right) => left.designationCode - right.designationCode);
}

export function extractG3LineCells(packets: readonly EnhancementPacket[]): G3LineCell[] {
  const cells = new Map<string, G3LineCell>();
  let activeRow: number | undefined;

  for (const packet of orderedPackets(packets)) {
    for (const triplet of packet.triplets) {
      if (isX26TerminationTriplet(triplet)) {
        return [...cells.values()];
      }

      if (triplet.mode === 0x04 && triplet.address >= 40 && triplet.address <= 63) {
        activeRow = triplet.address === 40 ? 24 : triplet.address - 40;
        continue;
      }

      if (triplet.mode === 0x07 && triplet.address === 63) {
        activeRow = 0;
        continue;
      }

      if (
        activeRow !== undefined
        && triplet.address <= 39
        && (triplet.mode === 0x02 || triplet.mode === 0x0b)
        && isG3LineCode(triplet.data)
      ) {
        const cell = { rowIndex: activeRow, column: triplet.address, code: triplet.data };
        cells.set(`${cell.rowIndex}:${cell.column}`, cell);
      }
    }
  }

  return [...cells.values()];
}

function lineTriplets(cells: readonly G3LineCell[]): EnhancementTriplet[] {
  const byRow = new Map<number, G3LineCell[]>();

  for (const cell of cells) {
    const row = byRow.get(cell.rowIndex) ?? [];
    row.push(cell);
    byRow.set(cell.rowIndex, row);
  }

  const triplets: EnhancementTriplet[] = [];

  for (const [rowIndex, rowCells] of [...byRow].sort(([left], [right]) => left - right)) {
    const firstColumn = Math.min(...rowCells.map((cell) => cell.column));
    triplets.push({
      address: rowIndex === 24 ? 40 : 40 + rowIndex,
      mode: 0x04,
      data: firstColumn,
      label: `${GENERATED_LABEL_PREFIX} row ${rowIndex}`
    });

    for (const cell of rowCells.sort((left, right) => left.column - right.column)) {
      triplets.push({
        address: cell.column,
        mode: 0x0b,
        data: cell.code,
        label: `${GENERATED_LABEL_PREFIX} cell ${rowIndex}:${cell.column}`
      });
    }
  }

  return triplets;
}

export function replaceG3LineCells(
  packets: readonly EnhancementPacket[],
  cells: readonly G3LineCell[]
): EnhancementPacket[] {
  const nonX26 = packets.filter((packet) => packet.packetType !== "X/26");
  const preservedTriplets = orderedPackets(packets).flatMap((packet) => packet.triplets).filter(
    (triplet) =>
      !isX26TerminationTriplet(triplet)
      && !triplet.label.startsWith(GENERATED_LABEL_PREFIX)
      && !(
        (triplet.mode === 0x02 || triplet.mode === 0x0b)
        && isG3LineCode(triplet.data)
      )
  );
  const contentTriplets = [...preservedTriplets, ...lineTriplets(cells)];

  if (contentTriplets.length === 0) {
    return nonX26;
  }

  const allTriplets = [...contentTriplets, X26_TERMINATION_TRIPLET];

  if (allTriplets.length > X26_PACKET_CAPACITY * X26_PACKET_LIMIT) {
    throw new Error("The X/26 packet limit leaves no room for another line glyph.");
  }

  const x26Packets: EnhancementPacket[] = [];

  for (let offset = 0; offset < allTriplets.length; offset += X26_PACKET_CAPACITY) {
    const designationCode = x26Packets.length;
    x26Packets.push({
      id: `fortyforge-x26-${designationCode}`,
      packetType: "X/26",
      designationCode,
      presentationLevels: ["2.5", "3.5"],
      triplets: allTriplets.slice(offset, offset + X26_PACKET_CAPACITY),
      source: "generated"
    });
  }

  return [...nonX26, ...x26Packets];
}
