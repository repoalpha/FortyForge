import {
  getSaa5050Glyph,
  SAA5050_GLYPH_HEIGHT,
  SAA5050_GLYPH_WIDTH
} from "./saa5050Font";
import { BEDSTEAD_GLYPHS } from "./bedsteadFont";
import { ETS_TELETEXT_GLYPHS } from "./etsTeletextFont";
import { PHILIPS_LATER_GLYPHS } from "./philipsLaterFont";
import type { TeletextFontProfileId } from "../../core";

export type BitmapGlyph = string[];

export interface BitmapDrawContext {
  fillStyle: string | CanvasGradient | CanvasPattern;
  fillRect(x: number, y: number, width: number, height: number): void;
}

export interface DrawBitmapGlyphOptions {
  cellHeight: number;
  cellWidth: number;
  colour: string;
  profileId?: TeletextFontProfileId;
  value: string;
  x: number;
  y: number;
}

export interface DrawMosaicGlyphOptions {
  cellHeight: number;
  cellWidth: number;
  colour: string;
  separated: boolean;
  sixelMask: number;
  x: number;
  y: number;
}

const FALLBACK_GLYPH: BitmapGlyph = [
  "11111",
  "10001",
  "00001",
  "00010",
  "00100",
  "00000",
  "00100"
];

const PIT_GLYPH_WIDTH = 12;
const PIT_GLYPH_HEIGHT = 20;
const PIT_SOURCE_SCALE = 2;
const PIT_LEFT_MARGIN = 1;

// Last-resort fallback for characters outside the SAA5050 English set.
const BITMAP_GLYPHS: Record<string, BitmapGlyph> = {
  " ": [
    "00000",
    "00000",
    "00000",
    "00000",
    "00000",
    "00000",
    "00000"
  ],
  "0": [
    "01110",
    "10001",
    "10011",
    "10101",
    "11001",
    "10001",
    "01110"
  ],
  "1": [
    "00100",
    "01100",
    "00100",
    "00100",
    "00100",
    "00100",
    "01110"
  ],
  "2": [
    "01110",
    "10001",
    "00001",
    "00010",
    "00100",
    "01000",
    "11111"
  ],
  "3": [
    "11110",
    "00001",
    "00001",
    "01110",
    "00001",
    "00001",
    "11110"
  ],
  "4": [
    "00010",
    "00110",
    "01010",
    "10010",
    "11111",
    "00010",
    "00010"
  ],
  "5": [
    "11111",
    "10000",
    "10000",
    "11110",
    "00001",
    "00001",
    "11110"
  ],
  "6": [
    "01110",
    "10000",
    "10000",
    "11110",
    "10001",
    "10001",
    "01110"
  ],
  "7": [
    "11111",
    "00001",
    "00010",
    "00100",
    "01000",
    "01000",
    "01000"
  ],
  "8": [
    "01110",
    "10001",
    "10001",
    "01110",
    "10001",
    "10001",
    "01110"
  ],
  "9": [
    "01110",
    "10001",
    "10001",
    "01111",
    "00001",
    "00001",
    "01110"
  ],
  A: [
    "01110",
    "10001",
    "10001",
    "11111",
    "10001",
    "10001",
    "10001"
  ],
  B: [
    "11110",
    "10001",
    "10001",
    "11110",
    "10001",
    "10001",
    "11110"
  ],
  C: [
    "01111",
    "10000",
    "10000",
    "10000",
    "10000",
    "10000",
    "01111"
  ],
  D: [
    "11110",
    "10001",
    "10001",
    "10001",
    "10001",
    "10001",
    "11110"
  ],
  E: [
    "11111",
    "10000",
    "10000",
    "11110",
    "10000",
    "10000",
    "11111"
  ],
  F: [
    "11111",
    "10000",
    "10000",
    "11110",
    "10000",
    "10000",
    "10000"
  ],
  G: [
    "01111",
    "10000",
    "10000",
    "10011",
    "10001",
    "10001",
    "01111"
  ],
  H: [
    "10001",
    "10001",
    "10001",
    "11111",
    "10001",
    "10001",
    "10001"
  ],
  I: [
    "01110",
    "00100",
    "00100",
    "00100",
    "00100",
    "00100",
    "01110"
  ],
  J: [
    "00111",
    "00010",
    "00010",
    "00010",
    "10010",
    "10010",
    "01100"
  ],
  K: [
    "10001",
    "10010",
    "10100",
    "11000",
    "10100",
    "10010",
    "10001"
  ],
  L: [
    "10000",
    "10000",
    "10000",
    "10000",
    "10000",
    "10000",
    "11111"
  ],
  M: [
    "10001",
    "11011",
    "10101",
    "10101",
    "10001",
    "10001",
    "10001"
  ],
  N: [
    "10001",
    "11001",
    "10101",
    "10011",
    "10001",
    "10001",
    "10001"
  ],
  O: [
    "01110",
    "10001",
    "10001",
    "10001",
    "10001",
    "10001",
    "01110"
  ],
  P: [
    "11110",
    "10001",
    "10001",
    "11110",
    "10000",
    "10000",
    "10000"
  ],
  Q: [
    "01110",
    "10001",
    "10001",
    "10001",
    "10101",
    "10010",
    "01101"
  ],
  R: [
    "11110",
    "10001",
    "10001",
    "11110",
    "10100",
    "10010",
    "10001"
  ],
  S: [
    "01111",
    "10000",
    "10000",
    "01110",
    "00001",
    "00001",
    "11110"
  ],
  T: [
    "11111",
    "00100",
    "00100",
    "00100",
    "00100",
    "00100",
    "00100"
  ],
  U: [
    "10001",
    "10001",
    "10001",
    "10001",
    "10001",
    "10001",
    "01110"
  ],
  V: [
    "10001",
    "10001",
    "10001",
    "10001",
    "10001",
    "01010",
    "00100"
  ],
  W: [
    "10001",
    "10001",
    "10001",
    "10101",
    "10101",
    "10101",
    "01010"
  ],
  X: [
    "10001",
    "10001",
    "01010",
    "00100",
    "01010",
    "10001",
    "10001"
  ],
  Y: [
    "10001",
    "10001",
    "01010",
    "00100",
    "00100",
    "00100",
    "00100"
  ],
  Z: [
    "11111",
    "00001",
    "00010",
    "00100",
    "01000",
    "10000",
    "11111"
  ],
  ".": [
    "00000",
    "00000",
    "00000",
    "00000",
    "00000",
    "01100",
    "01100"
  ],
  "-": [
    "00000",
    "00000",
    "00000",
    "11111",
    "00000",
    "00000",
    "00000"
  ],
  "/": [
    "00001",
    "00010",
    "00010",
    "00100",
    "01000",
    "01000",
    "10000"
  ],
  ":": [
    "00000",
    "01100",
    "01100",
    "00000",
    "01100",
    "01100",
    "00000"
  ]
};

