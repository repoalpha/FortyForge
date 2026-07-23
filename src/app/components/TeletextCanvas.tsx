import { useEffect, useMemo, useRef, useState } from "react";

import { renderLevel1Row } from "../../core";
import type {
  Cell,
  CellBlock,
  CellRectangle,
  EnhancementPacket,
  G3LineCode,
  MosaicSixelOperation,
  TeletextFontProfileId,
  TeletextRow
} from "../../core";
import { extractG3LineCells } from "../../core";
import type { RenderedLevel1Cell, RenderedLevel1Row } from "../../core";
import {
  drawBitmapGlyph,
  drawMosaicGlyph
} from "../preview/bitmapGlyphRenderer";
import { drawG3LineGlyph } from "../preview/g3LineRenderer";
import { level1ColourToCss } from "../preview/teletextColours";
import {
  getTeletextPreviewProfile,
  hitTestTeletextViewport
} from "../preview/teletextViewport";
import type { TeletextPreviewProfileId } from "../preview/teletextViewport";
import type { CellSelection } from "../state/editorStore";
import type { G3LinePaintMode, MosaicPaintMode } from "./ToolDock";

const COLUMN_COUNT = 40;
const ROW_COUNT = 25;
export const FRAMEBUFFER_CELL_WIDTH = 12;
export const FRAMEBUFFER_CELL_HEIGHT = 20;
export const PIT_STRICT_CELL_WIDTH = 12;
export const PIT_STRICT_CELL_HEIGHT = 20;
export type EditorTool = "text" | "lines" | "mosaic" | "import-trace" | "blocks";

interface TeletextCanvasProps {
  rows: TeletextRow[];
  selection?: CellSelection;
  activeTool?: EditorTool;
  blockPreview?: {
    block: CellBlock;
    target: CellSelection;
  };
  enhancementPackets?: EnhancementPacket[];
  animateFlash?: boolean;
  linePaintMode?: G3LinePaintMode;
  mosaicPaintMode?: MosaicPaintMode;
  previewProfileId?: TeletextPreviewProfileId;
  receiverFontProfileId?: TeletextFontProfileId;
  revealConcealed?: boolean;
  readOnly?: boolean;
  rectangleSelection?: CellRectangle;
  onBlockPreviewTargetChange?: (selection: CellSelection) => void;
  onBlockStamp?: (selection: CellSelection) => void;
  onCellSelect: (selection: CellSelection) => void;
  onCellDelete: () => void;
  onG3LinePaint?: (
    rowIndex: number,
    column: number,
    code: G3LineCode | undefined,
    options?: { coalesceWithPrevious?: boolean }
  ) => void;
  onRectangleClear?: () => void;
  onRectangleSelect?: (rectangle: CellRectangle) => void;
  onRowClear?: () => void;
  onMosaicSixelEdit?: (
    rowIndex: number,
    column: number,
    sixelIndex: number,
    operation: MosaicSixelOperation
  ) => void;
  onMosaicPresetPaint?: (
    rowIndex: number,
    column: number,
    sixelMask: number,
    options?: { coalesceWithPrevious?: boolean }
  ) => void;
  onRedo?: () => void;
  onTextInput: (value: string) => void;
  onUndo?: () => void;
}

function cellText(cell: Cell): string {
  if (cell.kind === "character") {
    return cell.character?.value ?? String.fromCharCode(cell.byte);
  }

  if (cell.kind === "control") {
    return "";
  }

  if (cell.kind === "mosaic" || cell.kind === "drcs") {
    return String.fromCharCode(cell.byte);
  }

  return "";
}

function renderedCellHeight(
  doubleHeight: boolean,
  rowIndex: number,
  cellHeight: number,
  viewportHeight: number
) {
  const y = rowIndex * cellHeight;

  return doubleHeight
    ? Math.min(cellHeight * 2, viewportHeight - y)
    : cellHeight;
}

export function displayBackgroundForRenderedCell(cell: RenderedLevel1Cell) {
  return level1ColourToCss(cell.background);
}

