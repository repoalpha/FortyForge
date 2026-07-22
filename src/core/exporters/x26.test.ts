import { describe, expect, it } from "vitest";

import { createDefaultProject } from "../model/projectFactory";
import { exportTti } from "./tti";
import {
  decodeX26TtiPayload,
  encodeX26TtiPayload,
  isX26TerminationTriplet,
  packX26Triplet,
  unpackX26Triplet
} from "./x26";
import { importTti } from "../importers/tti";

describe("X/26 interchange", () => {
  it("packs ETSI address, mode, and data fields into 18 bits", () => {
    const triplet = {
      address: 17,
      mode: 0x0f,
      data: 0x5a,
      label: "Latin G2 character"
    };

    expect(unpackX26Triplet(packX26Triplet(triplet))).toMatchObject({
      address: 17,
      mode: 0x0f,
      data: 0x5a
    });
  });

  it("writes a VBIT2-compatible 40-character unhammed packet payload", () => {
    const payload = encodeX26TtiPayload({
      id: "x26-0",
      packetType: "X/26",
      designationCode: 0,
      presentationLevels: ["2.5"],
      triplets: [{ address: 5, mode: 0x0f, data: 0x23, label: "G2 character" }],
      source: "authored"
    });

    expect(payload).toHaveLength(40);
    expect(payload.charCodeAt(0)).toBe(0x40);
    expect([...payload].every((character) => {
      const byte = character.charCodeAt(0);
      return byte >= 0x40 && byte <= 0x7f;
    })).toBe(true);

    const decoded = decodeX26TtiPayload(payload, "decoded");
    expect(decoded.triplets[0]).toMatchObject({ address: 5, mode: 0x0f, data: 0x23 });
    expect(isX26TerminationTriplet(decoded.triplets.at(-1)!)).toBe(true);
  });

  it("round-trips X/26 packets through TTI without changing display rows", () => {
    const project = createDefaultProject();
    project.services[0].pages[0].subpages[0].enhancementPackets.push({
      id: "x26-0",
      packetType: "X/26",
      designationCode: 0,
      presentationLevels: ["2.5"],
      triplets: [{ address: 7, mode: 0x09, data: 0x41, label: "Latin G0 A" }],
      source: "authored"
    });

    const tti = exportTti(project);
    const imported = importTti(tti);
    const importedSubpage = imported.services[0].pages[0].subpages[0];

    expect(tti).toContain("OL,26,");
    expect(importedSubpage.enhancementPackets[0].triplets[0]).toMatchObject({
      address: 7,
      mode: 0x09,
      data: 0x41
    });
    expect(importedSubpage.rows).toHaveLength(25);
  });
});
