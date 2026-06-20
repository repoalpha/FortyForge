import { useEffect, useMemo, useRef } from "react";

import { renderLevel1Row } from "../../core";
import type { Cell, MosaicSixelOperation, TeletextRow } from "../../core";
import type { RenderedLevel1Cell } from "../../core";
import {
  drawBitmapGlyph,
  drawMosaicGlyph
} from "../preview/bitmapGlyphRenderer";
import { level1ColourToCss } from "../preview/teletextColours";
import {
  createTeletextViewport,
  hitTestTeletextViewport
} from "../preview/teletextViewport";
import type { CellSelection } from "../state/editorStore";

const COLUMN_COUNT = 40;
const ROW_COUNT = 25;
export const FRAMEBUFFER_CELL_WIDTH = 16;
export const FRAMEBUFFER_CELL_HEIGHT = 20;
export type EditorTool = "text" | "mosaic";

interface TeletextCanvasProps {
  rows: TeletextRow[];
  selection?: CellSelection;
  activeTool?: EditorTool;
  onCellSelect: (selection: CellSelection) => void;
  onCellDelete: () => void;
  onMosaicSixelEdit?: (
    rowIndex: number,
    column: number,
    sixelIndex: number,
    operation: MosaicSixelOperation
  ) => void;
  onTextInput: (value: string) => void;
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

function renderedCellHeight(doubleHeight: boolean, rowIndex: number, viewportHeight: number) {
  const y = rowIndex * FRAMEBUFFER_CELL_HEIGHT;

  return doubleHeight
    ? Math.min(FRAMEBUFFER_CELL_HEIGHT * 2, viewportHeight - y)
    : FRAMEBUFFER_CELL_HEIGHT;
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

type CanvasPointerLikeEvent =
  | React.MouseEvent<HTMLCanvasElement>
  | React.PointerEvent<HTMLCanvasElement>;

function operationFromPointerEvent(event: CanvasPointerLikeEvent) {
  if (event.shiftKey) {
    return "toggle";
  }

  return event.button === 2 || (event.buttons & 2) === 2 ? "clear" : "set";
}

export function TeletextCanvas({
  activeTool = "text",
  rows,
  selection,
  onCellSelect,
  onCellDelete,
  onMosaicSixelEdit,
  onTextInput
}: TeletextCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const isPaintingRef = useRef(false);
  const columns = Array.from({ length: COLUMN_COUNT }, (_, index) => index + 1);
  const viewport = useMemo(
    () =>
      createTeletextViewport({
        columns: COLUMN_COUNT,
        rows: ROW_COUNT,
        cellWidth: FRAMEBUFFER_CELL_WIDTH,
        cellHeight: FRAMEBUFFER_CELL_HEIGHT
      }),
    []
  );

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
      renderedRow: renderLevel1Row(row)
    }));

    for (const { row, renderedRow } of renderedRows) {
      for (const cell of renderedRow.cells) {
        const x = cell.column * viewport.cellWidth;
        const y = row.index * viewport.cellHeight;
        const cellHeight = renderedCellHeight(cell.doubleHeight, row.index, viewport.height);
        context.fillStyle = displayBackgroundForRenderedCell(cell);
        context.fillRect(x, y, viewport.cellWidth, cellHeight);
      }
    }

    for (const { row, renderedRow } of renderedRows) {
      for (const cell of renderedRow.cells) {
        const x = cell.column * viewport.cellWidth;
        const y = row.index * viewport.cellHeight;
        const cellHeight = renderedCellHeight(cell.doubleHeight, row.index, viewport.height);

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
  }, [rows, selection, viewport]);

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
      <div className="column-ruler" aria-hidden="true">
        {columns.map((column) => (
          <span key={column}>{column % 10}</span>
        ))}
      </div>
      <canvas
        aria-label="PIT framebuffer preview"
        className="teletext-framebuffer"
        height={viewport.height}
        onClick={(event) => {
          const target = hitTestCanvasPointer(event);

          if (target) {
            selectCell(target.hit);
          }
        }}
        onContextMenu={(event) => {
          if (activeTool === "mosaic") {
            event.preventDefault();
          }
        }}
        onPointerDown={(event) => {
          isPaintingRef.current = activeTool === "mosaic";
          applyMosaicPointerEdit(event);
        }}
        onPointerLeave={() => {
          isPaintingRef.current = false;
        }}
        onPointerMove={(event) => {
          if (isPaintingRef.current && event.buttons !== 0) {
            applyMosaicPointerEdit(event);
          }
        }}
        onPointerUp={() => {
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
      <div
        className="teletext-grid teletext-access-grid"
        onKeyDown={(event) => {
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

          if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
            event.preventDefault();
            onTextInput(event.key.toUpperCase());
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
