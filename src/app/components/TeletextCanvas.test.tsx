import { describe, expect, it } from "vitest";

import type { RenderedLevel1Cell } from "../../core";
import {
  displayBackgroundForRenderedCell,
  FRAMEBUFFER_CELL_HEIGHT,
  FRAMEBUFFER_CELL_WIDTH,
  mosaicMaskForRenderedCell
} from "./TeletextCanvas";

function renderedCell(partial: Partial<RenderedLevel1Cell>): RenderedLevel1Cell {
  return {
    background: { palette: "level1", index: 0 },
    column: 0,
    conceal: false,
    doubleHeight: false,
    flash: false,
    foreground: { palette: "level1", index: 7 },
    holdGraphics: false,
    mode: "text",
    separatedGraphics: false,
    source: {
      annotations: [],
      byte: 0x20,
      column: 0,
      kind: "empty"
    },
    value: "",
    visible: false,
    ...partial
  };
}

describe("TeletextCanvas render helpers", () => {
  it("uses Level 1 background state for X/0 instead of forcing a blue band", () => {
    expect(
      displayBackgroundForRenderedCell(
        renderedCell({
          background: { palette: "level1", index: 0 }
        })
      )
    ).toBe("#000000");
  });

  it("converts visible typed bytes in graphics mode into mosaic masks", () => {
    expect(
      mosaicMaskForRenderedCell(
        renderedCell({
          mode: "graphics",
          source: {
            annotations: [],
            byte: 0x7f,
            character: {
              charset: "G0",
              value: "\u007f"
            },
            column: 0,
            kind: "character"
          },
          value: "\u007f",
          visible: true
        })
      )
    ).toBe(0x3f);
  });

  it("uses a wider framebuffer closer to the PIT studio preview", () => {
    expect(FRAMEBUFFER_CELL_WIDTH * 40).toBeGreaterThan(480);
    expect(FRAMEBUFFER_CELL_HEIGHT * 25).toBe(500);
  });
});
