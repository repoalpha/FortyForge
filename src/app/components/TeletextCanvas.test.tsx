import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createDefaultProject } from "../../core";
import type { RenderedLevel1Cell } from "../../core";
import {
  displayBackgroundForRenderedCell,
  FRAMEBUFFER_CELL_HEIGHT,
  FRAMEBUFFER_CELL_WIDTH,
  isCoveredByDoubleHeightCell,
  mosaicMaskForRenderedCell,
  sixelIndexFromCellPoint,
  TeletextCanvas
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

  it("keeps rendered mosaic mask separate from foreground and background colours", () => {
    const fullYellowOnBlue = renderedCell({
      background: { palette: "level1", index: 4 },
      foreground: { palette: "level1", index: 3 },
      source: {
        annotations: [],
        byte: 0x7f,
        column: 0,
        kind: "mosaic",
        mosaic: {
          background: { palette: "level1", index: 4 },
          foreground: { palette: "level1", index: 3 },
          separated: false,
          sixelMask: 0x3f
        }
      },
      value: "\u007f",
      visible: true
    });
    const emptyYellowOnBlue = renderedCell({
      background: { palette: "level1", index: 4 },
      foreground: { palette: "level1", index: 3 },
      source: {
        annotations: [],
        byte: 0x40,
        column: 0,
        kind: "mosaic",
        mosaic: {
          background: { palette: "level1", index: 4 },
          foreground: { palette: "level1", index: 3 },
          separated: false,
          sixelMask: 0
        }
      },
      value: "@",
      visible: true
    });

    expect(mosaicMaskForRenderedCell(fullYellowOnBlue)).toBe(0x3f);
    expect(displayBackgroundForRenderedCell(fullYellowOnBlue)).toBe("#0000ff");
    expect(fullYellowOnBlue.foreground).toEqual({ palette: "level1", index: 3 });
    expect(mosaicMaskForRenderedCell(emptyYellowOnBlue)).toBe(0);
    expect(displayBackgroundForRenderedCell(emptyYellowOnBlue)).toBe("#0000ff");
    expect(emptyYellowOnBlue.foreground).toEqual({ palette: "level1", index: 3 });
  });

  it("uses a wider framebuffer closer to the PIT studio preview", () => {
    expect(FRAMEBUFFER_CELL_WIDTH * 40).toBeGreaterThan(480);
    expect(FRAMEBUFFER_CELL_HEIGHT * 25).toBe(500);
  });

  it("maps points inside a character cell to the correct 2 by 3 sixel index", () => {
    expect(sixelIndexFromCellPoint(0, 0, 16, 20)).toBe(0);
    expect(sixelIndexFromCellPoint(15, 0, 16, 20)).toBe(1);
    expect(sixelIndexFromCellPoint(0, 9, 16, 20)).toBe(2);
    expect(sixelIndexFromCellPoint(15, 9, 16, 20)).toBe(3);
    expect(sixelIndexFromCellPoint(0, 19, 16, 20)).toBe(4);
    expect(sixelIndexFromCellPoint(15, 19, 16, 20)).toBe(5);
  });

  it("treats the row below visible double-height content as occupied", () => {
    const renderedRows = [
      {
        source: { index: 3, label: "Row 3", locked: false, cells: [] },
        cells: [
          renderedCell({
            column: 0,
            doubleHeight: true,
            value: "2",
            visible: true
          })
        ]
      },
      {
        source: { index: 4, label: "Row 4", locked: false, cells: [] },
        cells: [
          renderedCell({
            column: 0,
            source: {
              annotations: [],
              byte: 0x7f,
              column: 0,
              kind: "mosaic",
              mosaic: {
                background: { palette: "level1", index: 0 },
                foreground: { palette: "level1", index: 7 },
                separated: false,
                sixelMask: 0x3f
              }
            },
            visible: true
          })
        ]
      }
    ];

    expect(isCoveredByDoubleHeightCell(renderedRows, 1, 0)).toBe(true);
    expect(isCoveredByDoubleHeightCell(renderedRows, 0, 0)).toBe(false);
  });
});

describe("TeletextCanvas block selection", () => {
  function defaultRows() {
    return createDefaultProject().services[0].pages[0].subpages[0].rows;
  }

  function setCanvasBounds(canvas: HTMLElement) {
    Object.defineProperty(canvas, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        bottom: 500,
        height: 500,
        left: 0,
        right: 640,
        top: 0,
        width: 640,
        x: 0,
        y: 0,
        toJSON: () => ({})
      })
    });
  }

  it("selects a rectangular cell block by dragging in Blocks mode", () => {
    const onRectangleSelect = vi.fn();
    const onCellSelect = vi.fn();

    render(
      <TeletextCanvas
        activeTool="blocks"
        onCellDelete={vi.fn()}
        onCellSelect={onCellSelect}
        onRectangleSelect={onRectangleSelect}
        onTextInput={vi.fn()}
        rows={defaultRows()}
      />
    );

    const canvas = screen.getByRole("img", { name: "PIT framebuffer preview" });
    setCanvasBounds(canvas);

    fireEvent(
      canvas,
      new MouseEvent("pointerdown", {
        bubbles: true,
        buttons: 1,
        clientX: (2 * FRAMEBUFFER_CELL_WIDTH) + 1,
        clientY: (2 * FRAMEBUFFER_CELL_HEIGHT) + 1
      })
    );
    fireEvent(
      canvas,
      new MouseEvent("pointermove", {
        bubbles: true,
        buttons: 1,
        clientX: (5 * FRAMEBUFFER_CELL_WIDTH) + 1,
        clientY: (4 * FRAMEBUFFER_CELL_HEIGHT) + 1
      })
    );
    fireEvent(canvas, new MouseEvent("pointerup", { bubbles: true }));

    expect(onRectangleSelect).toHaveBeenLastCalledWith({
      startRow: 2,
      startColumn: 2,
      endRow: 4,
      endColumn: 5
    });
    expect(onCellSelect).toHaveBeenCalledWith({ rowIndex: 2, column: 2 });
  });

  it("clears rectangle selection with Escape in Blocks mode", () => {
    const onRectangleClear = vi.fn();

    render(
      <TeletextCanvas
        activeTool="blocks"
        onCellDelete={vi.fn()}
        onCellSelect={vi.fn()}
        onRectangleClear={onRectangleClear}
        onTextInput={vi.fn()}
        rectangleSelection={{
          startRow: 1,
          startColumn: 1,
          endRow: 2,
          endColumn: 3
        }}
        rows={defaultRows()}
      />
    );

    fireEvent.keyDown(screen.getByRole("grid", { name: "40 by 25 teletext grid" }), {
      key: "Escape"
    });

    expect(onRectangleClear).toHaveBeenCalledTimes(1);
  });
});
