import { z } from "zod";

const presentationLevelSchema = z.enum(["1", "1.5", "2.5", "3.5"]);
const colourSchema = z.object({
  palette: z.enum(["level1", "clut"]),
  index: z.number().int().nonnegative()
});
const annotationSchema = z.object({ id: z.string(), label: z.string(), message: z.string() });
const controlCodeSchema = z.object({
  id: z.string(),
  byte: z.number().int().min(0).max(127),
  mnemonic: z.string(),
  category: z.enum([
    "colour", "graphics", "background", "size", "flash", "conceal", "box", "hold",
    "release", "charset"
  ]),
  label: z.string(),
  supportedLevels: z.array(presentationLevelSchema),
  description: z.string()
});
const cellSchema = z.object({
  column: z.number().int().min(0).max(39),
  kind: z.enum(["empty", "character", "control", "mosaic", "drcs"]),
  byte: z.number().int().min(0).max(255),
  character: z.object({
    value: z.string(),
    charset: z.enum(["G0", "G2", "G3", "DRCS"])
  }).optional(),
  controlCode: controlCodeSchema.optional(),
  mosaic: z.object({
    separated: z.boolean(),
    sixelMask: z.number().int().min(0).max(63),
    foreground: colourSchema,
    background: colourSchema
  }).optional(),
  drcs: z.object({ glyphSetId: z.string(), glyphId: z.string() }).optional(),
  background: colourSchema.optional(),
  annotations: z.array(annotationSchema)
});
const rowSchema = z.object({
  index: z.number().int().min(0).max(24),
  cells: z.array(cellSchema).length(40),
  locked: z.boolean(),
  label: z.string()
});
const enhancementSchema = z.object({
  id: z.string(),
  packetType: z.enum(["X/26", "X/27", "X/28", "M/29", "DRCS"]),
  designationCode: z.number().int().nonnegative(),
  presentationLevels: z.array(presentationLevelSchema),
  triplets: z.array(z.object({
    address: z.number().int(), mode: z.number().int(), data: z.number().int(), label: z.string()
  })),
  source: z.enum(["authored", "imported", "generated"])
});
const normalizedRecordSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string().optional(),
  body: z.string().optional(),
  url: z.string().optional(),
  publishedAt: z.string().optional(),
  updatedAt: z.string().optional(),
  priority: z.number().optional(),
  fields: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()]))
});
const boundsSchema = z.object({
  startRow: z.number().int().min(0).max(24),
  endRow: z.number().int().min(0).max(24),
  startColumn: z.number().int().min(0).max(39),
  endColumn: z.number().int().min(0).max(39)
});
const sourceKindSchema = z.enum(["rss", "atom", "weather", "json", "csv", "text", "manual", "web-extract"]);
const overflowSchema = z.enum(["clip", "wrap", "ellipsis", "add-subpage", "reject-update"]);
const blockKindSchema = z.enum([
  "masthead", "header", "navigation-footer", "text", "headline-list", "story",
  "key-value-table", "schedule", "weather", "ticker", "attribution", "artwork", "spacer"
]);
const regionSchema = z.object({
  id: z.string(),
  label: z.string(),
  bounds: boundsSchema,
  kind: z.enum(["static", "editable", "generated", "dynamic", "ticker"]),
  acceptedContentKinds: z.array(sourceKindSchema),
  lockedControlCodes: z.boolean(),
  overflowPolicy: overflowSchema,
  fallbackText: z.string(),
  blockKind: blockKindSchema,
  characterPolicy: z.enum(["level1-replace", "level1-reject"]),
  attributionRequired: z.boolean(),
  writableColumns: z.array(z.number().int().min(0).max(39)).optional()
});
export const templateSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  category: z.enum(["blank", "index", "article", "weather", "finance", "schedule", "advert", "presentation", "status", "ticker", "art", "carousel"]),
  targetPresentationLevel: presentationLevelSchema,
  rows: z.array(rowSchema).length(25),
  regions: z.array(regionSchema),
  templateVersion: z.string(),
  requiredPixelcastVersion: z.string(),
  blocks: z.array(z.object({
    id: z.string(),
    kind: blockKindSchema,
    regionId: z.string(),
    label: z.string(),
    settings: z.record(z.union([z.string(), z.number(), z.boolean()]))
  })),
  fixtures: z.array(z.object({
    id: z.string(),
    label: z.string(),
    kind: z.enum(["sample", "long", "missing", "stale"]),
    records: z.array(normalizedRecordSchema)
  })),
  styleKit: z.object({
    id: z.string(),
    name: z.string(),
    permittedLevel1Colours: z.array(z.number().int().min(0).max(7)),
    mastheadAlphabetId: z.string().optional(),
    dividerByte: z.number().int().optional(),
    footerTemplate: z.string().optional()
  }).optional()
});
const sourcePolicySchema = z.object({
  licenceMode: z.enum(["open", "operator-licensed", "internal"]),
  termsUrl: z.string(),
  permittedUse: z.enum(["non-commercial", "commercial", "internal"]),
  attributionRequired: z.boolean(),
  attributionText: z.string(),
  reviewedAt: z.string(),
  expiresAt: z.string().optional(),
  operatorApproved: z.boolean()
});
const contentSourceSchema = z.object({
  id: z.string(),
  kind: sourceKindSchema,
  label: z.string(),
  uri: z.string(),
  enabled: z.boolean(),
  refreshPolicy: z.object({
    mode: z.enum(["manual", "on-export", "interval", "runtime"]),
    intervalSeconds: z.number().positive().optional(),
    staleAfterSeconds: z.number().positive().optional(),
    retryCount: z.number().int().nonnegative()
  }),
  cachePolicy: z.object({ keepSnapshots: z.number().int().nonnegative(), allowStaleOnError: z.boolean() }),
  fieldHints: z.record(z.string()),
  provider: z.string(),
  policy: sourcePolicySchema,
  credentialEnvironmentVariable: z.string().optional()
});
const bindingSchema = z.object({
  id: z.string(),
  sourceId: z.string(),
  templateRegionId: z.string(),
  targetPageId: z.string(),
  targetSubpageId: z.string().optional(),
  transform: z.object({
    maxItems: z.number().int().positive(),
    fields: z.array(z.object({
      sourceField: z.string(), label: z.string().optional(), maxChars: z.number().int().positive(), includeWhenEmpty: z.boolean()
    })),
    sort: z.enum(["source", "newest-first", "oldest-first", "priority"]),
    textCase: z.enum(["preserve", "upper", "teletext-title"]),
    controlStyle: z.enum(["plain", "headline-colour", "region-default"]),
    textColour: z.number().int().min(1).max(7),
    overflowPolicy: overflowSchema,
    attributionGapRows: z.number().int().min(0).max(3).optional()
  }),
  ticker: z.object({
    row: z.number().int().min(0).max(24),
    startColumn: z.number().int().min(0).max(39),
    endColumn: z.number().int().min(0).max(39),
    mode: z.enum(["snapshot", "carousel-frames", "runtime-scroll"]),
    speedCellsPerStep: z.number().positive(),
    separator: z.string()
  }).optional(),
  policy: z.object({
    approval: z.enum(["automatic", "manual"]),
    staleAfterSeconds: z.number().positive().optional(),
    allowStale: z.boolean(),
    onFailure: z.enum(["keep-last-valid", "use-fallback", "reject-publication"])
  })
});
const pageSchema = z.object({
  id: z.string(),
  magazine: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6), z.literal(7), z.literal(8)]),
  pageNumber: z.string(),
  title: z.string(),
  subpages: z.array(z.object({
    id: z.string(),
    subcode: z.string(),
    rows: z.array(rowSchema).length(25),
    enhancementPackets: z.array(enhancementSchema),
    glyphReferences: z.array(z.object({ glyphSetId: z.string(), glyphId: z.string() })),
    carousel: z.object({ enabled: z.boolean(), delaySeconds: z.number().positive(), priority: z.enum(["normal", "high"]) })
  })).min(1),
  contentBindings: z.array(bindingSchema),
  metadata: z.object({
    description: z.string(),
    tags: z.array(z.string()),
    publicationState: z.enum(["draft", "ready", "published"]),
    templateId: z.string().optional(),
    targetPresentationLevel: presentationLevelSchema,
    receiverFontProfileId: z.enum(["ets-1990s", "saa5050-classic", "bedstead-extended", "tdatext-later"]),
    header: z.object({
      clockMode: z.enum(["original", "local", "none"]),
      showLocalDate: z.boolean()
    })
  }),
  links: z.array(z.object({ label: z.string(), pageNumber: z.string(), subcode: z.string().optional() }))
});

