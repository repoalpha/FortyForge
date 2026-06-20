import { getSaa5050Glyph } from "./saa5050Font";

export type BitmapGlyph = string[];

export interface BitmapDrawContext {
  fillStyle: string | CanvasGradient | CanvasPattern;
  fillRect(x: number, y: number, width: number, height: number): void;
}

export interface DrawBitmapGlyphOptions {
  cellHeight: number;
  cellWidth: number;
  colour: string;
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

export function getBitmapGlyph(value: string): BitmapGlyph {
  const glyph = getSaa5050Glyph(value) ?? getSaa5050Glyph(value.toUpperCase());

  return glyph ? [...glyph] : normalizeBitmapGlyph(BITMAP_GLYPHS[value.toUpperCase()] ?? FALLBACK_GLYPH);
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
  const glyph = getBitmapGlyph(options.value);
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
  const blockWidth = Math.floor(options.cellWidth / 2);
  const blockHeights = [
    Math.floor(options.cellHeight / 3),
    Math.floor(options.cellHeight / 3) + (options.cellHeight % 3 > 0 ? 1 : 0),
    Math.floor(options.cellHeight / 3) + (options.cellHeight % 3 > 1 ? 1 : 0)
  ];
  const blockY = [
    options.y,
    options.y + blockHeights[0],
    options.y + blockHeights[0] + blockHeights[1]
  ];
  const inset = options.separated ? 1 : 0;

  context.fillStyle = options.colour;

  for (let sixel = 0; sixel < 6; sixel += 1) {
    if ((options.sixelMask & (1 << sixel)) === 0) {
      continue;
    }

    const blockColumn = sixel % 2;
    const blockRow = Math.floor(sixel / 2);

    context.fillRect(
      options.x + blockColumn * blockWidth + inset,
      blockY[blockRow] + inset,
      blockWidth - inset * 2,
      blockHeights[blockRow] - inset * 2
    );
  }
}
