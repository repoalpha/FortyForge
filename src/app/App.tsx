import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import { PageNavigator } from "./components/PageNavigator";
import {
  ReferenceImagePanel,
  type ReferenceGridAlignment,
  type ReferenceGridCalibration,
  type ReferenceInteractionMode,
  type ReferenceZoom
} from "./components/ReferenceImagePanel";
import { TeletextCanvas } from "./components/TeletextCanvas";
import type { FeedWorkspaceState } from "./components/FeedWorkbench";
import {
  automaticBoundSourceIdsDue,
  fetchStudioSource,
  STUDIO_AUTOMATION_CHECK_INTERVAL_MS
} from "./feedAutomation";
import { TemplateLibrary } from "./components/TemplateLibrary";
import { ContentSourcesPanel } from "./components/ContentSourcesPanel";
import {
  ToolDock,
  type G3LinePaintMode,
  type MosaicPaintMode,
  type TraceCalibrationPosition,
  type TraceDockStatus
} from "./components/ToolDock";
import { ValidationPanel } from "./components/ValidationPanel";
import {
  createCalibratedTraceGrid,
  detectEdgeAssistedTraceGrid,
  scanTeletextScreenshot,
  type TraceCellHint,
  type TraceCellHintKind,
  type TraceGrid,
  type TraceGridBounds,
  type TraceImageData
} from "./importTrace/screenshotTrace";
import {
  addPageCommand,
  addSubpageCommand,
  addTemplateRegionCommand,
  applyEditorCommand,
  applyTemplateCommand,
  composeExportRows,
  compilePageContent,
  createCitynewsCompactMastheadAlphabet,
  createCitynewsMastheadAlphabet,
  createEditorHistory,
  clearRowCommand,
  clearCellRectangleCommand,
  copyCellsFromRectangle,
  deleteCustomTemplateCommand,
  deleteCellWithRowShiftCommand,
  displaySubpageSubcode,
  editMosaicSixelCommand,
  exportNativeProject,
  exportTemplatePackage,
  exportTemplateLibrary,
  exportTti,
  getControlCodeByByte,
  importNativeProject,
  importTemplatePackage,
  importTemplateLibrary,
  insertBlankSpacerWithRowShiftCommand,
  insertBackgroundColourWithRowShiftCommand,
  insertControlCodeWithRowShiftCommand,
  insertCharacterByteCommand,
  insertTextCommand,
  paintMosaicCommand,
  paintCellBackgroundCommand,
  paintG3LineCommand,
  parseSourcePayload,
  removeContentBindingCommand,
  replaceG3LineCells,
  replacePageWithCarouselCommand,
  replaceSubpageRowsCommand,
  saveCellBlockAsArtworkCommand,
  saveCurrentPageAsTemplateCommand,
  setPageCarouselEnabledCommand,
  setMosaicForegroundCommand,
  setPageHeaderClockModeCommand,
  stampCellBlockCommand,
  stampMosaicTextCommand,
  storeContentSnapshotCommand,
  upsertContentSourceCommand,
  upsertTemplateCommand
} from "../core";
import {
  commitEditorHistory,
  createEditorViewModel,
  createInitialEditorHistory,
  redoEditorHistory,
  undoEditorHistory
} from "./state/editorStore";
import type { CellSelection } from "./state/editorStore";
import type { EditorTool } from "./components/TeletextCanvas";
import type { TeletextPreviewProfileId } from "./preview/teletextViewport";
import type {
  CellBlock,
  CellRectangle,
  ContentBinding,
  ContentSnapshot,
  ContentSource,
  EditorCommand,
  EditorHistory,
  G3LineCell,
  G3LineCode,
  MosaicAlphabet,
  PageHeaderSettings,
  Project,
  TeletextColourRef,
  TeletextFontProfileId,
  TeletextRow,
  Template,
  TemplateRegion
} from "../core";

type LayoutMode = "studio" | "playout";
const LOCAL_PROJECT_KEY = "pixelcast.currentProject";
const LEGACY_LOCAL_PROJECT_KEY = "fortyforge.currentProject";
const TEMPLATE_LIBRARY_KEY = "pixelcast.templateLibrary";
const RECEIVER_FONT_PROFILE_KEY = "pixelcast.receiverFontProfile";
const LEGACY_RECEIVER_FONT_PROFILE_KEY = "fortyforge.receiverFontProfile";
const RECEIVER_FONT_PROFILE_IDS: readonly TeletextFontProfileId[] = [
  "ets-1990s",
  "saa5050-classic",
  "tdatext-later"
];
const ILLEGAL_DOUBLE_HEIGHT_ROWS = new Set([0, 24]);
const DEFAULT_REFERENCE_PANEL_WIDTH = 460;
const MIN_REFERENCE_PANEL_WIDTH = 280;
const MAX_REFERENCE_PANEL_WIDTH = 760;
const INITIAL_TRACE_STATUS: TraceDockStatus = {
  state: "idle",
  message: "Load a screenshot as a side-by-side reference.",
  warnings: []
};
const DEFAULT_TRACE_GRID_ALIGNMENT: ReferenceGridAlignment = {
  bottomPercent: 0,
  leftPercent: 0,
  rightPercent: 0,
  topPercent: 0
};
const DEFAULT_TRACE_GRID_CALIBRATION: ReferenceGridCalibration = {
  xAnchors: [],
  yAnchors: []
};
const DEFAULT_TRACE_CALIBRATION_POSITION: TraceCalibrationPosition = {
  xPercent: 0,
  yPercent: 0
};
const BUILT_IN_MASTHEAD_ALPHABET_IDS = new Set([
  "citynews-masthead-alphabet",
  "citynews-compact-masthead"
]);

interface TraceReferenceImage {
  file: File;
  name: string;
  url: string;
}

interface ReferencePanelResizeDrag {
  startWidth: number;
  startX: number;
}

function clampReferencePanelWidth(width: number) {
  return Math.min(MAX_REFERENCE_PANEL_WIDTH, Math.max(MIN_REFERENCE_PANEL_WIDTH, width));
}

function currentBuiltInMastheadAlphabets(): MosaicAlphabet[] {
  return [
    createCitynewsMastheadAlphabet(),
    createCitynewsCompactMastheadAlphabet()
  ];
}

function alphabetMatches(left: MosaicAlphabet, right: MosaicAlphabet) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function refreshBuiltInMastheadAlphabets(project: Project): Project {
  const currentAlphabets = currentBuiltInMastheadAlphabets();
  const existingBuiltIns = project.mosaicAlphabets.filter((alphabet) =>
    BUILT_IN_MASTHEAD_ALPHABET_IDS.has(alphabet.id)
  );
  const isCurrent = currentAlphabets.length === existingBuiltIns.length
    && currentAlphabets.every((alphabet) => {
      const existing = existingBuiltIns.find((item) => item.id === alphabet.id);

      return existing ? alphabetMatches(existing, alphabet) : false;
    });

  if (isCurrent) {
    return project;
  }

  return {
    ...project,
    mosaicAlphabets: [
      ...project.mosaicAlphabets.filter((alphabet) =>
        !BUILT_IN_MASTHEAD_ALPHABET_IDS.has(alphabet.id)
      ),
      ...currentAlphabets
    ]
  };
}

function refreshHistoryBuiltInMastheadAlphabets(history: EditorHistory): EditorHistory {
  const past = history.past.map(refreshBuiltInMastheadAlphabets);
  const present = refreshBuiltInMastheadAlphabets(history.present);
  const future = history.future.map(refreshBuiltInMastheadAlphabets);
  const pastIsCurrent = past.every((project, index) => project === history.past[index]);
  const futureIsCurrent = future.every((project, index) => project === history.future[index]);

  if (pastIsCurrent && present === history.present && futureIsCurrent) {
    return history;
  }

  return {
    past,
    present,
    future
  };
}

function traceCellLeftPercent(selection: CellSelection, alignment: ReferenceGridAlignment) {
  const widthPercent = 100 - alignment.leftPercent - alignment.rightPercent;

  return alignment.leftPercent + ((selection.column / 40) * widthPercent);
}

function traceCellTopPercent(selection: CellSelection, alignment: ReferenceGridAlignment) {
  const heightPercent = 100 - alignment.topPercent - alignment.bottomPercent;

  return alignment.topPercent + ((selection.rowIndex / 25) * heightPercent);
}

function mergeStoredTemplates(project: Project, projectText?: string) {
  const storedLibrary = window.localStorage.getItem(TEMPLATE_LIBRARY_KEY);
  const templates = [
    ...(storedLibrary ? importTemplateLibrary(storedLibrary) : []),
    ...(projectText ? importTemplateLibrary(projectText) : []),
    ...project.templates
  ];
  const byId = new Map(templates.map((template) => [template.id, template]));
  const next = structuredClone(project) as Project;
  next.templates = [...byId.values()];
  return next;
}

interface BrowserPersistenceResult {
  ok: boolean;
  bytes: number;
}

