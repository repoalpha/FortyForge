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
  it("returns a deterministic PIT-shaped SAA5050 12 by 20 glyph", () => {
    expect(getBitmapGlyph("A")).toEqual([
      "000000000000",
      "000000000000",
      "000001100000",
      "000011110000",
      "000111111000",
      "001110011100",
      "011100001110",
      "011000000110",
      "011000000110",
      "011000000110",
      "011111111110",
      "011111111110",
      "011000000110",
      "011000000110",
      "011000000110",
      "011000000110",
      "000000000000",
      "000000000000",
      "000000000000",
      "000000000000"
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
      { fillStyle: "#ffffff", height: 1, width: 1, x: 5, y: 2 },
      { fillStyle: "#ffffff", height: 1, width: 1, x: 6, y: 2 },
      { fillStyle: "#ffffff", height: 1, width: 1, x: 4, y: 3 }
    ]);
    expect(context.rects).toHaveLength(72);
  });

  it("draws PIT-shaped SAA5050 glyphs as native 12 by 20 bitmaps", () => {
    const context = new RecordingContext();

    drawBitmapGlyph(context, {
      cellHeight: 20,
      cellWidth: 12,
      colour: "#ffffff",
      value: "A",
      x: 0,
      y: 0
    });

    expect(context.rects.slice(0, 12)).toEqual([
      { fillStyle: "#ffffff", height: 1, width: 1, x: 5, y: 2 },
      { fillStyle: "#ffffff", height: 1, width: 1, x: 6, y: 2 },
      { fillStyle: "#ffffff", height: 1, width: 1, x: 4, y: 3 },
      { fillStyle: "#ffffff", height: 1, width: 1, x: 5, y: 3 },
      { fillStyle: "#ffffff", height: 1, width: 1, x: 6, y: 3 },
      { fillStyle: "#ffffff", height: 1, width: 1, x: 7, y: 3 },
      { fillStyle: "#ffffff", height: 1, width: 1, x: 3, y: 4 },
      { fillStyle: "#ffffff", height: 1, width: 1, x: 4, y: 4 },
      { fillStyle: "#ffffff", height: 1, width: 1, x: 5, y: 4 },
      { fillStyle: "#ffffff", height: 1, width: 1, x: 6, y: 4 },
      { fillStyle: "#ffffff", height: 1, width: 1, x: 7, y: 4 },
      { fillStyle: "#ffffff", height: 1, width: 1, x: 8, y: 4 }
    ]);
    expect(context.rects).toHaveLength(72);
  });

  it("stretches SAA5050 glyph pixels vertically in double-height cells", () => {
    const context = new RecordingContext();

    drawBitmapGlyph(context, {
      cellHeight: 40,
      cellWidth: 12,
      colour: "#ffffff",
      value: "A",
      x: 0,
      y: 0
    });

    expect(context.rects.slice(0, 3)).toEqual([
      { fillStyle: "#ffffff", height: 2, width: 1, x: 5, y: 4 },
      { fillStyle: "#ffffff", height: 2, width: 1, x: 6, y: 4 },
      { fillStyle: "#ffffff", height: 2, width: 1, x: 4, y: 6 }
    ]);
  });

  it("includes the SAA5050 English pound glyph", () => {
    expect(getBitmapGlyph("£")).toEqual([
      "000000000000",
      "000000000000",
      "000001111000",
      "000011111100",
      "000111001110",
      "000110000110",
      "000110000000",
      "000110000000",
      "011111100000",
      "011111100000",
      "000110000000",
      "000110000000",
      "000110000000",
      "000110000000",
      "011111111110",
      "011111111110",
      "000000000000",
      "000000000000",
      "000000000000",
      "000000000000"
    ]);
  });

  it("draws contiguous teletext mosaics as full-height 2 by 3 blocks", () => {
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
