export interface BroadcastPageEntry {
  pageId: string;
  pageNumber: string;
  subpageId: string;
  subcode: string;
  rowsFile: string;
  ttiFile: string;
  sha256: string;
  byteLength: 1000;
  clockMode: "original" | "local" | "none";
  dwellSeconds: number;
  repeatWeight: number;
  priority: "normal" | "high" | "emergency";
  validFrom?: string;
  validUntil?: string;
  sourceTimestamps: Record<string, string>;
  attributions: string[];
}

export interface BroadcastManifest {
  format: "pixelcast-broadcast";
  formatVersion: "1";
  publisherId: string;
  channelId: string;
  releaseId: string;
  sequence: number;
  generatedAt: string;
  serviceId: string;
  serviceName: string;
  presentationLevel: "1" | "1.5";
  pages: BroadcastPageEntry[];
}

export interface ChannelHead {
  format: "pixelcast-channel";
  formatVersion: "1";
  publisherId: string;
  channelId: string;
  releaseId: string;
  sequence: number;
  manifestPath: string;
  manifestSha256: string;
  publishedAt: string;
}
