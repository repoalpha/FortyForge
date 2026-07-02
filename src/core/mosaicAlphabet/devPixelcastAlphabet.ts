import type { MosaicAlphabet, MosaicGlyph } from "../model/types";

const black = { palette: "level1" as const, index: 0 };
const citynewsRed = { palette: "level1" as const, index: 1 };

const FULL = 0x3f;
const EMPTY = 0x00;

const MASTHEAD_PATTERNS: Record<string, string[]> = {
  A: [
    "###",
    "#.#",
    "###",
    "#.#",
    "#.#"
  ],
  B: [
    "##.",
    "#.#",
    "##.",
    "#.#",
    "##."
  ],
  C: [
    "###",
    "#..",
    "#..",
    "#..",
    "###"
  ],
  D: [
    "##.",
    "#.#",
    "#.#",
    "#.#",
    "##."
  ],
  E: [
    "###",
    "#..",
    "###",
    "#..",
    "###"
  ],
  F: [
    "###",
    "#..",
    "###",
    "#..",
    "#.."
  ],
  G: [
    "###",
    "#..",
    "#.#",
    "#.#",
    "###"
  ],
  H: [
    "#.#",
    "#.#",
    "###",
    "#.#",
    "#.#"
  ],
  I: [
    "###",
    ".#.",
    ".#.",
    ".#.",
    "###"
  ],
  J: [
    "..#",
    "..#",
    "..#",
    "#.#",
    "###"
  ],
  K: [
    "#.#",
    "#.#",
    "##.",
    "#.#",
    "#.#"
  ],
  L: [
    "#..",
    "#..",
    "#..",
    "#..",
    "###"
  ],
  M: [
    "#.#",
    "###",
    "###",
    "#.#",
    "#.#"
  ],
  N: [
    "#.#",
    "###",
    "###",
    "###",
    "#.#"
  ],
  O: [
    "###",
    "#.#",
    "#.#",
    "#.#",
    "###"
  ],
  P: [
    "###",
    "#.#",
    "###",
    "#..",
    "#.."
  ],
  Q: [
    "###",
    "#.#",
    "#.#",
    "###",
    "..#"
  ],
  R: [
    "###",
    "#.#",
    "###",
    "##.",
    "#.#"
  ],
  S: [
    "###",
    "#..",
    "###",
    "..#",
    "###"
  ],
  T: [
    "###",
    ".#.",
    ".#.",
    ".#.",
    ".#."
  ],
  U: [
    "#.#",
    "#.#",
    "#.#",
    "#.#",
    "###"
  ],
  V: [
    "#.#",
    "#.#",
    "#.#",
    "#.#",
    ".#."
  ],
  W: [
    "#.#",
    "#.#",
    "###",
    "###",
    "#.#"
  ],
  X: [
    "#.#",
    "#.#",
    ".#.",
    "#.#",
    "#.#"
  ],
  Y: [
    "#.#",
    "#.#",
    ".#.",
    ".#.",
    ".#."
  ],
  Z: [
    "###",
    "..#",
    ".#.",
    "#..",
    "###"
  ]
};

const COMPACT_MASTHEAD_SIXEL_PATTERNS: Record<string, string[]> = {
  A: [
    ".####.",
    "##..##",
    "##..##",
    "######",
    "##..##",
    "##..##"
  ],
  B: [
    "#####.",
    "##..##",
    "#####.",
    "##..##",
    "##..##",
    "#####."
  ],
  C: [
    "#####.",
    "##...#",
    "##....",
    "##...#",
    "#####.",
    "#####."
  ],
  D: [
    "#####.",
    "##..##",
    "##..##",
    "##..##",
    "##..##",
    "#####."
  ],
  E: [
    "#######.",
    "##......",
    "######..",
    "##......",
    "#######.",
    "#######."
  ],
  F: [
    "######",
    "##....",
    "#####.",
    "##....",
    "##....",
    "##...."
  ],
  G: [
    "######",
    "##....",
    "##.###",
    "##..##",
    "######",
    "######"
  ],
  H: [
    "##..##",
    "##..##",
    "######",
    "##..##",
    "##..##",
    "##..##"
  ],
  I: [
    "##",
    "##",
    "##",
    "##",
    "##",
    "##"
  ],
  J: [
    "....##",
    "....##",
    "....##",
    "##..##",
    "######",
    "######"
  ],
  K: [
    "##..##",
    "##.##.",
    "####..",
    "##.##.",
    "##..##",
    "##..##"
  ],
  L: [
    "##....",
    "##....",
    "##....",
    "##....",
    "######",
    "######"
  ],
  M: [
    "##...##",
    "###.###",
    "#######",
    "##.#.##",
    "##...##",
    "##...##"
  ],
  N: [
    "#####.",
    "##..#.",
    "##..#.",
    "##..#.",
    "##..#.",
    "##..#."
  ],
  O: [
    "######",
    "##..##",
    "##..##",
    "##..##",
    "######",
    "######"
  ],
  P: [
    "#####.",
    "##..##",
    "#####.",
    "##....",
    "##....",
    "##...."
  ],
  Q: [
    "######",
    "##..##",
    "##..##",
    "##.###",
    "######",
    "....##"
  ],
  R: [
    "#####.",
    "##..##",
    "#####.",
    "##.##.",
    "##..##",
    "##..##"
  ],
  S: [
    "#######.",
    "##......",
    "#######.",
    "......##",
    "#######.",
    "#######."
  ],
  T: [
    ".####.",
    ".####.",
    "..##..",
    "..##..",
    "..##..",
    "..##.."
  ],
  U: [
    "##..##",
    "##..##",
    "##..##",
    "##..##",
    "######",
    "######"
  ],
  V: [
    "##..##",
    "##..##",
    "##..##",
    "##..##",
    ".####.",
    "..##.."
  ],
  W: [
    "##.#.##.",
    "##.#.##.",
    "##.#.##.",
    "##.#.##.",
    "#######.",
    ".#####.."
  ],
  X: [
    "##..##",
    ".####.",
    "..##..",
    "..##..",
    ".####.",
    "##..##"
  ],
  Y: [
    "##..#.",
    "##..#.",
    "#####.",
    "...##.",
    "#####.",
    "#####."
  ],
  Z: [
    "######",
    "....##",
    "..##..",
    ".##...",
    "######",
    "######"
  ]
};

