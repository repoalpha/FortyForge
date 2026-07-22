import type { Cell, ControlCode, TeletextColourRef, TeletextRow } from "../model/types";
import { g0CharacterForLevel1Byte } from "../standards/g0Charset";
import type { Level1CellRenderState, RenderedLevel1Cell, RenderedLevel1Row } from "./types";

const BLACK: TeletextColourRef = { palette: "level1", index: 0 };
const WHITE: TeletextColourRef = { palette: "level1", index: 7 };

export interface RenderLevel1Options {
  flashPhase?: "on" | "off";
  revealMode?: "hide" | "show";
  useCellBackgroundColours?: boolean;
  useMosaicCellColours?: boolean;
}

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
    nextState.conceal = false;
    return nextState;
  }

  if (controlCode.byte >= 0x10 && controlCode.byte <= 0x17) {
    nextState.mode = "graphics";
    nextState.foreground = level1Colour(controlCode.byte - 0x10);
    nextState.conceal = false;
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

function isSetAtControl(byte: number) {
  return byte === 0x09
    || byte === 0x0c
    || byte === 0x18
    || byte === 0x19
    || byte === 0x1a
    || byte === 0x1c
    || byte === 0x1d
    || byte === 0x1e;
}

function changesHeldMosaicIdentity(
  previous: Level1CellRenderState,
  next: Level1CellRenderState
) {
  return previous.mode !== next.mode || previous.doubleHeight !== next.doubleHeight;
}

function cellValue(cell: Cell): string {
  if (cell.kind === "character") {
    return g0CharacterForLevel1Byte(cell.byte);
  }

  if (cell.kind === "mosaic") {
    return String.fromCharCode(cell.byte);
  }

  return "";
}

function renderCell(
  cell: Cell,
  state: Level1CellRenderState,
  options: RenderLevel1Options,
  heldMosaicSeparated?: boolean
): RenderedLevel1Cell {
  const hasDisplayContent = cell.kind === "character" || cell.kind === "mosaic" || cell.kind === "drcs";
  const hiddenByFlash = state.flash && options.flashPhase === "off";
  const hiddenByConceal = state.conceal && options.revealMode === "hide";
  const visible = hasDisplayContent && !hiddenByFlash && !hiddenByConceal;
  const foreground = options.useMosaicCellColours && cell.kind === "mosaic"
    ? cell.mosaic?.foreground ?? state.foreground
    : state.foreground;
  const background = options.useCellBackgroundColours && cell.background
    ? cell.background
    : options.useMosaicCellColours && cell.kind === "mosaic"
      ? cell.mosaic?.background ?? state.background
      : state.background;

  return {
    ...state,
    foreground,
    background,
    column: cell.column,
    heldMosaicSeparated,
    source: cell,
    visible,
    value: visible ? cellValue(cell) : ""
  };
}

export function renderLevel1Row(
  row: TeletextRow,
  options: RenderLevel1Options = {}
): RenderedLevel1Row {
  let state = initialState();
  const cells: RenderedLevel1Cell[] = [];
  let heldMosaic: { cell: Cell; separated: boolean } | undefined;

  for (const cell of row.cells) {
    const controlCode = cell.kind === "control" ? cell.controlCode : undefined;
    const setAt = Boolean(controlCode && isSetAtControl(controlCode.byte));
    if (controlCode && setAt) {
      const nextState = applyControlCode(state, controlCode);
      if (changesHeldMosaicIdentity(state, nextState)) {
        heldMosaic = undefined;
      }
      state = nextState;
    }

    let displayCell = cell;
    let heldMosaicSeparated: boolean | undefined;

    if (state.mode === "graphics") {
      if (controlCode && state.holdGraphics && heldMosaic) {
        displayCell = {
          ...heldMosaic.cell,
          column: cell.column
        };
        heldMosaicSeparated = heldMosaic.separated;
      } else if (!controlCode && cell.byte !== 0x20) {
        heldMosaic = { cell, separated: state.separatedGraphics };
      } else if (state.holdGraphics && heldMosaic) {
        displayCell = {
          ...heldMosaic.cell,
          column: cell.column
        };
        heldMosaicSeparated = heldMosaic.separated;
      }
    }

    cells.push(renderCell(displayCell, state, options, heldMosaicSeparated));

    if (controlCode && !setAt) {
      const nextState = applyControlCode(state, controlCode);
      if (changesHeldMosaicIdentity(state, nextState)) {
        heldMosaic = undefined;
      }
      state = nextState;
    }
  }

  return {
    source: row,
    cells
  };
}
