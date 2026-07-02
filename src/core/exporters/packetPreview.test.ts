import { describe, expect, it } from "vitest";

import { createDefaultProject } from "../model/projectFactory";
import { exportPacketPreview } from "./packetPreview";

describe("exportPacketPreview", () => {
  it("emits packet records with MRAG bytes plus 40 payload bytes", () => {
    const project = createDefaultProject();

    const preview = exportPacketPreview(project);
    const rowOnePacket = preview.packets.find((packet) => packet.row === 1);

    expect(preview.pageNumber).toBe("100");
    expect(preview.packets).toHaveLength(25);
    expect(rowOnePacket).toEqual(
      expect.objectContaining({
        magazine: 1,
        row: 1,
        coding: "preview"
      })
    );
    expect(rowOnePacket?.mragBytes).toHaveLength(2);
    expect(rowOnePacket?.payloadBytes).toHaveLength(40);
  });

  it("uses composed local X/0 header bytes for packet preview", () => {
    const project = createDefaultProject();
    const preview = exportPacketPreview(project, {
      now: new Date(2026, 5, 20, 3, 4, 5)
    });
    const headerPacket = preview.packets.find((packet) => packet.row === 0);
    const headerText = String.fromCharCode(...(headerPacket?.payloadBytes ?? []));

    expect(headerText).toContain("P100");
    expect(headerText.slice(32)).toBe("03:04/05");
  });
});
