import { describe, expect, it } from "vitest";

import {
  LEVEL_1_CSS_COLOURS,
  contrastColourForLevel1,
  level1ColourToCss
} from "./teletextColours";

describe("teletext colours", () => {
  it("uses full-bright Level 1 colours for preview and palette rendering", () => {
    expect(LEVEL_1_CSS_COLOURS).toEqual([
      "#000000",
      "#ff0000",
      "#00ff00",
      "#ffff00",
      "#0000ff",
      "#ff00ff",
      "#00ffff",
      "#ffffff"
    ]);
    expect(level1ColourToCss({ palette: "level1", index: 1 })).toBe("#ff0000");
  });

  it("selects readable button text over bright swatches", () => {
    expect(contrastColourForLevel1("#ff0000")).toBe("#ffffff");
    expect(contrastColourForLevel1("#ffff00")).toBe("#101214");
    expect(contrastColourForLevel1("#ffffff")).toBe("#101214");
  });
});
