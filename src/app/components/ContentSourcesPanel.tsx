import type { ContentSnapshot, ContentSource } from "../../core";

interface ContentSourcesPanelProps {
  sources: ContentSource[];
  snapshots: ContentSnapshot[];
}

export function ContentSourcesPanel({ sources, snapshots }: ContentSourcesPanelProps) {
  if (sources.length === 0) return null;
  return (
    <section aria-label="Content sources">
      <h2>Content sources</h2>
      <div className="source-list">
        {sources.map((source) => {
          const latest = snapshots
            .filter((snapshot) => snapshot.sourceId === source.id)
            .sort((left, right) => right.capturedAt.localeCompare(left.capturedAt))[0];
          return (
            <article key={source.id} className="source-card">
              <strong>{source.label}</strong>
              <span>{source.kind} · {source.provider}</span>
              <span className={source.enabled ? "source-approved" : "source-blocked"}>
                {!source.enabled
                  ? "Source paused"
                  : source.refreshPolicy.mode === "interval"
                    ? `Automatic every ${Math.max(1, Math.round((source.refreshPolicy.intervalSeconds ?? 300) / 60))} min`
                    : source.refreshPolicy.mode === "on-export"
                      ? "Refresh on publish"
                      : "Manual refresh"}
              </span>
              <span className={source.policy.operatorApproved ? "source-approved" : "source-blocked"}>
                {source.policy.operatorApproved ? "Rights approved" : "Publication blocked"}
              </span>
              <span>{latest ? `${latest.status} · ${new Date(latest.capturedAt).toLocaleString()}` : "No snapshot"}</span>
              {source.policy.attributionRequired ? <small>{source.policy.attributionText || "Attribution missing"}</small> : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