export function getBitmapGlyph(value: string, profileId: TeletextFontProfileId = "saa5050-classic"): BitmapGlyph {
  if (profileId === "ets-1990s") {
    const etsGlyph = ETS_TELETEXT_GLYPHS[value] ?? ETS_TELETEXT_GLYPHS[value.toUpperCase()];

    if (etsGlyph) {
      return [...etsGlyph];
    }
  }

  if (profileId === "tdatext-later") {
    const laterGlyph = PHILIPS_LATER_GLYPHS[value] ?? PHILIPS_LATER_GLYPHS[value.toUpperCase()];

    if (laterGlyph) {
      return [...laterGlyph];
    }
  }

  if (profileId === "bedstead-extended") {
    const bedsteadGlyph = BEDSTEAD_GLYPHS[value] ?? BEDSTEAD_GLYPHS[value.toUpperCase()];

    if (bedsteadGlyph) {
      return [...bedsteadGlyph];
    }
  }

  const glyph = getSaa5050Glyph(value) ?? getSaa5050Glyph(value.toUpperCase());

  return glyph
    ? rasterizePitSaa5050Glyph(glyph)
    : normalizeBitmapGlyph(BITMAP_GLYPHS[value.toUpperCase()] ?? FALLBACK_GLYPH);
}

function emptyPitGlyph() {
  return Array.from({ length: PIT_GLYPH_HEIGHT }, () =>
    Array.from({ length: PIT_GLYPH_WIDTH }, () => false)
  );
}

function sourceOn(glyph: readonly string[], x: number, y: number) {
  if (x < 0 || x >= SAA5050_GLYPH_WIDTH || y < 0 || y >= SAA5050_GLYPH_HEIGHT) {
    return false;
  }

  return glyph[y][x] === "1";
}

function serializePitGlyph(pixels: boolean[][]): BitmapGlyph {
  return pixels.map((row) => row.map((pixel) => pixel ? "1" : "0").join(""));
}

