import type { ContentSnapshot, ContentSource, Project } from "../model/types";
import { parseSourcePayload } from "./adapters";

export interface SourceLoadResult {
  payload: string;
  sourceUri?: string;
}

export type SourceLoader = (source: ContentSource) => Promise<SourceLoadResult>;

export interface SourceRefreshDiagnostic {
  sourceId: string;
  severity: "info" | "warning" | "error";
  message: string;
}

function validateSourcePolicy(source: ContentSource) {
  if (!source.policy.operatorApproved) throw new Error("source rights have not been approved");
  if (source.policy.attributionRequired && !source.policy.attributionText.trim()) {
    throw new Error("required attribution text is missing");
  }
  if (source.policy.expiresAt && Date.parse(source.policy.expiresAt) <= Date.now()) {
    throw new Error("source permission has expired");
  }
}

export async function refreshProjectSources(
  project: Project,
  loader: SourceLoader,
  now = new Date(),
  sourceIds?: Set<string>
) {
  const next = structuredClone(project) as Project;
  const diagnostics: SourceRefreshDiagnostic[] = [];

  for (const source of next.contentSources) {
    if (!source.enabled || source.kind === "manual" || (sourceIds && !sourceIds.has(source.id))) continue;
    try {
      validateSourcePolicy(source);
      const loaded = await loader(source);
      const records = parseSourcePayload(source, loaded.payload);
      const snapshot: ContentSnapshot = {
        id: `${source.id}-${now.getTime()}`,
        sourceId: source.id,
        capturedAt: now.toISOString(),
        status: "ok",
        records,
        attributionText: source.policy.attributionText || undefined,
        sourceUri: loaded.sourceUri ?? source.uri
      };
      next.contentSnapshots.push(snapshot);
      diagnostics.push({ sourceId: source.id, severity: "info", message: `Loaded ${records.length} records.` });
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown source error";
      next.contentSnapshots.push({
        id: `${source.id}-${now.getTime()}-error`,
        sourceId: source.id,
        capturedAt: now.toISOString(),
        status: "error",
        records: [],
        errorMessage: message,
        attributionText: source.policy.attributionText || undefined,
        sourceUri: source.uri
      });
      diagnostics.push({ sourceId: source.id, severity: "error", message });
    }

    const sourceSnapshots = next.contentSnapshots
      .filter((snapshot) => snapshot.sourceId === source.id)
      .sort((left, right) => right.capturedAt.localeCompare(left.capturedAt));
    const keepIds = new Set(sourceSnapshots.slice(0, Math.max(1, source.cachePolicy.keepSnapshots)).map((item) => item.id));
    next.contentSnapshots = next.contentSnapshots.filter((snapshot) => snapshot.sourceId !== source.id || keepIds.has(snapshot.id));
  }

  next.metadata.updatedAt = now.toISOString();
  return { project: next, diagnostics };
}
