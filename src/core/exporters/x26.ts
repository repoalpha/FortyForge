import type { EnhancementPacket, EnhancementTriplet } from "../model/types";

const X26_TRIPLETS_PER_PACKET = 13;
const X26_TERMINATION_DATA = 0x07;

export const X26_TERMINATION_TRIPLET: EnhancementTriplet = {
  address: 0x3f,
  mode: 0x1f,
  data: X26_TERMINATION_DATA,
  label: "End of local enhancement data"
};

function assertTripletField(name: string, value: number, maximum: number) {
  if (!Number.isInteger(value) || value < 0 || value > maximum) {
    throw new Error(`Invalid X/26 ${name}: ${value}`);
  }
}

export function packX26Triplet(triplet: EnhancementTriplet): number {
  assertTripletField("address", triplet.address, 0x3f);
  assertTripletField("mode", triplet.mode, 0x1f);
  assertTripletField("data", triplet.data, 0x7f);

  return triplet.address | (triplet.mode << 6) | (triplet.data << 11);
}

export function unpackX26Triplet(value: number, label = "Imported X/26 triplet"): EnhancementTriplet {
  assertTripletField("value", value, 0x3ffff);

  return {
    address: value & 0x3f,
    mode: (value >> 6) & 0x1f,
    data: (value >> 11) & 0x7f,
    label
  };
}

export function isX26TerminationTriplet(triplet: EnhancementTriplet) {
  return triplet.address === 0x3f && triplet.mode === 0x1f;
}

function normalizePacketTriplets(packet: EnhancementPacket): EnhancementTriplet[] {
  if (packet.triplets.length > X26_TRIPLETS_PER_PACKET) {
    throw new Error(`X/26/${packet.designationCode} contains more than 13 triplets.`);
  }

  const triplets = [...packet.triplets];
  const hasTermination = triplets.some(isX26TerminationTriplet);

  if (!hasTermination) {
    if (triplets.length === X26_TRIPLETS_PER_PACKET) {
      return triplets;
    }

    triplets.push(X26_TERMINATION_TRIPLET);
  }

  const termination = triplets.find(isX26TerminationTriplet) ?? X26_TERMINATION_TRIPLET;

  while (triplets.length < X26_TRIPLETS_PER_PACKET) {
    triplets.push(termination);
  }

  return triplets;
}

export function encodeX26TtiPayload(packet: EnhancementPacket): string {
  assertTripletField("designation code", packet.designationCode, 0x0f);

  const bytes = [0x40 | packet.designationCode];

  for (const triplet of normalizePacketTriplets(packet)) {
    const packed = packX26Triplet(triplet);
    bytes.push(
      0x40 | (packed & 0x3f),
      0x40 | ((packed >> 6) & 0x3f),
      0x40 | ((packed >> 12) & 0x3f)
    );
  }

  return String.fromCharCode(...bytes);
}

export function decodeX26TtiPayload(payload: string, packetId: string): EnhancementPacket {
  if (payload.length !== 40) {
    throw new Error(`X/26 payload must contain 40 characters; received ${payload.length}.`);
  }

  const triplets: EnhancementTriplet[] = [];

  for (let offset = 1; offset < payload.length; offset += 3) {
    const packed = (payload.charCodeAt(offset) & 0x3f)
      | ((payload.charCodeAt(offset + 1) & 0x3f) << 6)
      | ((payload.charCodeAt(offset + 2) & 0x3f) << 12);
    const triplet = unpackX26Triplet(packed);

    triplets.push(triplet);

    if (isX26TerminationTriplet(triplet)) {
      break;
    }
  }

  return {
    id: packetId,
    packetType: "X/26",
    designationCode: payload.charCodeAt(0) & 0x0f,
    presentationLevels: ["1.5", "2.5", "3.5"],
    triplets,
    source: "imported"
  };
}

export function orderedX26Packets(packets: readonly EnhancementPacket[]) {
  const x26Packets = packets
    .filter((packet) => packet.packetType === "X/26")
    .sort((left, right) => left.designationCode - right.designationCode);

  x26Packets.forEach((packet, index) => {
    if (packet.designationCode !== index) {
      throw new Error("X/26 designation codes must be sequential starting at 0.");
    }
  });

  return x26Packets;
}
