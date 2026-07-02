import { z } from "zod";

export const projectSchema = z.object({
  schemaVersion: z.literal("1.0.0"),
  appVersion: z.string(),
  metadata: z.object({
    id: z.string(),
    title: z.string(),
    description: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
    author: z.string(),
    tags: z.array(z.string()),
    sourceReferences: z.array(
      z.object({
        kind: z.enum(["user", "import", "ai", "external"]),
        label: z.string(),
        uri: z.string(),
        capturedAt: z.string()
      })
    )
  }),
  services: z.array(z.unknown()),
  templates: z.array(z.unknown()),
  mosaicAlphabets: z.array(z.unknown()).default([]),
  artworkBlocks: z.array(z.unknown()).default([]),
  glyphSets: z.array(z.unknown()).default([]),
  contentSources: z.array(z.unknown()).default([]),
  contentSnapshots: z.array(z.unknown()).default([]),
  exportProfiles: z.array(z.unknown()).default([]),
  transmissionProfiles: z.array(z.unknown()).default([])
});
