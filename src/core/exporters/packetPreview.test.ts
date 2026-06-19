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
});
