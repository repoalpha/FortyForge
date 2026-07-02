import { describe, expect, it } from "vitest";

import { getBitmapGlyph } from "../preview/bitmapGlyphRenderer";
import { getSaa5050Glyph } from "../preview/saa5050Font";
import { renderLevel1Row } from "../../core/render/renderLevel1";
import {
  applyDoubleHeightBandColourCorrection,
  applyDoubleHeightBandWordCorrections,
  applyScannerTextCorrections,
  classifyTraceCell,
  createRowsFromTraceCells,
  createCalibratedTraceGrid,
  createTraceGridFromBounds,
  detectEdgeAssistedTraceGrid,
  detectTraceGrid,
  nearestLevel1Colour,
  scanTeletextScreenshot,
  traceTeletextScreenshot,
  type TraceCellHint,
  type TraceCell,
  type TraceImageData
} from "./screenshotTrace";

const PALETTE = [
  [0, 0, 0],
  [255, 0, 0],
  [0, 255, 0],
  [255, 255, 0],
  [0, 0, 255],
  [255, 0, 255],
  [0, 255, 255],
  [255, 255, 255]
] as const;

function createImage(width: number, height: number, colourIndex = 0): TraceImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  const [r, g, b] = PALETTE[colourIndex];

  for (let index = 0; index < data.length; index += 4) {
    data[index] = r;
    data[index + 1] = g;
    data[index + 2] = b;
    data[index + 3] = 255;
  }

  return { width, height, data };
}

function setPixel(image: TraceImageData, x: number, y: number, colourIndex: number) {
  const [r, g, b] = PALETTE[colourIndex];
  const offset = (y * image.width + x) * 4;

  image.data[offset] = r;
  image.data[offset + 1] = g;
  image.data[offset + 2] = b;
  image.data[offset + 3] = 255;
}

function drawGlyph(
  image: TraceImageData,
  rowIndex: number,
  column: number,
  value: string,
  colourIndex = 7
) {
  const glyph = getBitmapGlyph(value);
  const left = column * 12;
  const top = rowIndex * 20;

  for (let y = 0; y < glyph.length; y += 1) {
    for (let x = 0; x < glyph[y].length; x += 1) {
      if (glyph[y][x] === "1") {
        setPixel(image, left + x, top + y, colourIndex);
      }
    }
  }
}

function drawText(
  image: TraceImageData,
  rowIndex: number,
  startColumn: number,
  text: string,
  colourIndex = 7
) {
  [...text].forEach((value, offset) => {
    if (value !== " ") {
      drawGlyph(image, rowIndex, startColumn + offset, value, colourIndex);
    }
  });
}

function drawGlyphAt(
  image: TraceImageData,
  left: number,
  top: number,
  value: string,
  colourIndex = 7
) {
  const glyph = getBitmapGlyph(value);

  for (let y = 0; y < glyph.length; y += 1) {
    for (let x = 0; x < glyph[y].length; x += 1) {
      if (glyph[y][x] === "1") {
        setPixel(image, left + x, top + y, colourIndex);
      }
    }
  }
}

function drawWidenedGlyph(
  image: TraceImageData,
  rowIndex: number,
  column: number,
  value: string,
  colourIndex = 7
) {
  const glyph = getBitmapGlyph(value);
  const left = column * 12;
  const top = rowIndex * 20;

  for (let y = 0; y < glyph.length; y += 1) {
    for (let x = 0; x < glyph[y].length; x += 1) {
      if (glyph[y][x] === "1") {
        setPixel(image, left + x, top + y, colourIndex);

        if (x + 1 < 12) {
          setPixel(image, left + x + 1, top + y, colourIndex);
        }
      }
    }
  }
}

function drawLowResolutionGlyph(
  image: TraceImageData,
  rowIndex: number,
  column: number,
  value: string,
  colourIndex = 7,
  xOffset = 1
) {
  const glyph = getSaa5050Glyph(value);

  if (!glyph) {
    throw new Error(`Missing SAA5050 glyph for ${value}`);
  }

  const left = column * 8;
  const top = rowIndex * 10;

  for (let y = 0; y < glyph.length; y += 1) {
    for (let x = 0; x < glyph[y].length; x += 1) {
      if (glyph[y][x] === "1") {
        setPixel(image, left + xOffset + x, top + y, colourIndex);
      }
    }
  }
}

function drawLowResolutionText(
  image: TraceImageData,
  rowIndex: number,
  column: number,
  value: string,
  colourIndex = 7
) {
  [...value].forEach((character, offset) => {
    drawLowResolutionGlyph(image, rowIndex, column + offset, character, colourIndex);
  });
}

function drawLowResolutionDoubleHeightGlyph(
  image: TraceImageData,
  rowIndex: number,
  column: number,
  value: string,
  colourIndex = 7,
  xOffset = 1
) {
  const glyph = getSaa5050Glyph(value);

  if (!glyph) {
    throw new Error(`Missing SAA5050 glyph for ${value}`);
  }

  const left = column * 8;
  const top = rowIndex * 10;

  for (let sourceY = 0; sourceY < glyph.length; sourceY += 1) {
    for (let x = 0; x < glyph[sourceY].length; x += 1) {
      if (glyph[sourceY][x] !== "1") {
        continue;
      }

      setPixel(image, left + xOffset + x, top + sourceY * 2, colourIndex);
      setPixel(image, left + xOffset + x, top + sourceY * 2 + 1, colourIndex);
    }
  }
}

function drawLowResolutionDoubleHeightText(
  image: TraceImageData,
  rowIndex: number,
  column: number,
  value: string,
  colourIndex = 7
) {
  [...value].forEach((character, offset) => {
    drawLowResolutionDoubleHeightGlyph(image, rowIndex, column + offset, character, colourIndex);
  });
}

function drawMode7DoubleHeightGlyph(
  image: TraceImageData,
  rowIndex: number,
  column: number,
  value: string,
  colourIndex = 7,
  xOffset = 1,
  yOffset = 2
) {
  const glyph = getSaa5050Glyph(value);

  if (!glyph) {
    throw new Error(`Missing SAA5050 glyph for ${value}`);
  }

  const left = column * 8;
  const top = rowIndex * 12;

  for (let sourceY = 0; sourceY < glyph.length; sourceY += 1) {
    for (let x = 0; x < glyph[sourceY].length; x += 1) {
      if (glyph[sourceY][x] !== "1") {
        continue;
      }

      setPixel(image, left + xOffset + x, top + yOffset + sourceY * 2, colourIndex);
      setPixel(image, left + xOffset + x, top + yOffset + sourceY * 2 + 1, colourIndex);
    }
  }
}

function drawMode7DoubleHeightText(
  image: TraceImageData,
  rowIndex: number,
  column: number,
  value: string,
  colourIndex = 7
) {
  [...value].forEach((character, offset) => {
    drawMode7DoubleHeightGlyph(image, rowIndex, column + offset, character, colourIndex);
  });
}