function tryWriteBrowserStorage(key: string, value: string): BrowserPersistenceResult {
  try {
    window.localStorage.setItem(key, value);
    return { ok: true, bytes: new Blob([value]).size };
  } catch {
    return { ok: false, bytes: new Blob([value]).size };
  }
}

function createBrowserAutosaveProject(project: Project): Project {
  const compact = structuredClone(project) as Project;
  const retainedSnapshotIds = new Set<string>();

  compact.contentSources.forEach((source) => {
    compact.contentSnapshots
      .filter((snapshot) => snapshot.sourceId === source.id)
      .sort((left, right) => right.capturedAt.localeCompare(left.capturedAt))
      .slice(0, 2)
      .forEach((snapshot) => retainedSnapshotIds.add(snapshot.id));
  });
  compact.contentSnapshots = compact.contentSnapshots.filter((snapshot) =>
    retainedSnapshotIds.has(snapshot.id)
  );

  // Templates have their own independently recoverable browser library. Keeping
  // another full cell-by-cell copy inside the autosaved project can double the
  // storage footprint and exhaust the browser quota.
  compact.templates = [];
  return compact;
}

function persistProjectLocally(project: Project) {
  return tryWriteBrowserStorage(
    LOCAL_PROJECT_KEY,
    exportNativeProject(createBrowserAutosaveProject(project))
  );
}

function persistTemplateLibrary(project: Project) {
  return tryWriteBrowserStorage(TEMPLATE_LIBRARY_KEY, exportTemplateLibrary(project.templates));
}

function browserStorageWarning(action: string, bytes: number) {
  const megabytes = (bytes / (1024 * 1024)).toFixed(1);
  return `${action} in this session, but browser autosave is full (${megabytes} MB project). Download the project to disk before refreshing.`;
}

function loadInitialHistory() {
  const savedProject = window.localStorage.getItem(LOCAL_PROJECT_KEY)
    ?? window.localStorage.getItem(LEGACY_LOCAL_PROJECT_KEY);
  let project = createInitialEditorHistory().present;
  try {
    if (savedProject) {
      project = importNativeProject(savedProject);
    }
  } catch {
    // A damaged project must not make the independent template library unavailable.
  }

  project = mergeStoredTemplates(project, savedProject ?? undefined);
  if (project.mosaicAlphabets.some((alphabet) => alphabet.id === "dev-pixelcast-alphabet")) {
    project.mosaicAlphabets = [];
  }
  project = refreshBuiltInMastheadAlphabets(project);

  persistProjectLocally(project);
  try {
    window.localStorage.removeItem(LEGACY_LOCAL_PROJECT_KEY);
  } catch {
    // A full or unavailable browser store must not prevent Studio from opening.
  }
  persistTemplateLibrary(project);

  return createEditorHistory(project);
}

function loadReceiverFontProfile(): TeletextFontProfileId {
  try {
    const savedProfile = window.localStorage.getItem(RECEIVER_FONT_PROFILE_KEY)
      ?? window.localStorage.getItem(LEGACY_RECEIVER_FONT_PROFILE_KEY);

    if (savedProfile) {
      window.localStorage.setItem(RECEIVER_FONT_PROFILE_KEY, savedProfile);
      window.localStorage.removeItem(LEGACY_RECEIVER_FONT_PROFILE_KEY);
    }

    return RECEIVER_FONT_PROFILE_IDS.includes(savedProfile as TeletextFontProfileId)
      ? savedProfile as TeletextFontProfileId
      : "ets-1990s";
  } catch {
    return "ets-1990s";
  }
}

function downloadTextFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function downloadBinaryFile(filename: string, content: Uint8Array, type: string) {
  const blob = new Blob([new Uint8Array(content)], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function templateFilename(template: Template) {
  const name = template.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "template";
  return `${name}-v${template.templateVersion}.pixelcast-template`;
}

function loadHtmlImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();

    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load screenshot image."));
    image.src = url;
  });
}

async function imageDataFromFile(file: File): Promise<TraceImageData> {
  const url = URL.createObjectURL(file);
  let source: CanvasImageSource;
  let closeSource: (() => void) | undefined;

  try {
    if ("createImageBitmap" in window) {
      const bitmap = await window.createImageBitmap(file);
      source = bitmap;
      closeSource = () => bitmap.close();
    } else {
      source = await loadHtmlImage(url);
    }

    const width = Number("width" in source ? source.width : 0);
    const height = Number("height" in source ? source.height : 0);
    const canvas = document.createElement("canvas");

    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Could not create an image-analysis canvas.");
    }

    context.drawImage(source, 0, 0, width, height);

    const imageData = context.getImageData(0, 0, width, height);

    return {
      width,
      height,
      data: imageData.data
    };
  } finally {
    closeSource?.();
    URL.revokeObjectURL(url);
  }
}

function importTraceRowsCommand(
  serviceId: string,
  pageId: string,
  subpageId: string,
  rows: TeletextRow[],
  g3LineCells: G3LineCell[] = []
): EditorCommand {
  const replaceRows = replaceSubpageRowsCommand(serviceId, pageId, subpageId, rows);
  const useOriginalHeader = setPageHeaderClockModeCommand(serviceId, pageId, "original");
  const disableCarousel = setPageCarouselEnabledCommand(serviceId, pageId, false);

  return {
    id: "import-trace-rows",
    label: "Import trace rows",
    apply(project) {
      const withRows = replaceRows.apply(project);

      if (withRows !== project) {
        const service = withRows.services.find((item) => item.id === serviceId);
        const page = service?.pages.find((item) => item.id === pageId);
        const subpage = page?.subpages.find((item) => item.id === subpageId);

        if (subpage) {
          subpage.enhancementPackets = replaceG3LineCells(
            subpage.enhancementPackets,
            g3LineCells
          );
        }
      }

      if (withRows === project) return project;
      return disableCarousel.apply(useOriginalHeader.apply(withRows));
    }
  };
}

function traceGridBoundsFromAlignment(
  imageData: TraceImageData,
  alignment: ReferenceGridAlignment
): TraceGridBounds {
  return {
    left: (imageData.width * alignment.leftPercent) / 100,
    top: (imageData.height * alignment.topPercent) / 100,
    right: imageData.width - ((imageData.width * alignment.rightPercent) / 100),
    bottom: imageData.height - ((imageData.height * alignment.bottomPercent) / 100)
  };
}

function traceGridLineAnchorsFromEdges(
  grid: TraceGrid,
  bounds: TraceGridBounds,
  imageData: TraceImageData
): ReferenceGridCalibration {
  const xAnchors = (grid.xLines ?? [])
    .slice(1, -1)
    .map((position, index) => ({
      lineIndex: index + 1,
      position
    }))
    .filter((anchor) => {
      const expected = bounds.left + ((bounds.right - bounds.left) * anchor.lineIndex) / 40;

      return Math.abs(anchor.position - expected) >= 0.5;
    })
    .map((anchor) => ({
      lineIndex: anchor.lineIndex,
      percent: Number(((anchor.position / imageData.width) * 100).toFixed(3))
    }));
  const yAnchors = (grid.yLines ?? [])
    .slice(1, -1)
    .map((position, index) => ({
      lineIndex: index + 1,
      position
    }))
    .filter((anchor) => {
      const expected = bounds.top + ((bounds.bottom - bounds.top) * anchor.lineIndex) / 25;

      return Math.abs(anchor.position - expected) >= 0.5;
    })
    .map((anchor) => ({
      lineIndex: anchor.lineIndex,
      percent: Number(((anchor.position / imageData.height) * 100).toFixed(3))
    }));

  return {
    xAnchors,
    yAnchors
  };
}

