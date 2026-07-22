import { useEffect, useMemo, useState } from "react";

import {
  createFeedPreviewPages,
  createBlankFeedPreviewRows,
  MAX_DISPLAY_SUBPAGES,
  parseSourcePayload,
  protectLeadingMosaicArtwork,
  type CellRectangle,
  type ContentSnapshot,
  type ContentSource,
  type ContentSourceKind,
  type NormalizedContentRecord,
  type Page,
  type Subpage,
  type TeletextRow,
  type Template
} from "../../core";

const NASA_NEWS_FEED = "https://www.nasa.gov/news-release/feed/";
const NASA_MEDIA_TERMS = "https://www.nasa.gov/nasa-brand-center/images-and-media/";
const DATA_WORKBENCH_DRAFT_KEY = "pixelcast.dataWorkbenchDraft";
const DEFAULT_BOUNDS: CellRectangle = {
  startRow: 4,
  endRow: 21,
  startColumn: 1,
  endColumn: 39
};

export interface FeedWorkspaceState {
  rows: TeletextRow[];
  bounds: CellRectangle;
  record?: NormalizedContentRecord;
  recordPosition: number;
  recordCount: number;
  pagePosition: number;
  pageCount: number;
  usedRows: number;
  capacityRows: number;
  unsupportedCharacterCount: number;
  sourceLabel: string;
  protectedThroughRow?: number;
}

interface FeedWorkbenchProps {
  carouselPlaying: boolean;
  page: Page;
  pages: Page[];
  subpage: Subpage;
  sources: ContentSource[];
  snapshots: ContentSnapshot[];
  templates: Template[];
  rectangleSelection?: CellRectangle;
  onSourceSave: (source: ContentSource) => void;
  onSourceSnapshotSave: (source: ContentSource, snapshot: ContentSnapshot) => void;
  onTargetPageSelect: (pageId: string) => void;
  onBindingRemove: (pageId: string, bindingId: string) => void;
  onCarouselPlayingChange: (playing: boolean) => void;
  onWorkspaceChange: (workspace?: FeedWorkspaceState) => void;
  onPlaceSnapshot: (
    source: ContentSource,
    snapshot: ContentSnapshot,
    frames: TeletextRow[][],
    delaySeconds: number
  ) => void;
  onBindToSlot: (
    source: ContentSource,
    snapshot: ContentSnapshot,
    templateRegionId: string,
    fields: string[],
    bounds: CellRectangle,
    attributionGapRows: number
  ) => void;
}

interface FetchResult {
  payload: string;
  contentType: string;
  finalUrl: string;
  fetchedAt: string;
}

interface DataWorkbenchDraft {
  selectedSourceId: string;
  targetPageId: string;
  sourceLabel: string;
  sourceKind: ContentSourceKind;
  url: string;
  provider: string;
  attribution: string;
  termsUrl: string;
  operatorApproved: boolean;
  sourceEnabled: boolean;
  refreshMode: "manual" | "on-export" | "interval";
  refreshMinutes: number;
  staleMinutes: number;
  order: "newest-first" | "oldest-first";
  includeTitle: boolean;
  includeSummary: boolean;
  includeBody: boolean;
  targetKey: string;
  protectArtwork: boolean;
  headerGapRows: number;
  attributionGapRows: number;
  autoPlayCarousel: boolean;
  carouselDelaySeconds: number;
}

function readWorkbenchDraft(): Partial<DataWorkbenchDraft> {
  try {
    return JSON.parse(window.localStorage.getItem(DATA_WORKBENCH_DRAFT_KEY) ?? "{}") as Partial<DataWorkbenchDraft>;
  } catch {
    return {};
  }
}

function latestSnapshotForSource(snapshots: ContentSnapshot[], sourceId: string) {
  return snapshots
    .filter((snapshot) => snapshot.sourceId === sourceId && snapshot.status !== "error")
    .sort((left, right) => right.capturedAt.localeCompare(left.capturedAt))[0];
}

function sourceIdForUrl(url: string) {
  let hash = 2166136261;
  for (const character of url) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `feed-${(hash >>> 0).toString(16)}`;
}

function sortRecords(records: NormalizedContentRecord[], order: "newest-first" | "oldest-first") {
  return records.slice().sort((left, right) => {
    const leftDate = Date.parse(left.updatedAt ?? left.publishedAt ?? "") || 0;
    const rightDate = Date.parse(right.updatedAt ?? right.publishedAt ?? "") || 0;
    return order === "newest-first" ? rightDate - leftDate : leftDate - rightDate;
  });
}

function targetKeyForRegion(regionId: string) {
  return `region:${regionId}`;
}