function drawMode7WidenedDoubleHeightGlyph(
  image: TraceImageData,
  rowIndex: number,
  column: number,
  value: string,
  colourIndex = 7,
  xOffset = 1,
  yOffset = 2
) {
  const glyph = getSaa5050Glyph(value);

  if (!glyph) {
    throw new Error(`Missing SAA5050 glyph for ${value}`);
  }

  const left = column * 8;
  const top = rowIndex * 12;

  for (let sourceY = 0; sourceY < glyph.length; sourceY += 1) {
    for (let x = 0; x < glyph[sourceY].length; x += 1) {
      if (glyph[sourceY][x] !== "1") {
        continue;
      }

      setPixel(image, left + xOffset + x, top + yOffset + sourceY * 2, colourIndex);
      setPixel(image, left + xOffset + x, top + yOffset + sourceY * 2 + 1, colourIndex);

      if (xOffset + x + 1 < 8) {
        setPixel(image, left + xOffset + x + 1, top + yOffset + sourceY * 2, colourIndex);
        setPixel(image, left + xOffset + x + 1, top + yOffset + sourceY * 2 + 1, colourIndex);
      }
    }
  }
}

function drawMode7WidenedDoubleHeightText(
  image: TraceImageData,
  rowIndex: number,
  column: number,
  value: string,
  colourIndex = 7
) {
  [...value].forEach((character, offset) => {
    drawMode7WidenedDoubleHeightGlyph(image, rowIndex, column + offset, character, colourIndex);
  });
}

function drawMode7CaptureGlyph(
  image: TraceImageData,
  rowIndex: number,
  column: number,
  value: string,
  colourIndex = 7,
  xOffset = 1
) {
  const glyph = getSaa5050Glyph(value);

  if (!glyph) {
    throw new Error(`Missing SAA5050 glyph for ${value}`);
  }

  const left = column * 8;
  const top = rowIndex * 12;
  const yOffset = 1;

  for (let y = 0; y < glyph.length; y += 1) {
    for (let x = 0; x < glyph[y].length; x += 1) {
      if (glyph[y][x] === "1") {
        setPixel(image, left + xOffset + x, top + yOffset + y, colourIndex);
      }
    }
  }
}

function drawMode7CaptureText(
  image: TraceImageData,
  rowIndex: number,
  column: number,
  value: string,
  colourIndex = 7
) {
  [...value].forEach((character, offset) => {
    drawMode7CaptureGlyph(image, rowIndex, column + offset, character, colourIndex);
  });
}

function drawMosaic(image: TraceImageData, rowIndex: number, column: number, mask: number) {
  const left = column * 12;
  const top = rowIndex * 20;
  const blockX = [0, 6, 12];
  const blockY = [0, 6, 13, 20];

  for (let bit = 0; bit < 6; bit += 1) {
    if ((mask & (1 << bit)) === 0) {
      continue;
    }

    const blockColumn = bit % 2;
    const blockRow = Math.floor(bit / 2);

    for (let y = blockY[blockRow]; y < blockY[blockRow + 1]; y += 1) {
      for (let x = blockX[blockColumn]; x < blockX[blockColumn + 1]; x += 1) {
        setPixel(
          image,
          left + x,
          top + y,
          2
        );
      }
    }
  }
}

function drawLowResolutionMosaic(
  image: TraceImageData,
  rowIndex: number,
  column: number,
  mask: number,
  colourIndex = 2
) {
  const left = column * 8;
  const top = rowIndex * 10;
  const blockX = [0, 4, 8];
  const blockY = [0, 3, 6, 10];

  for (let bit = 0; bit < 6; bit += 1) {
    if ((mask & (1 << bit)) === 0) {
      continue;
    }

    const blockColumn = bit % 2;
    const blockRow = Math.floor(bit / 2);

    for (let y = blockY[blockRow]; y < blockY[blockRow + 1]; y += 1) {
      for (let x = blockX[blockColumn]; x < blockX[blockColumn + 1]; x += 1) {
        setPixel(image, left + x, top + y, colourIndex);
      }
    }
  }
}

function drawLowResolutionThinBar(
  image: TraceImageData,
  rowIndex: number,
  column: number,
  yOffset: number,
  colourIndex = 3
) {
  const left = column * 8;
  const top = rowIndex * 10;

  for (let x = 0; x < 8; x += 1) {
    setPixel(image, left + x, top + yOffset, colourIndex);
  }
}

function drawMode7Mosaic(
  image: TraceImageData,
  rowIndex: number,
  column: number,
  mask: number,
  colourIndex = 4
) {
  const left = column * 8;
  const top = rowIndex * 12;
  const blockX = [0, 4, 8];
  const blockY = [0, 4, 8, 12];

  for (let bit = 0; bit < 6; bit += 1) {
    if ((mask & (1 << bit)) === 0) {
      continue;
    }

    const blockColumn = bit % 2;
    const blockRow = Math.floor(bit / 2);

    for (let y = blockY[blockRow]; y < blockY[blockRow + 1]; y += 1) {
      for (let x = blockX[blockColumn]; x < blockX[blockColumn + 1]; x += 1) {
        setPixel(image, left + x, top + y, colourIndex);
      }
    }
  }
}

function fillMode7Cell(
  image: TraceImageData,
  rowIndex: number,
  column: number,
  colourIndex: number
) {
  const left = column * 8;
  const top = rowIndex * 12;

  for (let y = 0; y < 12; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      setPixel(image, left + x, top + y, colourIndex);
    }
  }
}

function fillRect(
  image: TraceImageData,
  left: number,
  top: number,
  right: number,
  bottom: number,
  colourIndex: number
) {
  for (let y = Math.max(0, top); y < Math.min(image.height, bottom); y += 1) {
    for (let x = Math.max(0, left); x < Math.min(image.width, right); x += 1) {
      setPixel(image, x, y, colourIndex);
    }
  }
}

function drawCheckerCells(image: TraceImageData, xLines: number[], yLines: number[]) {
  for (let rowIndex = 0; rowIndex < yLines.length - 1; rowIndex += 1) {
    for (let column = 0; column < xLines.length - 1; column += 1) {
      fillRect(
        image,
        xLines[column],
        yLines[rowIndex],
        xLines[column + 1],
        yLines[rowIndex + 1],
        (rowIndex + column) % 2 === 0 ? 1 : 4
      );
    }
  }
}

function traceCell(rowIndex: number, column: number, value: string, confidence = 0.7): TraceCell {
  return {
    rowIndex,
    column,
    kind: value === " " ? "space" : "text",
    foreground: { palette: "level1", index: 3 },
    background: { palette: "level1", index: 0 },
    confidence,
    value,
    warnings: []
  };
}

function traceRow(rowIndex: number, text: string) {
  return Array.from({ length: 40 }, (_, column) =>
    traceCell(rowIndex, column, text[column] ?? " ")
  );
}

