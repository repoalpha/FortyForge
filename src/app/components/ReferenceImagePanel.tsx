import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { TraceCellHint } from "../importTrace/screenshotTrace";
import type { CellSelection } from "../state/editorStore";

export type ReferenceZoom = "fit" | "100" | "150" | "200";
export type ReferenceInteractionMode = "tag-cells" | "move-grid";

export interface ReferenceGridAlignment {
  bottomPercent: number;
  leftPercent: number;
  rightPercent: number;
  topPercent: number;
}

export interface ReferenceGridAnchor {
  lineIndex: number;
  percent: number;
}

export interface ReferenceGridCalibration {
  xAnchors: ReferenceGridAnchor[];
  yAnchors: ReferenceGridAnchor[];
}

interface ReferenceImagePanelProps {
  gridAlignment: ReferenceGridAlignment;
  gridCalibration?: ReferenceGridCalibration;
  gridVisible: boolean;
  interactionMode: ReferenceInteractionMode;
  name: string;
  selectedCell?: CellSelection;
  traceCellHints?: TraceCellHint[];
  url: string;
  zoom: ReferenceZoom;
  onCellSelect?: (selection: CellSelection) => void;
  onGridLineDrag?: (axis: "x" | "y", lineIndex: number, percent: number) => void;
  onGridVisibleChange: (visible: boolean) => void;
  onInteractionModeChange: (mode: ReferenceInteractionMode) => void;
  onZoomChange: (zoom: ReferenceZoom) => void;
}

const ZOOM_OPTIONS: ReferenceZoom[] = ["fit", "100", "150", "200"];

function zoomLabel(zoom: ReferenceZoom) {
  return zoom === "fit" ? "Fit" : `${zoom}%`;
}

function interpolateGridPercents(
  lineCount: number,
  startPercent: number,
  endPercent: number,
  anchors: ReferenceGridAnchor[]
) {
  const byLine = new Map<number, number>();

  byLine.set(0, startPercent);
  byLine.set(lineCount, endPercent);
  anchors.forEach((anchor) => {
    if (anchor.lineIndex >= 0 && anchor.lineIndex <= lineCount) {
      byLine.set(anchor.lineIndex, anchor.percent);
    }
  });

  const sortedAnchors = [...byLine.entries()]
    .map(([lineIndex, percent]) => ({ lineIndex, percent }))
    .sort((first, second) => first.lineIndex - second.lineIndex);
  const lines = Array.from({ length: lineCount + 1 }, () => 0);

  for (let anchorIndex = 0; anchorIndex < sortedAnchors.length - 1; anchorIndex += 1) {
    const start = sortedAnchors[anchorIndex];
    const end = sortedAnchors[anchorIndex + 1];
    const span = end.lineIndex - start.lineIndex;

    for (let lineIndex = start.lineIndex; lineIndex <= end.lineIndex; lineIndex += 1) {
      const fraction = span === 0 ? 0 : (lineIndex - start.lineIndex) / span;

      lines[lineIndex] = start.percent + ((end.percent - start.percent) * fraction);
    }
  }

  return lines;
}