// Compact mastheads are authored in sixel-pixel space, then packed back into
// normal teletext mosaic cells. To add a new wordset, decode trusted source
// letters to six-pixel-high patterns here, use one "." column between letters,
// and let layoutMosaicText repack the full word into 2x3 sixel cells.
const CITYNEWS_COMPACT_PIXEL_PATTERNS: Record<string, string[]> = {
  A: [
    ".####.",
    "##..##",
    "######",
    "##..##",
    "##..##",
    "......"
  ],
  C: [
    "######",
    "##..##",
    "##....",
    "##..##",
    "######",
    "......"
  ],
  E: [
    "######",
    "##....",
    "######",
    "##....",
    "######",
    "......"
  ],
  I: [
    "##",
    "##",
    "##",
    "##",
    "##",
    ".."
  ],
  L: [
    "##....",
    "##....",
    "##....",
    "##....",
    "######",
    "......"
  ],
  P: [
    "######",
    "##..##",
    "######",
    "##....",
    "##....",
    "......"
  ],
  S: [
    "######",
    "##....",
    "######",
    "....##",
    "######",
    "......"
  ],
  T: [
    "######",
    "..##..",
    "..##..",
    "..##..",
    "..##..",
    "......"
  ],
  X: [
    "##..##",
    ".####.",
    "..##..",
    ".####.",
    "##..##",
    "......"
  ],
  Y: [
    "##..##",
    "##..##",
    "######",
    "....##",
    "######",
    "......"
  ],
  N: [
    "##..##",
    "###.##",
    "######",
    "##.###",
    "##..##",
    "......"
  ],
  W: [
    "##.#.##",
    "##.#.##",
    "##.#.##",
    "##.#.##",
    "#######",
    "......."
  ]
};

function glyphFromPattern(
  character: string,
  pattern: string[],
  note: string
): MosaicGlyph {
  return {
    character,
    width: pattern[0]?.length ?? 0,
    height: pattern.length,
    source: "generated",
    note,
    cells: pattern.flatMap((row) =>
      [...row].map((value) => ({
        sixelMask: value === "#" ? FULL : EMPTY,
        separated: false,
        foreground: citynewsRed,
        background: black
      }))
    )
  };
}

function mastheadGlyph(character: string, pattern: string[]): MosaicGlyph {
  return glyphFromPattern(
    character,
    pattern,
    "Generated from the CITYNEWS masthead block grammar; refine against captured glyphs when available."
  );
}

function compactMastheadGlyph(character: string, pattern: string[]): MosaicGlyph {
  const width = Math.ceil((pattern[0]?.length ?? 0) / 2);
  const paddedPattern = pattern.map((row) => row.padEnd(width * 2, "."));

  return {
    character,
    width,
    height: 2,
    source: "generated",
    note: "Two-row CITYNEWS-style mosaic glyph compiled from sixel patterns derived from the reference CITYNEWS masthead.",
    cells: Array.from({ length: 2 * width }, (_, index) => {
      const rowOffset = Math.floor(index / width);
      const columnOffset = index % width;
      let sixelMask = 0;

      for (let sixelRow = 0; sixelRow < 3; sixelRow += 1) {
        for (let sixelColumn = 0; sixelColumn < 2; sixelColumn += 1) {
          const patternRow = (rowOffset * 3) + sixelRow;
          const patternColumn = (columnOffset * 2) + sixelColumn;

          if (paddedPattern[patternRow]?.[patternColumn] === "#") {
            sixelMask |= 1 << ((sixelRow * 2) + sixelColumn);
          }
        }
      }

      return {
        sixelMask,
        separated: false,
        foreground: citynewsRed,
        background: black
      };
    })
  };
}

export function createCitynewsMastheadAlphabet(): MosaicAlphabet {
  return {
    id: "citynews-masthead-alphabet",
    name: "CITYNEWS masthead alphabet",
    description: "Generated A-Z block mosaic alphabet based on the BBC CITYNEWS masthead style.",
    cellWidth: 3,
    cellHeight: 5,
    spacingColumns: 1,
    glyphs: Object.fromEntries(
      Object.entries(MASTHEAD_PATTERNS).map(([character, pattern]) => [
        character,
        mastheadGlyph(character, pattern)
      ])
    )
  };
}

export function createCitynewsCompactMastheadAlphabet(): MosaicAlphabet {
  const generatedGlyphs = Object.fromEntries(
    Object.entries(COMPACT_MASTHEAD_SIXEL_PATTERNS).map(([character, pattern]) => [
      character,
      compactMastheadGlyph(character, pattern)
    ])
  );

  return {
    id: "citynews-compact-masthead",
    name: "CITYNEWS compact masthead",
    description: "Two-row CITYNEWS-style A-Z mosaic alphabet using sixel masks for smaller masthead lettering.",
    cellWidth: 3,
    cellHeight: 2,
    spacingColumns: 0,
    pixelGlyphs: CITYNEWS_COMPACT_PIXEL_PATTERNS,
    pixelSpacingColumns: 1,
    glyphs: generatedGlyphs
  };
}

export function createDevPixelcastAlphabet(): MosaicAlphabet {
  return createCitynewsMastheadAlphabet();
}
