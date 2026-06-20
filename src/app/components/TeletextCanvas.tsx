import { useEffect, useMemo, useRef } from "react";

import { renderLevel1Row } from "../../core";
import type { Cell, TeletextRow } from "../../core";
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
const CELL_WIDTH = 12;
const CELL_HEIGHT = 20;

interface TeletextCanvasProps {
  rows: TeletextRow[];
  selection?: CellSelection;
  onCellSelect: (selection: CellSelection) => void;
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

export function TeletextCanvas({
  rows,
  selection,
  onCellSelect,
  onTextInput
}: TeletextCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const columns = Array.from({ length: COLUMN_COUNT }, (_, index) => index + 1);
  const viewport = useMemo(
    () =>
      createTeletextViewport({
        columns: COLUMN_COUNT,
        rows: ROW_COUNT,
        cellWidth: CELL_WIDTH,
        cellHeight: CELL_HEIGHT
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

    for (const row of rows) {
      const renderedRow = renderLevel1Row(row);

      for (const cell of renderedRow.cells) {
        const x = cell.column * viewport.cellWidth;
        const y = row.index * viewport.cellHeight;
        const cellHeight = cell.doubleHeight
          ? Math.min(viewport.cellHeight * 2, viewport.height - y)
          : viewport.cellHeight;
        context.fillStyle = row.index === 0 ? "#001f5f" : level1ColourToCss(cell.background);
        context.fillRect(x, y, viewport.cellWidth, cellHeight);

        if (cell.source.kind === "mosaic" && cell.source.mosaic) {
          drawMosaicGlyph(context, {
            cellHeight,
            cellWidth: viewport.cellWidth,
            colour: level1ColourToCss(cell.foreground),
            separated: cell.source.mosaic.separated || cell.separatedGraphics,
            sixelMask: cell.source.mosaic.sixelMask,
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
    gridRef.current?.focus();
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
          const bounds = event.currentTarget.getBoundingClientRect();
          const x = ((event.clientX - bounds.left) / bounds.width) * viewport.width;
          const y = ((event.clientY - bounds.top) / bounds.height) * viewport.height;
          const hit = hitTestTeletextViewport(viewport, x, y);

          if (hit) {
            selectCell(hit);
          }
        }}
        ref={canvasRef}
        role="img"
        width={viewport.width}
      />
      <div
        className="teletext-grid teletext-access-grid"
        onKeyDown={(event) => {
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
                  row.index === 0 ? "header-cell" : "",
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
