import { useEffect, useState, type MouseEvent } from "react";
import { ChevronDown, Eraser } from "lucide-react";

import type {
  ArtworkBlock,
  CellBlock,
  CellRectangle,
  ContentSnapshot,
  ContentSource,
  MosaicAlphabet,
  Page,
  PageHeaderSettings,
  Subpage,
  TeletextFontProfileId,
  TeletextRow,
  Template,
  ValidationIssue
} from "../../core";
import { G3_LINE_CODES, type G3LineCode } from "../../core";
import type {
  TraceCellHint,
  TraceCellHintKind,
  TraceWarning
} from "../importTrace/screenshotTrace";
import type { EditorTool } from "./TeletextCanvas";
import type {
  ReferenceGridAlignment,
  ReferenceGridCalibration
} from "./ReferenceImagePanel";
import { ControlPalette } from "./ControlPalette";
import type { CellSelection } from "../state/editorStore";
import { FeedWorkbench, type FeedWorkspaceState } from "./FeedWorkbench";

export interface TraceDockStatus {
  state: "idle" | "loading" | "done" | "error";
  message: string;
  confidence?: number;
  warnings: TraceWarning[];
}

interface ToolDockProps {
  activeTool: EditorTool;
  artworkBlocks: ArtworkBlock[];
  blockClipboard?: CellBlock;
  carouselPlaying: boolean;
  disabled: boolean;
  mosaicPaintMode: MosaicPaintMode;
  linePaintMode: G3LinePaintMode;
  page: Page;
  pages: Page[];
  contentSources: ContentSource[];
  contentSnapshots: ContentSnapshot[];
  receiverFontProfileId: TeletextFontProfileId;
  rectangleSelection?: CellRectangle;
  selection?: CellSelection;
  subpage: Subpage;
  templates: Template[];
  mosaicAlphabets: MosaicAlphabet[];
  validationIssues: ValidationIssue[];
  onBackgroundSelect: (colourIndex: number) => void;
  onBlankSpacerInsert: () => void;
  onCharacterByteInsert: (byte: number, value: string) => void;
  onBlockCopy: () => void;
  onBlockCut: () => void;
  onBlockSave: (name: string, assignedCharacter?: string) => void;
  onBlockStamp: () => void;
  onControlSelect: (byte: number) => void;
  onHeaderClockModeChange: (mode: PageHeaderSettings["clockMode"]) => void;
  onFeedWorkspaceChange: (workspace?: FeedWorkspaceState) => void;
  onFeedSourceSave: (source: ContentSource) => void;
  onFeedSourceSnapshotSave: (source: ContentSource, snapshot: ContentSnapshot) => void;
  onFeedTargetPageSelect: (pageId: string) => void;
  onFeedBindingRemove: (pageId: string, bindingId: string) => void;
  onCarouselPlayingChange: (playing: boolean) => void;
  onFeedPlaceSnapshot: (
    source: ContentSource,
    snapshot: ContentSnapshot,
    frames: TeletextRow[][],
    delaySeconds: number
  ) => void;
  onFeedBindToSlot: (
    source: ContentSource,
    snapshot: ContentSnapshot,
    templateRegionId: string,
    fields: string[],
    bounds: CellRectangle,
    attributionGapRows: number
  ) => void;
  onMosaicPaint: (sixelMask: number) => void;
  onMosaicPaintModeChange: (mode: MosaicPaintMode) => void;
  onLinePaintModeChange: (mode: G3LinePaintMode) => void;
  onMosaicTextStamp: (alphabetId: string, text: string, rowIndex: number, column: number) => void;
  onReceiverFontProfileChange: (profileId: TeletextFontProfileId) => void;
  onTraceCalibrationPositionChange: (position: TraceCalibrationPosition) => void;
  onTraceGridSuggestFromEdges: () => void;
  onTraceScanScreenshot: () => void;
  onTraceGridCalibrationClear: () => void;
  onTraceGridCalibrationPin: (axis: "x" | "y") => void;
  onTraceGridAlignmentChange: (alignment: ReferenceGridAlignment) => void;
  onTraceHintChange: (kind: TraceCellHintKind | "auto") => void;
  onTraceReferenceLoad: (file: File) => void;
  onToolChange: (tool: EditorTool) => void;
  onRectangleClear: () => void;
  traceCellHints: TraceCellHint[];
  traceCalibrationPosition: TraceCalibrationPosition;
  traceGridCalibration: ReferenceGridCalibration;
  traceGridAlignment: ReferenceGridAlignment;
  traceReferenceName?: string;
  traceSelectedCell?: CellSelection;
  traceStatus: TraceDockStatus;
}