export function ReferenceImagePanel({
  gridAlignment,
  gridCalibration,
  gridVisible,
  interactionMode,
  name,
  selectedCell,
  traceCellHints = [],
  url,
  zoom,
  onCellSelect,
  onGridLineDrag,
  onGridVisibleChange,
  onInteractionModeChange,
  onZoomChange
}: ReferenceImagePanelProps) {
  const gridOverlayRef = useRef<HTMLDivElement | null>(null);
  const [draggedLine, setDraggedLine] = useState<
    { axis: "x" | "y"; lineIndex: number } | undefined
  >();
  const gridStyle: CSSProperties = {
    bottom: `${gridAlignment.bottomPercent}%`,
    left: `${gridAlignment.leftPercent}%`,
    right: `${gridAlignment.rightPercent}%`,
    top: `${gridAlignment.topPercent}%`
  };
  const traceHintsByCell = new Map(
    traceCellHints.map((hint) => [`${hint.rowIndex}:${hint.column}`, hint])
  );
  const hasCalibratedGrid =
    (gridCalibration?.xAnchors.length ?? 0) > 0
    || (gridCalibration?.yAnchors.length ?? 0) > 0;
  const gridWidthPercent = 100 - gridAlignment.leftPercent - gridAlignment.rightPercent;
  const gridHeightPercent = 100 - gridAlignment.topPercent - gridAlignment.bottomPercent;
  const xLinePercents = interpolateGridPercents(
    40,
    gridAlignment.leftPercent,
    100 - gridAlignment.rightPercent,
    gridCalibration?.xAnchors ?? []
  );
  const yLinePercents = interpolateGridPercents(
    25,
    gridAlignment.topPercent,
    100 - gridAlignment.bottomPercent,
    gridCalibration?.yAnchors ?? []
  );

  function percentWithinOverlay(axis: "x" | "y", percent: number) {
    if (axis === "x") {
      return ((percent - gridAlignment.leftPercent) / gridWidthPercent) * 100;
    }

    return ((percent - gridAlignment.topPercent) / gridHeightPercent) * 100;
  }

  function updateDraggedGridLine(axis: "x" | "y", lineIndex: number, clientX: number, clientY: number) {
    const bounds = gridOverlayRef.current?.getBoundingClientRect();
    const pointerCoordinate = axis === "x" ? clientX : clientY;

    if (!bounds || !onGridLineDrag || !Number.isFinite(pointerCoordinate)) {
      return;
    }

    const localPercent = axis === "x"
      ? ((clientX - bounds.left) / Math.max(1, bounds.width)) * 100
      : ((clientY - bounds.top) / Math.max(1, bounds.height)) * 100;
    const clampedLocalPercent = Math.min(100, Math.max(0, localPercent));
    const percent = axis === "x"
      ? gridAlignment.leftPercent + ((clampedLocalPercent / 100) * gridWidthPercent)
      : gridAlignment.topPercent + ((clampedLocalPercent / 100) * gridHeightPercent);

    onGridLineDrag(axis, lineIndex, Number(percent.toFixed(3)));
  }

  useEffect(() => {
    if (!draggedLine) {
      return undefined;
    }

    const activeDraggedLine = draggedLine;

    function handlePointerMove(event: PointerEvent) {
      updateDraggedGridLine(
        activeDraggedLine.axis,
        activeDraggedLine.lineIndex,
        event.clientX,
        event.clientY
      );
    }

    function handlePointerUp() {
      setDraggedLine(undefined);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [draggedLine, gridAlignment, gridHeightPercent, gridWidthPercent, onGridLineDrag]);

  return (
    <section className="reference-panel" role="region" aria-label="Reference screenshot">
      <header className="reference-panel-header">
        <div>
          <h2>Reference</h2>
          <p className="section-note">{name}</p>
        </div>
        <button
          aria-pressed={gridVisible}
          onClick={() => onGridVisibleChange(!gridVisible)}
          type="button"
        >
          {gridVisible ? "Hide grid" : "Show grid"}
        </button>
      </header>

      <div className="reference-toolbar" aria-label="Reference zoom">
        {ZOOM_OPTIONS.map((option) => (
          <button
            aria-pressed={zoom === option}
            key={option}
            onClick={() => onZoomChange(option)}
            type="button"
          >
            {zoomLabel(option)}
          </button>
        ))}
      </div>

      <div className="reference-toolbar" aria-label="Reference interaction mode">
        <button
          aria-pressed={interactionMode === "tag-cells"}
          onClick={() => onInteractionModeChange("tag-cells")}
          type="button"
        >
          Tag cells
        </button>
        <button
          aria-pressed={interactionMode === "move-grid"}
          onClick={() => onInteractionModeChange("move-grid")}
          type="button"
        >
          Move grid lines
        </button>
      </div>

      <div className={`reference-image-frame reference-zoom-${zoom}`}>
        <div className="reference-image-stage">
          <img alt={`Reference screenshot ${name}`} src={url} />
          {gridVisible ? (
            <div
              className="reference-grid-overlay"
              data-calibrated-grid={hasCalibratedGrid ? "true" : undefined}
              data-testid="reference-grid-overlay"
              ref={gridOverlayRef}
              style={gridStyle}
            >
              {onCellSelect && interactionMode === "tag-cells" ? (
                <div className="reference-cell-grid" aria-label="Reference trace cells">
                  {Array.from({ length: 25 }, (_, rowIndex) =>
                    Array.from({ length: 40 }, (_, column) => {
                      const hint = traceHintsByCell.get(`${rowIndex}:${column}`);
                      const selected =
                        selectedCell?.rowIndex === rowIndex && selectedCell.column === column;

                      return (
                        <button
                          aria-label={`Reference row ${rowIndex + 1} column ${column + 1}`}
                          aria-pressed={selected}
                          className="reference-cell-button"
                          data-trace-hint={hint?.kind}
                          key={`${rowIndex}-${column}`}
                          onClick={() => onCellSelect({ rowIndex, column })}
                          title={`R${rowIndex + 1} C${column + 1}`}
                          type="button"
                        />
                      );
                    })
                  )}
                </div>
              ) : null}
              {hasCalibratedGrid ? (
                <div className="reference-calibrated-grid-lines" aria-hidden="true">
                  {xLinePercents.map((percent, lineIndex) => (
                    <span
                      className="reference-calibrated-grid-line reference-calibrated-grid-line-vertical reference-grid-line-visual"
                      key={`x-visual-${lineIndex}`}
                      style={{
                        left: `${percentWithinOverlay("x", percent)}%`
                      }}
                    />
                  ))}
                  {yLinePercents.map((percent, lineIndex) => (
                    <span
                      className="reference-calibrated-grid-line reference-calibrated-grid-line-horizontal reference-grid-line-visual"
                      key={`y-visual-${lineIndex}`}
                      style={{
                        top: `${percentWithinOverlay("y", percent)}%`
                      }}
                    />
                  ))}
                </div>
              ) : null}
              {interactionMode === "move-grid" ? (
                <div className="reference-calibrated-grid-lines reference-grid-handle-layer">
                {xLinePercents.map((percent, lineIndex) => (
                  <button
                    aria-label={`Drag grid column line ${lineIndex + 1}`}
                    aria-valuemax={100}
                    aria-valuemin={0}
                    aria-valuenow={Number(percent.toFixed(3))}
                    className="reference-calibrated-grid-line reference-calibrated-grid-line-vertical reference-grid-line-handle"
                    key={`x-${lineIndex}`}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setDraggedLine({ axis: "x", lineIndex });
                      updateDraggedGridLine("x", lineIndex, event.clientX, event.clientY);
                    }}
                    style={{
                      left: `${percentWithinOverlay("x", percent)}%`
                    }}
                    title={`Column line ${lineIndex + 1}`}
                    type="button"
                  />
                ))}
                {yLinePercents.map((percent, lineIndex) => (
                  <button
                    aria-label={`Drag grid row line ${lineIndex + 1}`}
                    aria-valuemax={100}
                    aria-valuemin={0}
                    aria-valuenow={Number(percent.toFixed(3))}
                    className="reference-calibrated-grid-line reference-calibrated-grid-line-horizontal reference-grid-line-handle"
                    key={`y-${lineIndex}`}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setDraggedLine({ axis: "y", lineIndex });
                      updateDraggedGridLine("y", lineIndex, event.clientX, event.clientY);
                    }}
                    style={{
                      top: `${percentWithinOverlay("y", percent)}%`
                    }}
                    title={`Row line ${lineIndex + 1}`}
                    type="button"
                  />
                ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