export function App() {
  const [history, setHistory] = useState(loadInitialHistory);
  const [receiverFontProfileId, setReceiverFontProfileId] =
    useState<TeletextFontProfileId>(loadReceiverFontProfile);
  const [selection, setSelection] = useState<CellSelection | undefined>();
  const [rectangleSelection, setRectangleSelection] = useState<CellRectangle | undefined>();
  const [blockClipboard, setBlockClipboard] = useState<CellBlock | undefined>();
  const [blockPreviewTarget, setBlockPreviewTarget] = useState<CellSelection | undefined>();
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("studio");
  const [previewProfileId, setPreviewProfileId] =
    useState<TeletextPreviewProfileId>("studio-large");
  const [animateFlash, setAnimateFlash] = useState(true);
  const [revealConcealed, setRevealConcealed] = useState(false);
  const [activeTool, setActiveTool] = useState<EditorTool>("text");
  const [traceStatus, setTraceStatus] = useState<TraceDockStatus>(INITIAL_TRACE_STATUS);
  const [traceReferenceImage, setTraceReferenceImage] = useState<TraceReferenceImage | undefined>();
  const [traceReferenceGridVisible, setTraceReferenceGridVisible] = useState(true);
  const [traceGridAlignment, setTraceGridAlignment] =
    useState<ReferenceGridAlignment>(DEFAULT_TRACE_GRID_ALIGNMENT);
  const [traceGridCalibration, setTraceGridCalibration] =
    useState<ReferenceGridCalibration>(DEFAULT_TRACE_GRID_CALIBRATION);
  const [traceCalibrationPosition, setTraceCalibrationPosition] =
    useState<TraceCalibrationPosition>(DEFAULT_TRACE_CALIBRATION_POSITION);
  const [traceCellHints, setTraceCellHints] = useState<TraceCellHint[]>([]);
  const [traceSelectedCell, setTraceSelectedCell] = useState<CellSelection | undefined>();
  const [traceReferenceInteractionMode, setTraceReferenceInteractionMode] =
    useState<ReferenceInteractionMode>("tag-cells");
  const [traceReferenceZoom, setTraceReferenceZoom] = useState<ReferenceZoom>("fit");
  const [traceReferencePanelWidth, setTraceReferencePanelWidth] =
    useState(DEFAULT_REFERENCE_PANEL_WIDTH);
  const [referencePanelResizeDrag, setReferencePanelResizeDrag] =
    useState<ReferencePanelResizeDrag | undefined>();
  const [mosaicPaintMode, setMosaicPaintMode] =
    useState<MosaicPaintMode>({ kind: "inactive" });
  const [linePaintMode, setLinePaintMode] = useState<G3LinePaintMode>({
    code: 0x51,
    level1Fallback: true
  });
  const [mosaicForeground, setMosaicForeground] =
    useState<TeletextColourRef>({ palette: "level1", index: 7 });
  const [clockNow, setClockNow] = useState(() => new Date());
  const [saveMessage, setSaveMessage] = useState("Not saved");
  const [activePageId, setActivePageId] = useState<string | undefined>();
  const [activeSubpageId, setActiveSubpageId] = useState<string | undefined>();
  const [generatedPreviewIndex, setGeneratedPreviewIndex] = useState<number | undefined>();
  const [feedWorkspace, setFeedWorkspace] = useState<FeedWorkspaceState | undefined>();
  const [carouselPlaying, setCarouselPlaying] = useState(false);
  const currentProjectRef = useRef(history.present);
  const automaticRefreshInFlightRef = useRef(new Set<string>());
  const editor = useMemo(
    () => createEditorViewModel(history.present, activePageId, activeSubpageId),
    [activePageId, activeSubpageId, history.present]
  );
  const generatedPreviews = useMemo(
    () => compilePageContent(editor.project, editor.page),
    [editor.page, editor.project]
  );
  const generatedPreview = generatedPreviewIndex === undefined
    ? undefined
    : generatedPreviews[Math.min(generatedPreviewIndex, generatedPreviews.length - 1)];
  const previewSubpage = generatedPreview
    ? {
        ...editor.subpage,
        subcode: generatedPreview.subcode,
        rows: generatedPreview.rows,
        enhancementPackets: generatedPreview.enhancementPackets
      }
    : editor.subpage;
  const displayRows = useMemo(
    () => composeExportRows(editor.page, previewSubpage, clockNow),
    [clockNow, editor.page, previewSubpage]
  );
  const carouselSubpages = useMemo(
    () => editor.page.subpages.filter((subpage) => subpage.carousel.enabled),
    [editor.page.subpages]
  );
  const carouselPosition = carouselSubpages.findIndex((subpage) => subpage.id === editor.subpage.id);

  useEffect(() => {
    setGeneratedPreviewIndex(editor.page.contentBindings.length > 0 ? 0 : undefined);
  }, [editor.page.id]);

  useEffect(() => {
    currentProjectRef.current = history.present;
  }, [history.present]);

  useEffect(() => {
    let disposed = false;

    async function refreshSource(sourceId: string) {
      if (automaticRefreshInFlightRef.current.has(sourceId)) return;
      const source = currentProjectRef.current.contentSources.find((item) => item.id === sourceId);
      if (!source) return;
      automaticRefreshInFlightRef.current.add(sourceId);
      const capturedAt = new Date();
      let snapshot: ContentSnapshot;

      try {
        const result = await fetchStudioSource(source);
        const records = parseSourcePayload(source, result.payload);
        if (records.length === 0) throw new Error("The source contained no readable records.");
        snapshot = {
          id: `${source.id}-${capturedAt.getTime()}`,
          sourceId: source.id,
          capturedAt: result.fetchedAt || capturedAt.toISOString(),
          status: "ok",
          records,
          attributionText: source.policy.attributionText || undefined,
          sourceUri: result.finalUrl || source.uri
        };
      } catch (error) {
        snapshot = {
          id: `${source.id}-${capturedAt.getTime()}-error`,
          sourceId: source.id,
          capturedAt: capturedAt.toISOString(),
          status: "error",
          records: [],
          errorMessage: error instanceof Error ? error.message : "Automatic refresh failed.",
          attributionText: source.policy.attributionText || undefined,
          sourceUri: source.uri
        };
      }

      if (!disposed) {
        setHistory((currentHistory) => {
          const currentSource = currentHistory.present.contentSources.find((item) => item.id === sourceId);
          const stillBound = currentHistory.present.services.some((service) =>
            service.pages.some((page) => page.contentBindings.some((binding) => binding.sourceId === sourceId))
          );
          if (
            !currentSource
            || !currentSource.enabled
            || currentSource.refreshPolicy.mode !== "interval"
            || !stillBound
          ) {
            return currentHistory;
          }
          const nextProject = storeContentSnapshotCommand(currentSource, snapshot).apply(currentHistory.present);
          if (nextProject === currentHistory.present) return currentHistory;
          const persistence = persistProjectLocally(nextProject);
          if (!persistence.ok) {
            window.setTimeout(() => setSaveMessage(
              browserStorageWarning(`Refreshed ${source.label}`, persistence.bytes)
            ), 0);
          }
          return {
            past: currentHistory.past,
            present: nextProject,
            future: []
          };
        });
        setSaveMessage(snapshot.status === "ok"
          ? `Automatically refreshed ${source.label}`
          : `Automatic refresh failed for ${source.label}: ${snapshot.errorMessage}`);
      }
      automaticRefreshInFlightRef.current.delete(sourceId);
    }

    function refreshDueSources() {
      const dueSourceIds = automaticBoundSourceIdsDue(currentProjectRef.current, new Date());
      dueSourceIds.forEach((sourceId) => void refreshSource(sourceId));
    }

    refreshDueSources();
    const timer = window.setInterval(refreshDueSources, STUDIO_AUTOMATION_CHECK_INTERVAL_MS);

    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (activeTool === "import-trace") setCarouselPlaying(false);
  }, [activeTool]);

  useEffect(() => {
    setHistory((currentHistory) =>
      refreshHistoryBuiltInMastheadAlphabets(currentHistory)
    );
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(new Date()), 1000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (
      !carouselPlaying
      || carouselSubpages.length < 2
      || feedWorkspace
      || generatedPreviewIndex !== undefined
    ) {
      return undefined;
    }

    const currentIndex = carouselPosition >= 0 ? carouselPosition : 0;
    const current = carouselSubpages[currentIndex];
    const timer = window.setTimeout(() => {
      const next = carouselSubpages[(currentIndex + 1) % carouselSubpages.length];
      setActiveSubpageId(next.id);
      setSelection(undefined);
      setRectangleSelection(undefined);
    }, current.carousel.delaySeconds * 1000);

    return () => window.clearTimeout(timer);
  }, [
    carouselPlaying,
    carouselPosition,
    carouselSubpages,
    feedWorkspace,
    generatedPreviewIndex
  ]);

  useEffect(() => {
    if (
      !carouselPlaying
      || generatedPreviewIndex === undefined
      || generatedPreviews.length < 2
      || feedWorkspace
    ) {
      return undefined;
    }

    const delaySeconds = Math.max(2, editor.subpage.carousel.delaySeconds || 8);
    const timer = window.setTimeout(() => {
      setGeneratedPreviewIndex((current) =>
        current === undefined ? 0 : (current + 1) % generatedPreviews.length
      );
      setSelection(undefined);
      setRectangleSelection(undefined);
    }, delaySeconds * 1000);

    return () => window.clearTimeout(timer);
  }, [
    carouselPlaying,
    editor.subpage.carousel.delaySeconds,
    feedWorkspace,
    generatedPreviewIndex,
    generatedPreviews.length
  ]);

  useEffect(() => () => {
    if (traceReferenceImage) {
      URL.revokeObjectURL(traceReferenceImage.url);
    }
  }, [traceReferenceImage]);

  useEffect(() => {
    if (!referencePanelResizeDrag) {
      return undefined;
    }

    const activeDrag = referencePanelResizeDrag;

    function handlePointerMove(event: PointerEvent) {
      setTraceReferencePanelWidth(
        clampReferencePanelWidth(
          activeDrag.startWidth + activeDrag.startX - event.clientX
        )
      );
    }

    function handlePointerUp() {
      setReferencePanelResizeDrag(undefined);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [referencePanelResizeDrag]);

  useEffect(() => {
    if (activeTool !== "blocks") {
      return undefined;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      setRectangleSelection(undefined);
      setBlockPreviewTarget(undefined);
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTool]);

  function commitTemplate(templateId: string) {
    setHistory((currentHistory) =>
      commitEditorHistory(
        currentHistory,
        applyTemplateCommand(editor.service.id, editor.page.id, templateId)
      )
    );
  }

  function deleteTemplate(templateId: string) {
    setHistory((currentHistory) => {
      const template = currentHistory.present.templates.find((item) => item.id === templateId);

      if (!template) {
        return currentHistory;
      }

      const nextHistory = commitEditorHistory(
        currentHistory,
        deleteCustomTemplateCommand(templateId)
      );

      persistProjectLocally(nextHistory.present);
      persistTemplateLibrary(nextHistory.present);
      setSaveMessage(`Deleted ${template.name}`);

      return nextHistory;
    });
  }

  function addTemplateRegion(templateId: string, region: TemplateRegion) {
    setHistory((currentHistory) => {
      const nextHistory = commitEditorHistory(
        currentHistory,
        addTemplateRegionCommand(templateId, region)
      );
      persistProjectLocally(nextHistory.present);
      persistTemplateLibrary(nextHistory.present);
      return nextHistory;
    });
    setSaveMessage(`Added ${region.label} slot`);
  }

  function placeFeedSnapshot(
    source: ContentSource,
    snapshot: ContentSnapshot,
    frames: TeletextRow[][],
    delaySeconds: number
  ) {
    const replace = replacePageWithCarouselCommand(
      editor.service.id,
      editor.page.id,
      frames,
      delaySeconds,
      editor.subpage.id
    );
    const store = storeContentSnapshotCommand(source, snapshot);
    const command: EditorCommand = {
      id: "place-feed-snapshot",
      label: "Place feed snapshot",
      apply(project) {
        const replaced = replace.apply(project);
        return replaced === project ? project : store.apply(replaced);
      }
    };

    setHistory((currentHistory) => {
      const nextHistory = commitEditorHistory(currentHistory, command);
      const persistence = persistProjectLocally(nextHistory.present);
      if (!persistence.ok) {
        window.setTimeout(() => setSaveMessage(
          browserStorageWarning(`Placed ${source.label}`, persistence.bytes)
        ), 0);
      }
      return nextHistory;
    });
    const firstSubcode = displaySubpageSubcode(0, frames.length);
    setActiveSubpageId(`${editor.page.id}-subpage-${firstSubcode}`);
    setCarouselPlaying(false);
    setSelection(undefined);
    setRectangleSelection(undefined);
    setSaveMessage(frames.length > 1
      ? `Placed ${source.label} as ${frames.length} selectable subpages on page ${editor.page.pageNumber}. Press Play carousel when you want automatic rotation.`
      : `Placed ${source.label} snapshot in page ${editor.page.pageNumber}`);
  }

  function bindFeedToSlot(
    source: ContentSource,
    snapshot: ContentSnapshot,
    templateRegionId: string,
    fields: string[],
    bounds: CellRectangle,
    attributionGapRows: number
  ) {
    const template = editor.templates.find((item) => item.id === editor.page.metadata.templateId);
    const region = template?.regions.find((item) => item.id === templateRegionId);
    if (!template || !region) {
      setSaveMessage("Apply a template with a compatible content slot before binding the feed.");
      return;
    }

    const binding: ContentBinding = {
      id: `binding-${editor.page.id}-${templateRegionId}`,
      sourceId: source.id,
      templateRegionId,
      targetPageId: editor.page.id,
      targetSubpageId: editor.subpage.id,
      transform: {
        maxItems: 1,
        fields: fields.map((sourceField) => ({
          sourceField,
          maxChars: 4000,
          includeWhenEmpty: false
        })),
        sort: "newest-first",
        textCase: "preserve",
        controlStyle: "region-default",
        overflowPolicy: region.overflowPolicy,
        attributionGapRows
      },
      policy: {
        approval: "manual",
        staleAfterSeconds: source.refreshPolicy.staleAfterSeconds,
        allowStale: source.cachePolicy.allowStaleOnError,
        onFailure: source.cachePolicy.allowStaleOnError ? "keep-last-valid" : "reject-publication"
      }
    };

    const store = storeContentSnapshotCommand(source, snapshot, binding);
    const command: EditorCommand = {
      id: "bind-feed-to-protected-slot",
      label: "Bind feed to protected template slot",
      apply(project) {
        const next = store.apply(project);
        if (next === project) return project;
        const storedTemplate = next.templates.find((item) => item.id === template.id);
        const storedRegion = storedTemplate?.regions.find((item) => item.id === templateRegionId);
        if (storedTemplate && storedRegion && JSON.stringify(storedRegion.bounds) !== JSON.stringify(bounds)) {
          storedRegion.bounds = structuredClone(bounds);
          const [major, minor, patch = "0"] = storedTemplate.templateVersion.split(".");
          storedTemplate.templateVersion = `${major}.${minor}.${Number(patch) + 1}`;
        }
        return next;
      }
    };

    setHistory((currentHistory) => {
      const nextHistory = commitEditorHistory(currentHistory, command);
      const persistence = persistProjectLocally(nextHistory.present);
      if (!persistence.ok) {
        window.setTimeout(() => setSaveMessage(
          browserStorageWarning(`Bound ${source.label}`, persistence.bytes)
        ), 0);
      }
      persistTemplateLibrary(nextHistory.present);
      return nextHistory;
    });
    setGeneratedPreviewIndex(0);
    setCarouselPlaying(false);
    setSaveMessage(`Bound ${source.label} to ${region.label}`);
  }

  function saveFeedSource(source: ContentSource) {
    setHistory((currentHistory) => {
      const nextHistory = commitEditorHistory(currentHistory, upsertContentSourceCommand(source));
      const persistence = persistProjectLocally(nextHistory.present);
      if (!persistence.ok) {
        window.setTimeout(() => setSaveMessage(
          browserStorageWarning(`Saved ${source.label}`, persistence.bytes)
        ), 0);
      }
      return nextHistory;
    });
    setSaveMessage(`Saved data source ${source.label}`);
  }

  function saveFeedSourceSnapshot(source: ContentSource, snapshot: ContentSnapshot) {
    setHistory((currentHistory) => {
      const nextHistory = commitEditorHistory(
        currentHistory,
        storeContentSnapshotCommand(source, snapshot)
      );
      const persistence = persistProjectLocally(nextHistory.present);
      if (!persistence.ok) {
        window.setTimeout(() => setSaveMessage(
          browserStorageWarning(`Refreshed ${source.label}`, persistence.bytes)
        ), 0);
      }
      return nextHistory;
    });
    setSaveMessage(`Refreshed data source ${source.label}`);
  }

  function selectFeedTargetPage(pageId: string) {
    if (!pageId) {
      setFeedWorkspace(undefined);
      setGeneratedPreviewIndex(undefined);
      return;
    }
    const targetPage = editor.service.pages.find((candidate) => candidate.id === pageId);
    if (!targetPage) return;
    const targetChanged = targetPage.id !== editor.page.id;
    setActivePageId(targetPage.id);
    if (targetChanged) setActiveSubpageId(targetPage.subpages[0]?.id);
    setGeneratedPreviewIndex(undefined);
    setSelection(undefined);
    if (targetChanged) setRectangleSelection(undefined);
  }

  function removeFeedBinding(pageId: string, bindingId: string) {
    setHistory((currentHistory) => {
      const nextHistory = commitEditorHistory(
        currentHistory,
        removeContentBindingCommand(pageId, bindingId)
      );
      persistProjectLocally(nextHistory.present);
      return nextHistory;
    });
    setFeedWorkspace(undefined);
    setGeneratedPreviewIndex(undefined);
    setSaveMessage("Disconnected live feed binding");
  }

  function commitSubpageAdd(pageId: string) {
    const page = editor.service.pages.find((item) => item.id === pageId) ?? editor.page;
    const nextSubpageId = `subpage-${page.subpages.length.toString().padStart(4, "0")}`;

    setHistory((currentHistory) =>
      commitEditorHistory(
        currentHistory,
        addSubpageCommand(editor.service.id, page.id)
      )
    );
    setActivePageId(page.id);
    setActiveSubpageId(nextSubpageId);
    setSelection(undefined);
  }

  function commitPageAdd(pageNumber: string) {
    const normalizedPageNumber = pageNumber.toUpperCase();
    setHistory((currentHistory) => {
      const nextHistory = commitEditorHistory(
        currentHistory,
        addPageCommand(editor.service.id, normalizedPageNumber)
      );
      persistProjectLocally(nextHistory.present);
      return nextHistory;
    });
    setActivePageId(`page-${normalizedPageNumber}`);
    setActiveSubpageId(`page-${normalizedPageNumber}-subpage-0000`);
    setGeneratedPreviewIndex(undefined);
    setSelection(undefined);
    setRectangleSelection(undefined);
    setSaveMessage(`Added page ${normalizedPageNumber}`);
  }

  function commitPageCarouselEnabled(enabled: boolean) {
    setHistory((currentHistory) => {
      const nextHistory = commitEditorHistory(
        currentHistory,
        setPageCarouselEnabledCommand(editor.service.id, editor.page.id, enabled)
      );
      persistProjectLocally(nextHistory.present);
      return nextHistory;
    });
    setCarouselPlaying(enabled);
    setSaveMessage(enabled ? "Enabled page carousel" : "Disabled page carousel");
  }

  function commitText(value: string) {
    if (!selection) {
      return;
    }

    setHistory((currentHistory) =>
      commitEditorHistory(
        currentHistory,
        insertTextCommand(
          editor.service.id,
          editor.page.id,
          editor.subpage.id,
          selection.rowIndex,
          selection.column,
          value
        )
      )
    );
    setSelection({
      rowIndex: selection.rowIndex,
      column: Math.min(selection.column + value.length, 39)
    });
  }

  function commitCharacterByte(byte: number, value: string) {
    if (!selection) {
      return;
    }

    setHistory((currentHistory) =>
      commitEditorHistory(
        currentHistory,
        insertCharacterByteCommand(
          editor.service.id,
          editor.page.id,
          editor.subpage.id,
          selection.rowIndex,
          selection.column,
          byte,
          value
        )
      )
    );
    setSelection({
      rowIndex: selection.rowIndex,
      column: Math.min(selection.column + 1, 39)
    });
  }

  function commitControlCode(byte: number) {
    if (!selection) {
      return;
    }

    const controlCode = getControlCodeByByte(byte);

    if (activeTool === "text" && controlCode?.category === "graphics") {
      return;
    }

    if (activeTool === "mosaic" && byte >= 0x10 && byte <= 0x17) {
      const foreground: TeletextColourRef = { palette: "level1", index: byte - 0x10 };

      setMosaicForeground(foreground);
      setHistory((currentHistory) =>
        commitEditorHistory(
          currentHistory,
          setMosaicForegroundCommand(
            editor.service.id,
            editor.page.id,
            editor.subpage.id,
            selection.rowIndex,
            selection.column,
            foreground
          )
        )
      );
      setSelection(selection);
      return;
    }

    if (
      (byte === 0x0d || byte === 0x0f) &&
      ILLEGAL_DOUBLE_HEIGHT_ROWS.has(selection.rowIndex)
    ) {
      return;
    }

    setHistory((currentHistory) =>
      commitEditorHistory(
        currentHistory,
        insertControlCodeWithRowShiftCommand(
          editor.service.id,
          editor.page.id,
          editor.subpage.id,
          selection.rowIndex,
          selection.column,
          byte
        )
      )
    );
    setSelection({
      rowIndex: selection.rowIndex,
      column: selection.column
    });
  }

  function commitBackgroundColour(colourIndex: number) {
    if (!selection) {
      return;
    }

    setHistory((currentHistory) =>
      commitEditorHistory(
        currentHistory,
        paintCellBackgroundCommand(
          editor.service.id,
          editor.page.id,
          editor.subpage.id,
          selection.rowIndex,
          selection.column,
          colourIndex
        )
      )
    );
    setSelection(selection);
  }

  function commitCellDelete() {
    if (!selection) {
      return;
    }

    setHistory((currentHistory) =>
      commitEditorHistory(
        currentHistory,
        deleteCellWithRowShiftCommand(
          editor.service.id,
          editor.page.id,
          editor.subpage.id,
          selection.rowIndex,
          selection.column
        )
      )
    );
    setSelection(selection);
  }

  function commitBlankSpacerInsert() {
    if (!selection) {
      return;
    }

    setHistory((currentHistory) =>
      commitEditorHistory(
        currentHistory,
        insertBlankSpacerWithRowShiftCommand(
          editor.service.id,
          editor.page.id,
          editor.subpage.id,
          selection.rowIndex,
          selection.column
        )
      )
    );
    setSelection({
      rowIndex: selection.rowIndex,
      column: Math.min(selection.column + 1, 39)
    });
  }

  function commitRowClear() {
    if (!selection) {
      return;
    }

    setHistory((currentHistory) =>
      commitEditorHistory(
        currentHistory,
        clearRowCommand(
          editor.service.id,
          editor.page.id,
          editor.subpage.id,
          selection.rowIndex
        )
      )
    );
    setSelection({
      rowIndex: selection.rowIndex,
      column: 0
    });
  }

  function commitMosaicPaint(sixelMask: number) {
    if (!selection) {
      return;
    }

    setHistory((currentHistory) =>
      commitEditorHistory(
        currentHistory,
        paintMosaicCommand(
          editor.service.id,
          editor.page.id,
          editor.subpage.id,
          selection.rowIndex,
          selection.column,
          sixelMask,
          mosaicForeground
        )
      )
    );
    setSelection({
      rowIndex: selection.rowIndex,
      column: selection.column
    });
  }

  function commitMosaicPresetPaint(
    rowIndex: number,
    column: number,
    sixelMask: number,
    options: { coalesceWithPrevious?: boolean } = {}
  ) {
    const command = paintMosaicCommand(
      editor.service.id,
      editor.page.id,
      editor.subpage.id,
      rowIndex,
      column,
      sixelMask,
      mosaicForeground
    );

    setHistory((currentHistory) =>
      options.coalesceWithPrevious
        ? {
            past: currentHistory.past,
            present: applyEditorCommand(currentHistory.present, command),
            future: []
          }
        : commitEditorHistory(currentHistory, command)
    );
    setSelection({ rowIndex, column });
  }

  function commitMosaicSixelEdit(
    rowIndex: number,
    column: number,
    sixelIndex: number,
    operation: "set" | "clear" | "toggle"
  ) {
    setHistory((currentHistory) =>
      commitEditorHistory(
        currentHistory,
        editMosaicSixelCommand(
          editor.service.id,
          editor.page.id,
          editor.subpage.id,
          rowIndex,
          column,
          sixelIndex,
          operation,
          mosaicForeground
        )
      )
    );
    setSelection({ rowIndex, column });
  }

  function commitG3LinePaint(
    rowIndex: number,
    column: number,
    code: G3LineCode | undefined,
    options: { coalesceWithPrevious?: boolean } = {}
  ) {
    const command = paintG3LineCommand(
      editor.service.id,
      editor.page.id,
      editor.subpage.id,
      rowIndex,
      column,
      code,
      linePaintMode.level1Fallback
    );

    setHistory((currentHistory) =>
      options.coalesceWithPrevious
        ? {
            past: currentHistory.past,
            present: applyEditorCommand(currentHistory.present, command),
            future: []
          }
        : commitEditorHistory(currentHistory, command)
    );
    setSelection({ rowIndex, column });
  }

  function commitMosaicTextStamp(alphabetId: string, text: string, rowIndex: number, column: number) {
    const stampTarget = { rowIndex, column };

    setHistory((currentHistory) =>
      commitEditorHistory(
        currentHistory,
        stampMosaicTextCommand(
          editor.service.id,
          editor.page.id,
          editor.subpage.id,
          {
            alphabetId,
            text,
            rowIndex: stampTarget.rowIndex,
            column: stampTarget.column
          }
        )
      )
    );
    setSelection(stampTarget);
  }

  function copySelectedBlock() {
    if (!rectangleSelection) {
      return;
    }

    const copied = copyCellsFromRectangle(
      history.present,
      editor.service.id,
      editor.page.id,
      editor.subpage.id,
      rectangleSelection
    );

    setBlockClipboard(copied);
    setBlockPreviewTarget(copied ? {
      rowIndex: copied.source.rowIndex,
      column: copied.source.column
    } : undefined);
  }

  function cutSelectedBlock() {
    if (!rectangleSelection) {
      setActiveTool("blocks");
      return;
    }

    const copied = copyCellsFromRectangle(
      history.present,
      editor.service.id,
      editor.page.id,
      editor.subpage.id,
      rectangleSelection
    );

    setBlockClipboard(copied);
    setBlockPreviewTarget(copied ? {
      rowIndex: copied.source.rowIndex,
      column: copied.source.column
    } : undefined);
    setHistory((currentHistory) =>
      commitEditorHistory(
        currentHistory,
        clearCellRectangleCommand(
          editor.service.id,
          editor.page.id,
          editor.subpage.id,
          rectangleSelection
        )
      )
    );
    setActiveTool("blocks");
  }

  function clearBlockSelection() {
    setRectangleSelection(undefined);
    setBlockPreviewTarget(undefined);
  }

  function commitBlockStamp(target = blockPreviewTarget ?? selection) {
    if (!blockClipboard || !target) {
      return;
    }

    setHistory((currentHistory) =>
      commitEditorHistory(
        currentHistory,
        stampCellBlockCommand(
          editor.service.id,
          editor.page.id,
          editor.subpage.id,
          blockClipboard,
          target
        )
      )
    );
    setSelection(target);
    setRectangleSelection(undefined);
    setBlockPreviewTarget(undefined);
  }

  function commitBlockSave(name: string, assignedCharacter?: string) {
    if (!blockClipboard) {
      return;
    }

    setHistory((currentHistory) =>
      commitEditorHistory(
        currentHistory,
        saveCellBlockAsArtworkCommand(blockClipboard, {
          name,
          category: assignedCharacter ? "letter" : "masthead",
          assignedCharacter
        })
      )
    );
  }

  function commitHeaderClockMode(mode: PageHeaderSettings["clockMode"]) {
    setHistory((currentHistory) =>
      commitEditorHistory(
        currentHistory,
        setPageHeaderClockModeCommand(editor.service.id, editor.page.id, mode)
      )
    );
  }

  function commitReceiverFontProfile(profileId: TeletextFontProfileId) {
    setReceiverFontProfileId(profileId);

    try {
      tryWriteBrowserStorage(RECEIVER_FONT_PROFILE_KEY, profileId);
    } catch {
      // The in-memory preference remains usable when storage is unavailable.
    }
  }

  function undoEdit() {
    setHistory(undoEditorHistory);
  }

  function redoEdit() {
    setHistory(redoEditorHistory);
  }

  function loadTraceReferenceFile(file: File) {
    setTraceReferenceImage({
      file,
      name: file.name,
      url: URL.createObjectURL(file)
    });
    setTraceReferenceGridVisible(true);
    setTraceGridAlignment(DEFAULT_TRACE_GRID_ALIGNMENT);
    setTraceGridCalibration(DEFAULT_TRACE_GRID_CALIBRATION);
    setTraceCalibrationPosition(DEFAULT_TRACE_CALIBRATION_POSITION);
    setTraceCellHints([]);
    setTraceSelectedCell(undefined);
    setTraceReferenceInteractionMode("tag-cells");
    setTraceReferenceZoom("fit");
    setTraceReferencePanelWidth(DEFAULT_REFERENCE_PANEL_WIDTH);
    setTraceStatus({
      state: "idle",
      message: `Reference loaded: ${file.name}`,
      warnings: []
    });
  }

  function closeTraceReference() {
    setTraceReferenceImage(undefined);
    setTraceCellHints([]);
    setTraceSelectedCell(undefined);
    setTraceStatus({
      state: "idle",
      message: "Reference closed. The scanned teletext page remains editable.",
      warnings: []
    });
  }

  function selectTraceReferenceCell(nextSelection: CellSelection) {
    setTraceSelectedCell(nextSelection);
    setTraceCalibrationPosition({
      xPercent: Number(traceCellLeftPercent(nextSelection, traceGridAlignment).toFixed(3)),
      yPercent: Number(traceCellTopPercent(nextSelection, traceGridAlignment).toFixed(3))
    });
  }

  function pinTraceGridCalibration(axis: "x" | "y") {
    if (!traceSelectedCell) {
      return;
    }

    const lineIndex = axis === "x" ? traceSelectedCell.column : traceSelectedCell.rowIndex;
    const percent = axis === "x"
      ? traceCalibrationPosition.xPercent
      : traceCalibrationPosition.yPercent;

    setTraceGridCalibrationAnchor(axis, lineIndex, percent);
  }

  function setTraceGridCalibrationAnchor(axis: "x" | "y", lineIndex: number, percent: number) {
    setTraceGridCalibration((currentCalibration) => {
      if (axis === "x") {
        return {
          ...currentCalibration,
          xAnchors: [
            ...currentCalibration.xAnchors.filter((anchor) => anchor.lineIndex !== lineIndex),
            {
              lineIndex,
              percent
            }
          ].sort((first, second) => first.lineIndex - second.lineIndex)
        };
      }

      return {
        ...currentCalibration,
        yAnchors: [
          ...currentCalibration.yAnchors.filter((anchor) => anchor.lineIndex !== lineIndex),
          {
            lineIndex,
            percent
          }
        ].sort((first, second) => first.lineIndex - second.lineIndex)
      };
    });
  }

  function dragTraceGridLine(axis: "x" | "y", lineIndex: number, percent: number) {
    setTraceGridCalibrationAnchor(axis, lineIndex, percent);
    setTraceCalibrationPosition((currentPosition) => axis === "x"
      ? { ...currentPosition, xPercent: percent }
      : { ...currentPosition, yPercent: percent });
  }

  function updateTraceHint(kind: TraceCellHintKind | "auto") {
    if (!traceSelectedCell) {
      return;
    }

    setTraceCellHints((currentHints) => {
      const remainingHints = currentHints.filter(
        (hint) =>
          hint.rowIndex !== traceSelectedCell.rowIndex
          || hint.column !== traceSelectedCell.column
      );

      if (kind === "auto") {
        return remainingHints;
      }

      return [
        ...remainingHints,
        {
          rowIndex: traceSelectedCell.rowIndex,
          column: traceSelectedCell.column,
          kind
        }
      ];
    });
  }

  async function suggestTraceGridFromEdges() {
    if (!traceReferenceImage) {
      return;
    }

    const file = traceReferenceImage.file;

    setTraceStatus({
      state: "loading",
      message: `Finding grid edges in ${file.name}...`,
      warnings: []
    });

    try {
      const imageData = await imageDataFromFile(file);
      const traceGridBounds = traceGridBoundsFromAlignment(imageData, traceGridAlignment);
      const suggestedGrid = detectEdgeAssistedTraceGrid(imageData, traceGridBounds);
      const suggestedCalibration = traceGridLineAnchorsFromEdges(
        suggestedGrid,
        traceGridBounds,
        imageData
      );

      setTraceGridCalibration(suggestedCalibration);
      setTraceReferenceGridVisible(true);
      setTraceReferenceInteractionMode("move-grid");
      setTraceStatus({
        state: "done",
        message: `Suggested edge grid from image edges: ${suggestedCalibration.xAnchors.length} column anchors, ${suggestedCalibration.yAnchors.length} row anchors.`,
        warnings: []
      });
    } catch (error) {
      setTraceStatus({
        state: "error",
        message: error instanceof Error ? error.message : "Could not suggest grid from screenshot edges.",
        warnings: []
      });
    }
  }

  async function scanTraceReferenceScreenshot() {
    if (!traceReferenceImage) {
      return;
    }

    const file = traceReferenceImage.file;
    setCarouselPlaying(false);

    setTraceStatus({
      state: "loading",
      message: `Scanning ${file.name}...`,
      warnings: []
    });

    try {
      const imageData = await imageDataFromFile(file);
      const traceGridBounds = traceGridBoundsFromAlignment(imageData, traceGridAlignment);
      const hasCalibration =
        traceGridCalibration.xAnchors.length > 0 || traceGridCalibration.yAnchors.length > 0;
      const calibratedGrid = hasCalibration
        ? createCalibratedTraceGrid(imageData, traceGridBounds, {
          xAnchors: traceGridCalibration.xAnchors.map((anchor) => ({
            lineIndex: anchor.lineIndex,
            position: (imageData.width * anchor.percent) / 100
          })),
          yAnchors: traceGridCalibration.yAnchors.map((anchor) => ({
            lineIndex: anchor.lineIndex,
            position: (imageData.height * anchor.percent) / 100
          }))
        })
        : undefined;
      const scan = scanTeletextScreenshot(imageData, {
        bounds: traceGridBounds,
        grid: calibratedGrid,
        hints: traceCellHints
      });
      const suggestedCalibration = traceGridLineAnchorsFromEdges(
        scan.grid,
        traceGridBounds,
        imageData
      );

      setHistory((currentHistory) =>
        commitEditorHistory(
          currentHistory,
          importTraceRowsCommand(
            editor.service.id,
            editor.page.id,
            editor.subpage.id,
            scan.rows,
            scan.g3LineCells
          )
        )
      );
      setSelection(undefined);
      setTraceGridCalibration(suggestedCalibration);
      setTraceReferenceGridVisible(true);
      setTraceReferenceInteractionMode("tag-cells");
      setTraceStatus({
        state: "done",
        message: `Scanned ${file.name} into editable rows with image-only finite-template matching (no page dictionary).`,
        confidence: scan.confidence,
        warnings: scan.warnings
      });
      setSaveMessage(`Scanned trace ${new Date().toLocaleTimeString()}`);
    } catch (error) {
      setTraceStatus({
        state: "error",
        message: error instanceof Error ? error.message : "Could not scan screenshot.",
        warnings: []
      });
    }
  }

  function saveProject() {
    const projectPersistence = persistProjectLocally(history.present);
    const templatePersistence = persistTemplateLibrary(history.present);
    setSaveMessage(projectPersistence.ok && templatePersistence.ok
      ? `Saved locally ${new Date().toLocaleTimeString()}`
      : browserStorageWarning("Kept the project", projectPersistence.bytes));
  }

  function saveTemplate() {
    const nextHistory = commitEditorHistory(
      history,
      saveCurrentPageAsTemplateCommand(editor.service.id, editor.page.id)
    );
    const savedTemplate = nextHistory.present.templates.at(-1);
    setHistory(nextHistory);
    const persistence = persistProjectLocally(nextHistory.present);
    persistTemplateLibrary(nextHistory.present);
    if (savedTemplate) {
      downloadBinaryFile(
        templateFilename(savedTemplate),
        exportTemplatePackage(savedTemplate),
        "application/zip"
      );
      setSaveMessage(persistence.ok
        ? `Saved ${savedTemplate.name} locally and downloaded ${templateFilename(savedTemplate)}`
        : `Downloaded ${templateFilename(savedTemplate)}. Browser autosave is full, so keep this disk copy.`);
    } else {
      setSaveMessage("Could not save template");
    }
  }

  function exportTemplateToDisk(templateId: string) {
    const template = editor.templates.find((item) => item.id === templateId);
    if (!template) {
      setSaveMessage("Could not find template to export");
      return;
    }
    downloadBinaryFile(
      templateFilename(template),
      exportTemplatePackage(template),
      "application/zip"
    );
    setSaveMessage(`Downloaded ${templateFilename(template)}`);
  }

  async function importTemplateFromDisk(file: File) {
    try {
      const template = importTemplatePackage(new Uint8Array(await file.arrayBuffer()));
      const nextHistory = commitEditorHistory(history, upsertTemplateCommand(template));
      setHistory(nextHistory);
      const persistence = persistProjectLocally(nextHistory.present);
      persistTemplateLibrary(nextHistory.present);
      setSaveMessage(persistence.ok
        ? `Imported ${template.name} from ${file.name}`
        : browserStorageWarning(`Imported ${template.name}`, persistence.bytes));
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : "Could not import template package");
    }
  }

  function downloadProject() {
    downloadTextFile(
      "pixelcast-project.pixelcast.json",
      exportNativeProject(history.present),
      "application/json"
    );
  }

  function downloadTti() {
    downloadTextFile(
      `page-${editor.page.pageNumber}-subpage-${editor.subpage.subcode}.tti`,
      exportTti(history.present, {
        now: clockNow,
        pageId: editor.page.id,
        serviceId: editor.service.id,
        subpageId: editor.subpage.id
      }),
      "text/plain"
    );
  }

  async function openProjectFile(file: File) {
    try {
      const text = await file.text();
      const project = refreshBuiltInMastheadAlphabets(
        mergeStoredTemplates(importNativeProject(text), text)
      );
      setHistory(createEditorHistory(project));
      setActivePageId(project.services[0]?.pages[0]?.id);
      setActiveSubpageId(project.services[0]?.pages[0]?.subpages[0]?.id);
      setSelection(undefined);
      const persistence = persistProjectLocally(project);
      persistTemplateLibrary(project);
      setSaveMessage(persistence.ok
        ? `Opened ${file.name}`
        : browserStorageWarning(`Opened ${file.name}`, persistence.bytes));
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : "Could not open project");
    }
  }

  const referenceVisible = traceReferenceImage !== undefined && feedWorkspace === undefined;
  const referenceWorkbenchStyle = referenceVisible
    ? {
      "--reference-panel-width": `${traceReferencePanelWidth}px`
    } as CSSProperties
    : undefined;

  return (
    <main className={`app-shell ${layoutMode === "playout" ? "playout-shell" : "studio-shell"}`}>
      <aside className="sidebar" aria-label="Service navigator">
        <div className="brand">
          <span className="brand-mark">PX</span>
          <div>
            <h1>Pixelcast Studio</h1>
            <p>Teletext page editor</p>
          </div>
        </div>

        <PageNavigator
          activePageId={editor.page.id}
          activeGeneratedSubpageIndex={generatedPreviewIndex}
          activeSubpageId={generatedPreview ? undefined : editor.subpage.id}
          generatedSubpages={editor.page.contentBindings.length > 0
            ? generatedPreviews.map(({ subcode }) => ({ subcode }))
            : []}
          onGeneratedSubpageSelect={(index) => {
            setGeneratedPreviewIndex(index);
            setCarouselPlaying(false);
            setSelection(undefined);
            setRectangleSelection(undefined);
          }}
          onPageAdd={commitPageAdd}
          onSubpageAdd={commitSubpageAdd}
          onPageSelect={(pageId) => {
            setActivePageId(pageId);
            setActiveSubpageId(undefined);
            setCarouselPlaying(false);
            setSelection(undefined);
          }}
          onSubpageSelect={(pageId, subpageId) => {
            setActivePageId(pageId);
            setActiveSubpageId(subpageId);
            setGeneratedPreviewIndex(undefined);
            setCarouselPlaying(false);
            setSelection(undefined);
          }}
          pages={editor.service.pages}
          service={editor.service}
        />

        <TemplateLibrary
          onTemplateApply={commitTemplate}
          onTemplateDelete={deleteTemplate}
          onTemplateExport={exportTemplateToDisk}
          onTemplateImport={(file) => {
            void importTemplateFromDisk(file);
          }}
          onTemplateRegionAdd={addTemplateRegion}
          rectangleSelection={rectangleSelection}
          templates={editor.templates}
        />
        <ContentSourcesPanel
          snapshots={editor.project.contentSnapshots}
          sources={editor.project.contentSources}
        />
      </aside>

      <section className="workspace" aria-label="Teletext workspace">
        <header className="toolbar">
          <div>
            <p className="eyebrow">
              {feedWorkspace ? "Feed staging · literal teletext" : `Level ${editor.page.metadata.targetPresentationLevel} authoring`}
            </p>
            <h2>{feedWorkspace ? "Feed scratch canvas" : `Page ${editor.page.pageNumber}`}</h2>
            <p>
              {feedWorkspace
                ? feedWorkspace.record
                  ? `${feedWorkspace.sourceLabel} · record ${feedWorkspace.recordPosition}/${feedWorkspace.recordCount} · teletext ${feedWorkspace.pagePosition}/${feedWorkspace.pageCount}`
                  : "Fetch and select a record in the Feeds tab"
                : `Subpage ${generatedPreview?.subcode ?? editor.subpage.subcode}${generatedPreview ? ` · generated ${generatedPreviewIndex! + 1}/${generatedPreviews.length}` : ""}`}
            </p>
          </div>
          <div className="toolbar-actions">
            <div className="segmented-control" aria-label="Layout mode">
              <button
                aria-pressed={layoutMode === "studio"}
                onClick={() => setLayoutMode("studio")}
                type="button"
              >
                Studio
              </button>
              <button
                aria-pressed={layoutMode === "playout"}
                onClick={() => setLayoutMode("playout")}
                type="button"
              >
                Playout
              </button>
            </div>
            <div className="segmented-control" aria-label="Preview mode">
              <button
                aria-pressed={previewProfileId === "studio-large"}
                onClick={() => setPreviewProfileId("studio-large")}
                type="button"
              >
                Studio large
              </button>
              <button
                aria-pressed={previewProfileId === "pit-strict"}
                onClick={() => setPreviewProfileId("pit-strict")}
                type="button"
              >
                PIT strict
              </button>
            </div>
            <button
              disabled={history.past.length === 0}
              onClick={undoEdit}
              type="button"
            >
              Undo
            </button>
            <button
              disabled={history.future.length === 0}
              onClick={redoEdit}
              type="button"
            >
              Redo
            </button>
            <button
              disabled={Boolean(feedWorkspace)}
              aria-pressed={generatedPreview !== undefined}
              onClick={() => setGeneratedPreviewIndex((current) => current === undefined ? 0 : undefined)}
              type="button"
            >
              {generatedPreview
                ? "Edit template"
                : editor.page.contentBindings.length > 0
                  ? "Show live content"
                  : "Preview generated"}
            </button>
            {generatedPreview && generatedPreviews.length > 1 ? (
              <div className="segmented-control" aria-label="Live feed carousel playback">
                <button
                  aria-pressed={carouselPlaying}
                  onClick={() => setCarouselPlaying((current) => !current)}
                  type="button"
                >
                  {carouselPlaying ? "Pause live carousel" : "Play live carousel"}
                </button>
                <button
                  disabled={generatedPreviewIndex === 0}
                  onClick={() => {
                    setGeneratedPreviewIndex((current) => Math.max(0, (current ?? 0) - 1));
                    setCarouselPlaying(false);
                  }}
                  type="button"
                >
                  Previous
                </button>
                <button
                  disabled={generatedPreviewIndex === generatedPreviews.length - 1}
                  onClick={() => {
                    setGeneratedPreviewIndex((current) => Math.min(generatedPreviews.length - 1, (current ?? 0) + 1));
                    setCarouselPlaying(false);
                  }}
                  type="button"
                >
                  Next
                </button>
                <span>
                  {(generatedPreviewIndex ?? 0) + 1}/{generatedPreviews.length} · {Math.max(2, editor.subpage.carousel.delaySeconds || 8)}s
                </span>
              </div>
            ) : null}
            {editor.page.subpages.length > 1 && !feedWorkspace && !generatedPreview ? (
              <div className="segmented-control" aria-label="Story carousel playback">
                {carouselSubpages.length > 1 ? (
                  <button
                    aria-pressed={carouselPlaying}
                    onClick={() => setCarouselPlaying((current) => !current)}
                    type="button"
                  >
                    {carouselPlaying ? "Pause carousel" : "Play carousel"}
                  </button>
                ) : null}
                <span>
                  {carouselSubpages.length > 1
                    ? `${(carouselPosition >= 0 ? carouselPosition : 0) + 1}/${carouselSubpages.length} · ${editor.subpage.carousel.delaySeconds}s`
                    : `${editor.page.subpages.length} static subpages`}
                </span>
                <button
                  onClick={() => commitPageCarouselEnabled(carouselSubpages.length < 2)}
                  type="button"
                >
                  {carouselSubpages.length > 1 ? "Disable carousel" : "Enable carousel"}
                </button>
              </div>
            ) : null}
            <button
              aria-pressed={revealConcealed}
              onClick={() => setRevealConcealed((current) => !current)}
              type="button"
            >
              {revealConcealed ? "Hide concealed" : "Reveal concealed"}
            </button>
            <button
              aria-pressed={animateFlash}
              onClick={() => setAnimateFlash((current) => !current)}
              type="button"
            >
              {animateFlash ? "Pause flash" : "Resume flash"}
            </button>
            <button onClick={saveTemplate} type="button">Save template to disk</button>
            <button onClick={saveProject} type="button">Save</button>
            <label className="file-button">
              Open project
              <input
                accept=".json,.pttx,.pixelcast.json"
                aria-label="Open project file"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void openProjectFile(file);
                }}
                type="file"
              />
            </label>
            <button onClick={downloadProject} type="button">Download project</button>
            <button onClick={downloadTti} type="button">Download TTI</button>
          </div>
        </header>

        <div
          className={[
            "preview-workbench",
            referenceVisible
              ? "preview-workbench-with-reference"
              : ""
          ].filter(Boolean).join(" ")}
          data-testid="preview-workbench"
          style={referenceWorkbenchStyle}
        >
          <TeletextCanvas
            activeTool={activeTool}
            animateFlash={animateFlash}
            blockPreview={blockClipboard && blockPreviewTarget
              ? { block: blockClipboard, target: blockPreviewTarget }
              : undefined}
            mosaicPaintMode={mosaicPaintMode}
            enhancementPackets={feedWorkspace ? [] : previewSubpage.enhancementPackets}
            linePaintMode={linePaintMode}
            onBlockPreviewTargetChange={setBlockPreviewTarget}
            onBlockStamp={commitBlockStamp}
            onCellSelect={setSelection}
            onCellDelete={commitCellDelete}
            onG3LinePaint={commitG3LinePaint}
            onMosaicPresetPaint={commitMosaicPresetPaint}
            onMosaicSixelEdit={commitMosaicSixelEdit}
            onRectangleClear={clearBlockSelection}
            onRectangleSelect={setRectangleSelection}
            onRedo={redoEdit}
            onRowClear={commitRowClear}
            onTextInput={commitText}
            onUndo={undoEdit}
            previewProfileId={feedWorkspace ? "pit-strict" : previewProfileId}
            readOnly={Boolean(feedWorkspace)}
            rectangleSelection={feedWorkspace?.bounds ?? rectangleSelection}
            receiverFontProfileId={receiverFontProfileId}
            revealConcealed={revealConcealed}
            rows={feedWorkspace?.rows ?? displayRows}
            selection={feedWorkspace ? undefined : selection}
          />

          {traceReferenceImage && !feedWorkspace ? (
            <>
              <button
                aria-label="Resize reference panel"
                aria-orientation="vertical"
                aria-valuemax={MAX_REFERENCE_PANEL_WIDTH}
                aria-valuemin={MIN_REFERENCE_PANEL_WIDTH}
                aria-valuenow={traceReferencePanelWidth}
                className="reference-resize-handle"
                onDoubleClick={() => setTraceReferencePanelWidth(DEFAULT_REFERENCE_PANEL_WIDTH)}
                onPointerDown={(event) => {
                  event.preventDefault();
                  setReferencePanelResizeDrag({
                    startWidth: traceReferencePanelWidth,
                    startX: event.clientX
                  });
                }}
                role="separator"
                type="button"
              />
              <ReferenceImagePanel
                gridAlignment={traceGridAlignment}
                gridCalibration={traceGridCalibration}
                gridVisible={traceReferenceGridVisible}
                interactionMode={traceReferenceInteractionMode}
                name={traceReferenceImage.name}
                onCellSelect={selectTraceReferenceCell}
                onClose={closeTraceReference}
                onGridLineDrag={dragTraceGridLine}
                onGridVisibleChange={setTraceReferenceGridVisible}
                onInteractionModeChange={setTraceReferenceInteractionMode}
                onZoomChange={setTraceReferenceZoom}
                selectedCell={traceSelectedCell}
                traceCellHints={traceCellHints}
                url={traceReferenceImage.url}
                zoom={traceReferenceZoom}
              />
            </>
          ) : null}
        </div>

        {layoutMode === "playout" ? (
          <p className="playout-note">Clean output mode for a second display or live monitor.</p>
        ) : null}

        {feedWorkspace ? (
          <section className="feed-preview-summary" aria-label="Feed fit summary">
            <strong>{feedWorkspace.usedRows}/{feedWorkspace.capacityRows} slot rows used</strong>
            <span>{feedWorkspace.pageCount} teletext {feedWorkspace.pageCount === 1 ? "page" : "subpages"}</span>
            {feedWorkspace.protectedThroughRow !== undefined ? (
              <span>Mosaic heading protected through row {feedWorkspace.protectedThroughRow}</span>
            ) : null}
            <span>
              {feedWorkspace.unsupportedCharacterCount === 0
                ? "Level 1 character set clean"
                : `${feedWorkspace.unsupportedCharacterCount} unsupported characters replaced with ?`}
            </span>
          </section>
        ) : (
          <ValidationPanel
            issues={editor.validationIssues}
            packetPreview={editor.packetPreview}
          />
        )}
        <p className="save-status" role="status">{saveMessage}</p>
      </section>

      <ToolDock
        activeTool={activeTool}
        artworkBlocks={editor.project.artworkBlocks}
        blockClipboard={blockClipboard}
        carouselPlaying={carouselPlaying}
        disabled={!selection}
        mosaicPaintMode={mosaicPaintMode}
        linePaintMode={linePaintMode}
        page={editor.page}
        pages={editor.service.pages}
        contentSources={editor.project.contentSources}
        contentSnapshots={editor.project.contentSnapshots}
        receiverFontProfileId={receiverFontProfileId}
        rectangleSelection={rectangleSelection}
        subpage={editor.subpage}
        templates={editor.templates}
        mosaicAlphabets={editor.project.mosaicAlphabets}
        validationIssues={editor.validationIssues}
        selection={selection}
        onBackgroundSelect={commitBackgroundColour}
        onBlankSpacerInsert={commitBlankSpacerInsert}
        onCharacterByteInsert={commitCharacterByte}
        onBlockCopy={copySelectedBlock}
        onBlockCut={cutSelectedBlock}
        onBlockSave={commitBlockSave}
        onBlockStamp={() => commitBlockStamp()}
        onControlSelect={commitControlCode}
        onHeaderClockModeChange={commitHeaderClockMode}
        onFeedWorkspaceChange={setFeedWorkspace}
        onFeedSourceSave={saveFeedSource}
        onFeedSourceSnapshotSave={saveFeedSourceSnapshot}
        onFeedTargetPageSelect={selectFeedTargetPage}
        onFeedBindingRemove={removeFeedBinding}
        onCarouselPlayingChange={setCarouselPlaying}
        onFeedPlaceSnapshot={placeFeedSnapshot}
        onFeedBindToSlot={bindFeedToSlot}
        onMosaicPaint={commitMosaicPaint}
        onMosaicPaintModeChange={setMosaicPaintMode}
        onLinePaintModeChange={setLinePaintMode}
        onMosaicTextStamp={commitMosaicTextStamp}
        onReceiverFontProfileChange={commitReceiverFontProfile}
        onTraceCalibrationPositionChange={setTraceCalibrationPosition}
        onTraceGridSuggestFromEdges={() => {
          void suggestTraceGridFromEdges();
        }}
        onTraceScanScreenshot={() => {
          void scanTraceReferenceScreenshot();
        }}
        onTraceGridCalibrationClear={() => setTraceGridCalibration(DEFAULT_TRACE_GRID_CALIBRATION)}
        onTraceGridCalibrationPin={pinTraceGridCalibration}
        onTraceGridAlignmentChange={setTraceGridAlignment}
        onTraceHintChange={updateTraceHint}
        onTraceReferenceLoad={loadTraceReferenceFile}
        onToolChange={setActiveTool}
        onRectangleClear={clearBlockSelection}
        traceCellHints={traceCellHints}
        traceCalibrationPosition={traceCalibrationPosition}
        traceGridCalibration={traceGridCalibration}
        traceGridAlignment={traceGridAlignment}
        traceReferenceName={traceReferenceImage?.name}
        traceSelectedCell={traceSelectedCell}
        traceStatus={traceStatus}
      />
    </main>
  );
}