export interface TraceCalibrationPosition {
  xPercent: number;
  yPercent: number;
}

type ToolDockTab = "tools" | "feeds" | "lines" | "mosaic" | "masthead" | "blocks" | "trace" | "page";

export type MosaicPaintMode =
  | { kind: "inactive" }
  | { kind: "freestyle" }
  | { kind: "preset"; mask: number };

export interface G3LinePaintMode {
  code?: G3LineCode;
  level1Fallback: boolean;
}

const TOOL_DOCK_TABS: Array<{ id: ToolDockTab; label: string }> = [
  { id: "tools", label: "Tools" },
  { id: "feeds", label: "Feeds" },
  { id: "lines", label: "Lines" },
  { id: "mosaic", label: "Mosaic" },
  { id: "masthead", label: "Masthead" },
  { id: "blocks", label: "Blocks" },
  { id: "trace", label: "Trace" },
  { id: "page", label: "Page" }
];

const G3_LINE_PALETTE: Array<{ code: G3LineCode; label: string; symbol: string }> = [
  { code: G3_LINE_CODES.horizontal, label: "Horizontal line", symbol: "\u2500" },
  { code: G3_LINE_CODES.vertical, label: "Vertical line", symbol: "\u2502" },
  { code: G3_LINE_CODES.topLeft, label: "Top-left corner", symbol: "\u250c" },
  { code: G3_LINE_CODES.topRight, label: "Top-right corner", symbol: "\u2510" },
  { code: G3_LINE_CODES.bottomLeft, label: "Bottom-left corner", symbol: "\u2514" },
  { code: G3_LINE_CODES.bottomRight, label: "Bottom-right corner", symbol: "\u2518" },
  { code: G3_LINE_CODES.teeRight, label: "Right-facing junction", symbol: "\u251c" },
  { code: G3_LINE_CODES.teeLeft, label: "Left-facing junction", symbol: "\u2524" },
  { code: G3_LINE_CODES.teeDown, label: "Down-facing junction", symbol: "\u252c" },
  { code: G3_LINE_CODES.teeUp, label: "Up-facing junction", symbol: "\u2534" },
  { code: G3_LINE_CODES.cross, label: "Cross junction", symbol: "\u253c" }
];

export const MOSAIC_PATTERNS = [
  { label: "Mosaic empty", mask: 0x00 },
  { label: "Mosaic full block", mask: 0x3f },
  { label: "Mosaic left half", mask: 0x15 },
  { label: "Mosaic right half", mask: 0x2a },
  { label: "Mosaic top row", mask: 0x03 },
  { label: "Mosaic middle row", mask: 0x0c },
  { label: "Mosaic bottom row", mask: 0x30 },
  { label: "Mosaic diagonal", mask: 0x25 },
  { label: "Mosaic checker", mask: 0x29 }
];
const DEFAULT_MASTHEAD_ALPHABET_ID = "citynews-compact-masthead";

function preferredMastheadAlphabetId(mosaicAlphabets: MosaicAlphabet[]) {
  return mosaicAlphabets.some((alphabet) => alphabet.id === DEFAULT_MASTHEAD_ALPHABET_ID)
    ? DEFAULT_MASTHEAD_ALPHABET_ID
    : mosaicAlphabets[0]?.id ?? "";
}

function selectionLabel(selection?: CellSelection) {
  return selection
    ? `Row ${selection.rowIndex}, column ${selection.column + 1}`
    : "No cell selected";
}

function rectangleLabel(rectangle?: CellRectangle) {
  if (!rectangle) {
    return "No rectangle selected";
  }

  const startRow = Math.min(rectangle.startRow, rectangle.endRow);
  const endRow = Math.max(rectangle.startRow, rectangle.endRow);
  const startColumn = Math.min(rectangle.startColumn, rectangle.endColumn);
  const endColumn = Math.max(rectangle.startColumn, rectangle.endColumn);

  return `Rows ${startRow}-${endRow}, columns ${startColumn + 1}-${endColumn + 1}`;
}