export function rasterizePitSaa5050Glyph(sourceGlyph: readonly string[]): BitmapGlyph {
  const pixels = emptyPitGlyph();

  for (let sourceY = 0; sourceY < SAA5050_GLYPH_HEIGHT; sourceY += 1) {
    for (let sourceX = 0; sourceX < SAA5050_GLYPH_WIDTH; sourceX += 1) {
      if (!sourceOn(sourceGlyph, sourceX, sourceY)) {
        continue;
      }

      for (let dy = 0; dy < PIT_SOURCE_SCALE; dy += 1) {
        for (let dx = 0; dx < PIT_SOURCE_SCALE; dx += 1) {
          pixels[sourceY * PIT_SOURCE_SCALE + dy][
            PIT_LEFT_MARGIN + sourceX * PIT_SOURCE_SCALE + dx
          ] = true;
        }
      }
    }
  }

  for (let sourceY = 0; sourceY < SAA5050_GLYPH_HEIGHT; sourceY += 1) {
    for (let sourceX = 0; sourceX < SAA5050_GLYPH_WIDTH; sourceX += 1) {
      if (sourceOn(sourceGlyph, sourceX, sourceY)) {
        continue;
      }

      const left = PIT_LEFT_MARGIN + sourceX * PIT_SOURCE_SCALE;
      const top = sourceY * PIT_SOURCE_SCALE;
      const west = sourceOn(sourceGlyph, sourceX - 1, sourceY);
      const east = sourceOn(sourceGlyph, sourceX + 1, sourceY);
      const north = sourceOn(sourceGlyph, sourceX, sourceY - 1);
      const south = sourceOn(sourceGlyph, sourceX, sourceY + 1);
      const northwest = sourceOn(sourceGlyph, sourceX - 1, sourceY - 1);
      const northeast = sourceOn(sourceGlyph, sourceX + 1, sourceY - 1);
      const southwest = sourceOn(sourceGlyph, sourceX - 1, sourceY + 1);
      const southeast = sourceOn(sourceGlyph, sourceX + 1, sourceY + 1);

      if (west && south && !southwest) {
        pixels[top + 1][left] = true;
      }
      if (east && south && !southeast) {
        pixels[top + 1][left + 1] = true;
      }
      if (west && north && !northwest) {
        pixels[top][left] = true;
      }
      if (east && north && !northeast) {
        pixels[top][left + 1] = true;
      }
    }
  }

  return serializePitGlyph(pixels);
}

function normalizeBitmapGlyph(glyph: BitmapGlyph): BitmapGlyph {
  return [
    "000000",
    ...glyph.map((row) => `0${row}`),
    "000000",
    "000000"
  ];
}

export function drawBitmapGlyph(context: BitmapDrawContext, options: DrawBitmapGlyphOptions): void {
  const glyph = getBitmapGlyph(options.value, options.profileId);
  const pixelWidth = Math.max(1, Math.floor(options.cellWidth / glyph[0].length));
  const pixelHeight = Math.max(1, Math.floor(options.cellHeight / glyph.length));
  const xOffset = Math.floor((options.cellWidth - glyph[0].length * pixelWidth) / 2);
  const yOffset = Math.floor((options.cellHeight - glyph.length * pixelHeight) / 2);

  context.fillStyle = options.colour;

  for (let rowIndex = 0; rowIndex < glyph.length; rowIndex += 1) {
    for (let column = 0; column < glyph[rowIndex].length; column += 1) {
      if (glyph[rowIndex][column] === "1") {
        context.fillRect(
          options.x + xOffset + column * pixelWidth,
          options.y + yOffset + rowIndex * pixelHeight,
          pixelWidth,
          pixelHeight
        );
      }
    }
  }
}

export function drawMosaicGlyph(context: BitmapDrawContext, options: DrawMosaicGlyphOptions): void {
  const blockX = [
    options.x,
    options.x + Math.floor(options.cellWidth / 2),
    options.x + options.cellWidth
  ];
  const blockY = [
    options.y,
    options.y + Math.floor(options.cellHeight / 3),
    options.y + Math.floor((options.cellHeight * 2) / 3),
    options.y + options.cellHeight
  ];
  const inset = options.separated ? 1 : 0;

  context.fillStyle = options.colour;

  for (let sixel = 0; sixel < 6; sixel += 1) {
    if ((options.sixelMask & (1 << sixel)) === 0) {
      continue;
    }

    const blockColumn = sixel % 2;
    const blockRow = Math.floor(sixel / 2);
    const left = blockX[blockColumn] + inset;
    const top = blockY[blockRow] + inset;
    const width = blockX[blockColumn + 1] - blockX[blockColumn] - inset * 2;
    const height = blockY[blockRow + 1] - blockY[blockRow] - inset * 2;

    context.fillRect(
      left,
      top,
      width,
      height
    );
  }
}
