import type { TeletextColourRef } from "../../core";

export const LEVEL_1_CSS_COLOURS = [
  "#000000",
  "#ff0000",
  "#00ff00",
  "#ffff00",
  "#0000ff",
  "#ff00ff",
  "#00ffff",
  "#ffffff"
] as const;

export function level1ColourToCss(colour: TeletextColourRef): string {
  if (colour.palette === "level1") {
    return LEVEL_1_CSS_COLOURS[colour.index] ?? LEVEL_1_CSS_COLOURS[7];
  }

  return LEVEL_1_CSS_COLOURS[7];
}

export function contrastColourForLevel1(background: string): string {
  return background === "#00ff00"
    || background === "#ffff00"
    || background === "#00ffff"
    || background === "#ffffff"
    ? "#101214"
    : "#ffffff";
}