export function FeedWorkbench({
  carouselPlaying,
  page,
  pages,
  subpage,
  sources,
  snapshots,
  templates,
  rectangleSelection,
  onSourceSave,
  onSourceSnapshotSave,
  onTargetPageSelect,
  onBindingRemove,
  onCarouselPlayingChange,
  onWorkspaceChange,
  onPlaceSnapshot,
  onBindToSlot
}: FeedWorkbenchProps) {
  const initialDraft = useMemo(readWorkbenchDraft, []);
  const initialSource = sources.find((source) => source.id === initialDraft.selectedSourceId)
    ?? sources[0];
  const initialSnapshot = initialSource
    ? latestSnapshotForSource(snapshots, initialSource.id)
    : undefined;
  const useDraft = initialSource?.id === initialDraft.selectedSourceId || (!initialSource && initialDraft.selectedSourceId === "new");
  const initialBoundPageId = initialSource
    ? pages.find((candidatePage) => candidatePage.contentBindings.some((binding) => binding.sourceId === initialSource.id))?.id
    : undefined;
  const restoredTargetPageId = initialDraft.targetPageId && pages.some((candidatePage) => candidatePage.id === initialDraft.targetPageId)
    ? initialDraft.targetPageId
    : initialBoundPageId ?? "";
  const [selectedSourceId, setSelectedSourceId] = useState(initialSource?.id ?? "new");
  const [targetPageId, setTargetPageId] = useState(restoredTargetPageId);
  const [sourceLabel, setSourceLabel] = useState(useDraft ? initialDraft.sourceLabel ?? initialSource?.label ?? "NASA news" : initialSource?.label ?? "NASA news");
  const [sourceKind, setSourceKind] = useState<ContentSourceKind>(useDraft ? initialDraft.sourceKind ?? initialSource?.kind ?? "rss" : initialSource?.kind ?? "rss");
  const [url, setUrl] = useState(useDraft ? initialDraft.url ?? initialSource?.uri ?? NASA_NEWS_FEED : initialSource?.uri ?? NASA_NEWS_FEED);
  const [provider, setProvider] = useState(useDraft ? initialDraft.provider ?? initialSource?.provider ?? "NASA" : initialSource?.provider ?? "NASA");
  const [attribution, setAttribution] = useState(useDraft ? initialDraft.attribution ?? initialSource?.policy.attributionText ?? "Source: NASA" : initialSource?.policy.attributionText ?? "Source: NASA");
  const [termsUrl, setTermsUrl] = useState(useDraft ? initialDraft.termsUrl ?? initialSource?.policy.termsUrl ?? NASA_MEDIA_TERMS : initialSource?.policy.termsUrl ?? NASA_MEDIA_TERMS);
  const [operatorApproved, setOperatorApproved] = useState(useDraft ? initialDraft.operatorApproved ?? initialSource?.policy.operatorApproved ?? false : initialSource?.policy.operatorApproved ?? false);
  const [sourceEnabled, setSourceEnabled] = useState(useDraft ? initialDraft.sourceEnabled ?? initialSource?.enabled ?? true : initialSource?.enabled ?? true);
  const [refreshMode, setRefreshMode] = useState<"manual" | "on-export" | "interval">(
    useDraft ? initialDraft.refreshMode ?? (initialSource?.refreshPolicy.mode === "runtime" ? "interval" : initialSource?.refreshPolicy.mode) ?? "manual" : (initialSource?.refreshPolicy.mode === "runtime" ? "interval" : initialSource?.refreshPolicy.mode) ?? "manual"
  );
  const [refreshMinutes, setRefreshMinutes] = useState(useDraft ? initialDraft.refreshMinutes ?? Math.max(1, Math.round((initialSource?.refreshPolicy.intervalSeconds ?? 300) / 60)) : Math.max(1, Math.round((initialSource?.refreshPolicy.intervalSeconds ?? 300) / 60)));
  const [staleMinutes, setStaleMinutes] = useState(useDraft ? initialDraft.staleMinutes ?? Math.max(1, Math.round((initialSource?.refreshPolicy.staleAfterSeconds ?? 3600) / 60)) : Math.max(1, Math.round((initialSource?.refreshPolicy.staleAfterSeconds ?? 3600) / 60)));
  const [status, setStatus] = useState(initialSnapshot
    ? `Restored ${initialSnapshot.records.length} records from ${initialSource?.label}.`
    : "Select or create a data source, then fetch it for inspection.");
  const [fetching, setFetching] = useState(false);
  const [fetchResult, setFetchResult] = useState<FetchResult>();
  const [snapshotIdentity, setSnapshotIdentity] = useState(initialSnapshot
    ? { id: initialSnapshot.id, sourceId: initialSnapshot.sourceId, capturedAt: initialSnapshot.capturedAt }
    : undefined);
  const [records, setRecords] = useState<NormalizedContentRecord[]>(initialSnapshot?.records ?? []);
  const [recordIndex, setRecordIndex] = useState(0);
  const [previewPageIndex, setPreviewPageIndex] = useState(0);
  const [order, setOrder] = useState<"newest-first" | "oldest-first">(initialDraft.order ?? "newest-first");
  const [includeTitle, setIncludeTitle] = useState(initialDraft.includeTitle ?? true);
  const [includeSummary, setIncludeSummary] = useState(initialDraft.includeSummary ?? true);
  const [includeBody, setIncludeBody] = useState(initialDraft.includeBody ?? false);
  const [targetKey, setTargetKey] = useState(initialDraft.targetKey ?? (rectangleSelection ? "selection" : "scratch"));
  const [protectArtwork, setProtectArtwork] = useState(initialDraft.protectArtwork ?? true);
  const [headerGapRows, setHeaderGapRows] = useState(initialDraft.headerGapRows ?? 1);
  const [attributionGapRows, setAttributionGapRows] = useState(initialDraft.attributionGapRows ?? 1);
  const [autoPlayCarousel, setAutoPlayCarousel] = useState(initialDraft.autoPlayCarousel ?? true);
  const [carouselDelaySeconds, setCarouselDelaySeconds] = useState(initialDraft.carouselDelaySeconds ?? 8);
  const [previewOnCanvas, setPreviewOnCanvas] = useState(false);
  const [wholePageReplacementApproved, setWholePageReplacementApproved] = useState(false);
  const placedCarouselSubpages = page.subpages.filter((candidate) => candidate.carousel.enabled);

  useEffect(() => {
    if (!restoredTargetPageId) onTargetPageSelect("");
  }, []);

  const boundPages = useMemo(() => pages.flatMap((candidatePage) =>
    candidatePage.contentBindings
      .filter((binding) => binding.sourceId === selectedSourceId)
      .map((binding) => ({ page: candidatePage, binding }))
  ), [pages, selectedSourceId]);

  useEffect(() => {
    const draft: DataWorkbenchDraft = {
      selectedSourceId,
      targetPageId,
      sourceLabel,
      sourceKind,
      url,
      provider,
      attribution,
      termsUrl,
      operatorApproved,
      sourceEnabled,
      refreshMode,
      refreshMinutes,
      staleMinutes,
      order,
      includeTitle,
      includeSummary,
      includeBody,
      targetKey,
      protectArtwork,
      headerGapRows,
      attributionGapRows,
      autoPlayCarousel,
      carouselDelaySeconds
    };
    try {
      window.localStorage.setItem(DATA_WORKBENCH_DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // A full browser store must not break feed staging or the main canvas.
    }
  }, [
    attribution,
    attributionGapRows,
    autoPlayCarousel,
    carouselDelaySeconds,
    headerGapRows,
    includeBody,
    includeSummary,
    includeTitle,
    operatorApproved,
    order,
    protectArtwork,
    provider,
    refreshMinutes,
    refreshMode,
    selectedSourceId,
    sourceEnabled,
    targetPageId,
    sourceKind,
    sourceLabel,
    staleMinutes,
    targetKey,
    termsUrl,
    url
  ]);

  function selectTargetPage(pageId: string) {
    setTargetPageId(pageId);
    setPreviewPageIndex(0);
    if (!pageId) setPreviewOnCanvas(false);
    onTargetPageSelect(pageId);
  }

  function selectSource(sourceId: string) {
    setSelectedSourceId(sourceId);
    setFetchResult(undefined);
    setRecordIndex(0);
    setPreviewPageIndex(0);

    if (sourceId === "new") {
      setSnapshotIdentity(undefined);
      selectTargetPage("");
      setSourceLabel("New data source");
      setSourceKind("rss");
      setUrl("");
      setProvider("");
      setAttribution("");
      setTermsUrl("");
      setOperatorApproved(false);
      setSourceEnabled(true);
      setRefreshMode("manual");
      setRefreshMinutes(5);
      setStaleMinutes(60);
      setRecords([]);
      setStatus("Configure the new data source, then save or fetch it.");
      return;
    }

    const source = sources.find((item) => item.id === sourceId);
    if (!source) return;
    const boundPage = pages.find((candidatePage) =>
      candidatePage.contentBindings.some((binding) => binding.sourceId === source.id)
    );
    selectTargetPage(boundPage?.id ?? "");
    const latest = latestSnapshotForSource(snapshots, source.id);
    setSnapshotIdentity(latest
      ? { id: latest.id, sourceId: latest.sourceId, capturedAt: latest.capturedAt }
      : undefined);
    setSourceLabel(source.label);
    setSourceKind(source.kind);
    setUrl(source.uri);
    setProvider(source.provider);
    setAttribution(source.policy.attributionText);
    setTermsUrl(source.policy.termsUrl);
    setOperatorApproved(source.policy.operatorApproved);
    setSourceEnabled(source.enabled);
    setRefreshMode(source.refreshPolicy.mode === "runtime" ? "interval" : source.refreshPolicy.mode);
    setRefreshMinutes(Math.max(1, Math.round((source.refreshPolicy.intervalSeconds ?? 300) / 60)));
    setStaleMinutes(Math.max(1, Math.round((source.refreshPolicy.staleAfterSeconds ?? 3600) / 60)));
    setRecords(latest?.records ?? []);
    setStatus(latest
      ? `Restored ${latest.records.length} records captured ${new Date(latest.capturedAt).toLocaleString()}.`
      : `${source.label} has no saved snapshot yet.`);
  }

  const hasTargetPage = targetPageId !== "";
  const activeTemplate = hasTargetPage
    ? templates.find((template) => template.id === page.metadata.templateId)
    : undefined;
  const regions = activeTemplate?.regions.filter((region) =>
    region.kind === "dynamic" || region.kind === "ticker"
  ) ?? [];
  useEffect(() => {
    const existingBinding = page.contentBindings.find((binding) => binding.sourceId === selectedSourceId);
    const matchingRegion = existingBinding
      ? regions.find((region) => region.id === existingBinding.templateRegionId)
      : undefined;
    if (!hasTargetPage) {
      setTargetKey("scratch");
    } else if (matchingRegion) {
      setTargetKey(targetKeyForRegion(matchingRegion.id));
    } else if (regions.length > 0) {
      setTargetKey(targetKeyForRegion(regions[0].id));
    } else {
      setTargetKey(rectangleSelection ? "selection" : "scratch");
    }
    setPreviewPageIndex(0);
  }, [hasTargetPage, page.id, selectedSourceId]);
  const orderedRecords = useMemo(() => sortRecords(records, order), [order, records]);
  const selectedRecord = orderedRecords[Math.min(recordIndex, Math.max(0, orderedRecords.length - 1))];
  const selectedRegion = targetKey.startsWith("region:")
    ? regions.find((region) => targetKeyForRegion(region.id) === targetKey)
    : undefined;
  const requestedBounds = selectedRegion?.bounds
    ?? (targetKey === "selection" && rectangleSelection ? rectangleSelection : DEFAULT_BOUNDS);
  const previewBaseRows = selectedRegion
    ? activeTemplate?.rows
    : targetKey === "selection"
      ? subpage.rows
      : undefined;
  const protectedLayout = useMemo(
    () => previewBaseRows && protectArtwork
      ? protectLeadingMosaicArtwork(previewBaseRows, requestedBounds, headerGapRows)
      : { bounds: requestedBounds, protectedThroughRow: undefined },
    [headerGapRows, previewBaseRows, protectArtwork, requestedBounds]
  );
  const bounds = protectedLayout.bounds;
  const previewPages = useMemo(
    () => selectedRecord
      ? createFeedPreviewPages({
          record: selectedRecord,
          bounds,
          attribution,
          attributionGapRows,
          baseRows: previewBaseRows,
          includeTitle,
          includeSummary,
          includeBody,
          pageNumber: page.pageNumber,
          showPreviewHeader: previewBaseRows === undefined
        })
      : [],
    [attribution, attributionGapRows, bounds, includeBody, includeSummary, includeTitle, page.pageNumber, previewBaseRows, selectedRecord]
  );
  const preview = previewPages[Math.min(previewPageIndex, Math.max(0, previewPages.length - 1))];

  useEffect(() => {
    if (!autoPlayCarousel || previewPages.length < 2) return;
    const timer = window.setTimeout(() => {
      setPreviewPageIndex((current) => (current + 1) % previewPages.length);
    }, carouselDelaySeconds * 1000);
    return () => window.clearTimeout(timer);
  }, [autoPlayCarousel, carouselDelaySeconds, previewPageIndex, previewPages.length]);

  useEffect(() => () => onWorkspaceChange(undefined), [onWorkspaceChange]);

  useEffect(() => {
    if (!previewOnCanvas) {
      onWorkspaceChange(undefined);
      return;
    }
    if (!preview) {
      onWorkspaceChange({
        rows: previewBaseRows
          ? structuredClone(previewBaseRows) as TeletextRow[]
          : createBlankFeedPreviewRows(page.pageNumber),
        bounds,
        recordPosition: 0,
        recordCount: 0,
        pagePosition: 1,
        pageCount: 1,
        usedRows: 0,
        capacityRows: bounds.endRow - bounds.startRow + 1,
        unsupportedCharacterCount: 0,
        sourceLabel: provider || "Feed",
        protectedThroughRow: protectedLayout.protectedThroughRow
      });
      return;
    }
    onWorkspaceChange({
      rows: preview.rows,
      bounds,
      record: selectedRecord,
      recordPosition: recordIndex + 1,
      recordCount: orderedRecords.length,
      pagePosition: preview.pageIndex + 1,
      pageCount: preview.pageCount,
      usedRows: preview.usedRows,
      capacityRows: preview.capacityRows,
      unsupportedCharacterCount: preview.unsupportedCharacterCount,
      sourceLabel: provider || "Feed",
      protectedThroughRow: protectedLayout.protectedThroughRow
    });
  }, [bounds, onWorkspaceChange, orderedRecords.length, page.pageNumber, preview, previewBaseRows, previewOnCanvas, protectedLayout.protectedThroughRow, provider, recordIndex, selectedRecord]);

  useEffect(() => {
    setRecordIndex(0);
    setPreviewPageIndex(0);
  }, [order]);

  useEffect(() => {
    setPreviewPageIndex(0);
  }, [recordIndex, targetKey, includeTitle, includeSummary, includeBody, attributionGapRows, headerGapRows, protectArtwork]);

  useEffect(() => {
    setWholePageReplacementApproved(false);
  }, [page.id, recordIndex, selectedSourceId, targetKey]);

  function createSource(resolvedUrl = fetchResult?.finalUrl ?? url): ContentSource {
    const id = selectedSourceId === "new"
      ? sourceIdForUrl(`${sourceLabel}|${resolvedUrl}`)
      : selectedSourceId;
    return {
      id,
      kind: sourceKind,
      label: sourceLabel.trim() || provider.trim() || "Data source",
      uri: resolvedUrl,
      enabled: sourceEnabled,
      refreshPolicy: {
        mode: refreshMode,
        intervalSeconds: refreshMode === "interval" ? Math.max(60, refreshMinutes * 60) : undefined,
        retryCount: 2,
        staleAfterSeconds: Math.max(60, staleMinutes * 60)
      },
      // Current plus previous is enough for last-known-good fallback without
      // allowing large news bodies to exhaust browser autosave storage.
      cachePolicy: { keepSnapshots: 2, allowStaleOnError: true },
      fieldHints: {},
      provider: provider.trim() || "External source",
      policy: {
        licenceMode: "open",
        termsUrl,
        permittedUse: "non-commercial",
        attributionRequired: true,
        attributionText: attribution,
        reviewedAt: new Date().toISOString(),
        operatorApproved
      }
    };
  }

  function createSnapshot(
    source: ContentSource,
    snapshotRecords = orderedRecords,
    capturedAt = fetchResult?.fetchedAt ?? snapshotIdentity?.capturedAt ?? new Date().toISOString(),
    id = snapshotIdentity?.sourceId === source.id
      ? snapshotIdentity.id
      : `${source.id}-${capturedAt}`
  ): ContentSnapshot {
    return {
      id,
      sourceId: source.id,
      capturedAt,
      status: "ok",
      records: snapshotRecords,
      attributionText: attribution,
      sourceUri: source.uri
    };
  }

  function saveSourceDefinition() {
    if (!url.trim()) {
      setStatus("Enter a source URL before saving.");
      return;
    }
    const source = createSource();
    onSourceSave(source);
    setSelectedSourceId(source.id);
    setStatus(`Saved ${source.label}. Its schedule and page bindings are now part of this Pixelcast project.`);
  }

  function changeSourceEnabled(enabled: boolean) {
    setSourceEnabled(enabled);

    if (selectedSourceId !== "new" && url.trim()) {
      const source = { ...createSource(), enabled };
      onSourceSave(source);
      setStatus(enabled
        ? `Enabled ${source.label}. Its saved schedule is active.`
        : `Paused ${source.label}. Live page bindings are retained.`);
    }
  }

  async function fetchFeed() {
    setFetching(true);
    setStatus("Fetching feed through the local Pixelcast preview bridge...");
    try {
      const response = await fetch(`/api/pixelcast/feed-preview?url=${encodeURIComponent(url)}`);
      const result = await response.json() as FetchResult & { error?: string };
      if (!response.ok) throw new Error(result.error ?? `Feed returned HTTP ${response.status}.`);
      const source = createSource(result.finalUrl);
      const parsed = parseSourcePayload(source, result.payload);
      if (parsed.length === 0) throw new Error("The feed contained no readable records.");
      const normalized = sortRecords(parsed, order);
      const capturedAt = result.fetchedAt || new Date().toISOString();
      const snapshotId = `${source.id}-${capturedAt}`;
      setFetchResult(result);
      setSnapshotIdentity({ id: snapshotId, sourceId: source.id, capturedAt });
      setRecords(normalized);
      setSelectedSourceId(source.id);
      setRecordIndex(0);
      setPreviewPageIndex(0);
      onSourceSnapshotSave(source, createSnapshot(source, normalized, capturedAt, snapshotId));
      setStatus(`Fetched and saved ${normalized.length} records for ${source.label}.`);
    } catch (error) {
      setRecords([]);
      setFetchResult(undefined);
      setStatus(error instanceof Error ? error.message : "Could not fetch feed.");
    } finally {
      setFetching(false);
    }
  }

  const fields = [
    ...(includeTitle ? ["title"] : []),
    ...(includeSummary ? ["summary"] : []),
    ...(includeBody ? ["body"] : [])
  ];
  const canImport = Boolean(
    preview
    && selectedRecord
    && operatorApproved
    && attribution.trim()
    && termsUrl.trim()
    && previewPages.length <= MAX_DISPLAY_SUBPAGES
  );

  return (
    <section className="feed-workbench" aria-label="Feed staging workspace">
      <h2>Data sources</h2>
      <p className="section-note">
        Maintain multiple sources, inspect their records, and bind each source to pages or live template slots.
      </p>

      {placedCarouselSubpages.length > 1 ? (
        <section className="feed-playback-control" aria-label="Current page carousel playback">
          <strong>Page {page.pageNumber} has a {placedCarouselSubpages.length}-subpage placed carousel</strong>
          <button
            className="feed-primary-button"
            onClick={() => onCarouselPlayingChange(!carouselPlaying)}
            type="button"
          >
            {carouselPlaying ? "Pause current page carousel" : "Play current page carousel"}
          </button>
          <p>Playback only: this does not place, replace or remove any page content.</p>
        </section>
      ) : null}

      <label>
        Source library
        <select aria-label="Data source" onChange={(event) => selectSource(event.target.value)} value={selectedSourceId}>
          <option value="new">+ New data source</option>
          {sources.map((source) => (
            <option key={source.id} value={source.id}>{source.label}</option>
          ))}
        </select>
      </label>

      {boundPages.length > 0 ? (
        <section className="data-source-bindings" aria-label="Pages bound to this source">
          <strong>Live page bindings</strong>
          <div>
            {boundPages.map(({ page: boundPage, binding }) => (
              <span className="data-source-binding-entry" key={binding.id}>
                <button onClick={() => selectTargetPage(boundPage.id)} type="button">
                  Open {boundPage.pageNumber} {boundPage.title}
                </button>
                <button
                  aria-label={`Disconnect ${sourceLabel} from page ${boundPage.pageNumber}`}
                  className="data-source-disconnect"
                  onClick={() => {
                    setPreviewOnCanvas(false);
                    onBindingRemove(boundPage.id, binding.id);
                  }}
                  type="button"
                >
                  Disconnect
                </button>
              </span>
            ))}
          </div>
        </section>
      ) : selectedSourceId !== "new" ? (
        <p className="section-note">This source is saved but is not yet bound to a live page slot.</p>
      ) : null}

      <label>
        Target page
        <select
          aria-label="Feed target page"
          onChange={(event) => selectTargetPage(event.target.value)}
          value={targetPageId}
        >
          <option value="">Not assigned (staging only)</option>
          {pages.map((candidatePage) => (
            <option key={candidatePage.id} value={candidatePage.id}>
              {candidatePage.pageNumber} {candidatePage.title}
            </option>
          ))}
        </select>
      </label>
      {!hasTargetPage ? (
        <p className="section-note">Source-only mode: saving and refreshing cannot change the canvas. Existing live bindings, if listed above, continue until you explicitly disconnect them.</p>
      ) : null}

      <div className="data-source-identity">
        <label>
          Source name
          <input aria-label="Source name" onChange={(event) => setSourceLabel(event.target.value)} value={sourceLabel} />
        </label>
        <label>
          Format
          <select aria-label="Source format" onChange={(event) => setSourceKind(event.target.value as ContentSourceKind)} value={sourceKind}>
            <option value="rss">RSS</option>
            <option value="atom">Atom</option>
            <option value="json">JSON</option>
            <option value="csv">CSV</option>
            <option value="text">Plain text</option>
          </select>
        </label>
      </div>
      <label>
        Source URL
        <input aria-label="Feed URL" onChange={(event) => setUrl(event.target.value)} type="url" value={url} />
      </label>

      <fieldset className="data-source-schedule">
        <legend>Refresh schedule</legend>
        <label className="feed-approval">
          <input
            aria-label="Source enabled"
            checked={sourceEnabled}
            onChange={(event) => changeSourceEnabled(event.target.checked)}
            type="checkbox"
          />
          Source enabled
        </label>
        <label>
          Mode
          <select aria-label="Refresh mode" onChange={(event) => setRefreshMode(event.target.value as typeof refreshMode)} value={refreshMode}>
            <option value="manual">Manual</option>
            <option value="on-export">Whenever Publisher runs</option>
            <option value="interval">Automatic interval</option>
          </select>
        </label>
        {refreshMode === "interval" ? (
          <label>
            Refresh every (minutes)
            <input aria-label="Refresh interval minutes" min={1} onChange={(event) => setRefreshMinutes(Math.max(1, Number(event.target.value) || 1))} type="number" value={refreshMinutes} />
          </label>
        ) : null}
        <label>
          Mark stale after (minutes)
          <input aria-label="Stale after minutes" min={1} onChange={(event) => setStaleMinutes(Math.max(1, Number(event.target.value) || 1))} type="number" value={staleMinutes} />
        </label>
        <p className={sourceEnabled && refreshMode === "interval" ? "feed-automation-on" : "section-note"} role="status">
          {!sourceEnabled
            ? "Automation is OFF. Existing live page bindings remain connected but will not refresh."
            : refreshMode === "interval"
              ? `Automation is ON while Pixelcast Studio is open. Bound pages refresh every ${refreshMinutes} minute${refreshMinutes === 1 ? "" : "s"}.`
              : refreshMode === "on-export"
                ? "Studio polling is off. Publisher refreshes this source whenever publish runs."
                : "Manual mode is selected. Use Fetch now when you want an update."}
        </p>
      </fieldset>

      <div className="data-source-actions">
        <button onClick={saveSourceDefinition} type="button">Save schedule and source</button>
        <button className="feed-primary-button" disabled={fetching || !url.trim()} onClick={() => void fetchFeed()} type="button">
          {fetching ? "Fetching..." : "Fetch now"}
        </button>
      </div>
      <p className="feed-status" role="status">{status}</p>

      <section className="feed-carousel-guide" aria-label="Story subpage carousel guide">
        <strong>Long stories become selectable subpages automatically</strong>
        <p>
          Fetch a story and choose its target area. If it needs more than one teletext screen,
          Pixelcast shows the exact subpage count before import.
        </p>
        <ol>
          <li>Preview the subpages and optionally set carousel timing.</li>
          <li>Create the selectable subpages inside the chosen area.</li>
          <li>Studio returns on 0001 paused. Select 0001, 0002… manually, or press Play carousel.</li>
        </ol>
      </section>

      {orderedRecords.length > 0 ? (
        <>
          <div className="feed-queue-header">
            <strong>Record {recordIndex + 1} of {orderedRecords.length}</strong>
            <select aria-label="Feed order" onChange={(event) => setOrder(event.target.value as typeof order)} value={order}>
              <option value="newest-first">Newest first</option>
              <option value="oldest-first">Oldest first (FIFO)</option>
            </select>
          </div>
          <select
            aria-label="Feed record"
            className="feed-record-select"
            onChange={(event) => setRecordIndex(Number(event.target.value))}
            size={5}
            value={recordIndex}
          >
            {orderedRecords.map((record, index) => (
              <option key={`${record.id}-${index}`} value={index}>{record.title || "Untitled record"}</option>
            ))}
          </select>
          <div className="feed-step-actions">
            <button disabled={recordIndex === 0} onClick={() => setRecordIndex((value) => value - 1)} type="button">Previous record</button>
            <button disabled={recordIndex >= orderedRecords.length - 1} onClick={() => setRecordIndex((value) => value + 1)} type="button">Next record</button>
          </div>

          <details className="feed-inspector" open>
            <summary>Normalized record</summary>
            <dl>
              <div><dt>Title</dt><dd>{selectedRecord?.title || "—"}</dd></div>
              <div><dt>Published</dt><dd>{selectedRecord?.publishedAt ? new Date(selectedRecord.publishedAt).toLocaleString() : "Not supplied"}</dd></div>
              <div><dt>Summary</dt><dd>{selectedRecord?.summary || "Not supplied"}</dd></div>
              <div><dt>Body</dt><dd>{selectedRecord?.body || "Not supplied"}</dd></div>
            </dl>
          </details>
          <details className="feed-inspector">
            <summary>Original response</summary>
            <pre>{fetchResult?.payload.slice(0, 6000)}</pre>
          </details>

          <fieldset className="feed-layout-fields">
            <legend>Teletext fit</legend>
            <label>
              Target area
              <select aria-label="Feed target area" onChange={(event) => setTargetKey(event.target.value)} value={targetKey}>
                <option value="scratch">
                  {hasTargetPage ? "New blank page frame (replaces target page)" : "Isolated staging canvas (18 × 39)"}
                </option>
                {hasTargetPage && rectangleSelection ? <option value="selection">Current page rectangle (with artwork)</option> : null}
                {regions.map((region) => (
                  <option key={region.id} value={targetKeyForRegion(region.id)}>{activeTemplate?.name}: {region.label}</option>
                ))}
              </select>
            </label>
            <button
              aria-pressed={previewOnCanvas}
              className={`feed-canvas-preview-toggle${previewOnCanvas ? "" : " feed-primary-button"}`}
              disabled={!selectedRecord}
              onClick={() => setPreviewOnCanvas((current) => !current)}
              type="button"
            >
              {previewOnCanvas
                ? `Canvas showing staging subpage ${previewPageIndex + 1}/${Math.max(1, previewPages.length)} · return to editable page`
                : `Show ${Math.max(1, previewPages.length)}-subpage staging carousel on main canvas`}
            </button>
            <p className="section-note">
              {previewOnCanvas
                ? "The main canvas now follows the staging carousel. This temporary preview is read-only."
                : "The small feed preview is isolated from the main canvas. Use the button above to inspect it full-size; bind or place it to make it part of the page."}
            </p>
            {selectedRegion ? (
              <p className="data-binding-target" role="status">
                Live binding target: page {page.pageNumber}, {selectedRegion.label}. Publisher refreshes will regenerate this slot.
              </p>
            ) : (
              <p className="section-note">
                Scratch and rectangle placement create a one-time page snapshot. Apply a template and choose one of its slots for ongoing automatic updates.
              </p>
            )}
            {hasTargetPage && targetKey === "scratch" ? (
              <label className="feed-destructive-confirmation">
                <input
                  checked={wholePageReplacementApproved}
                  onChange={(event) => setWholePageReplacementApproved(event.target.checked)}
                  type="checkbox"
                />
                Allow whole-page replacement. This removes the template artwork and is not a playback control.
              </label>
            ) : null}
            {previewBaseRows ? (
              <>
                <label className="feed-approval">
                  <input checked={protectArtwork} onChange={(event) => setProtectArtwork(event.target.checked)} type="checkbox" />
                  Protect leading mosaic artwork
                </label>
                <label>
                  Space after mosaic heading
                  <select aria-label="Space after mosaic heading" disabled={!protectArtwork} onChange={(event) => setHeaderGapRows(Number(event.target.value))} value={headerGapRows}>
                    <option value={0}>No blank row</option>
                    <option value={1}>1 blank row</option>
                    <option value={2}>2 blank rows</option>
                  </select>
                </label>
              </>
            ) : null}
            <label>
              Gap before attribution
              <select aria-label="Gap before attribution" onChange={(event) => setAttributionGapRows(Number(event.target.value))} value={attributionGapRows}>
                <option value={0}>No blank row</option>
                <option value={1}>1 blank row</option>
                <option value={2}>2 blank rows</option>
                <option value={3}>3 blank rows</option>
              </select>
            </label>
            {protectedLayout.protectedThroughRow !== undefined ? (
              <p className="feed-artwork-protection" role="status">
                Mosaic artwork protected through row {protectedLayout.protectedThroughRow}; feed starts on row {bounds.startRow}.
              </p>
            ) : previewBaseRows && protectArtwork ? (
              <p className="section-note">No leading mosaic cells were found inside this target.</p>
            ) : null}
            <label><input checked={includeTitle} onChange={(event) => setIncludeTitle(event.target.checked)} type="checkbox" /> Title</label>
            <label><input checked={includeSummary} onChange={(event) => setIncludeSummary(event.target.checked)} type="checkbox" /> Summary</label>
            <label><input checked={includeBody} onChange={(event) => setIncludeBody(event.target.checked)} type="checkbox" /> Body</label>
            {preview ? (
              <section
                aria-label="Story page result"
                className={preview.pageCount > 1 ? "feed-carousel-result" : "feed-single-page-result"}
              >
                <strong>
                  {preview.pageCount > 1
                    ? `Result: ${preview.pageCount} selectable subpages`
                    : "Result: one teletext page"}
                </strong>
                <span>
                  {preview.usedRows}/{preview.capacityRows} rows used
                  {preview.unsupportedCharacterCount ? ` · ${preview.unsupportedCharacterCount} characters replaced` : " · Level 1 clean"}
                </span>
                {preview.pageCount > 1 ? (
                  <span>
                    Placement adds subpages 0001–{preview.pageCount.toString().padStart(4, "0")} beneath page {page.pageNumber}.
                  </span>
                ) : (
                  <span>It will not carousel unless the selected content exceeds this target area.</span>
                )}
              </section>
            ) : null}
            {preview && preview.pageCount > 1 ? (
              <>
                <label className="feed-approval">
                  <input checked={autoPlayCarousel} onChange={(event) => setAutoPlayCarousel(event.target.checked)} type="checkbox" />
                  Auto-play this preview
                </label>
                <label>
                  Carousel seconds per subpage
                  <input
                    aria-label="Seconds per story subpage"
                    max={30}
                    min={2}
                    onChange={(event) => setCarouselDelaySeconds(Math.max(2, Math.min(30, Number(event.target.value) || 8)))}
                    type="number"
                    value={carouselDelaySeconds}
                  />
                </label>
                <div className="feed-step-actions">
                  <button disabled={previewPageIndex === 0} onClick={() => setPreviewPageIndex((value) => value - 1)} type="button">Previous subpage</button>
                  <span>{previewPageIndex + 1}/{preview.pageCount}</span>
                  <button disabled={previewPageIndex >= preview.pageCount - 1} onClick={() => setPreviewPageIndex((value) => value + 1)} type="button">Next subpage</button>
                </div>
                <p className="section-note">
                  This timing is used only after you press Play carousel. Static artwork outside the target remains the same on every subpage.
                </p>
              </>
            ) : null}
            {previewPages.length > MAX_DISPLAY_SUBPAGES ? (
              <p className="feed-fit-warning">This story exceeds the ETSI display-page limit of {MAX_DISPLAY_SUBPAGES} subpages.</p>
            ) : null}
          </fieldset>

          <fieldset className="feed-rights-fields">
            <legend>Source and rights</legend>
            <label>Provider<input onChange={(event) => setProvider(event.target.value)} value={provider} /></label>
            <label>Visible attribution<input onChange={(event) => setAttribution(event.target.value)} value={attribution} /></label>
            <label>Terms URL<input onChange={(event) => setTermsUrl(event.target.value)} type="url" value={termsUrl} /></label>
            <label className="feed-approval"><input checked={operatorApproved} onChange={(event) => setOperatorApproved(event.target.checked)} type="checkbox" /> I have reviewed and approve this source for the intended use.</label>
          </fieldset>

          <div className="feed-import-actions">
            <button
              className={targetKey === "scratch" ? "feed-destructive-button" : undefined}
              disabled={!canImport || !hasTargetPage || (targetKey === "scratch" && !wholePageReplacementApproved)}
              onClick={() => {
                if (!preview) return;
                if (targetKey === "scratch" && !window.confirm(
                  `Replace every subpage of page ${page.pageNumber} with this feed snapshot? Existing page artwork and text will be replaced.`
                )) return;
                const source = createSource();
                onPlaceSnapshot(
                  source,
                  createSnapshot(source),
                  previewPages.map((pagePreview) => pagePreview.rows),
                  carouselDelaySeconds
                );
              }}
              type="button"
            >
              {previewPages.length > 1
                ? targetKey === "scratch"
                  ? `Replace ENTIRE page with ${previewPages.length} selectable subpages`
                  : `Create ${previewPages.length} selectable subpages inside selected area`
                : targetKey === "scratch"
                  ? "Replace ENTIRE page with snapshot"
                  : "Place snapshot inside selected area"}
            </button>
            <button
              disabled={!canImport || !hasTargetPage || !selectedRegion}
              onClick={() => {
                if (!selectedRegion) return;
                const source = createSource();
                onBindToSlot(
                  source,
                  createSnapshot(source),
                  selectedRegion.id,
                  fields,
                  bounds,
                  attributionGapRows
                );
              }}
              type="button"
            >
              Bind source live to page {page.pageNumber}
            </button>
          </div>
          {!operatorApproved ? <p className="section-note">Preview is allowed; import remains blocked until source rights and attribution are approved.</p> : null}
          {!hasTargetPage ? <p className="section-note">Assign a target page before placing a snapshot or creating a live binding.</p> : null}
          {!selectedRegion ? <p className="section-note">To create a live binding, apply a template with a compatible dynamic slot and choose it above.</p> : null}
        </>
      ) : null}
    </section>
  );
}
