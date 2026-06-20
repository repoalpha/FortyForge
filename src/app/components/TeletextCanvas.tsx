import type { Cell, TeletextRow } from "../../core";
import type { CellSelection } from "../state/editorStore";

const COLUMN_COUNT = 40;

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
  const columns = Array.from({ length: COLUMN_COUNT }, (_, index) => index + 1);

  return (
    <div className="canvas-frame">
      <div className="column-ruler" aria-hidden="true">
        {columns.map((column) => (
          <span key={column}>{column % 10}</span>
        ))}
      </div>
      <div
        className="teletext-grid"
        onKeyDown={(event) => {
          if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
            event.preventDefault();
            onTextInput(event.key.toUpperCase());
          }
        }}
        role="grid"
        aria-label="40 by 25 teletext grid"
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
                onClick={() => onCellSelect({ rowIndex: row.index, column: cell.column })}
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
