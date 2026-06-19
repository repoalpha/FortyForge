import type { Cell, TeletextRow } from "../../core";

const COLUMN_COUNT = 40;

interface TeletextCanvasProps {
  rows: TeletextRow[];
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

export function TeletextCanvas({ rows }: TeletextCanvasProps) {
  const columns = Array.from({ length: COLUMN_COUNT }, (_, index) => index + 1);

  return (
    <div className="canvas-frame">
      <div className="column-ruler" aria-hidden="true">
        {columns.map((column) => (
          <span key={column}>{column % 10}</span>
        ))}
      </div>
      <div className="teletext-grid" role="grid" aria-label="40 by 25 teletext grid">
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
                className={row.index === 0 ? "cell header-cell" : "cell"}
                key={`${row.index}-${cell.column}`}
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
