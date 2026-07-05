import { useEffect, useMemo, useState, type CSSProperties } from "react";

import { PageNavigator } from "./components/PageNavigator";
import {
  ReferenceImagePanel,
  type ReferenceGridAlignment,
  type ReferenceGridCalibration,
  type ReferenceInteractionMode,
  type ReferenceZoom
} from "./components/ReferenceImagePanel";
import { TeletextCanvas } from "./components/TeletextCanvas";
import { TemplateLibrary } from "./components/TemplateLibrary";
import {
  ToolDock,
  type MosaicPaintMode,
  type TraceCalibrationPosition,
  type TraceDockStatus
} from "./components/ToolDock";
import { ValidationPanel } from "./components/ValidationPanel";
import {
  createCalibratedTraceGrid,
  createTraceGridFromBounds,
  detectEdgeAssistedTraceGrid,
  scanTeletextScreenshot,
  traceTeletextScreenshot,
  type TraceCellHint,
  type TraceCellHintKind,
  type TraceGrid,
  type TraceGridBounds,
  type TraceImageData
} from "./importTrace/screenshotTrace";
import {
  addSubpageCommand,
  applyTemplateCommand,
  composeExportRows,
  createCitynewsCompactMastheadAlphabet,
  createCitynewsMastheadAlphabet,
  createEditorHistory,
  clearRowCommand,
  clearCellRectangleCommand,
  copyCellsFromRectangle,
  deleteCustomTemplateCommand,
  deleteCellWithRowShiftCommand,
  editMosaicSixelCommand,
  exportNativeProject,
  exportTti,
  getControlCodeByByte,
  importNativeProject,
  insertBlankSpacerWithRowShiftCommand,
  insertBackgroundColourWithRowShiftCommand,
  insertControlCodeWithRowShiftCommand,
  insertTextCommand,
  paintMosaicCommand,
  paintCellBackgroundCommand,
  replaceSubpageRowsCommand,
  saveCellBlockAsArtworkCommand,
  saveCurrentPageAsTemplateCommand,
  setMosaicForegroundCommand,
  setPageHeaderClockModeCommand,
  stampCellBlockCommand,
  stampMosaicTextCommand
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
  EditorCommand,
  EditorHistory,
  MosaicAlphabet,
  PageHeaderSettings,
  Project,
  TeletextColourRef,
  TeletextRow
} from "../core";

type LayoutMode = "studio" | "playout";
const LOCAL_PROJECT_KEY = "fortyforge.currentProject";
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

