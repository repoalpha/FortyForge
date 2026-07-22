import type { ContentSource, Project } from "../core";

export const STUDIO_AUTOMATION_CHECK_INTERVAL_MS = 15_000;

export interface StudioSourceFetchResult {
  payload: string;
  contentType: string;
  finalUrl: string;
  fetchedAt: string;
}

export function automaticBoundSourceIdsDue(project: Project, now = new Date()) {
  const boundSourceIds = new Set(
    project.services.flatMap((service) =>
      service.pages.flatMap((page) => page.contentBindings.map((binding) => binding.sourceId))
    )
  );

  return project.contentSources
    .filter((source) =>
      source.enabled
      && source.kind !== "manual"
      && source.refreshPolicy.mode === "interval"
      && source.policy.operatorApproved
      && boundSourceIds.has(source.id)
    )
    .filter((source) => {
      const latestAttempt = project.contentSnapshots
        .filter((snapshot) => snapshot.sourceId === source.id)
        .sort((left, right) => right.capturedAt.localeCompare(left.capturedAt))[0];
      const intervalMs = Math.max(60, source.refreshPolicy.intervalSeconds ?? 300) * 1000;

      return !latestAttempt
        || now.getTime() - Date.parse(latestAttempt.capturedAt) >= intervalMs;
    })
    .map((source) => source.id);
}

export async function fetchStudioSource(source: ContentSource): Promise<StudioSourceFetchResult> {
  const response = await fetch(`/api/pixelcast/feed-preview?url=${encodeURIComponent(source.uri)}`);
  const result = await response.json() as StudioSourceFetchResult & { error?: string };

  if (!response.ok) {
    throw new Error(result.error ?? `Feed returned HTTP ${response.status}.`);
  }

  return result;
}
