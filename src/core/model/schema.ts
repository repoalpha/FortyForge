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
  glyphSets: z.array(z.unknown()),
  exportProfiles: z.array(z.unknown()),
  transmissionProfiles: z.array(z.unknown())
});