function loadInitialHistory() {
  const savedProject = window.localStorage.getItem(LOCAL_PROJECT_KEY);

  if (!savedProject) {
    return createInitialEditorHistory();
  }

  try {
    let importedProject = importNativeProject(savedProject);

    if (importedProject.mosaicAlphabets.some((alphabet) => alphabet.id === "dev-pixelcast-alphabet")) {
      importedProject.mosaicAlphabets = [];
    }

    importedProject = refreshBuiltInMastheadAlphabets(importedProject);

    return createEditorHistory(importedProject);
  } catch {
    return createInitialEditorHistory();
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
  rows: TeletextRow[]
): EditorCommand {
  const replaceRows = replaceSubpageRowsCommand(serviceId, pageId, subpageId, rows);
  const useOriginalHeader = setPageHeaderClockModeCommand(serviceId, pageId, "original");

  return {
    id: "import-trace-rows",
    label: "Import trace rows",
    apply(project) {
      const withRows = replaceRows.apply(project);

      return withRows === project ? project : useOriginalHeader.apply(withRows);
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
  const [selection, setSelection] = useState<CellSelection | undefined>();
  const [rectangleSelection, setRectangleSelection] = useState<CellRectangle | undefined>();
  const [blockClipboard, setBlockClipboard] = useState<CellBlock | undefined>();
  const [blockPreviewTarget, setBlockPreviewTarget] = useState<CellSelection | undefined>();
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("studio");
  const [previewProfileId, setPreviewProfileId] =
    useState<TeletextPreviewProfileId>("studio-large");
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
    useState<MosaicPaintMode>({ kind: "freestyle" });
  const [mosaicForeground, setMosaicForeground] =
    useState<TeletextColourRef>({ palette: "level1", index: 7 });
  const [clockNow, setClockNow] = useState(() => new Date());
  const [saveMessage, setSaveMessage] = useState("Not saved");
  const [activeSubpageId, setActiveSubpageId] = useState<string | undefined>();
  const editor = useMemo(
    () => createEditorViewModel(history.present, activeSubpageId),
    [activeSubpageId, history.present]
  );
  const displayRows = useMemo(
    () => composeExportRows(editor.page, editor.subpage, clockNow),
    [clockNow, editor.page, editor.subpage]
  );

  useEffect(() => {
    setHistory((currentHistory) =>
      refreshHistoryBuiltInMastheadAlphabets(currentHistory)
    );
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(new Date()), 1000);

    return () => window.clearInterval(timer);
  }, []);

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

      window.localStorage.setItem(LOCAL_PROJECT_KEY, exportNativeProject(nextHistory.present));
      setSaveMessage(`Deleted ${template.name}`);

      return nextHistory;
    });
  }

  function commitSubpageAdd() {
    const nextSubpageId = `subpage-${editor.page.subpages.length.toString().padStart(4, "0")}`;

    setHistory((currentHistory) =>
      commitEditorHistory(
        currentHistory,
        addSubpageCommand(editor.service.id, editor.page.id)
      )
    );
    setActiveSubpageId(nextSubpageId);
    setSelection(undefined);
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

  function commitMosaicPresetPaint(rowIndex: number, column: number, sixelMask: number) {
    setHistory((currentHistory) =>
      commitEditorHistory(
        currentHistory,
        paintMosaicCommand(
          editor.service.id,
          editor.page.id,
          editor.subpage.id,
          rowIndex,
          column,
          sixelMask,
          mosaicForeground
        )
      )
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

  async function importTraceReference() {
    if (!traceReferenceImage) {
      return;
    }

    const file = traceReferenceImage.file;

    setTraceStatus({
      state: "loading",
      message: `Tracing ${file.name}...`,
      warnings: []
    });

    try {
      const imageData = await imageDataFromFile(file);
      const traceGridBounds = traceGridBoundsFromAlignment(imageData, traceGridAlignment);
      const hasCalibration =
        traceGridCalibration.xAnchors.length > 0 || traceGridCalibration.yAnchors.length > 0;
      const traceGrid = hasCalibration
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
        : createTraceGridFromBounds(imageData, traceGridBounds);
      const trace = traceTeletextScreenshot(imageData, traceGrid, traceCellHints);

      setHistory((currentHistory) =>
        commitEditorHistory(
          currentHistory,
          importTraceRowsCommand(
            editor.service.id,
            editor.page.id,
            editor.subpage.id,
            trace.rows
          )
        )
      );
      setSelection(undefined);
      setTraceStatus({
        state: "done",
        message: `Imported ${file.name} into editable rows.`,
        confidence: trace.confidence,
        warnings: trace.warnings
      });
      setSaveMessage(`Imported trace ${new Date().toLocaleTimeString()}`);
    } catch (error) {
      setTraceStatus({
        state: "error",
        message: error instanceof Error ? error.message : "Could not import screenshot.",
        warnings: []
      });
    }
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

    setTraceStatus({
      state: "loading",
      message: `Scanning ${file.name}...`,
      warnings: []
    });

    try {
      const imageData = await imageDataFromFile(file);
      const traceGridBounds = traceGridBoundsFromAlignment(imageData, traceGridAlignment);
      const scan = scanTeletextScreenshot(imageData, {
        bounds: traceGridBounds,
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
            scan.rows
          )
        )
      );
      setSelection(undefined);
      setTraceGridCalibration(suggestedCalibration);
      setTraceReferenceGridVisible(true);
      setTraceReferenceInteractionMode("tag-cells");
      setTraceStatus({
        state: "done",
        message: `Scanned ${file.name} into editable rows with finite-template matching.`,
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
    window.localStorage.setItem(LOCAL_PROJECT_KEY, exportNativeProject(history.present));
    setSaveMessage(`Saved locally ${new Date().toLocaleTimeString()}`);
  }

  function saveTemplate() {
    setHistory((currentHistory) => {
      const nextHistory = commitEditorHistory(
        currentHistory,
        saveCurrentPageAsTemplateCommand(editor.service.id, editor.page.id)
      );
      window.localStorage.setItem(LOCAL_PROJECT_KEY, exportNativeProject(nextHistory.present));
      return nextHistory;
    });
    setSaveMessage(`Saved template locally ${new Date().toLocaleTimeString()}`);
  }

  function downloadProject() {
    downloadTextFile(
      "fortyforge-project.pttx.json",
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

  const referenceVisible = traceReferenceImage !== undefined;
  const referenceWorkbenchStyle = referenceVisible
    ? {
      "--reference-panel-width": `${traceReferencePanelWidth}px`
    } as CSSProperties
    : undefined;

  return (
    <main className={`app-shell ${layoutMode === "playout" ? "playout-shell" : "studio-shell"}`}>
      <aside className="sidebar" aria-label="Service navigator">
        <div className="brand">
          <span className="brand-mark">40</span>
          <div>
            <h1>FortyForge</h1>
            <p>Teletext page editor</p>
          </div>
        </div>

        <PageNavigator
          activeSubpageId={editor.subpage.id}
          onSubpageAdd={commitSubpageAdd}
          onSubpageSelect={(subpageId) => {
            setActiveSubpageId(subpageId);
            setSelection(undefined);
          }}
          pages={editor.service.pages}
          service={editor.service}
        />

        <TemplateLibrary
          onTemplateApply={commitTemplate}
          onTemplateDelete={deleteTemplate}
          templates={editor.templates}
        />
      </aside>

      <section className="workspace" aria-label="Teletext workspace">
        <header className="toolbar">
          <div>
            <p className="eyebrow">Level {editor.page.metadata.targetPresentationLevel} authoring</p>
            <h2>Page {editor.page.pageNumber}</h2>
            <p>Subpage {editor.subpage.subcode}</p>
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
            <button type="button">Preview Level 1</button>
            <button onClick={saveTemplate} type="button">Save as template</button>
            <button onClick={saveProject} type="button">Save</button>
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
            blockPreview={blockClipboard && blockPreviewTarget
              ? { block: blockClipboard, target: blockPreviewTarget }
              : undefined}
            mosaicPaintMode={mosaicPaintMode}
            onBlockPreviewTargetChange={setBlockPreviewTarget}
            onBlockStamp={commitBlockStamp}
            onCellSelect={setSelection}
            onCellDelete={commitCellDelete}
            onMosaicPresetPaint={commitMosaicPresetPaint}
            onMosaicSixelEdit={commitMosaicSixelEdit}
            onRectangleClear={clearBlockSelection}
            onRectangleSelect={setRectangleSelection}
            onRedo={redoEdit}
            onRowClear={commitRowClear}
            onTextInput={commitText}
            onUndo={undoEdit}
            previewProfileId={previewProfileId}
            rectangleSelection={rectangleSelection}
            rows={displayRows}
            selection={selection}
          />

          {traceReferenceImage ? (
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

        <ValidationPanel
          issues={editor.validationIssues}
          packetPreview={editor.packetPreview}
        />
        <p className="save-status" role="status">{saveMessage}</p>
      </section>

      <ToolDock
        activeTool={activeTool}
        artworkBlocks={editor.project.artworkBlocks}
        blockClipboard={blockClipboard}
        disabled={!selection}
        mosaicPaintMode={mosaicPaintMode}
        page={editor.page}
        rectangleSelection={rectangleSelection}
        subpage={editor.subpage}
        templates={editor.templates}
        mosaicAlphabets={editor.project.mosaicAlphabets}
        validationIssues={editor.validationIssues}
        selection={selection}
        onBackgroundSelect={commitBackgroundColour}
        onBlankSpacerInsert={commitBlankSpacerInsert}
        onBlockCopy={copySelectedBlock}
        onBlockCut={cutSelectedBlock}
        onBlockSave={commitBlockSave}
        onBlockStamp={() => commitBlockStamp()}
        onControlSelect={commitControlCode}
        onHeaderClockModeChange={commitHeaderClockMode}
        onMosaicPaint={commitMosaicPaint}
        onMosaicPaintModeChange={setMosaicPaintMode}
        onMosaicTextStamp={commitMosaicTextStamp}
        onTraceAutoImport={() => {
          void importTraceReference();
        }}
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
