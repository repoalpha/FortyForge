import { useEffect, useMemo, useRef } from "react";

import { renderLevel1Row } from "../../core";
import type { Cell, CellBlock, CellRectangle, MosaicSixelOperation, TeletextRow } from "../../core";
import type { RenderedLevel1Cell, RenderedLevel1Row } from "../../core";
import {
  drawBitmapGlyph,
  drawMosaicGlyph
} from "../preview/bitmapGlyphRenderer";
import { level1ColourToCss } from "../preview/teletextColours";
import {
  createTeletextViewport,
  getTeletextPreviewProfile,
  hitTestTeletextViewport
} from "../preview/teletextViewport";
import type { TeletextPreviewProfileId } from "../preview/teletextViewport";
import type { CellSelection } from "../state/editorStore";

const COLUMN_COUNT = 40;
const ROW_COUNT = 25;
export const FRAMEBUFFER_CELL_WIDTH = 16;
export const FRAMEBUFFER_CELL_HEIGHT = 20;
export const PIT_STRICT_CELL_WIDTH = 12;
export const PIT_STRICT_CELL_HEIGHT = 20;
export type EditorTool = "text" | "mosaic" | "import-trace" | "blocks";

interface TeletextCanvasProps {
  rows: TeletextRow[];
  selection?: CellSelection;
  activeTool?: EditorTool;
  blockPreview?: {
    block: CellBlock;
    target: CellSelection;
  };
  previewProfileId?: TeletextPreviewProfileId;
  rectangleSelection?: CellRectangle;
  onBlockPreviewTargetChange?: (selection: CellSelection) => void;
  onBlockStamp?: (selection: CellSelection) => void;
  onCellSelect: (selection: CellSelection) => void;
  onCellDelete: () => void;
  onRectangleClear?: () => void;
  onRectangleSelect?: (rectangle: CellRectangle) => void;
  onRowClear?: () => void;
  onMosaicSixelEdit?: (
    rowIndex: number,
    column: number,
    sixelIndex: number,
    operation: MosaicSixelOperation
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

export function mosaicMaskForRenderedCell(cell: RenderedLevel1Cell) {
  if (cell.source.kind === "mosaic" && cell.source.mosaic) {
    return cell.source.mosaic.sixelMask;
  }

  if (cell.mode === "graphics" && cell.visible) {
    return cell.source.byte & 0x3f;
  }

  return undefined;
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
  blockPreview,
  previewProfileId = "studio-large",
  rectangleSelection,
  rows,
  selection,
  onBlockPreviewTargetChange,
  onBlockStamp,
  onCellSelect,
  onCellDelete,
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
  const isPaintingRef = useRef(false);
  const rectangleAnchorRef = useRef<CellSelection | undefined>(undefined);
  const columns = Array.from({ length: COLUMN_COUNT }, (_, index) => index + 1);
  const rowLabels = Array.from({ length: ROW_COUNT }, (_, index) => index === 0 ? "X/0" : String(index));
  const viewport = useMemo(
    () => {
      const profile = getTeletextPreviewProfile(previewProfileId);

      return createTeletextViewport({
        columns: profile.columns,
        rows: profile.rows,
        cellWidth: profile.cellWidth,
        cellHeight: profile.cellHeight
      });
    },
    [previewProfileId]
  );

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
        useCellBackgroundColours: true,
        useMosaicCellColours: true
      })
    }));

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

        const sixelMask = mosaicMaskForRenderedCell(cell);

        if (sixelMask !== undefined) {
          drawMosaicGlyph(context, {
            cellHeight,
            cellWidth: viewport.cellWidth,
            colour: level1ColourToCss(cell.foreground),
            separated: cell.source.kind === "mosaic"
              ? cell.source.mosaic?.separated || cell.separatedGraphics
              : cell.separatedGraphics,
            sixelMask,
            x,
            y
          });
        } else if (cell.visible && cell.value) {
          drawBitmapGlyph(context, {
            cellHeight,
            cellWidth: viewport.cellWidth,
            colour: level1ColourToCss(cell.foreground),
            value: cell.value,
            x,
            y
          });
        }
      }
    }

    if (selection) {
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
  }, [blockPreview, rows, rectangleSelection, selection, viewport]);

  function selectCell(nextSelection: CellSelection) {
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

    selectCell(target.hit);

    if (activeTool === "mosaic" && onMosaicSixelEdit) {
      event.preventDefault();
      onMosaicSixelEdit(
        target.hit.rowIndex,
        target.hit.column,
        target.sixelIndex,
        operationFromPointerEvent(event)
      );
    }
  }

  return (
    <div className="canvas-frame">
      <div className="teletext-frame-grid">
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
          height={viewport.height}
          onClick={(event) => {
            const target = hitTestCanvasPointer(event);

            if (target) {
              if (activeTool === "blocks" && blockPreview) {
                onBlockStamp?.(target.hit);
                return;
              }

              selectCell(target.hit);
            }
          }}
          onContextMenu={(event) => {
            if (activeTool === "mosaic") {
              event.preventDefault();
            }
          }}
          onPointerDown={(event) => {
            if (activeTool === "blocks") {
              const target = hitTestCanvasPointer(event);

              if (target) {
                rectangleAnchorRef.current = target.hit;
                onRectangleSelect?.(rectangleFromCells(target.hit, target.hit));
                selectCell(target.hit);
              }
              return;
            }

            isPaintingRef.current = activeTool === "mosaic";
            applyMosaicPointerEdit(event);
          }}
          onPointerLeave={() => {
            isPaintingRef.current = false;
          }}
          onPointerMove={(event) => {
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

            if (isPaintingRef.current && event.buttons !== 0) {
              applyMosaicPointerEdit(event);
            }
          }}
          onPointerUp={() => {
            rectangleAnchorRef.current = undefined;
            isPaintingRef.current = false;
          }}
          onMouseDown={(event) => {
            if (typeof window.PointerEvent === "undefined") {
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
          const key = event.key.toLowerCase();
          const modifierKey = event.ctrlKey || event.metaKey;

          if (modifierKey && key === "z") {
            event.preventDefault();

            if (event.shiftKey) {
              onRedo?.();
            } else {
              onUndo?.();
            }
            return;
          }

          if (modifierKey && key === "y") {
            event.preventDefault();
            onRedo?.();
            return;
          }

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
        ref={gridRef}
        tabIndex={0}
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
                onClick={() => selectCell({ rowIndex: row.index, column: cell.column })}
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