export const projectSchema = z.object({
  schemaVersion: z.literal("2.0.0"),
  appVersion: z.string(),
  metadata: z.object({
    id: z.string(), title: z.string(), description: z.string(), createdAt: z.string(), updatedAt: z.string(),
    author: z.string(), tags: z.array(z.string()),
    sourceReferences: z.array(z.object({
      kind: z.enum(["user", "import", "ai", "external"]), label: z.string(), uri: z.string(), capturedAt: z.string()
    }))
  }),
  services: z.array(z.object({
    id: z.string(),
    name: z.string(),
    defaultPresentationLevel: presentationLevelSchema,
    defaultLanguage: z.object({ id: z.string(), label: z.string(), primaryG0: z.string(), secondaryG0: z.string().optional() }),
    pages: z.array(pageSchema),
    navigation: z.object({
      fastextLinks: z.array(z.object({ label: z.string(), pageNumber: z.string(), subcode: z.string().optional() })),
      topEnabled: z.boolean()
    }),
    settings: z.object({ defaultExportProfileId: z.string(), rowCount: z.literal(25), columnCount: z.literal(40) }),
    schedule: z.object({
      enabled: z.boolean(),
      defaultDwellSeconds: z.number().positive(),
      entries: z.array(z.object({
        pageId: z.string(), subpageId: z.string().optional(), enabled: z.boolean(), dwellSeconds: z.number().positive(),
        repeatWeight: z.number().int().positive(), priority: z.enum(["normal", "high", "emergency"]),
        validFrom: z.string().optional(), validUntil: z.string().optional()
      })),
      emergencyPageId: z.string().optional()
    })
  })),
  templates: z.array(templateSchema),
  mosaicAlphabets: z.array(z.object({
    id: z.string(), name: z.string(), description: z.string(),
    sourceReference: z.object({ kind: z.enum(["user", "import", "ai", "external"]), label: z.string(), uri: z.string(), capturedAt: z.string() }).optional(),
    cellWidth: z.number().int().positive(), cellHeight: z.number().int().positive(), spacingColumns: z.number().int().nonnegative(),
    glyphs: z.record(z.object({
      character: z.string(), width: z.number().int().positive(), height: z.number().int().positive(),
      cells: z.array(z.object({ sixelMask: z.number().int(), separated: z.boolean(), foreground: colourSchema, background: colourSchema })),
      source: z.enum(["captured", "generated", "edited"]), note: z.string().optional()
    })),
    pixelGlyphs: z.record(z.array(z.string())).optional(), pixelSpacingColumns: z.number().int().optional()
  })),
  artworkBlocks: z.array(z.object({
    id: z.string(), name: z.string(), description: z.string().optional(),
    category: z.enum(["masthead", "logo", "divider", "letter", "panel", "other"]),
    assignedCharacter: z.string().optional(), width: z.number().int().positive(), height: z.number().int().positive(),
    cells: z.array(z.array(cellSchema)),
    source: z.object({ pageNumber: z.string().optional(), templateId: z.string().optional(), rowIndex: z.number().int(), column: z.number().int() }).optional(),
    createdAt: z.string(), updatedAt: z.string()
  })),
  glyphSets: z.array(z.object({
    id: z.string(), name: z.string(), scope: z.enum(["page", "service", "global"]), source: z.enum(["authored", "imported", "ai-generated"]),
    glyphs: z.array(z.object({
      id: z.string(), codePoint: z.number().int(), mode: z.enum(["12x10x1", "12x10x2", "12x10x4", "6x5x4"]),
      width: z.union([z.literal(12), z.literal(6)]), height: z.union([z.literal(10), z.literal(5)]),
      bitsPerPixel: z.union([z.literal(1), z.literal(2), z.literal(4)]), pixels: z.array(z.number().int())
    }))
  })),
  contentSources: z.array(contentSourceSchema),
  contentSnapshots: z.array(z.object({
    id: z.string(), sourceId: z.string(), capturedAt: z.string(), status: z.enum(["ok", "stale", "error"]),
    records: z.array(normalizedRecordSchema), errorMessage: z.string().optional(), attributionText: z.string().optional(),
    sourceUri: z.string().optional(), generatedPageHashes: z.record(z.string()).optional()
  })),
  exportProfiles: z.array(z.object({
    id: z.string(), name: z.string(),
    targetFormats: z.array(z.enum(["pixelcast", "pttx", "tti", "t42", "raw", "png", "gif"])),
    presentationLevel: presentationLevelSchema
  })),
  transmissionProfiles: z.array(z.object({
    id: z.string(), name: z.string(), kind: z.enum(["broadcast", "packet-stream", "low-bandwidth-delta"]),
    maxPayloadBytes: z.number().int().positive(), supportsDelta: z.boolean(), supportsCompression: z.boolean(),
    integrity: z.enum(["crc32", "sha256"]), scheduling: z.enum(["manual", "carousel", "priority"])
  }))
});
