import { describe, expect, it } from "vitest";

import { encodeX26TtiPayload, isX26TerminationTriplet } from "../exporters/x26";
import { exportTti } from "../exporters/tti";
import { importTti } from "../importers/tti";
import { createDefaultProject } from "../model/projectFactory";
import {
  extractG3LineCells,
  G3_LINE_CODES,
  replaceG3LineCells
} from "./g3Lines";

describe("ETSI G3 line enhancements", () => {
  it("encodes row positioning and line glyphs across continuation packets", () => {
    const cells = Array.from({ length: 24 }, (_, column) => ({
      rowIndex: 10,
      column,
      code: G3_LINE_CODES.horizontal
    }));
    const packets = replaceG3LineCells([], cells);

    expect(packets).toHaveLength(2);
    expect(packets[0].triplets).toHaveLength(13);
    expect(packets[0].triplets[0]).toMatchObject({ address: 50, mode: 0x04, data: 0 });
    expect(packets[0].triplets.some(isX26TerminationTriplet)).toBe(false);
    expect(encodeX26TtiPayload(packets[0])).toHaveLength(40);
    expect(isX26TerminationTriplet(packets[1].triplets.at(-1)!)).toBe(true);
    expect(extractG3LineCells(packets)).toEqual(cells);
  });

  it("uses address 40 for row 24 and removes packets after the last glyph is erased", () => {
    const packets = replaceG3LineCells([], [{
      rowIndex: 24,
      column: 39,
      code: G3_LINE_CODES.vertical
    }]);

    expect(packets[0].triplets[0]).toMatchObject({ address: 40, mode: 0x04, data: 39 });
    expect(extractG3LineCells(packets)).toEqual([{
      rowIndex: 24,
      column: 39,
      code: G3_LINE_CODES.vertical
    }]);
    expect(replaceG3LineCells(packets, [])).toEqual([]);
  });

  it("preserves non-line enhancement triplets when rebuilding generated packets", () => {
    const packets = replaceG3LineCells([{
      id: "imported",
      packetType: "X/26",
      designationCode: 0,
      presentationLevels: ["2.5"],
      triplets: [{ address: 4, mode: 0x0f, data: 0x23, label: "G2 character" }],
      source: "imported"
    }], [{ rowIndex: 3, column: 7, code: G3_LINE_CODES.cross }]);

    expect(packets.flatMap((packet) => packet.triplets)).toEqual(expect.arrayContaining([
      expect.objectContaining({ address: 4, mode: 0x0f, data: 0x23 }),
      expect.objectContaining({ address: 7, mode: 0x0b, data: G3_LINE_CODES.cross })
    ]));
  });

  it("round-trips a multi-packet separator through VBIT2 TTI", () => {
    const project = createDefaultProject();
    const cells = Array.from({ length: 40 }, (_, column) => ({
      rowIndex: 12,
      column,
      code: G3_LINE_CODES.horizontal
    }));
    project.services[0].pages[0].subpages[0].enhancementPackets = replaceG3LineCells([], cells);

    const imported = importTti(exportTti(project));
    const importedPackets = imported.services[0].pages[0].subpages[0].enhancementPackets;

    expect(importedPackets).toHaveLength(4);
    expect(extractG3LineCells(importedPackets)).toEqual(cells);
  });
});
