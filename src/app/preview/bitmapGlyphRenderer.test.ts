import { describe, expect, it } from "vitest";

import {
  drawBitmapGlyph,
  drawMosaicGlyph,
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
  it("returns a deterministic 6 by 10 glyph bitmap for known teletext text", () => {
    expect(getBitmapGlyph("A")).toEqual([
      "000000",
      "001110",
      "010001",
      "010001",
      "011111",
      "010001",
      "010001",
      "010001",
      "000000",
      "000000"
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
      { fillStyle: "#ffffff", height: 2, width: 2, x: 4, y: 2 },
      { fillStyle: "#ffffff", height: 2, width: 2, x: 6, y: 2 },
      { fillStyle: "#ffffff", height: 2, width: 2, x: 8, y: 2 }
    ]);
    expect(context.rects).toHaveLength(18);
  });

  it("draws teletext mosaics as crisp 2 by 3 blocks", () => {
    const context = new RecordingContext();

    drawMosaicGlyph(context, {
      cellHeight: 20,
      cellWidth: 12,
      colour: "#00ff00",
      separated: false,
      sixelMask: 0b100101,
      x: 10,
      y: 20
    });

    expect(context.rects).toEqual([
      { fillStyle: "#00ff00", height: 6, width: 6, x: 10, y: 20 },
      { fillStyle: "#00ff00", height: 7, width: 6, x: 10, y: 26 },
      { fillStyle: "#00ff00", height: 7, width: 6, x: 16, y: 33 }
    ]);
  });
});