describe("screenshot trace", () => {
  it("detects the PIT strict 40 by 25 grid from a clean screenshot", () => {
    expect(detectTraceGrid(createImage(480, 500))).toEqual({
      columns: 40,
      rows: 25,
      left: 0,
      top: 0,
      width: 480,
      height: 500,
      cellWidth: 12,
      cellHeight: 20
    });
  });

  it("builds a 40 by 25 grid from manually aligned image bounds", () => {
    const image = createImage(500, 540);

    expect(createTraceGridFromBounds(image, {
      left: 10,
      top: 20,
      right: 490,
      bottom: 520
    })).toEqual({
      columns: 40,
      rows: 25,
      left: 10,
      top: 20,
      width: 480,
      height: 500,
      cellWidth: 12,
      cellHeight: 20
    });
  });

  it("interpolates explicit calibrated grid line anchors", () => {
    const image = createImage(520, 540);
    const grid = createCalibratedTraceGrid(
      image,
      {
        left: 10,
        top: 20,
        right: 490,
        bottom: 520
      },
      {
        xAnchors: [
          { lineIndex: 0, position: 10 },
          { lineIndex: 10, position: 150 },
          { lineIndex: 40, position: 490 }
        ],
        yAnchors: [
          { lineIndex: 0, position: 20 },
          { lineIndex: 5, position: 126 },
          { lineIndex: 25, position: 520 }
        ]
      }
    );

    expect(grid.xLines?.[0]).toBe(10);
    expect(grid.xLines?.[5]).toBe(80);
    expect(grid.xLines?.[10]).toBe(150);
    expect(grid.xLines?.[25]).toBe(320);
    expect(grid.xLines?.[40]).toBe(490);
    expect(grid.yLines?.[0]).toBe(20);
    expect(grid.yLines?.[5]).toBe(126);
    expect(grid.yLines?.[15]).toBe(323);
    expect(grid.yLines?.[25]).toBe(520);
  });

  it("suggests non-uniform trace grid lines from colour edges", () => {
    const image = createImage(520, 560);
    const xLines = Array.from({ length: 41 }, (_, lineIndex) =>
      10 + (lineIndex * 12) + (lineIndex >= 14 ? 3 : 0)
    );
    const yLines = Array.from({ length: 26 }, (_, lineIndex) =>
      20 + (lineIndex * 20) + Math.floor(lineIndex / 6) * 3
    );

    drawCheckerCells(image, xLines, yLines);

    const grid = detectEdgeAssistedTraceGrid(image, {
      left: xLines[0],
      top: yLines[0],
      right: xLines[40],
      bottom: yLines[25]
    });

    expect(grid.xLines?.[14]).toBeCloseTo(xLines[14], 0);
    expect(grid.xLines?.[28]).toBeCloseTo(xLines[28], 0);
    expect(grid.yLines?.[6]).toBeCloseTo(yLines[6], 0);
    expect(grid.yLines?.[18]).toBeCloseTo(yLines[18], 0);
  });

  it("matches pixels to the nearest Level 1 palette colour", () => {
    expect(nearestLevel1Colour(250, 10, 10)).toEqual({
      index: 1,
      distance: expect.any(Number)
    });
  });

  it("classifies a clean SAA5050 text cell", () => {
    const image = createImage(480, 500);
    const grid = detectTraceGrid(image);
    drawGlyph(image, 1, 2, "A", 7);

    expect(classifyTraceCell(image, grid, 1, 2)).toEqual(
      expect.objectContaining({
        kind: "text",
        value: "A",
        foreground: { palette: "level1", index: 7 },
        background: { palette: "level1", index: 0 },
        confidence: 1
      })
    );
  });

  it("scans a later-font style widened glyph back to its finite SAA5050 character", () => {
    const image = createImage(480, 500);
    const strictGrid = detectTraceGrid(image);

    drawWidenedGlyph(image, 3, 2, "A", 7);

    expect(classifyTraceCell(image, strictGrid, 3, 2)).toEqual(
      expect.objectContaining({
        kind: "uncertain"
      })
    );

    const scan = scanTeletextScreenshot(image);
    const scannedCell = scan.cells[3 * 40 + 2];

    expect(scannedCell).toEqual(expect.objectContaining({
      kind: "text",
      value: "A"
    }));
    expect(scan.rows[3].cells[2]).toEqual(expect.objectContaining({
      kind: "character",
      byte: 65
    }));
  });

  it("scans clean 320 by 250 teletext captures using native 8 by 10 cell glyphs", () => {
    const image = createImage(320, 250);

    drawLowResolutionText(image, 8, 0, "NEWS", 3);

    const scan = scanTeletextScreenshot(image);

    expect(scan.cells.slice(8 * 40, (8 * 40) + 4).map((cell) => cell.value).join("")).toBe("NEWS");
    expect(scan.rows[8].cells.slice(0, 4)).toEqual([
      expect.objectContaining({ kind: "character", byte: 78 }),
      expect.objectContaining({ kind: "character", byte: 69 }),
      expect.objectContaining({ kind: "character", byte: 87 }),
      expect.objectContaining({ kind: "character", byte: 83 })
    ]);
  });

  it("scans 320 by 288 Mode 7 captures as 24 visible rows without vertical drift", () => {
    const image = createImage(320, 288);

    drawMode7CaptureText(image, 8, 0, "NEWS", 3);

    const scan = scanTeletextScreenshot(image);

    expect(scan.grid.cellHeight).toBe(12);
    expect(scan.grid.yLines?.[8]).toBe(96);
    expect(scan.cells.slice(8 * 40, (8 * 40) + 4).map((cell) => cell.value).join("")).toBe("NEWS");
    expect(scan.rows[24].cells.every((cell) => cell.kind === "empty")).toBe(true);
  });

  it("scans low-resolution mosaic cells with source-sized sixel templates", () => {
    const image = createImage(320, 250);

    drawLowResolutionMosaic(image, 9, 4, 0b100101, 2);

    const scan = scanTeletextScreenshot(image);
    const cell = scan.cells[9 * 40 + 4];

    expect(cell).toEqual(expect.objectContaining({
      kind: "mosaic",
      sixelMask: 0b100101,
      foreground: { palette: "level1", index: 2 }
    }));
  });

  it("keeps adjacent low-resolution mosaic separator cells continuous", () => {
    const image = createImage(320, 250);

    for (let column = 0; column < 8; column += 1) {
      drawLowResolutionMosaic(image, 12, column, 0b000011, 3);
    }

    const scan = scanTeletextScreenshot(image);
    const cells = scan.cells.slice(12 * 40, (12 * 40) + 8);

    expect(cells.every((cell) => cell.kind === "mosaic")).toBe(true);
    expect(cells.every((cell) => cell.sixelMask === 0b000011)).toBe(true);
    expect(scan.rows[12].cells.slice(0, 8).every((cell) => cell.kind === "mosaic")).toBe(true);
  });

  it("keeps thin low-resolution separator bars visible instead of dropping cells", () => {
    const image = createImage(320, 250);

    for (let column = 0; column < 8; column += 1) {
      drawLowResolutionThinBar(image, 12, column, 4, 3);
    }

    const scan = scanTeletextScreenshot(image);
    const cells = scan.cells.slice(12 * 40, (12 * 40) + 8);

    expect(cells.every((cell) => cell.kind === "mosaic" || cell.kind === "text")).toBe(true);
    expect(scan.rows[12].cells.slice(0, 8).every((cell) => cell.kind !== "empty")).toBe(true);
  });

  it("keeps Mode 7 horizontal divider bands as contiguous mosaics", () => {
    const image = createImage(320, 288);

    for (let column = 24; column < 40; column += 1) {
      drawMode7Mosaic(image, 9, column, 0b000011, 4);
    }

    const scan = scanTeletextScreenshot(image);
    const cells = scan.cells.slice(9 * 40 + 24, 9 * 40 + 40);

    expect(cells.every((cell) => cell.kind === "mosaic")).toBe(true);
    expect(cells.every((cell) => cell.sixelMask === 0b000011)).toBe(true);
    expect(scan.rows[9].cells.slice(24, 40).every((cell) => cell.kind === "mosaic")).toBe(true);
  });

  it("classifies Mode 7 mosaic lettering masks from source-cell occupancy", () => {
    const image = createImage(320, 288, 3);
    const masks = [0b101000, 0b010101, 0b110001];

    masks.forEach((mask, offset) => {
      drawMode7Mosaic(image, 4, 8 + offset, mask, 4);
    });

    const scan = scanTeletextScreenshot(image);
    const cells = scan.cells.slice(4 * 40 + 8, 4 * 40 + 11);

    expect(cells.map((cell) => cell.kind)).toEqual(["mosaic", "mosaic", "mosaic"]);
    expect(cells.map((cell) => cell.sixelMask)).toEqual(masks);
    expect(cells.every((cell) => cell.foreground.index === 4)).toBe(true);
    expect(cells.every((cell) => cell.background.index === 3)).toBe(true);
  });

  it("keeps Mode 7 mosaic foreground when the active sixels outnumber the background", () => {
    const image = createImage(320, 288, 3);

    drawMode7Mosaic(image, 4, 12, 0b111101, 4);

    const scan = scanTeletextScreenshot(image);
    const cell = scan.cells[4 * 40 + 12];

    expect(cell).toEqual(expect.objectContaining({
      kind: "mosaic",
      sixelMask: 0b111101,
      foreground: { palette: "level1", index: 4 },
      background: { palette: "level1", index: 3 }
    }));
  });

  it("uses neighbouring mosaic background when brute-forcing foreground-heavy masks", () => {
    const image = createImage(320, 288, 3);

    drawMode7Mosaic(image, 4, 7, 0b111100, 4);
    drawMode7Mosaic(image, 4, 8, 0b001111, 4);
    drawMode7Mosaic(image, 4, 9, 0b001111, 4);

    const scan = scanTeletextScreenshot(image);
    const cell = scan.cells[4 * 40 + 8];

    expect(cell).toEqual(expect.objectContaining({
      kind: "mosaic",
      sixelMask: 0b001111,
      foreground: { palette: "level1", index: 4 },
      background: { palette: "level1", index: 3 }
    }));
  });

  it("imports paired low-resolution double-height text as one editable top row", () => {
    const image = createImage(320, 250);

    drawLowResolutionDoubleHeightText(image, 6, 1, "NEWS", 3);

    const scan = scanTeletextScreenshot(image);

    expect(scan.cells.slice(6 * 40 + 1, 6 * 40 + 5).map((cell) => cell.value).join("")).toBe("NEWS");
    expect(scan.cells.slice(6 * 40 + 1, 6 * 40 + 5).every((cell) => cell.doubleHeight === "top")).toBe(true);
    expect(scan.cells.slice(7 * 40 + 1, 7 * 40 + 5).every((cell) => cell.doubleHeight === "bottom")).toBe(true);
    expect(scan.rows[6].cells[0]).toEqual(expect.objectContaining({
      kind: "control",
      byte: 0x0d
    }));
    expect(scan.rows[6].cells.slice(1, 5).map((cell) => cell.kind === "character" ? cell.character?.value : "")).toEqual([
      "N",
      "E",
      "W",
      "S"
    ]);
    expect(scan.rows[7].cells.slice(1, 5).every((cell) => cell.kind === "empty")).toBe(true);
  });

  it("imports paired Mode 7 double-height text despite vertical capture padding", () => {
    const image = createImage(320, 288);

    drawMode7DoubleHeightText(image, 6, 1, "NEWS", 3);

    const scan = scanTeletextScreenshot(image);

    expect(scan.cells.slice(6 * 40 + 1, 6 * 40 + 5).map((cell) => cell.value).join("")).toBe("NEWS");
    expect(scan.cells.slice(6 * 40 + 1, 6 * 40 + 5).every((cell) => cell.doubleHeight === "top")).toBe(true);
    expect(scan.cells.slice(7 * 40 + 1, 7 * 40 + 5).every((cell) => cell.doubleHeight === "bottom")).toBe(true);
    expect(scan.rows[6].cells[0]).toEqual(expect.objectContaining({
      kind: "control",
      byte: 0x0d
    }));
    expect(scan.rows[7].cells.slice(1, 5).every((cell) => cell.kind === "empty")).toBe(true);
  });

  it("imports widened later-font Mode 7 double-height text as editable top-row characters", () => {
    const image = createImage(320, 288);

    drawMode7WidenedDoubleHeightText(image, 21, 1, "BBC RADIO", 7);

    const scan = scanTeletextScreenshot(image);

    expect(scan.cells.slice(21 * 40 + 1, 21 * 40 + 10).map((cell) => cell.value ?? " ").join("")).toBe("BBC RADIO");
    expect(scan.cells.slice(21 * 40 + 1, 21 * 40 + 10).filter((cell) => cell.value).every((cell) => cell.doubleHeight === "top")).toBe(true);
    expect(scan.cells.slice(22 * 40 + 1, 22 * 40 + 10).filter((_, index) => index !== 3).every((cell) => cell.doubleHeight === "bottom")).toBe(true);
  });

  it("does not fit an ordinary single-height footer into double-height text", () => {
    const image = createImage(320, 288);

    drawMode7CaptureText(image, 21, 0, "BBC RADIO FOR SCHOOLS", 7);

    const scan = scanTeletextScreenshot(image);
    const footerCells = scan.cells.slice(21 * 40, 21 * 40 + 22);
    const lowerCells = scan.cells.slice(22 * 40, 22 * 40 + 22);

    expect(footerCells.map((cell) => cell.value ?? " ").join("")).toContain("BBC RADIO FOR SCHOOLS");
    expect(footerCells.some((cell) => cell.doubleHeight === "top")).toBe(false);
    expect(lowerCells.some((cell) => cell.doubleHeight === "bottom")).toBe(false);
  });

  it("does not merge two ordinary readable text rows into double-height text", () => {
    const image = createImage(320, 288);

    drawMode7CaptureText(image, 7, 0, "NEWS HEADLINES", 3);
    drawMode7CaptureText(image, 8, 0, "NEWS IN DETAIL", 3);

    const scan = scanTeletextScreenshot(image);

    expect(scan.cells.slice(7 * 40, 7 * 40 + 14).map((cell) => cell.value ?? " ").join("")).toBe("NEWS HEADLINES");
    expect(scan.cells.slice(8 * 40, 8 * 40 + 14).map((cell) => cell.value ?? " ").join("")).toBe("NEWS IN DETAIL");
    expect(scan.cells.slice(7 * 40, 9 * 40).some((cell) => cell.doubleHeight)).toBe(false);
  });

  it("uses nearby mosaic region background for text labels at the start of a graphics block", () => {
    const image = createImage(320, 288, 4);

    drawMode7CaptureText(image, 3, 3, "BBC", 3);
    drawMode7Mosaic(image, 3, 6, 0b000000, 3);
    drawMode7Mosaic(image, 3, 7, 0b111100, 3);

    const scan = scanTeletextScreenshot(image);

    expect(scan.cells.slice(3 * 40 + 3, 3 * 40 + 6).map((cell) => cell.background.index)).toEqual([4, 4, 4]);
    expect(scan.rows[3].cells.slice(0, 3)).toEqual([
      expect.objectContaining({ kind: "control", byte: 0x04 }),
      expect.objectContaining({ kind: "control", byte: 0x1d }),
      expect.objectContaining({ kind: "control", byte: 0x03 })
    ]);
    expect(scan.rows[3].cells.slice(3, 6).map((cell) => cell.kind === "character" ? cell.character?.value : "")).toEqual([
      "B",
      "B",
      "C"
    ]);
  });

  it("does not steal Mode 7 mosaic logo cells for double-height text", () => {
    const image = createImage(320, 288, 3);
    const masks = [
      0b001100,
      0b111100,
      0b110011,
      0b111100,
      0b001100,
      0b010101
    ];

    [2, 3].forEach((rowIndex) => {
      masks.forEach((mask, offset) => {
        drawMode7Mosaic(image, rowIndex, 8 + offset, mask, 4);
      });
    });

    const scan = scanTeletextScreenshot(image);
    const logoCells = scan.cells.slice(2 * 40 + 8, 2 * 40 + 14);

    expect(logoCells.every((cell) => cell.kind === "mosaic")).toBe(true);
    expect(logoCells.some((cell) => cell.doubleHeight)).toBe(false);
  });

  it("finds embedded double-height text without unlocking protected mosaic runs", () => {
    const image = createImage(320, 288, 3);

    drawMode7DoubleHeightText(image, 6, 1, "NEWS", 7);

    for (let rowIndex = 6; rowIndex <= 7; rowIndex += 1) {
      for (let column = 12; column < 40; column += 1) {
        drawMode7Mosaic(image, rowIndex, column, column % 2 === 0 ? 0b000011 : 0b110000, 4);
      }
    }

    const scan = scanTeletextScreenshot(image);
    const textCells = scan.cells.slice(6 * 40 + 1, 6 * 40 + 5);
    const bottomCells = scan.cells.slice(7 * 40 + 1, 7 * 40 + 5);
    const mosaicCells = scan.cells.slice(6 * 40 + 12, 6 * 40 + 40);

    expect(textCells.map((cell) => cell.value).join("")).toBe("NEWS");
    expect(textCells.every((cell) => cell.doubleHeight === "top")).toBe(true);
    expect(bottomCells.every((cell) => cell.doubleHeight === "bottom")).toBe(true);
    expect(mosaicCells.every((cell) => cell.kind === "mosaic")).toBe(true);
    expect(mosaicCells.some((cell) => cell.doubleHeight)).toBe(false);
  });

  it("lets readable double-height words beat weak mosaic-looking cell matches", () => {
    const image = createImage(320, 288);

    drawMode7DoubleHeightText(image, 10, 6, "BBC2", 7);

    const scan = scanTeletextScreenshot(image);
    const textCells = scan.cells.slice(10 * 40 + 6, 10 * 40 + 10);
    const bottomCells = scan.cells.slice(11 * 40 + 6, 11 * 40 + 10);

    expect(textCells.map((cell) => cell.value).join("")).toBe("BBC2");
    expect(textCells.every((cell) => cell.kind === "text")).toBe(true);
    expect(textCells.every((cell) => cell.doubleHeight === "top")).toBe(true);
    expect(bottomCells.every((cell) => cell.doubleHeight === "bottom")).toBe(true);
  });

  it("does not chain a double-height bottom row into the following normal text row", () => {
    const image = createImage(320, 288);

    for (let column = 0; column < 40; column += 1) {
      drawMode7Mosaic(image, 9, column, 0b001100, 6);
    }

    drawMode7DoubleHeightText(image, 10, 1, "BBC2 NEWS", 7);
    drawMode7CaptureText(image, 12, 1, "STERLING £1.4840", 3);

    const scan = scanTeletextScreenshot(image);
    const separatorCells = scan.cells.slice(9 * 40, 10 * 40);
    const topCells = scan.cells.slice(10 * 40 + 1, 10 * 40 + 10);
    const bottomCells = scan.cells.slice(11 * 40 + 1, 11 * 40 + 10);
    const normalCells = scan.cells.slice(12 * 40 + 1, 12 * 40 + 18);

    expect(separatorCells.every((cell) => cell.kind === "mosaic")).toBe(true);
    expect(topCells.map((cell) => cell.value ?? " ").join("")).toBe("BBC2 NEWS");
    expect(topCells.filter((cell) => cell.kind === "text").every((cell) => cell.doubleHeight === "top")).toBe(true);
    expect(bottomCells.filter((_, index) => index !== 4).every((cell) => cell.doubleHeight === "bottom")).toBe(true);
    expect(normalCells.map((cell) => cell.value ?? " ").join("")).toContain("STERLING");
    expect(normalCells.some((cell) => cell.doubleHeight)).toBe(false);
  });

  it("does not use language-only band repair without paired double-height evidence", () => {
    const image = createImage(320, 250);

    for (let column = 0; column < 40; column += 1) {
      drawLowResolutionMosaic(image, 11, column, 0b001100, 6);
    }

    drawLowResolutionDoubleHeightText(image, 12, 1, "FT INDEX CLOSED", 7);
    drawLowResolutionText(image, 14, 1, "STERLING $1.4840", 3);

    const scan = scanTeletextScreenshot(image);
    const topCells = scan.cells.slice(12 * 40 + 1, 12 * 40 + 16);
    const bottomCells = scan.cells.slice(13 * 40 + 1, 13 * 40 + 16);
    const normalCells = scan.cells.slice(14 * 40 + 1, 14 * 40 + 18);

    expect(topCells.map((cell) => cell.value ?? " ").join("")).not.toBe("FT INDEX CLOSED");
    expect(topCells.some((cell) => cell.doubleHeight === "top")).toBe(false);
    expect(bottomCells.some((cell) => cell.doubleHeight === "bottom")).toBe(false);
    expect(normalCells.map((cell) => cell.value ?? " ").join("")).toContain("STERLING");
    expect(normalCells.some((cell) => cell.doubleHeight)).toBe(false);
  });

  it("grows a seeded double-height finance heading across weak neighbouring cells", () => {
    const top = traceRow(12, " ?Y INDEX  CLOSED");
    const bottom = traceRow(13, "");

    [4, 5, 6, 7, 8, 11, 12, 13, 14, 15, 16].forEach((column) => {
      top[column] = {
        ...top[column],
        doubleHeight: "top"
      };
      bottom[column] = {
        ...bottom[column],
        kind: "space",
        value: undefined,
        doubleHeight: "bottom"
      };
    });
    top[1] = {
      ...top[1],
      kind: "mosaic",
      value: undefined,
      sixelMask: 0b001100,
      confidence: 0.72
    };

    const corrected = applyDoubleHeightBandWordCorrections([...top, ...bottom]);
    const correctedTop = corrected.slice(0, 17);
    const correctedBottom = corrected.slice(40, 57);

    expect(correctedTop.slice(1, 17).map((cell) => cell.value ?? " ").join("")).toBe("FT INDEX  CLOSED");
    expect(correctedTop.filter((_, column) => column >= 1 && column <= 16 && column !== 3 && column !== 9 && column !== 10)
      .every((cell) => cell.doubleHeight === "top")).toBe(true);
    expect(correctedBottom.filter((_, column) => column >= 1 && column <= 16 && column !== 3 && column !== 9 && column !== 10)
      .every((cell) => cell.doubleHeight === "bottom")).toBe(true);
  });

  it("extends a confirmed double-height band through weak mosaic-looking cells but stops at protected mosaics", () => {
    const top = traceRow(12, " ?Y INDEX  CLOSED ?Y ");
    const bottom = traceRow(13, "");

    [4, 5, 6, 7, 8, 11, 12, 13, 14, 15, 16].forEach((column) => {
      top[column] = { ...top[column], doubleHeight: "top" };
      bottom[column] = { ...bottom[column], doubleHeight: "bottom" };
    });
    top[18] = {
      ...top[18],
      kind: "mosaic",
      value: undefined,
      sixelMask: 0b001100,
      confidence: 0.72
    };
    top[21] = {
      ...top[21],
      kind: "mosaic",
      value: undefined,
      sixelMask: 0b001100,
      confidence: 0.96,
      warnings: ["Scanner matched low-resolution mosaic occupancy."]
    };

    const corrected = applyDoubleHeightBandWordCorrections([...top, ...bottom]);

    expect(corrected[18].kind).toBe("uncertain");
    expect(corrected[18].doubleHeight).toBe("top");
    expect(corrected[18 + 40].doubleHeight).toBe("bottom");
    expect(corrected[19].doubleHeight).toBe("top");
    expect(corrected[21].kind).toBe("mosaic");
    expect(corrected[21].doubleHeight).toBeUndefined();
  });

  it("rescans foreground and background colours inside a confirmed double-height band without touching protected mosaics", () => {
    const image = createImage(320, 250, 4);
    const grid = createTraceGridFromBounds(image, { left: 0, top: 0, right: 320, bottom: 250 });
    const cells = Array.from({ length: 25 }, (_, rowIndex) => traceRow(rowIndex, ""));
    const top = cells[12];
    const bottom = cells[13];

    drawLowResolutionDoubleHeightText(image, 12, 4, "INDEX", 3);

    for (let column = 4; column < 9; column += 1) {
      top[column] = {
        ...top[column],
        kind: "text",
        value: "INDEX"[column - 4],
        foreground: { palette: "level1", index: 7 },
        background: { palette: "level1", index: 0 },
        doubleHeight: "top"
      };
      bottom[column] = {
        ...bottom[column],
        foreground: { palette: "level1", index: 7 },
        background: { palette: "level1", index: 0 },
        doubleHeight: "bottom"
      };
    }

    top[10] = {
      ...top[10],
      kind: "mosaic",
      sixelMask: 0b001100,
      foreground: { palette: "level1", index: 6 },
      background: { palette: "level1", index: 4 },
      confidence: 0.96,
      warnings: ["Scanner matched low-resolution mosaic occupancy."]
    };

    const corrected = applyDoubleHeightBandColourCorrection(image, grid, cells.flat());

    for (let column = 4; column < 9; column += 1) {
      expect(corrected[12 * 40 + column].foreground.index).toBe(3);
      expect(corrected[12 * 40 + column].background.index).toBe(4);
      expect(corrected[13 * 40 + column].foreground.index).toBe(3);
      expect(corrected[13 * 40 + column].background.index).toBe(4);
    }
    expect(corrected[12 * 40 + 10]).toMatchObject(top[10]);
  });

  it("reclaims low-confidence prelude cells for coloured double-height controls instead of dropping the colour", () => {
    const cells = Array.from({ length: 25 }, (_, rowIndex) => traceRow(rowIndex, ""));
    const top = cells[12];
    const bottom = cells[13];

    top[2] = { ...top[2], kind: "uncertain", confidence: 0.7 };
    top[3] = traceCell(12, 3, "Y", 0.7);
    top[4] = { ...top[4], doubleHeight: "top" };
    ["I", "N", "D", "E", "X"].forEach((value, offset) => {
      const column = offset + 5;
      top[column] = {
        ...traceCell(12, column, value),
        foreground: { palette: "level1", index: 3 },
        background: { palette: "level1", index: 0 },
        doubleHeight: "top"
      };
      bottom[column] = { ...bottom[column], doubleHeight: "bottom" };
    });

    const result = createRowsFromTraceCells(cells.flat());
    const row = result.rows[12];

    expect(row.cells[3]).toEqual(expect.objectContaining({ kind: "control", byte: 0x0d }));
    expect(row.cells[4]).toEqual(expect.objectContaining({ kind: "control", byte: 0x03 }));
    expect(row.cells[5]).toEqual(expect.objectContaining({
      kind: "character",
      character: expect.objectContaining({ value: "I" })
    }));
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ message: expect.stringContaining("Reclaimed") })
    ]));
  });

  it("does not promote normal financial text rows into double-height without paired evidence", () => {
    const image = createImage(320, 288);

    drawMode7CaptureText(image, 12, 1, "FT INDEX CLOSED", 7);
    drawMode7CaptureText(image, 13, 1, "STERLING $1.4840", 3);

    const scan = scanTeletextScreenshot(image);
    const headingCells = scan.cells.slice(12 * 40 + 1, 12 * 40 + 16);
    const sterlingCells = scan.cells.slice(13 * 40 + 1, 13 * 40 + 18);

    expect(headingCells.map((cell) => cell.value ?? " ").join("")).toContain("FT INDEX");
    expect(headingCells.some((cell) => cell.doubleHeight)).toBe(false);
    expect(sterlingCells.map((cell) => cell.value ?? " ").join("")).toContain("STERLING");
    expect(sterlingCells.some((cell) => cell.doubleHeight)).toBe(false);
  });

  it("does not pair adjacent normal finance rows as a double-height island", () => {
    const image = createImage(320, 250);

    drawLowResolutionText(image, 14, 1, "STERLING $1.4840 (-1.3c) EFFC 82.9 135", 3);
    drawLowResolutionText(image, 15, 1, "GOLD/OZ $391.63 at London close 136", 3);

    const scan = scanTeletextScreenshot(image);
    const sterlingCells = scan.cells.slice(14 * 40 + 1, 14 * 40 + 40);
    const goldCells = scan.cells.slice(15 * 40 + 1, 15 * 40 + 38);

    expect(sterlingCells.some((cell) => cell.doubleHeight)).toBe(false);
    expect(goldCells.some((cell) => cell.doubleHeight)).toBe(false);
  });

  it("does not pair a normal financial text row with a reports mosaic header below it", () => {
    const image = createImage(320, 288);

    drawMode7CaptureText(image, 15, 1, "GOLD/OZ $391.63 at London close 136", 3);

    for (let column = 0; column < 40; column += 1) {
      drawMode7Mosaic(image, 16, column, 0b001100, 6);
    }

    drawMode7CaptureText(image, 16, 6, "REPORTS", 7);
    drawMode7CaptureText(image, 16, 25, "PRICES", 7);

    const scan = scanTeletextScreenshot(image);
    const goldCells = scan.cells.slice(15 * 40 + 1, 15 * 40 + 37);
    const headerCells = scan.cells.slice(16 * 40, 17 * 40);

    expect(goldCells.map((cell) => cell.value ?? " ").join("")).toContain("GOLD");
    expect(goldCells.some((cell) => cell.doubleHeight)).toBe(false);
    expect(headerCells.filter((cell) => cell.kind === "mosaic").length).toBeGreaterThan(20);
  });

  it("promotes solid foreground-colour cells inside mosaic regions to full-block mosaics", () => {
    const image = createImage(320, 288, 3);

    drawMode7Mosaic(image, 3, 8, 0b111100, 4);
    fillMode7Cell(image, 3, 9, 4);
    drawMode7Mosaic(image, 3, 10, 0b001111, 4);

    const scan = scanTeletextScreenshot(image);
    const solidCell = scan.cells[3 * 40 + 9];

    expect(solidCell).toEqual(expect.objectContaining({
      kind: "mosaic",
      sixelMask: 0x3f,
      foreground: { palette: "level1", index: 4 },
      background: { palette: "level1", index: 3 }
    }));
  });

  it("promotes solid foreground-colour cells with diagonal mosaic neighbours", () => {
    const image = createImage(320, 288, 3);

    drawMode7Mosaic(image, 2, 8, 0b111100, 4);
    fillMode7Cell(image, 3, 9, 4);
    drawMode7Mosaic(image, 4, 10, 0b001111, 4);

    const scan = scanTeletextScreenshot(image);
    const solidCell = scan.cells[3 * 40 + 9];

    expect(solidCell).toEqual(expect.objectContaining({
      kind: "mosaic",
      sixelMask: 0x3f,
      foreground: { palette: "level1", index: 4 },
      background: { palette: "level1", index: 3 }
    }));
  });

  it("preserves solid background-colour cells inside mosaic regions as zero-mask mosaics", () => {
    const image = createImage(320, 288, 4);

    drawMode7Mosaic(image, 3, 8, 0b111100, 3);
    fillMode7Cell(image, 3, 9, 4);
    drawMode7Mosaic(image, 3, 10, 0b001111, 3);

    const scan = scanTeletextScreenshot(image);
    const solidCell = scan.cells[3 * 40 + 9];

    expect(solidCell).toEqual(expect.objectContaining({
      kind: "mosaic",
      sixelMask: 0,
      foreground: { palette: "level1", index: 3 },
      background: { palette: "level1", index: 4 }
    }));
  });

  it("uses a row prelude so early mosaic background runs survive official Level 1 rendering", () => {
    const image = createImage(320, 288, 4);

    for (let column = 1; column < 16; column += 1) {
      fillMode7Cell(image, 5, column, 4);
    }
    drawMode7Mosaic(image, 5, 12, 0b001111, 3);

    const scan = scanTeletextScreenshot(image);
    const row = scan.rows[5];
    const rendered = renderLevel1Row(row);

    expect(row.cells[0].byte).toBe(0x04);
    expect(row.cells[1].byte).toBe(0x1d);
    expect(row.cells[2].byte).toBe(0x13);
    expect(rendered.cells[3].background.index).toBe(4);
    expect(rendered.cells[12].background.index).toBe(4);
    expect(rendered.cells[12].foreground.index).toBe(3);
  });

  it("brute-forces inverted mosaic cells using the dominant region colour as background", () => {
    const image = createImage(320, 288, 4);

    drawMode7Mosaic(image, 3, 8, 0b111100, 3);
    drawMode7Mosaic(image, 3, 9, 0b000001, 3);
    drawMode7Mosaic(image, 3, 10, 0b001111, 3);

    const scan = scanTeletextScreenshot(image);
    const cell = scan.cells[3 * 40 + 9];

    expect(cell).toEqual(expect.objectContaining({
      kind: "mosaic",
      sixelMask: 0b000001,
      foreground: { palette: "level1", index: 3 },
      background: { palette: "level1", index: 4 }
    }));
  });

  it("rescues common teletext words from near-miss scanner OCR", () => {
    const cells = traceRow(7, "NE?B HEAD?INEB     101");
    const corrected = applyScannerTextCorrections(cells);

    expect(corrected.slice(0, 4).map((cell) => cell.value).join("")).toBe("NEWS");
    expect(corrected.slice(5, 14).map((cell) => cell.value).join("")).toBe("HEADLINES");
    expect(corrected[3]).toEqual(expect.objectContaining({
      kind: "text",
      value: "S",
      warnings: expect.arrayContaining([
        expect.stringContaining("Scanner word correction")
      ])
    }));
    expect(corrected.slice(19, 22).map((cell) => cell.value).join("")).toBe("101");
  });

  it("rescues common r-as-n scanner confusions while preserving word case", () => {
    const cells = traceRow(7, "nate Wonld ManKets Stneet Fonex");
    const corrected = applyScannerTextCorrections(cells);
    const row = corrected.map((cell) => cell.value ?? " ").join("").trimEnd();

    expect(row).toBe("rate World Markets Street Forex");
  });

  it("rescues word confusions when teletext dotted leaders follow the word", () => {
    const cells = traceRow(7, "Wall Stneet.. l27   Fonex........ l29");
    const corrected = applyScannerTextCorrections(cells);
    const row = corrected.map((cell) => cell.value ?? " ").join("").trimEnd();

    expect(row).toBe("Wall Street.. l27   Forex........ l29");
  });

  it("does not apply double-height footer phrase repairs to ordinary text rows", () => {
    const cells = traceRow(7, "BBC2 g0");
    const corrected = applyScannerTextCorrections(cells);
    const row = corrected.map((cell) => cell.value ?? " ").join("").trimEnd();

    expect(row).toBe("BBC2 g0");
  });

  it("rescues common pound-sign-as-f scanner confusions in ordinary text", () => {
    const cells = traceRow(7, "chie£ £ailunes Shanes So£ts");
    const corrected = applyScannerTextCorrections(cells);
    const row = corrected.map((cell) => cell.value ?? " ").join("").trimEnd();

    expect(row).toBe("chief failures Shares Softs");
  });

  it("rescues pound-sign-as-f confusions only into meaningful prose words", () => {
    const firstLine = applyScannerTextCorrections(traceRow(7, "The explusion o£ £ive membens o£"));
    const secondLine = applyScannerTextCorrections(traceRow(8, "Militant Tendency has been con£inmed at"));
    const thirdLine = applyScannerTextCorrections(traceRow(9, "a secnet session o£ the Laboun panty"));
    const fourthLine = applyScannerTextCorrections(traceRow(10, "the extneme le£t–wingens by 5–l."));
    const fifthLine = applyScannerTextCorrections(traceRow(11, "the le£t. Eanlien a motion to put"));
    const sixthLine = applyScannerTextCorrections(traceRow(12, "con£enence in Bnighton."));
    const seventhLine = applyScannerTextCorrections(traceRow(13, "A£tenwands Mn Peten Taa££e,"));
    const eighthLine = applyScannerTextCorrections(traceRow(14, "editon, said: \"We will be bacK\"."));
    const ninthLine = applyScannerTextCorrections(traceRow(15, "It was the second de£eat o£ the day for"));
    const tenthLine = applyScannerTextCorrections(traceRow(16, "nejected, again by 5–l."));

    expect(firstLine.map((cell) => cell.value ?? " ").join("").trimEnd())
      .toBe("The explusion of five members of");
    expect(secondLine.map((cell) => cell.value ?? " ").join("").trimEnd())
      .toBe("Militant Tendency has been confirmed at");
    expect(thirdLine.map((cell) => cell.value ?? " ").join("").trimEnd())
      .toBe("a secret session of the Labour party");
    expect(fourthLine.map((cell) => cell.value ?? " ").join("").trimEnd())
      .toBe("the extreme left–wingers by 5–l.");
    expect(fifthLine.map((cell) => cell.value ?? " ").join("").trimEnd())
      .toBe("the left. Earlier a motion to put");
    expect(sixthLine.map((cell) => cell.value ?? " ").join("").trimEnd())
      .toBe("conference in Brighton.");
    expect(seventhLine.map((cell) => cell.value ?? " ").join("").trimEnd())
      .toBe("Afterwards Mr Peter Taaffe,");
    expect(eighthLine.map((cell) => cell.value ?? " ").join("").trimEnd())
      .toBe("editor, said: \"We will be bacK\".");
    expect(ninthLine.map((cell) => cell.value ?? " ").join("").trimEnd())
      .toBe("It was the second defeat of the day for");
    expect(tenthLine.map((cell) => cell.value ?? " ").join("").trimEnd())
      .toBe("rejected, again by 5–l.");
  });

  it("normalises common scanner confusions in the X/0 header row", () => {
    const cells = traceRow(0, "PlO2   CEEFAX lO2  Mon  3 Dct  2O:5O/4B");
    const corrected = applyScannerTextCorrections(cells);
    const row = corrected.map((cell) => cell.value ?? " ").join("");

    expect(row.trimEnd()).toBe("P102   CEEFAX 102  Mon  3 Oct  20:50/48");
  });

  it("rescues mixed alpha-numeric broadcaster labels from near-miss scanner OCR", () => {
    const cells = traceRow(21, "HHGg");
    const corrected = applyScannerTextCorrections(cells);

    expect(corrected.slice(0, 4).map((cell) => cell.value).join("")).toBe("BBC2");
  });

  it("keeps thin Mode 7 punctuation such as dash and full stop", () => {
    const image = createImage(320, 288);

    drawMode7CaptureText(image, 7, 5, "-.", 7);

    const scan = scanTeletextScreenshot(image);

    expect(scan.cells[7 * 40 + 5]).toEqual(expect.objectContaining({
      kind: "text",
      value: "-"
    }));
    expect(scan.cells[7 * 40 + 6]).toEqual(expect.objectContaining({
      kind: "text",
      value: "."
    }));
  });

  it("keeps solid blue gaps inside yellow masthead mosaic regions as mosaic background", () => {
    const image = createImage(320, 288, 4);

    drawMode7Mosaic(image, 3, 14, 0b111100, 3);
    fillMode7Cell(image, 3, 15, 4);
    fillMode7Cell(image, 3, 16, 4);
    drawMode7Mosaic(image, 3, 17, 0b001111, 3);

    const scan = scanTeletextScreenshot(image);

    for (const column of [15, 16]) {
      expect(scan.cells[3 * 40 + column]).toEqual(expect.objectContaining({
        kind: "mosaic",
        sixelMask: 0,
        foreground: { palette: "level1", index: 3 },
        background: { palette: "level1", index: 4 }
      }));
    }
  });

  it("classifies text using a manually aligned crop grid", () => {
    const image = createImage(500, 540);
    const grid = createTraceGridFromBounds(image, {
      left: 10,
      top: 20,
      right: 490,
      bottom: 520
    });
    const glyph = getBitmapGlyph("A");

    for (let y = 0; y < glyph.length; y += 1) {
      for (let x = 0; x < glyph[y].length; x += 1) {
        if (glyph[y][x] === "1") {
          setPixel(image, 10 + (2 * 12) + x, 20 + (1 * 20) + y, 7);
        }
      }
    }

    expect(classifyTraceCell(image, grid, 1, 2)).toEqual(
      expect.objectContaining({
        kind: "text",
        value: "A",
        confidence: 1
      })
    );
  });

  it("classifies a glyph using calibrated non-uniform cell lines", () => {
    const image = createImage(520, 540);
    const grid = createCalibratedTraceGrid(
      image,
      {
        left: 10,
        top: 20,
        right: 510,
        bottom: 520
      },
      {
        xAnchors: [
          { lineIndex: 0, position: 10 },
          { lineIndex: 4, position: 58 },
          { lineIndex: 40, position: 510 }
        ],
        yAnchors: [
          { lineIndex: 0, position: 20 },
          { lineIndex: 3, position: 80 },
          { lineIndex: 25, position: 520 }
        ]
      }
    );

    drawGlyphAt(
      image,
      Math.round(grid.xLines?.[3] ?? 0),
      Math.round(grid.yLines?.[2] ?? 0),
      "B"
    );

    expect(classifyTraceCell(image, grid, 2, 3)).toEqual(
      expect.objectContaining({
        kind: "text",
        value: "B"
      })
    );
  });

  it("classifies a clean contiguous mosaic cell", () => {
    const image = createImage(480, 500);
    const grid = detectTraceGrid(image);
    drawMosaic(image, 2, 3, 0b100101);

    expect(classifyTraceCell(image, grid, 2, 3)).toEqual(
      expect.objectContaining({
        kind: "mosaic",
        sixelMask: 0b100101,
        foreground: { palette: "level1", index: 2 },
        background: { palette: "level1", index: 0 },
        confidence: 1
      })
    );
  });

  it("creates editable rows with minimal row-local colour controls", () => {
    const image = createImage(480, 500);
    drawGlyph(image, 4, 1, "A", 1);

    const result = traceTeletextScreenshot(image);
    const row = result.rows[4];

    expect(row.cells[0]).toEqual(
      expect.objectContaining({
        kind: "control",
        byte: 0x01
      })
    );
    expect(row.cells[1]).toEqual(
      expect.objectContaining({
        kind: "character",
        byte: 65,
        character: {
          charset: "G0",
          value: "A"
        }
      })
    );
  });

  it("normalises the X/0 header row when importing through the manually aligned trace path", () => {
    const image = createImage(480, 500);
    drawText(image, 0, 1, "PlO2   CEEFAX lO2  Mon  3 Dct  2O:5O/4B");

    const result = traceTeletextScreenshot(image);
    const headerText = result.rows[0].cells
      .map((cell) => cell.character?.value ?? " ")
      .join("")
      .trimEnd();

    expect(headerText).toBe(" P102   CEEFAX 102  Mon  3 Oct  20:50/48");
  });

  it("reports uncertain cells without blocking editable output", () => {
    const image = createImage(480, 500);
    const grid = detectTraceGrid(image);

    for (let y = 0; y < 20; y += 1) {
      setPixel(image, 6, 5 * 20 + y, 7);
    }

    const cell = classifyTraceCell(image, grid, 5, 0);
    const result = traceTeletextScreenshot(image);

    expect(cell.kind).toBe("uncertain");
    expect(result.warnings[0]).toEqual(
      expect.objectContaining({
        rowIndex: 5,
        column: 0
      })
    );
    expect(result.rows[5].cells[0]).toEqual(
      expect.objectContaining({
        kind: "empty",
        annotations: expect.arrayContaining([
          expect.objectContaining({
            label: "Trace confidence"
          })
        ])
      })
    );
  });

  it("uses a text hint to keep the best SAA5050 match when confidence is low", () => {
    const image = createImage(480, 500);
    const grid = detectTraceGrid(image);
    const glyph = getBitmapGlyph("A");

    for (let y = 0; y < glyph.length; y += 1) {
      for (let x = 0; x < glyph[y].length; x += 1) {
        if (glyph[y][x] === "1" && x % 2 === 0) {
          setPixel(image, 2 * 12 + x, 1 * 20 + y, 7);
        }
      }
    }

    const withoutHint = classifyTraceCell(image, grid, 1, 2);
    const withHint = classifyTraceCell(image, grid, 1, 2, {
      rowIndex: 1,
      column: 2,
      kind: "text"
    });

    expect(withoutHint.kind).toBe("uncertain");
    expect(withHint).toEqual(expect.objectContaining({
      kind: "text",
      value: "A",
      warnings: expect.arrayContaining([
        expect.stringContaining("Text hint")
      ])
    }));
  });

  it("preserves double-height trace hints as editable annotations", () => {
    const image = createImage(480, 500);
    const hints: TraceCellHint[] = [
      { rowIndex: 6, column: 4, kind: "double-height-top" }
    ];

    const result = traceTeletextScreenshot(image, detectTraceGrid(image), hints);

    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        rowIndex: 6,
        column: 4,
        message: expect.stringContaining("Double-height top hint")
      })
    ]));
    expect(result.rows[6].cells[4]).toEqual(expect.objectContaining({
      annotations: expect.arrayContaining([
        expect.objectContaining({
          label: "Trace hint"
        })
      ])
    }));
  });
});
