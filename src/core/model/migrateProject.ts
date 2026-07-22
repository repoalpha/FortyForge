import type { BindingPolicy, SourcePolicy, TemplateBlockKind } from "./types";

const DEFAULT_SOURCE_POLICY: SourcePolicy = {
  licenceMode: "internal",
  termsUrl: "",
  permittedUse: "internal",
  attributionRequired: false,
  attributionText: "",
  reviewedAt: "",
  operatorApproved: false
};

const DEFAULT_BINDING_POLICY: BindingPolicy = {
  approval: "manual",
  allowStale: true,
  onFailure: "keep-last-valid"
};

function blockKindForRegion(region: Record<string, unknown>): TemplateBlockKind {
  if (region.kind === "ticker") return "ticker";
  if (String(region.id).includes("weather")) return "weather";
  if (String(region.id).includes("content")) return "story";
  return "text";
}

export function migrateProject(input: unknown): unknown {
  if (!input || typeof input !== "object") {
    throw new Error("Unsupported project schema");
  }

  const source = structuredClone(input) as Record<string, any>;
  if (source.schemaVersion !== "1.0.0" && source.schemaVersion !== "2.0.0") {
    throw new Error("Unsupported project schema");
  }

  source.schemaVersion = "2.0.0";
  source.templates ??= [];
  source.contentSources ??= [];
  source.contentSnapshots ??= [];
  source.mosaicAlphabets ??= [];
  source.artworkBlocks ??= [];
  source.glyphSets ??= [];
  source.exportProfiles ??= [];
  source.transmissionProfiles ??= [];

  for (const service of source.services ?? []) {
    service.schedule ??= { enabled: false, defaultDwellSeconds: 8, entries: [] };
    for (const page of service.pages ?? []) {
      page.metadata.receiverFontProfileId ??= "ets-1990s";
      page.metadata.header ??= { clockMode: "original" };
      page.contentBindings ??= [];
      for (const binding of page.contentBindings) {
        binding.policy ??= structuredClone(DEFAULT_BINDING_POLICY);
      }
    }
  }

  for (const template of source.templates) {
    template.templateVersion ??= "1.0.0";
    template.requiredPixelcastVersion ??= "0.2.0";
    template.fixtures ??= [];
    for (const region of template.regions ?? []) {
      region.blockKind ??= blockKindForRegion(region);
      region.characterPolicy ??= "level1-replace";
      region.attributionRequired ??= false;
    }
    template.blocks ??= (template.regions ?? []).map((region: Record<string, any>) => ({
      id: `block-${region.id}`,
      kind: region.blockKind,
      regionId: region.id,
      label: region.label,
      settings: {}
    }));
  }

  for (const contentSource of source.contentSources) {
    contentSource.provider ??= contentSource.label ?? "Operator source";
    contentSource.policy ??= structuredClone(DEFAULT_SOURCE_POLICY);
  }

  return source;
}