export function level1RenderOptionsForPreview(profileId: TeletextPreviewProfileId) {
  return profileId === "pit-strict"
    ? {}
    : {
      useCellBackgroundColours: true,
      useMosaicCellColours: true
    };
}

export function mosaicMaskForRenderedCell(cell: RenderedLevel1Cell) {
  if (cell.source.kind === "mosaic" && cell.source.mosaic) {
    return cell.source.mosaic.sixelMask;
  }

  if (cell.mode === "graphics" && cell.visible) {
    return cell.source.byte & 0x3f;
  }

  return undefined;
}

export function mosaicSeparatedForPreview(
  cell: RenderedLevel1Cell,
  profileId: TeletextPreviewProfileId
) {
  if (cell.heldMosaicSeparated !== undefined) return cell.heldMosaicSeparated;
  if (profileId === "pit-strict") return cell.separatedGraphics;

  return cell.source.kind === "mosaic"
    ? Boolean(cell.source.mosaic?.separated || cell.separatedGraphics)
    : cell.separatedGraphics;
}

export function sixelIndexFromCellPoint(
  x: number,
  y: number,
  cellWidth: number,
  cellHeight: number
) {
  const blockColumn = Math.min(1, Math.max(0, Math.floor((x / cellWidth) * 2)));
  const blockRow = Math.min(2, Math.max(0, Math.floor((y / cellHeight) * 3)));

  return blockRow * 2 + blockColumn;
}

export function isCoveredByDoubleHeightCell(
  renderedRows: Array<{ renderedRow?: RenderedLevel1Row; cells?: RenderedLevel1Cell[] }>,
  rowIndex: number,
  column: number
) {
  if (rowIndex <= 0) {
    return false;
  }

  const previousCells = renderedRows[rowIndex - 1]?.renderedRow?.cells
    ?? renderedRows[rowIndex - 1]?.cells;
  const previousCell = previousCells?.[column];

  return Boolean(previousCell?.visible && previousCell.doubleHeight);
}

type CanvasPointerLikeEvent =
  | React.MouseEvent<HTMLCanvasElement>
  | React.PointerEvent<HTMLCanvasElement>;

function operationFromPointerEvent(event: CanvasPointerLikeEvent) {
  return event.button === 2 || (event.buttons & 2) === 2 ? "clear" : "toggle";
}

