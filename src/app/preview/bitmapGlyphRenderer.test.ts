import { describe, expect, it } from "vitest";

import {
  drawBitmapGlyph,
  getBitmapGlyph
} from "./bitmapGlyphRenderer";

interface RectCall {
  fillStyle: string;
  height: number;
  width: number;
  x: number;
  y: number;
}

class RecordingContext {
  fillStyle = "#000000";
  readonly rects: RectCall[] = [];

  fillRect(x: number, y: number, width: number, height: number) {
    this.rects.push({
      fillStyle: this.fillStyle,
      height,
      width,
      x,
      y
    });
  }
}

describe("bitmap glyph renderer", () => {
  it("returns a deterministic 5 by 7 glyph bitmap for known teletext text", () => {
    expect(getBitmapGlyph("A")).toEqual([
      "01110",
      "10001",
      "10001",
      "11111",
      "10001",
      "10001",
      "10001"
    ]);
  });

  it("draws glyph pixels as sharp filled rectangles", () => {
    const context = new RecordingContext();

    drawBitmapGlyph(context, {
      cellHeight: 20,
      cellWidth: 12,
      colour: "#ffffff",
      value: "A",
      x: 0,
      y: 0
    });

    expect(context.rects.slice(0, 3)).toEqual([
      { fillStyle: "#ffffff", height: 2, width: 2, x: 3, y: 3 },
      { fillStyle: "#ffffff", height: 2, width: 2, x: 5, y: 3 },
      { fillStyle: "#ffffff", height: 2, width: 2, x: 7, y: 3 }
    ]);
    expect(context.rects).toHaveLength(18);
  });
});