export function ToolDock({
  activeTool,
  artworkBlocks,
  blockClipboard,
  carouselPlaying,
  disabled,
  mosaicPaintMode,
  linePaintMode,
  page,
  pages,
  contentSources,
  contentSnapshots,
  receiverFontProfileId,
  rectangleSelection,
  selection,
  subpage,
  templates,
  mosaicAlphabets,
  validationIssues,
  onBackgroundSelect,
  onBlankSpacerInsert,
  onCharacterByteInsert,
  onBlockCopy,
  onBlockCut,
  onBlockSave,
  onBlockStamp,
  onControlSelect,
  onHeaderClockModeChange,
  onFeedWorkspaceChange,
  onFeedSourceSave,
  onFeedSourceSnapshotSave,
  onFeedTargetPageSelect,
  onFeedBindingRemove,
  onCarouselPlayingChange,
  onFeedPlaceSnapshot,
  onFeedBindToSlot,
  onMosaicPaint,
  onMosaicPaintModeChange,
  onLinePaintModeChange,
  onMosaicTextStamp,
  onReceiverFontProfileChange,
  onToolChange,
  onTraceCalibrationPositionChange,
  onTraceGridSuggestFromEdges,
  onTraceScanScreenshot,
  onTraceGridAlignmentChange,
  onTraceGridCalibrationClear,
  onTraceGridCalibrationPin,
  onTraceHintChange,
  onTraceReferenceLoad,
  onRectangleClear,
  traceGridAlignment,
  traceCellHints,
  traceCalibrationPosition,
  traceGridCalibration,
  traceReferenceName,
  traceSelectedCell,
  traceStatus
}: ToolDockProps) {
  const [dockTab, setDockTab] = useState<ToolDockTab>("tools");
  const [blockName, setBlockName] = useState("Masthead block");
  const [letterCharacter, setLetterCharacter] = useState("");
  const [mosaicText, setMosaicText] = useState("PIXELCAST");
  const [selectedMosaicAlphabetId, setSelectedMosaicAlphabetId] = useState(
    () => preferredMastheadAlphabetId(mosaicAlphabets)
  );
  const [mosaicStampRow, setMosaicStampRow] = useState(1);
  const [mosaicStampColumn, setMosaicStampColumn] = useState(2);
  const manualMosaicStampTarget = {
    rowIndex: Math.min(24, Math.max(0, mosaicStampRow)),
    column: Math.min(39, Math.max(0, mosaicStampColumn - 1))
  };
  const mosaicStampTarget = manualMosaicStampTarget;

  useEffect(() => {
    if (
      selectedMosaicAlphabetId
      && mosaicAlphabets.some((alphabet) => alphabet.id === selectedMosaicAlphabetId)
    ) {
      return;
    }

    setSelectedMosaicAlphabetId(preferredMastheadAlphabetId(mosaicAlphabets));
  }, [mosaicAlphabets, selectedMosaicAlphabetId]);

  useEffect(() => {
    if (selection) {
      setMosaicStampRow(selection.rowIndex);
      setMosaicStampColumn(selection.column + 1);
    }
  }, [selection?.column, selection?.rowIndex]);

  useEffect(() => {
    if (activeTool === "mosaic") {
      setDockTab("mosaic");
    } else if (activeTool === "lines") {
      setDockTab("lines");
    } else if (activeTool === "blocks") {
      setDockTab("blocks");
    } else if (activeTool === "import-trace") {
      setDockTab("trace");
    }
  }, [activeTool]);

  function selectDockTab(tab: ToolDockTab, event?: MouseEvent<HTMLButtonElement>) {
    setDockTab(tab);

    if (tab === "blocks") {
      if (event?.ctrlKey || event?.metaKey) {
        onBlockCut();
        return;
      }

      onToolChange("blocks");
    } else if (tab === "mosaic") {
      onToolChange("mosaic");
    } else if (tab === "lines") {
      onToolChange("lines");
    } else if (tab === "trace") {
      onToolChange("import-trace");
    }
  }

  const activeTemplate = templates.find((template) => template.id === page.metadata.templateId);
  const dynamicRegionCount = templates.reduce(
    (count, template) =>
      count
      + template.regions.filter((region) => region.kind === "dynamic" || region.kind === "ticker")
        .length,
    0
  );
  const clockSourceLabel = page.metadata.header.clockMode === "local"
    ? "Local clock"
    : page.metadata.header.clockMode === "none"
      ? "No clock"
      : "Original row";
  const updateTraceAlignment = (
    key: keyof ReferenceGridAlignment,
    value: number
  ) => {
    onTraceGridAlignmentChange({
      ...traceGridAlignment,
      [key]: Math.min(45, Math.max(0, value))
    });
  };
  const updateTraceCalibrationPosition = (
    key: keyof TraceCalibrationPosition,
    value: number
  ) => {
    onTraceCalibrationPositionChange({
      ...traceCalibrationPosition,
      [key]: Math.min(100, Math.max(0, value))
    });
  };

  return (
    <aside className="tool-dock" aria-label="Tool dock">
      <div className="tool-dock-tabs" role="tablist" aria-label="Tool dock sections">
        {TOOL_DOCK_TABS.map((tab) => (
          <button
            aria-controls={`tool-dock-panel-${tab.id}`}
            aria-selected={dockTab === tab.id}
            className={dockTab === tab.id ? "active" : ""}
            key={tab.id}
            onClick={(event) => selectDockTab(tab.id, event)}
            role="tab"
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div
        className="tool-dock-panel"
        id={`tool-dock-panel-${dockTab}`}
        role="tabpanel"
      >
      {dockTab === "tools" ? (
      <>
      <section>
        <h2>Tools</h2>
        <div className="segmented-control tool-mode-control" aria-label="Editor tool">
          <button
            aria-pressed={activeTool === "text"}
            onClick={() => onToolChange("text")}
            type="button"
          >
            Text
          </button>
          <button
            aria-pressed={activeTool === "mosaic"}
            onClick={() => onToolChange("mosaic")}
            type="button"
          >
            Mosaic
          </button>
          <button
            aria-pressed={activeTool === "lines"}
            onClick={() => onToolChange("lines")}
            type="button"
          >
            Lines
          </button>
          <button
            aria-pressed={activeTool === "blocks"}
            onClick={(event) => {
              if (event.ctrlKey || event.metaKey) {
                onBlockCut();
                return;
              }

              onToolChange("blocks");
            }}
            type="button"
          >
            Blocks
          </button>
          <button
            aria-pressed={activeTool === "import-trace"}
            onClick={() => onToolChange("import-trace")}
            type="button"
          >
            Import Trace
          </button>
        </div>
        <p className="section-note">
          Mosaic mode paints sixels directly. Import Trace shows a screenshot reference beside the canvas.
        </p>
      </section>
      <ControlPalette
        activeTool={activeTool}
        disabled={disabled}
        onBackgroundSelect={onBackgroundSelect}
        onControlSelect={onControlSelect}
      />
      <section>
        <h2>Receiver</h2>
        <label className="receiver-font-field">
          Receiver font
          <span className="select-control">
            <select
              onChange={(event) =>
                onReceiverFontProfileChange(event.target.value as TeletextFontProfileId)}
              value={receiverFontProfileId}
            >
              <option value="ets-1990s">ETS 1990s / EBU Level 2.5</option>
              <option value="saa5050-classic">SAA5050 classic</option>
              <option value="tdatext-later">Philips later / TDA</option>
            </select>
            <ChevronDown aria-hidden="true" size={16} strokeWidth={2} />
          </span>
        </label>
        <p className="section-note">
          Changes preview glyphs only; page bytes remain Level 1 compatible.
        </p>
        <div className="tool-button-grid">
          <button onClick={() => onCharacterByteInsert(0x60, "–")} type="button">
            Horizontal rule
          </button>
          <button onClick={() => onCharacterByteInsert(0x7c, "‖")} type="button">
            Vertical rule
          </button>
          <button onClick={() => onCharacterByteInsert(0x7f, "█")} type="button">
            Solid block
          </button>
        </div>
      </section>
      <section>
        <h2>Selection</h2>
        <dl className="inspector-list">
          <div>
            <dt>Page</dt>
            <dd>{page.pageNumber}</dd>
          </div>
          <div>
            <dt>Subpage</dt>
            <dd>{subpage.subcode}</dd>
          </div>
          <div>
            <dt>Template</dt>
            <dd data-testid="active-template-name">
              {activeTemplate?.name ?? "No template applied"}
            </dd>
          </div>
          <div>
            <dt>Cell</dt>
            <dd>{selectionLabel(selection)}</dd>
          </div>
        </dl>
      </section>
      </>
      ) : null}

      {dockTab === "feeds" ? (
        <FeedWorkbench
          carouselPlaying={carouselPlaying}
          onBindingRemove={onFeedBindingRemove}
          onCarouselPlayingChange={onCarouselPlayingChange}
          onBindToSlot={(source, snapshot, templateRegionId, fields, bounds, attributionGapRows) => {
            onFeedBindToSlot(source, snapshot, templateRegionId, fields, bounds, attributionGapRows);
            setDockTab("tools");
            onToolChange("text");
          }}
          onPlaceSnapshot={(source, snapshot, frames, delaySeconds) => {
            onFeedPlaceSnapshot(source, snapshot, frames, delaySeconds);
            setDockTab("tools");
            onToolChange("text");
          }}
          onWorkspaceChange={onFeedWorkspaceChange}
          onSourceSave={onFeedSourceSave}
          onSourceSnapshotSave={onFeedSourceSnapshotSave}
          onTargetPageSelect={onFeedTargetPageSelect}
          page={page}
          pages={pages}
          rectangleSelection={rectangleSelection}
          snapshots={contentSnapshots}
          sources={contentSources}
          subpage={subpage}
          templates={templates}
        />
      ) : null}

      {dockTab === "lines" ? (
        <section className="line-tool-panel">
          <h2>ETSI Line Drawing</h2>
          <div className="line-glyph-grid" role="group" aria-label="Line glyph">
            {G3_LINE_PALETTE.map((glyph) => (
              <button
                aria-label={glyph.label}
                aria-pressed={linePaintMode.code === glyph.code}
                className="line-glyph-button"
                key={glyph.code}
                onClick={() => onLinePaintModeChange({ ...linePaintMode, code: glyph.code })}
                title={glyph.label}
                type="button"
              >
                <span aria-hidden="true">{glyph.symbol}</span>
              </button>
            ))}
            <button
              aria-label="Erase line glyph"
              aria-pressed={linePaintMode.code === undefined}
              className="line-glyph-button"
              onClick={() => onLinePaintModeChange({ ...linePaintMode, code: undefined })}
              title="Erase line glyph"
              type="button"
            >
              <Eraser aria-hidden="true" size={20} />
            </button>
          </div>
          <label className="line-fallback-toggle">
            <input
              checked={linePaintMode.level1Fallback}
              onChange={(event) => onLinePaintModeChange({
                ...linePaintMode,
                level1Fallback: event.target.checked
              })}
              type="checkbox"
            />
            <span>Level 1 horizontal fallback</span>
          </label>
          <p className="section-note">
            Click or drag on rows 1-24. Right-click erases. Lines are transmitted as X/26 G3.
          </p>
        </section>
      ) : null}

      {dockTab === "trace" ? (
        <section>
          <h2>Reference Trace</h2>
          <p className="section-note">
            Load a teletext screenshot as a visual guide or scan it into editable rows.
          </p>
          <label className="trace-file-picker">
            <span>Reference screenshot</span>
            <input
              accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"
              aria-label="Reference screenshot"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];

                if (file) {
                  onTraceReferenceLoad(file);
                  event.currentTarget.value = "";
                }
              }}
              type="file"
            />
          </label>
          <button
            className="trace-secondary-button"
            disabled={!traceReferenceName || traceStatus.state === "loading"}
            onClick={onTraceGridSuggestFromEdges}
            type="button"
          >
            Suggest grid from edges
          </button>
          <button
            className="trace-primary-button"
            disabled={!traceReferenceName || traceStatus.state === "loading"}
            onClick={onTraceScanScreenshot}
            type="button"
          >
            Scan screenshot
          </button>
          <p className="trace-status" role="status">
            {traceStatus.message}
          </p>
          {traceReferenceName ? (
            <p className="section-note">Reference: {traceReferenceName}</p>
          ) : null}
          {traceReferenceName ? (
            <fieldset className="trace-grid-alignment">
              <legend>Grid alignment</legend>
              {[
                ["leftPercent", "Left %"],
                ["topPercent", "Top %"],
                ["rightPercent", "Right %"],
                ["bottomPercent", "Bottom %"]
              ].map(([key, label]) => (
                <label key={key}>
                  <span>{label}</span>
                  <input
                    aria-label={`Grid ${label.toLowerCase()}`}
                    max={45}
                    min={0}
                    onChange={(event) =>
                      updateTraceAlignment(
                        key as keyof ReferenceGridAlignment,
                        Number(event.currentTarget.value)
                      )}
                    step={0.1}
                    type="number"
                    value={traceGridAlignment[key as keyof ReferenceGridAlignment]}
                  />
                </label>
              ))}
              <button
                onClick={() =>
                  onTraceGridAlignmentChange({
                    bottomPercent: 0,
                    leftPercent: 0,
                    rightPercent: 0,
                    topPercent: 0
                  })}
                type="button"
              >
                Reset grid
              </button>
            </fieldset>
          ) : null}
          {traceReferenceName ? (
            <fieldset className="trace-grid-calibration">
              <legend>Grid calibration</legend>
              <p className="section-note">
                {traceSelectedCell
                  ? `Selected grid line: C${traceSelectedCell.column + 1} left, R${traceSelectedCell.rowIndex + 1} top`
                  : "Use Tag cells to select a cell, or Move grid lines on the reference to drag boundaries directly."}
              </p>
              <label>
                <span>Calibration X %</span>
                <input
                  aria-label="Calibration X %"
                  max={100}
                  min={0}
                  onChange={(event) =>
                    updateTraceCalibrationPosition("xPercent", Number(event.currentTarget.value))}
                  step={0.1}
                  type="number"
                  value={traceCalibrationPosition.xPercent}
                />
              </label>
              <label>
                <span>Calibration Y %</span>
                <input
                  aria-label="Calibration Y %"
                  max={100}
                  min={0}
                  onChange={(event) =>
                    updateTraceCalibrationPosition("yPercent", Number(event.currentTarget.value))}
                  step={0.1}
                  type="number"
                  value={traceCalibrationPosition.yPercent}
                />
              </label>
              <div className="trace-calibration-buttons">
                <button
                  disabled={!traceSelectedCell}
                  onClick={() => onTraceGridCalibrationPin("x")}
                  type="button"
                >
                  Pin selected column left
                </button>
                <button
                  disabled={!traceSelectedCell}
                  onClick={() => onTraceGridCalibrationPin("y")}
                  type="button"
                >
                  Pin selected row top
                </button>
                <button onClick={onTraceGridCalibrationClear} type="button">
                  Clear grid calibration
                </button>
              </div>
              <p className="section-note">
                Grid calibration anchors: {traceGridCalibration.xAnchors.length} columns,{" "}
                {traceGridCalibration.yAnchors.length} rows
              </p>
            </fieldset>
          ) : null}
          {traceReferenceName ? (
            <fieldset className="trace-hint-panel">
              <legend>Cell hints</legend>
              <p className="section-note">
                {traceSelectedCell
                  ? `Selected reference cell: R${traceSelectedCell.rowIndex + 1} C${traceSelectedCell.column + 1}`
                  : "Switch the reference to Tag cells, then choose a grid cell to guide the decoder."}
              </p>
              <div className="trace-hint-buttons">
                {[
                  ["text", "Hint text"],
                  ["mosaic", "Hint mosaic"],
                  ["background", "Hint background"],
                  ["ignore", "Hint ignore"],
                  ["double-height-top", "Hint double height top"],
                  ["double-height-bottom", "Hint double height bottom"]
                ].map(([kind, label]) => (
                  <button
                    disabled={!traceSelectedCell}
                    key={kind}
                    onClick={() => onTraceHintChange(kind as TraceCellHintKind)}
                    type="button"
                  >
                    {label}
                  </button>
                ))}
                <button
                  disabled={!traceSelectedCell}
                  onClick={() => onTraceHintChange("auto")}
                  type="button"
                >
                  Clear hint
                </button>
              </div>
              <p className="section-note">Trace hints: {traceCellHints.length}</p>
            </fieldset>
          ) : null}
          {traceStatus.confidence !== undefined ? (
            <p className="section-note">
              Confidence {(traceStatus.confidence * 100).toFixed(1)}%.
            </p>
          ) : null}
          {traceStatus.warnings.length > 0 ? (
            <div className="trace-warning-list">
              {traceStatus.warnings.slice(0, 6).map((warning) => (
                <span key={`${warning.rowIndex}-${warning.column}-${warning.message}`}>
                  R{warning.rowIndex} C{warning.column + 1}: {warning.message}
                </span>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {dockTab === "mosaic" ? (
      <>
      <section>
        <h2>Mosaic patterns</h2>
        <div className="mosaic-pattern-grid">
          <button
            aria-pressed={mosaicPaintMode.kind === "freestyle"}
            className={mosaicPaintMode.kind === "freestyle" ? "active" : ""}
            onClick={() => onMosaicPaintModeChange({ kind: "freestyle" })}
            type="button"
          >
            Freestyle
          </button>
          {MOSAIC_PATTERNS.map((pattern) => {
            const selected = mosaicPaintMode.kind === "preset"
              && mosaicPaintMode.mask === pattern.mask;

            return (
              <button
                aria-pressed={selected}
                className={selected ? "active" : ""}
                key={pattern.label}
                onClick={() => {
                  onMosaicPaintModeChange(
                    selected ? { kind: "inactive" } : { kind: "preset", mask: pattern.mask }
                  );

                  if (!selected && !disabled) {
                    onMosaicPaint(pattern.mask);
                  }
                }}
                type="button"
              >
                <span
                  aria-hidden="true"
                  className="mosaic-pattern-icon"
                >
                  {Array.from({ length: 6 }, (_, sixelIndex) => (
                    <span
                      className={(pattern.mask & (1 << sixelIndex)) !== 0 ? "sixel-on" : ""}
                      key={sixelIndex}
                    />
                  ))}
                </span>
                {pattern.label}
              </button>
            );
          })}
        </div>
      </section>
      <ControlPalette
        activeTool={activeTool}
        disabled={disabled}
        onBackgroundSelect={onBackgroundSelect}
        onControlSelect={onControlSelect}
      />
      </>
      ) : null}

      {dockTab === "masthead" ? (
      <section className="masthead-panel">
        <h2>Masthead</h2>
        <p className="masthead-target">
          Target: Row {manualMosaicStampTarget.rowIndex}, column {manualMosaicStampTarget.column + 1}
        </p>
        <fieldset className="masthead-fieldset">
          <legend>Source</legend>
          <label>
            Alphabet
            <select
              disabled={mosaicAlphabets.length === 0}
              onChange={(event) => setSelectedMosaicAlphabetId(event.target.value)}
              value={selectedMosaicAlphabetId}
            >
              {mosaicAlphabets.map((alphabet) => (
                <option key={alphabet.id} value={alphabet.id}>
                  {alphabet.name}
                </option>
              ))}
            </select>
          </label>
        </fieldset>
        <fieldset className="masthead-fieldset">
          <legend>Text</legend>
          <label>
            Masthead text
            <input
              onChange={(event) => setMosaicText(event.target.value.toUpperCase())}
              type="text"
              value={mosaicText}
            />
          </label>
        </fieldset>
        <fieldset className="masthead-fieldset">
          <legend>Position</legend>
          <div className="masthead-position-grid">
            <label>
              Start row
              <input
                aria-label="Start row"
                max={24}
                min={0}
                onChange={(event) => setMosaicStampRow(Number(event.target.value))}
                type="number"
                value={mosaicStampRow}
              />
            </label>
            <label>
              Start column
              <input
                aria-label="Start column"
                max={40}
                min={1}
                onChange={(event) => setMosaicStampColumn(Number(event.target.value))}
                type="number"
                value={mosaicStampColumn}
              />
            </label>
          </div>
        </fieldset>
        <div className="masthead-actions">
          <button
            className="masthead-primary-action"
            disabled={!selectedMosaicAlphabetId || mosaicText.length === 0}
            onClick={() =>
              onMosaicTextStamp(
                selectedMosaicAlphabetId,
                mosaicText,
                mosaicStampTarget.rowIndex,
                mosaicStampTarget.column
              )}
            type="button"
          >
            Stamp masthead
          </button>
          <button
            className="masthead-secondary-action"
            disabled={!selection}
            onClick={onBlankSpacerInsert}
            type="button"
          >
            Insert blank spacer
          </button>
        </div>
      </section>
      ) : null}

      {dockTab === "blocks" ? (
      <section>
        <h2>Blocks</h2>
        <p className="section-note">{rectangleLabel(rectangleSelection)}</p>
        <div className="block-panel-actions">
          <button disabled={!rectangleSelection} onClick={onBlockCopy} type="button">
            Copy block
          </button>
          <button disabled={!rectangleSelection} onClick={onBlockCut} type="button">
            Cut block
          </button>
          <button disabled={!blockClipboard} onClick={onBlockStamp} type="button">
            Stamp copied block
          </button>
          <button
            disabled={!rectangleSelection && !blockClipboard}
            onClick={onRectangleClear}
            type="button"
          >
            Clear block selection
          </button>
        </div>
        <p className="block-preview-meta">
          {blockClipboard
            ? `Clipboard: ${blockClipboard.width} by ${blockClipboard.height} cells`
            : "Clipboard empty"}
        </p>
        <fieldset className="block-save-form">
          <legend>Save copied block</legend>
          <label className="block-name-field">
            Block name
            <input
              aria-label="Block name"
              onChange={(event) => setBlockName(event.target.value)}
              placeholder="Name this strip or block"
              type="text"
              value={blockName}
            />
          </label>
          <label className="block-shortcut-field">
            Shortcut letter (optional)
            <input
              aria-label="Shortcut letter (optional)"
              maxLength={1}
              onChange={(event) => setLetterCharacter(event.target.value.toUpperCase())}
              type="text"
              value={letterCharacter}
            />
          </label>
          <button
            disabled={!blockClipboard || blockName.trim().length === 0}
            onClick={() => onBlockSave(blockName.trim(), letterCharacter || undefined)}
            type="button"
          >
            Save block
          </button>
        </fieldset>
        <h3>Saved blocks</h3>
        <div className="future-tool-list">
          {artworkBlocks.length === 0 ? (
            <span>No saved blocks</span>
          ) : artworkBlocks.map((block) => (
            <span key={block.id}>
              {block.name} {block.assignedCharacter ? `(${block.assignedCharacter})` : ""}
            </span>
          ))}
        </div>
      </section>
      ) : null}

      {dockTab === "page" ? (
      <>
      <section>
        <h2>X/0 Header</h2>
        <p className="section-note">Clock slot: columns 33-40. Current: {clockSourceLabel}.</p>
        <div className="segmented-control" aria-label="X/0 header clock source">
          <button
            aria-pressed={page.metadata.header.clockMode === "local"}
            onClick={() => onHeaderClockModeChange("local")}
            type="button"
          >
            Local clock
          </button>
          <button
            aria-pressed={page.metadata.header.clockMode === "none"}
            onClick={() => onHeaderClockModeChange("none")}
            type="button"
          >
            No clock
          </button>
          <button
            aria-pressed={page.metadata.header.clockMode === "original"}
            onClick={() => onHeaderClockModeChange("original")}
            type="button"
          >
            Original row
          </button>
        </div>
      </section>

      <section>
        <h2>Selection</h2>
        <dl className="inspector-list">
          <div>
            <dt>Page</dt>
            <dd>{page.pageNumber}</dd>
          </div>
          <div>
            <dt>Subpage</dt>
            <dd>{subpage.subcode}</dd>
          </div>
          <div>
            <dt>Template</dt>
            <dd data-testid="active-template-name">
              {activeTemplate?.name ?? "No template applied"}
            </dd>
          </div>
          <div>
            <dt>Cell</dt>
            <dd>{selectionLabel(selection)}</dd>
          </div>
        </dl>
      </section>

      <section>
        <h2>Next tools</h2>
        <div className="future-tool-list">
          <span>DRCS 12x10</span>
          <span>DRCS 6x5</span>
          <span>Palette/CLUT</span>
          <span>{dynamicRegionCount} dynamic regions</span>
          <span>Issues: {validationIssues.length}</span>
        </div>
      </section>
      </>
      ) : null}
      </div>
    </aside>
  );
}