export function TeletextCanvas({
  activeTool = "text",
  animateFlash = true,
  blockPreview,
  enhancementPackets = [],
  linePaintMode = { code: 0x51, level1Fallback: true },
  mosaicPaintMode = { kind: "inactive" },
  previewProfileId = "studio-large",
  receiverFontProfileId = "ets-1990s",
  revealConcealed = false,
  readOnly = false,
  rectangleSelection,
  rows,
  selection,
  onBlockPreviewTargetChange,
  onBlockStamp,
  onCellSelect,
  onCellDelete,
  onG3LinePaint,
  onMosaicPresetPaint,
  onMosaicSixelEdit,
  onRectangleClear,
  onRectangleSelect,
  onRedo,
  onRowClear,
  onTextInput,
  onUndo
}: TeletextCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const arrowRepeatActiveRef = useRef(false);
  const isPaintingRef = useRef(false);
  const lastLineCellRef = useRef<string | undefined>(undefined);
  const rectangleAnchorRef = useRef<CellSelection | undefined>(undefined);
  const [flashVisible, setFlashVisible] = useState(true);
  const columns = Array.from({ length: COLUMN_COUNT }, (_, index) => index + 1);
  const rowLabels = Array.from({ length: ROW_COUNT }, (_, index) => index === 0 ? "X/0" : String(index));
  const viewport = useMemo(
    () => getTeletextPreviewProfile(previewProfileId),
    [previewProfileId]
  );

  useEffect(() => {
    if (!animateFlash) {
      setFlashVisible(true);
      return;
    }

    const updateFlashPhase = () => {
      setFlashVisible(Date.now() % 1000 < 750);
    };
    updateFlashPhase();
    const interval = window.setInterval(updateFlashPhase, 125);

    return () => window.clearInterval(interval);
  }, [animateFlash]);

  function rectangleFromCells(first: CellSelection, second: CellSelection): CellRectangle {
    return {
      startRow: first.rowIndex,
      startColumn: first.column,
      endRow: second.rowIndex,
      endColumn: second.column
    };
  }

  function drawRectangleOverlay(
    context: CanvasRenderingContext2D,
    rectangle: CellRectangle,
    colour: string,
    fill = false
  ) {
    const startRow = Math.min(rectangle.startRow, rectangle.endRow);
    const endRow = Math.max(rectangle.startRow, rectangle.endRow);
    const startColumn = Math.min(rectangle.startColumn, rectangle.endColumn);
    const endColumn = Math.max(rectangle.startColumn, rectangle.endColumn);
    const x = startColumn * viewport.cellWidth + 1;
    const y = startRow * viewport.cellHeight + 1;
    const width = (endColumn - startColumn + 1) * viewport.cellWidth - 2;
    const height = (endRow - startRow + 1) * viewport.cellHeight - 2;

    if (fill) {
      context.fillStyle = colour;
      context.fillRect(x, y, width, height);
      return;
    }

    context.strokeStyle = colour;
    context.lineWidth = 2;
    context.strokeRect(x, y, width, height);
  }

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas || typeof globalThis.CanvasRenderingContext2D === "undefined") {
      return;
    }

    let context: CanvasRenderingContext2D | null = null;

    try {
      context = canvas.getContext("2d");
    } catch {
      return;
    }

    if (!context) {
      return;
    }

    context.fillStyle = "#000";
    context.fillRect(0, 0, viewport.width, viewport.height);

    const renderedRows = rows.map((row) => ({
      row,
      renderedRow: renderLevel1Row(row, {
        ...level1RenderOptionsForPreview(previewProfileId),
        flashPhase: flashVisible ? "on" : "off",
        revealMode: revealConcealed ? "show" : "hide"
      })
    }));
    const g3Lines = extractG3LineCells(enhancementPackets);
    const enhancedCells = new Set(
      g3Lines.map((line) => `${line.rowIndex}:${line.column}`)
    );

    for (const { row, renderedRow } of renderedRows) {
      for (const cell of renderedRow.cells) {
        if (isCoveredByDoubleHeightCell(renderedRows, row.index, cell.column)) {
          continue;
        }

        const x = cell.column * viewport.cellWidth;
        const y = row.index * viewport.cellHeight;
        const cellHeight = renderedCellHeight(
          cell.doubleHeight,
          row.index,
          viewport.cellHeight,
          viewport.height
        );
        context.fillStyle = displayBackgroundForRenderedCell(cell);
        context.fillRect(x, y, viewport.cellWidth, cellHeight);
      }
    }

    for (const { row, renderedRow } of renderedRows) {
      for (const cell of renderedRow.cells) {
        if (isCoveredByDoubleHeightCell(renderedRows, row.index, cell.column)) {
          continue;
        }

        const x = cell.column * viewport.cellWidth;
        const y = row.index * viewport.cellHeight;
        const cellHeight = renderedCellHeight(
          cell.doubleHeight,
          row.index,
          viewport.cellHeight,
          viewport.height
        );

        if (enhancedCells.has(`${row.index}:${cell.column}`)) {
          continue;
        }

        const sixelMask = mosaicMaskForRenderedCell(cell);

        if (sixelMask !== undefined) {
          drawMosaicGlyph(context, {
            cellHeight,
            cellWidth: viewport.cellWidth,
            colour: level1ColourToCss(cell.foreground),
            separated: mosaicSeparatedForPreview(cell, previewProfileId),
            sixelMask,
            x,
            y
          });
        } else if (cell.visible && cell.value) {
          drawBitmapGlyph(context, {
            cellHeight,
            cellWidth: viewport.cellWidth,
            colour: level1ColourToCss(cell.foreground),
            profileId: receiverFontProfileId,
            value: cell.value,
            x,
            y
          });
        }
      }
    }

    for (const line of g3Lines) {
      const renderedCell = renderedRows[line.rowIndex]?.renderedRow.cells[line.column];

      if (!renderedCell) {
        continue;
      }

      drawG3LineGlyph(context, {
        cellHeight: viewport.cellHeight,
        cellWidth: viewport.cellWidth,
        code: line.code,
        colour: level1ColourToCss(renderedCell.foreground),
        x: line.column * viewport.cellWidth,
        y: line.rowIndex * viewport.cellHeight
      });
    }

    if (selection && previewProfileId !== "pit-strict") {
      context.strokeStyle = "#f2d15c";
      context.lineWidth = 2;
      context.strokeRect(
        selection.column * viewport.cellWidth + 1,
        selection.rowIndex * viewport.cellHeight + 1,
        viewport.cellWidth - 2,
        viewport.cellHeight - 2
      );
    }

    if (rectangleSelection) {
      drawRectangleOverlay(context, rectangleSelection, "#62d6ff");
    }

    if (blockPreview) {
      const previewRectangle = {
        startRow: blockPreview.target.rowIndex,
        startColumn: blockPreview.target.column,
        endRow: blockPreview.target.rowIndex + blockPreview.block.height - 1,
        endColumn: blockPreview.target.column + blockPreview.block.width - 1
      };

      drawRectangleOverlay(context, previewRectangle, "rgba(98, 214, 255, 0.22)", true);
      drawRectangleOverlay(context, previewRectangle, "#62d6ff");
    }
  }, [blockPreview, enhancementPackets, flashVisible, previewProfileId, receiverFontProfileId, revealConcealed, rows, rectangleSelection, selection, viewport]);

  function selectCell(nextSelection: CellSelection) {
    if (readOnly) return;
    onCellSelect(nextSelection);
    gridRef.current?.focus({ preventScroll: true });
  }

  function hitTestCanvasPointer(event: CanvasPointerLikeEvent) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const boundsWidth = bounds.width || viewport.width;
    const boundsHeight = bounds.height || viewport.height;
    const x = ((event.clientX - bounds.left) / boundsWidth) * viewport.width;
    const y = ((event.clientY - bounds.top) / boundsHeight) * viewport.height;
    const hit = hitTestTeletextViewport(viewport, x, y);

    if (!hit) {
      return undefined;
    }

    return {
      hit,
      sixelIndex: sixelIndexFromCellPoint(
        x - hit.column * viewport.cellWidth,
        y - hit.rowIndex * viewport.cellHeight,
        viewport.cellWidth,
        viewport.cellHeight
      )
    };
  }

  function applyMosaicPointerEdit(event: CanvasPointerLikeEvent) {
    const target = hitTestCanvasPointer(event);

    if (!target) {
      return;
    }

    arrowRepeatActiveRef.current = false;
    selectCell(target.hit);

    if (activeTool !== "mosaic") {
      return;
    }

    event.preventDefault();

    if (mosaicPaintMode.kind === "inactive") {
      return;
    }

    if (mosaicPaintMode.kind === "preset") {
      onMosaicPresetPaint?.(
        target.hit.rowIndex,
        target.hit.column,
        mosaicPaintMode.mask
      );
      return;
    }

    if (onMosaicSixelEdit) {
      onMosaicSixelEdit(
        target.hit.rowIndex,
        target.hit.column,
        target.sixelIndex,
        operationFromPointerEvent(event)
      );
    }
  }

  function applyLinePointerEdit(event: CanvasPointerLikeEvent) {
    const target = hitTestCanvasPointer(event);

    if (!target || activeTool !== "lines" || !onG3LinePaint || target.hit.rowIndex === 0) {
      return;
    }

    event.preventDefault();
    selectCell(target.hit);
    const key = `${target.hit.rowIndex}:${target.hit.column}`;

    if (lastLineCellRef.current === key) {
      return;
    }

    onG3LinePaint(
      target.hit.rowIndex,
      target.hit.column,
      event.button === 2 || (event.buttons & 2) === 2 ? undefined : linePaintMode.code,
      { coalesceWithPrevious: lastLineCellRef.current !== undefined }
    );
    lastLineCellRef.current = key;
  }

  function stampPresetAtSelectionOffset(offset: -1 | 1) {
    if (
      activeTool !== "mosaic"
      || mosaicPaintMode.kind !== "preset"
      || !selection
      || !onMosaicPresetPaint
    ) {
      return false;
    }

    const nextColumn = selection.column + offset;

    if (nextColumn < 0 || nextColumn > 39) {
      return true;
    }

    onMosaicPresetPaint(selection.rowIndex, nextColumn, mosaicPaintMode.mask, {
      coalesceWithPrevious: arrowRepeatActiveRef.current
    });
    arrowRepeatActiveRef.current = true;
    return true;
  }

  return (
    <div className="canvas-frame">
      <div
        className="teletext-frame-grid"
        style={{ maxWidth: `${viewport.displayWidth + 34}px` }}
      >
        <div className="ruler-corner" aria-hidden="true" />
        <div className="column-ruler" data-testid="column-ruler" aria-hidden="true">
          {columns.map((column) => (
            <span key={column}>{column.toString().padStart(2, "0")}</span>
          ))}
        </div>
        <div className="row-ruler" data-testid="row-ruler" aria-hidden="true">
          {rowLabels.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
        <canvas
          aria-label="PIT framebuffer preview"
          className={`teletext-framebuffer teletext-framebuffer-${previewProfileId}`}
          data-preview-smoothing={viewport.smoothing}
          height={viewport.height}
          onClick={(event) => {
            if (readOnly) return;
            const target = hitTestCanvasPointer(event);

            if (target) {
              if (activeTool === "blocks" && blockPreview) {
                onBlockStamp?.(target.hit);
                return;
              }

              if (activeTool === "lines") {
                return;
              }

              selectCell(target.hit);
            }
          }}
          onContextMenu={(event) => {
            if (activeTool === "mosaic" || activeTool === "lines") {
              event.preventDefault();
            }
          }}
          onPointerDown={(event) => {
            if (readOnly) return;
            if (activeTool === "blocks") {
              const target = hitTestCanvasPointer(event);

              if (target) {
                rectangleAnchorRef.current = target.hit;
                onRectangleSelect?.(rectangleFromCells(target.hit, target.hit));
                selectCell(target.hit);
              }
              return;
            }


            if (activeTool === "lines") {
              lastLineCellRef.current = undefined;
              isPaintingRef.current = true;
              applyLinePointerEdit(event);
              return;
            }

            isPaintingRef.current = activeTool === "mosaic";
            applyMosaicPointerEdit(event);
          }}
          onPointerLeave={() => {
            isPaintingRef.current = false;
            lastLineCellRef.current = undefined;
          }}
          onPointerMove={(event) => {
            if (readOnly) return;
            if (activeTool === "blocks") {
              const target = hitTestCanvasPointer(event);

              if (target && blockPreview) {
                onBlockPreviewTargetChange?.(target.hit);
              }

              if (target && rectangleAnchorRef.current && event.buttons !== 0) {
                onRectangleSelect?.(rectangleFromCells(rectangleAnchorRef.current, target.hit));
              }
              return;
            }


            if (activeTool === "lines" && isPaintingRef.current && event.buttons !== 0) {
              applyLinePointerEdit(event);
              return;
            }

            if (isPaintingRef.current && event.buttons !== 0) {
              applyMosaicPointerEdit(event);
            }
          }}
          onPointerUp={() => {
            rectangleAnchorRef.current = undefined;
            isPaintingRef.current = false;
            lastLineCellRef.current = undefined;
          }}
          onMouseDown={(event) => {
            if (typeof window.PointerEvent === "undefined") {
              if (activeTool === "lines") {
                lastLineCellRef.current = undefined;
                isPaintingRef.current = true;
                applyLinePointerEdit(event);
                return;
              }
              isPaintingRef.current = activeTool === "mosaic";
              applyMosaicPointerEdit(event);
            }
          }}
          ref={canvasRef}
          role="img"
          width={viewport.width}
        />
      </div>
      <div
        className="teletext-grid teletext-access-grid"
        onKeyDown={(event) => {
          if (readOnly) return;
          const key = event.key.toLowerCase();
          const modifierKey = event.ctrlKey || event.metaKey;

          if (modifierKey && key === "z") {
            arrowRepeatActiveRef.current = false;
            event.preventDefault();

            if (event.shiftKey) {
              onRedo?.();
            } else {
              onUndo?.();
            }
            return;
          }

          if (modifierKey && key === "y") {
            arrowRepeatActiveRef.current = false;
            event.preventDefault();
            onRedo?.();
            return;
          }

          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            const handled = stampPresetAtSelectionOffset(event.key === "ArrowRight" ? 1 : -1);

            if (handled) {
              event.preventDefault();
              return;
            }
          }

          arrowRepeatActiveRef.current = false;

          if (event.key === "Escape" && activeTool === "blocks") {
            event.preventDefault();
            onRectangleClear?.();
            return;
          }

          if (modifierKey && key === "k" && selection && onRowClear) {
            event.preventDefault();
            onRowClear();
            return;
          }

          const sixelKeys: Record<string, number> = {
            A: 2,
            Q: 0,
            S: 3,
            W: 1,
            X: 5,
            Z: 4
          };
          const sixelIndex = sixelKeys[event.key.toUpperCase()];

          if (
            activeTool === "mosaic" &&
            mosaicPaintMode.kind === "freestyle" &&
            selection &&
            sixelIndex !== undefined &&
            onMosaicSixelEdit
          ) {
            event.preventDefault();
            onMosaicSixelEdit(selection.rowIndex, selection.column, sixelIndex, "toggle");
            return;
          }

          if ((event.key === "Backspace" || event.key === "Delete") && selection) {
            event.preventDefault();
            onCellDelete();
            return;
          }

          if (
            activeTool === "text" &&
            event.key.length === 1 &&
            !event.ctrlKey &&
            !event.metaKey &&
            !event.altKey
          ) {
            event.preventDefault();
            onTextInput(event.key);
          }
        }}
        role="grid"
        aria-label="40 by 25 teletext grid"
        aria-readonly={readOnly}
        ref={gridRef}
        tabIndex={readOnly ? -1 : 0}
      >
        {rows.map((row) => (
          <div
            className="teletext-row"
            data-testid={`teletext-row-${row.index}`}
            key={row.index}
            role="row"
          >
            {row.cells.map((cell) => (
              <button
                aria-label={`Row ${row.index}, column ${cell.column + 1}, byte ${cell.byte}`}
                className={[
                  "cell",
                  selection?.rowIndex === row.index && selection.column === cell.column
                    ? "selected-cell"
                    : ""
                ].filter(Boolean).join(" ")}
                key={`${row.index}-${cell.column}`}
                disabled={readOnly}
                onClick={() => {
                  const nextSelection = { rowIndex: row.index, column: cell.column };

                  arrowRepeatActiveRef.current = false;

                  if (activeTool === "mosaic" && mosaicPaintMode.kind === "preset") {
                    onMosaicPresetPaint?.(row.index, cell.column, mosaicPaintMode.mask);
                    gridRef.current?.focus({ preventScroll: true });
                    return;
                  }

                  if (activeTool === "lines" && row.index > 0) {
                    onG3LinePaint?.(row.index, cell.column, linePaintMode.code);
                    selectCell(nextSelection);
                    return;
                  }

                  selectCell(nextSelection);
                }}
                role="gridcell"
                type="button"
              >
                {cellText(cell)}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
