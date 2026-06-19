import type { Cell, ControlCode, TeletextColourRef, TeletextRow } from "../model/types";
import type { Level1CellRenderState, RenderedLevel1Cell, RenderedLevel1Row } from "./types";

const BLACK: TeletextColourRef = { palette: "level1", index: 0 };
const WHITE: TeletextColourRef = { palette: "level1", index: 7 };

function initialState(): Level1CellRenderState {
  return {
    mode: "text",
    foreground: WHITE,
    background: BLACK,
    flash: false,
    conceal: false,
    doubleHeight: false,
    holdGraphics: false,
    separatedGraphics: false
  };
}

function level1Colour(index: number): TeletextColourRef {
  return {
    palette: "level1",
    index
  };
}

function applyControlCode(
  state: Level1CellRenderState,
  controlCode: ControlCode
): Level1CellRenderState {
  const nextState = { ...state };

  if (controlCode.byte >= 0x00 && controlCode.byte <= 0x07) {
    nextState.mode = "text";
    nextState.foreground = level1Colour(controlCode.byte);
    return nextState;
  }

  if (controlCode.byte >= 0x10 && controlCode.byte <= 0x17) {
    nextState.mode = "graphics";
    nextState.foreground = level1Colour(controlCode.byte - 0x10);
    return nextState;
  }

  switch (controlCode.byte) {
    case 0x08:
      nextState.flash = true;
      break;
    case 0x09:
      nextState.flash = false;
      break;
    case 0x0c:
      nextState.doubleHeight = false;
      break;
    case 0x0d:
      nextState.doubleHeight = true;
      break;
    case 0x18:
      nextState.conceal = true;
      break;
    case 0x19:
      nextState.separatedGraphics = false;
      break;
    case 0x1a:
      nextState.separatedGraphics = true;
      break;
    case 0x1c:
      nextState.background = BLACK;
      break;
    case 0x1d:
      nextState.background = nextState.foreground;
      break;
    case 0x1e:
      nextState.holdGraphics = true;
      break;
    case 0x1f:
      nextState.holdGraphics = false;
      break;
  }

  return nextState;
}

function cellValue(cell: Cell): string {
  if (cell.kind === "character") {
    return cell.character?.value ?? String.fromCharCode(cell.byte);
  }

  if (cell.kind === "mosaic") {
    return String.fromCharCode(cell.byte);
  }

  return "";
}

function renderCell(cell: Cell, state: Level1CellRenderState): RenderedLevel1Cell {
  const visible = cell.kind === "character" || cell.kind === "mosaic" || cell.kind === "drcs";

  return {
    ...state,
    column: cell.column,
    source: cell,
    visible,
    value: visible ? cellValue(cell) : ""
  };
}

export function renderLevel1Row(row: TeletextRow): RenderedLevel1Row {
  let state = initialState();
  const cells: RenderedLevel1Cell[] = [];

  for (const cell of row.cells) {
    if (cell.kind === "control" && cell.controlCode) {
      state = applyControlCode(state, cell.controlCode);
    }

    cells.push(renderCell(cell, state));
  }

  return {
    source: row,
    cells
  };
}
