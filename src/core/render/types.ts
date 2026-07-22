import type { Cell, TeletextColourRef, TeletextRow } from "../model/types";

export type Level1CellMode = "text" | "graphics";

export interface Level1CellRenderState {
  mode: Level1CellMode;
  foreground: TeletextColourRef;
  background: TeletextColourRef;
  flash: boolean;
  conceal: boolean;
  doubleHeight: boolean;
  holdGraphics: boolean;
  separatedGraphics: boolean;
}

export interface RenderedLevel1Cell extends Level1CellRenderState {
  column: number;
  heldMosaicSeparated?: boolean;
  source: Cell;
  visible: boolean;
  value: string;
}

export interface RenderedLevel1Row {
  source: TeletextRow;
  cells: RenderedLevel1Cell[];
}
