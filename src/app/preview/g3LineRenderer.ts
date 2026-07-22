import type { G3LineCode } from "../../core";
import { G3_LINE_CODES } from "../../core";

interface DrawG3LineGlyphOptions {
  cellHeight: number;
  cellWidth: number;
  code: G3LineCode;
  colour: string;
  x: number;
  y: number;
}

const CONNECTIONS: Record<G3LineCode, readonly [boolean, boolean, boolean, boolean]> = {
  [G3_LINE_CODES.vertical]: [true, false, true, false],
  [G3_LINE_CODES.horizontal]: [false, true, false, true],
  [G3_LINE_CODES.topLeft]: [false, true, true, false],
  [G3_LINE_CODES.topRight]: [false, false, true, true],
  [G3_LINE_CODES.bottomLeft]: [true, true, false, false],
  [G3_LINE_CODES.bottomRight]: [true, false, false, true],
  [G3_LINE_CODES.teeRight]: [true, true, true, false],
  [G3_LINE_CODES.teeLeft]: [true, false, true, true],
  [G3_LINE_CODES.teeDown]: [false, true, true, true],
  [G3_LINE_CODES.teeUp]: [true, true, false, true],
  [G3_LINE_CODES.cross]: [true, true, true, true]
};

export function drawG3LineGlyph(
  context: CanvasRenderingContext2D,
  options: DrawG3LineGlyphOptions
) {
  const [up, right, down, left] = CONNECTIONS[options.code];
  const thickness = 2;
  const centreX = options.x + Math.floor(options.cellWidth / 2);
  const centreY = options.y + Math.floor(options.cellHeight / 2);

  context.fillStyle = options.colour;

  if (up) {
    context.fillRect(centreX - 1, options.y, thickness, centreY - options.y + 1);
  }
  if (right) {
    context.fillRect(centreX - 1, centreY - 1, options.x + options.cellWidth - centreX + 1, thickness);
  }
  if (down) {
    context.fillRect(centreX - 1, centreY - 1, thickness, options.y + options.cellHeight - centreY + 1);
  }
  if (left) {
    context.fillRect(options.x, centreY - 1, centreX - options.x + 1, thickness);
  }
}
