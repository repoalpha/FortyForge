export interface TeletextViewportOptions {
  columns: number;
  rows: number;
  cellWidth: number;
  cellHeight: number;
}

export interface TeletextViewport extends TeletextViewportOptions {
  width: number;
  height: number;
}

export interface TeletextViewportCell {
  rowIndex: number;
  column: number;
}

export function createTeletextViewport(options: TeletextViewportOptions): TeletextViewport {
  return {
    ...options,
    width: options.columns * options.cellWidth,
    height: options.rows * options.cellHeight
  };
}

export function hitTestTeletextViewport(
  viewport: TeletextViewport,
  x: number,
  y: number
): TeletextViewportCell | undefined {
  if (x < 0 || y < 0 || x >= viewport.width || y >= viewport.height) {
    return undefined;
  }

  return {
    rowIndex: Math.floor(y / viewport.cellHeight),
    column: Math.floor(x / viewport.cellWidth)
  };
}
