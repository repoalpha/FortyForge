import "@testing-library/jest-dom/vitest";

import { render, screen, waitFor, within } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";
import { FRAMEBUFFER_CELL_HEIGHT, FRAMEBUFFER_CELL_WIDTH } from "./components/TeletextCanvas";
import { getBitmapGlyph } from "./preview/bitmapGlyphRenderer";
import { createDefaultProject, exportNativeProject } from "../core";

const TRACE_TEST_PALETTE = [
  [0, 0, 0],
  [255, 0, 0],
  [0, 255, 0],
  [255, 255, 0],
  [0, 0, 255],
  [255, 0, 255],
  [0, 255, 255],
  [255, 255, 255]
] as const;

function createEdgeGridImageData(width = 520, height = 560) {
  const data = new Uint8ClampedArray(width * height * 4);
  const xLines = Array.from({ length: 41 }, (_, lineIndex) =>
    10 + (lineIndex * 12) + (lineIndex >= 14 ? 3 : 0)
  );
  const yLines = Array.from({ length: 26 }, (_, lineIndex) =>
    20 + (lineIndex * 20) + Math.floor(lineIndex / 6) * 3
  );

  function setPixel(x: number, y: number, colourIndex: number) {
    const [r, g, b] = TRACE_TEST_PALETTE[colourIndex];
    const offset = (y * width + x) * 4;

    data[offset] = r;
    data[offset + 1] = g;
    data[offset + 2] = b;
    data[offset + 3] = 255;
  }

  for (let rowIndex = 0; rowIndex < yLines.length - 1; rowIndex += 1) {
    for (let column = 0; column < xLines.length - 1; column += 1) {
      const colourIndex = (rowIndex + column) % 2 === 0 ? 1 : 4;

      for (let y = yLines[rowIndex]; y < yLines[rowIndex + 1]; y += 1) {
        for (let x = xLines[column]; x < xLines[column + 1]; x += 1) {
          setPixel(x, y, colourIndex);
        }
      }
    }
  }

  return {
    data,
    height,
    width
  };
}

function createWidenedGlyphImageData(width = 480, height = 500) {
  const data = new Uint8ClampedArray(width * height * 4);
  const glyph = getBitmapGlyph("A");

  for (let index = 0; index < data.length; index += 4) {
    data[index + 3] = 255;
  }

  function setPixel(x: number, y: number) {
    const offset = (y * width + x) * 4;

    data[offset] = 255;
    data[offset + 1] = 255;
    data[offset + 2] = 255;
    data[offset + 3] = 255;
  }

  for (let y = 0; y < glyph.length; y += 1) {
    for (let x = 0; x < glyph[y].length; x += 1) {
      if (glyph[y][x] === "1") {
        setPixel((2 * 12) + x, (3 * 20) + y);

        if (x + 1 < 12) {
          setPixel((2 * 12) + x + 1, (3 * 20) + y);
        }
      }
    }
  }

  return {
    data,
    height,
    width
  };
}

function createHeaderTraceImageData(width = 480, height = 500) {
  const data = new Uint8ClampedArray(width * height * 4);

  for (let index = 0; index < data.length; index += 4) {
    data[index + 3] = 255;
  }

  function setPixel(x: number, y: number) {
    const offset = (y * width + x) * 4;

    data[offset] = 255;
    data[offset + 1] = 255;
    data[offset + 2] = 255;
    data[offset + 3] = 255;
  }

  [..."PlOO   CEEFAX lOO  Mon  3 Dct  2O:49/5O"].forEach((value, offset) => {
    if (value === " ") {
      return;
    }

    const glyph = getBitmapGlyph(value);
    const left = (offset + 1) * 12;

    for (let y = 0; y < glyph.length; y += 1) {
      for (let x = 0; x < glyph[y].length; x += 1) {
        if (glyph[y][x] === "1") {
          setPixel(left + x, y);
        }
      }
    }
  });

  return {
    data,
    height,
    width
  };
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

function canvasPointerEvent(type: string, rowIndex: number, column: number) {
  return new MouseEvent(type, {
    bubbles: true,
    buttons: type === "pointerup" ? 0 : 1,
    clientX: (column * FRAMEBUFFER_CELL_WIDTH) + 1,
    clientY: (rowIndex * FRAMEBUFFER_CELL_HEIGHT) + 1
  });
}

describe("App", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("renders the model-backed editor shell", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "Page 100" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /100\.00 Index/i })).toBeInTheDocument();
    expect(screen.getByRole("grid", { name: "40 by 25 teletext grid" })).toBeInTheDocument();

    const rowOne = screen.getByTestId("teletext-row-1");
    expect(within(rowOne).getAllByRole("gridcell")).toHaveLength(40);

    expect(screen.getByRole("button", { name: "Blank page" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Weather page" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Subtitle newsflash" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "PIT framebuffer preview" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Studio" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Playout" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByRole("complementary", { name: "Inspector" })).not.toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Tool dock" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Text" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Mosaic" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Import Trace" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("column-ruler")).toHaveTextContent("01");
    expect(screen.getByTestId("column-ruler")).toHaveTextContent("40");
    expect(screen.getByTestId("row-ruler")).toHaveTextContent("X/0");
    expect(screen.getByTestId("row-ruler")).toHaveTextContent("24");

    expect(screen.getByText("0 validation issues")).toBeInTheDocument();
    expect(screen.getByText("25 packet preview records")).toBeInTheDocument();
  });

  it("groups the right tool dock into tabs and shows masthead controls only on the Masthead tab", () => {
    render(<App />);

    expect(screen.getByRole("tab", { name: "Tools" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Masthead" })).toHaveAttribute("aria-selected", "false");
    expect(screen.queryByRole("button", { name: "Stamp masthead" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Masthead" }));

    expect(screen.getByRole("tab", { name: "Masthead" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("button", { name: "Stamp masthead" })).toBeEnabled();
    expect(screen.getByRole("option", { name: "CITYNEWS masthead alphabet" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "CITYNEWS compact masthead" })).toBeInTheDocument();
  });

  it("organizes masthead controls into compact form groups", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("tab", { name: "Masthead" }));

    expect(screen.getByRole("heading", { name: "Masthead" })).toBeInTheDocument();
    expect(screen.getByText("Source")).toBeInTheDocument();
    expect(screen.getByText("Text")).toBeInTheDocument();
    expect(screen.getByText("Position")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stamp masthead" })).toBeInTheDocument();
  });

  it("keeps mosaic paint controls on the Mosaic tab", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("tab", { name: "Mosaic" }));

    expect(screen.getByRole("button", { name: "Mosaic full block" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Stamp masthead" })).not.toBeInTheDocument();
  });

  it("supports cell typing and template application", () => {
    render(<App />);

    const firstBodyCell = screen.getByRole("gridcell", {
      name: "Row 1, column 1, byte 32"
    });
    fireEvent.click(firstBodyCell);
    fireEvent.keyDown(screen.getByRole("grid", { name: "40 by 25 teletext grid" }), {
      key: "A"
    });

    expect(
      screen.getByRole("gridcell", {
        name: "Row 1, column 1, byte 65"
      })
    ).toHaveTextContent("A");
    expect(screen.getByText("Row 1, column 2")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(
      screen.getByRole("gridcell", {
        name: "Row 1, column 1, byte 32"
      })
    ).toHaveTextContent("");

    fireEvent.click(screen.getByRole("button", { name: "Redo" }));
    expect(
      screen.getByRole("gridcell", {
        name: "Row 1, column 1, byte 65"
      })
    ).toHaveTextContent("A");

    fireEvent.click(screen.getByRole("button", { name: "Weather page" }));

    expect(screen.getByTestId("active-template-name")).toHaveTextContent("Weather page");
    expect(
      screen.getByRole("gridcell", {
        name: "Row 2, column 1, byte 78"
      })
    ).toHaveTextContent("N");
  });

  it("undoes and redoes text edits with keyboard shortcuts", () => {
    render(<App />);
    const grid = screen.getByRole("grid", { name: "40 by 25 teletext grid" });

    fireEvent.click(screen.getByRole("gridcell", {
      name: "Row 1, column 1, byte 32"
    }));
    fireEvent.keyDown(grid, { key: "A" });

    expect(screen.getByRole("gridcell", {
      name: "Row 1, column 1, byte 65"
    })).toHaveTextContent("A");

    fireEvent.keyDown(grid, { key: "z", ctrlKey: true });

    expect(screen.getByRole("gridcell", {
      name: "Row 1, column 1, byte 32"
    })).toHaveTextContent("");

    fireEvent.keyDown(grid, { key: "Z", ctrlKey: true, shiftKey: true });

    expect(screen.getByRole("gridcell", {
      name: "Row 1, column 1, byte 65"
    })).toHaveTextContent("A");
  });

  it("clears the selected row with Ctrl+K and restores it with undo", () => {
    render(<App />);
    const grid = screen.getByRole("grid", { name: "40 by 25 teletext grid" });

    fireEvent.click(screen.getByRole("gridcell", {
      name: "Row 1, column 1, byte 32"
    }));
    fireEvent.keyDown(grid, { key: "A" });
    fireEvent.keyDown(grid, { key: "B" });
    fireEvent.keyDown(grid, { key: "C" });

    expect(screen.getByRole("gridcell", {
      name: "Row 1, column 1, byte 65"
    })).toHaveTextContent("A");
    expect(screen.getByRole("gridcell", {
      name: "Row 1, column 2, byte 66"
    })).toHaveTextContent("B");

    fireEvent.keyDown(grid, { key: "k", ctrlKey: true });

    expect(screen.getByRole("gridcell", {
      name: "Row 1, column 1, byte 32"
    })).toHaveTextContent("");
    expect(screen.getByRole("gridcell", {
      name: "Row 1, column 2, byte 32"
    })).toHaveTextContent("");

    fireEvent.keyDown(grid, { key: "z", ctrlKey: true });

    expect(screen.getByRole("gridcell", {
      name: "Row 1, column 1, byte 65"
    })).toHaveTextContent("A");
    expect(screen.getByRole("gridcell", {
      name: "Row 1, column 2, byte 66"
    })).toHaveTextContent("B");
  });

  it("preserves lowercase keyboard input for SAA5050 lowercase glyphs", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("gridcell", {
      name: "Row 1, column 1, byte 32"
    }));
    fireEvent.keyDown(screen.getByRole("grid", { name: "40 by 25 teletext grid" }), {
      key: "a"
    });

    expect(screen.getByRole("gridcell", {
      name: "Row 1, column 1, byte 97"
    })).toHaveTextContent("a");
  });

  it("keeps keyboard input active after selecting a cell", () => {
    render(<App />);

    const firstBodyCell = screen.getByRole("gridcell", {
      name: "Row 1, column 1, byte 32"
    });
    fireEvent.click(firstBodyCell);

    expect(screen.getByRole("grid", { name: "40 by 25 teletext grid" })).toHaveFocus();
  });

  it("focuses the keyboard grid without scrolling the page", () => {
    render(<App />);

    const grid = screen.getByRole("grid", { name: "40 by 25 teletext grid" });
    const focusWithoutScroll = vi.fn();
    Object.defineProperty(grid, "focus", {
      configurable: true,
      value: focusWithoutScroll
    });

    fireEvent.click(screen.getByRole("gridcell", {
      name: "Row 1, column 1, byte 32"
    }));

    expect(focusWithoutScroll).toHaveBeenCalledWith({ preventScroll: true });
  });

  it("inserts control characters from the studio palette", () => {
    render(<App />);

    expect(screen.getByRole("button", { name: "Alpha red" })).toHaveStyle({
      backgroundColor: "#ff0000",
      color: "#ffffff"
    });

    fireEvent.click(screen.getByRole("gridcell", {
      name: "Row 1, column 1, byte 32"
    }));
    fireEvent.keyDown(screen.getByRole("grid", { name: "40 by 25 teletext grid" }), {
      key: "A"
    });
    fireEvent.click(screen.getByRole("gridcell", {
      name: "Row 1, column 1, byte 65"
    }));
    fireEvent.click(screen.getByRole("button", { name: "Alpha red" }));

    expect(screen.getByRole("gridcell", {
      name: "Row 1, column 1, byte 1"
    })).toHaveTextContent("");
    expect(screen.getByRole("gridcell", {
      name: "Row 1, column 2, byte 65"
    })).toHaveTextContent("A");
    expect(screen.getByText("Control codes")).toBeInTheDocument();
  });

  it("allows authored controls on the X/0 header row in local clock mode", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("gridcell", {
      name: "Row 0, column 1, byte 80"
    }));
    fireEvent.click(screen.getByRole("button", { name: "Alpha red" }));

    expect(screen.getByRole("gridcell", {
      name: "Row 0, column 1, byte 1"
    })).toHaveTextContent("");
    expect(screen.getByRole("gridcell", {
      name: "Row 0, column 2, byte 49"
    })).toHaveTextContent("1");
  });

  it("does not insert double-height controls on the header or final display row", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("gridcell", {
      name: "Row 0, column 1, byte 80"
    }));
    fireEvent.click(screen.getByRole("button", { name: "Double height" }));

    expect(screen.queryByRole("gridcell", {
      name: "Row 0, column 1, byte 13"
    })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("gridcell", {
      name: "Row 24, column 1, byte 32"
    }));
    fireEvent.click(screen.getByRole("button", { name: "Double height" }));

    expect(screen.queryByRole("gridcell", {
      name: "Row 24, column 1, byte 13"
    })).not.toBeInTheDocument();
  });

  it("deletes the selected cell and compacts the row left", () => {
    render(<App />);
    const grid = screen.getByRole("grid", { name: "40 by 25 teletext grid" });

    fireEvent.click(screen.getByRole("gridcell", { name: "Row 1, column 1, byte 32" }));
    fireEvent.keyDown(grid, { key: "A" });
    fireEvent.keyDown(grid, { key: "B" });
    fireEvent.keyDown(grid, { key: "C" });
    fireEvent.click(screen.getByRole("gridcell", { name: "Row 1, column 2, byte 66" }));
    fireEvent.keyDown(grid, { key: "Delete" });

    expect(screen.getByRole("gridcell", { name: "Row 1, column 1, byte 65" }))
      .toHaveTextContent("A");
    expect(screen.getByRole("gridcell", { name: "Row 1, column 2, byte 67" }))
      .toHaveTextContent("C");
    expect(screen.getByRole("gridcell", { name: "Row 1, column 3, byte 32" }))
      .toHaveTextContent("");
  });

  it("removes a colour control with Delete so the row renders from the remaining bytes", () => {
    render(<App />);
    const grid = screen.getByRole("grid", { name: "40 by 25 teletext grid" });

    fireEvent.click(screen.getByRole("gridcell", { name: "Row 1, column 1, byte 32" }));
    fireEvent.keyDown(grid, { key: "A" });
    fireEvent.click(screen.getByRole("gridcell", { name: "Row 1, column 1, byte 65" }));
    fireEvent.click(screen.getByRole("button", { name: "Alpha red" }));
    const controlCell = screen.getByRole("gridcell", { name: "Row 1, column 1, byte 1" });
    expect(controlCell).toBeInTheDocument();

    fireEvent.click(controlCell);
    fireEvent.keyDown(grid, { key: "Delete" });

    expect(screen.getByRole("gridcell", { name: "Row 1, column 1, byte 65" }))
      .toHaveTextContent("A");
    expect(screen.queryByRole("gridcell", { name: "Row 1, column 1, byte 1" }))
      .not.toBeInTheDocument();
  });

  it("ignores graphics colour controls while the Text tool is active", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("gridcell", {
      name: "Row 1, column 1, byte 32"
    }));
    fireEvent.keyDown(screen.getByRole("grid", { name: "40 by 25 teletext grid" }), {
      key: "A"
    });
    fireEvent.click(screen.getByRole("gridcell", {
      name: "Row 1, column 1, byte 65"
    }));
    fireEvent.click(screen.getByRole("button", { name: "Graphics red" }));

    expect(screen.getByRole("gridcell", {
      name: "Row 1, column 1, byte 65"
    })).toHaveTextContent("A");
    expect(screen.queryByRole("gridcell", {
      name: "Row 1, column 1, byte 17"
    })).not.toBeInTheDocument();
  });

  it("only enables graphics colour controls in Mosaic mode", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("gridcell", {
      name: "Row 1, column 1, byte 32"
    }));

    expect(screen.getByRole("button", { name: "Graphics red" })).toBeDisabled();

    fireEvent.click(screen.getByRole("tab", { name: "Tools" }));
    fireEvent.click(screen.getByRole("button", { name: "Mosaic" }));

    expect(screen.getByRole("button", { name: "Graphics red" })).not.toBeDisabled();
  });

  it("enables graphics colour controls when opening the Mosaic tab directly", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("tab", { name: "Mosaic" }));
    fireEvent.click(screen.getByRole("gridcell", {
      name: "Row 1, column 1, byte 32"
    }));

    expect(screen.getByRole("button", { name: "Graphics blue" })).not.toBeDisabled();
  });

  it("keeps a selected mosaic preset highlighted until Freestyle is chosen", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("tab", { name: "Mosaic" }));

    const freestyle = screen.getByRole("button", { name: "Freestyle" });
    const topRow = screen.getByRole("button", { name: "Mosaic top row" });

    expect(freestyle).toHaveAttribute("aria-pressed", "true");
    expect(topRow).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(topRow);

    expect(topRow).toHaveAttribute("aria-pressed", "true");
    expect(freestyle).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(freestyle);

    expect(freestyle).toHaveAttribute("aria-pressed", "true");
    expect(topRow).toHaveAttribute("aria-pressed", "false");
  });

  it("shows screenshot import controls in Import Trace mode", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Import Trace" }));

    expect(screen.getByRole("tab", { name: "Trace" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    fireEvent.click(screen.getByRole("tab", { name: "Tools" }));
    expect(screen.getByRole("button", { name: "Import Trace" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    fireEvent.click(screen.getByRole("tab", { name: "Trace" }));
    expect(screen.getByLabelText("Reference screenshot")).toHaveAttribute("type", "file");
    expect(screen.getByRole("button", { name: "Try auto trace" })).toBeDisabled();
    expect(screen.getByText("Load a screenshot as a side-by-side reference.")).toBeInTheDocument();
  });

  it("places an uploaded screenshot beside the canvas as a manual reference", () => {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:fortyforge-reference")
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn()
    });

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Import Trace" }));
    fireEvent.change(screen.getByLabelText("Reference screenshot"), {
      target: {
        files: [new File(["not decoded in this path"], "test-page.png", { type: "image/png" })]
      }
    });

    expect(screen.getByRole("region", { name: "Reference screenshot" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Reference screenshot test-page.png" }))
      .toHaveAttribute("src", "blob:fortyforge-reference");
    expect(screen.getByText("Reference loaded: test-page.png")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try auto trace" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Hide grid" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByRole("button", { name: "Fit" })).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps the loaded reference visible while editing in Text mode", () => {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:fortyforge-reference")
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn()
    });

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Import Trace" }));
    fireEvent.change(screen.getByLabelText("Reference screenshot"), {
      target: {
        files: [new File(["not decoded in this path"], "text-mode-page.png", { type: "image/png" })]
      }
    });

    fireEvent.click(screen.getByRole("tab", { name: "Tools" }));
    fireEvent.click(screen.getByRole("button", { name: "Text" }));

    expect(screen.getByRole("button", { name: "Text" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("region", { name: "Reference screenshot" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Reference screenshot text-mode-page.png" }))
      .toHaveAttribute("src", "blob:fortyforge-reference");
    expect(screen.getByRole("separator", { name: "Resize reference panel" })).toBeInTheDocument();
  });

  it("widens the reference panel by dragging the split handle", () => {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:fortyforge-reference")
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn()
    });

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Import Trace" }));
    fireEvent.change(screen.getByLabelText("Reference screenshot"), {
      target: {
        files: [new File(["not decoded in this path"], "wide-page.png", { type: "image/png" })]
      }
    });

    const workbench = screen.getByTestId("preview-workbench");
    const resizeHandle = screen.getByRole("separator", { name: "Resize reference panel" });

    expect(workbench).toHaveStyle({ "--reference-panel-width": "460px" });

    fireEvent(resizeHandle, new MouseEvent("pointerdown", { bubbles: true, clientX: 800 }));
    fireEvent(window, new MouseEvent("pointermove", { bubbles: true, clientX: 640 }));
    fireEvent(window, new MouseEvent("pointerup", { bubbles: true, clientX: 640 }));

    expect(workbench).toHaveStyle({ "--reference-panel-width": "620px" });
  });

  it("aligns the reference trace grid with manual edge insets", () => {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:fortyforge-reference")
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn()
    });

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Import Trace" }));
    fireEvent.change(screen.getByLabelText("Reference screenshot"), {
      target: {
        files: [new File(["not decoded in this path"], "aligned-page.png", { type: "image/png" })]
      }
    });

    fireEvent.change(screen.getByLabelText("Grid left %"), {
      target: { value: "5" }
    });
    fireEvent.change(screen.getByLabelText("Grid top %"), {
      target: { value: "3" }
    });

    expect(screen.getByTestId("reference-grid-overlay")).toHaveStyle({
      left: "5%",
      top: "3%"
    });
  });

  it("marks selected reference grid cells with trace hints", () => {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:fortyforge-reference")
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn()
    });

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Import Trace" }));
    fireEvent.change(screen.getByLabelText("Reference screenshot"), {
      target: {
        files: [new File(["not decoded in this path"], "hint-page.png", { type: "image/png" })]
      }
    });

    expect(screen.getByRole("button", { name: "Tag cells" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: "Drag grid row line 10" }))
      .not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reference row 3 column 5" }));
    fireEvent.click(screen.getByRole("button", { name: "Hint mosaic" }));

    expect(screen.getByText("Selected reference cell: R3 C5")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reference row 3 column 5" }))
      .toHaveAttribute("data-trace-hint", "mosaic");

    fireEvent.click(screen.getByRole("button", { name: "Hint double height top" }));

    expect(screen.getByRole("button", { name: "Reference row 3 column 5" }))
      .toHaveAttribute("data-trace-hint", "double-height-top");

    fireEvent.click(screen.getByRole("button", { name: "Clear hint" }));

    expect(screen.getByRole("button", { name: "Reference row 3 column 5" }))
      .not.toHaveAttribute("data-trace-hint");
  });

  it("pins selected reference cell edges as calibrated trace grid anchors", () => {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:fortyforge-reference")
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn()
    });

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Import Trace" }));
    fireEvent.change(screen.getByLabelText("Reference screenshot"), {
      target: {
        files: [new File(["not decoded in this path"], "calibration-page.png", { type: "image/png" })]
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "Reference row 3 column 5" }));

    expect(screen.getByLabelText("Calibration X %")).toHaveValue(10);
    expect(screen.getByLabelText("Calibration Y %")).toHaveValue(8);

    fireEvent.change(screen.getByLabelText("Calibration X %"), {
      target: { value: "12.5" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Pin selected column left" }));
    fireEvent.change(screen.getByLabelText("Calibration Y %"), {
      target: { value: "9" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Pin selected row top" }));

    expect(screen.getByText("Grid calibration anchors: 1 columns, 1 rows")).toBeInTheDocument();
    expect(screen.getByTestId("reference-grid-overlay"))
      .toHaveAttribute("data-calibrated-grid", "true");

    fireEvent.click(screen.getByRole("button", { name: "Clear grid calibration" }));

    expect(screen.getByText("Grid calibration anchors: 0 columns, 0 rows")).toBeInTheDocument();
    expect(screen.getByTestId("reference-grid-overlay"))
      .not.toHaveAttribute("data-calibrated-grid");
  });

  it("drags reference grid row lines to create visible calibration anchors", () => {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:fortyforge-reference")
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn()
    });

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Import Trace" }));
    fireEvent.change(screen.getByLabelText("Reference screenshot"), {
      target: {
        files: [new File(["not decoded in this path"], "drag-grid-page.png", { type: "image/png" })]
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "Move grid lines" }));

    const overlay = screen.getByTestId("reference-grid-overlay");
    Object.defineProperty(overlay, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        bottom: 500,
        height: 500,
        left: 0,
        right: 480,
        top: 0,
        width: 480,
        x: 0,
        y: 0,
        toJSON: () => ({})
      })
    });

    fireEvent(
      screen.getByRole("button", { name: "Drag grid row line 10" }),
      new MouseEvent("pointerdown", { bubbles: true, clientY: 180 })
    );
    fireEvent(window, new MouseEvent("pointermove", { bubbles: true, clientY: 210 }));
    fireEvent(window, new MouseEvent("pointerup", { bubbles: true, clientY: 210 }));

    expect(screen.getByText("Grid calibration anchors: 0 columns, 1 rows")).toBeInTheDocument();
    expect(overlay).toHaveAttribute("data-calibrated-grid", "true");
    expect(screen.getByRole("button", { name: "Drag grid row line 10" }))
      .toHaveAttribute("aria-valuenow", "42");

    fireEvent.click(screen.getByRole("button", { name: "Tag cells" }));

    expect(screen.queryByRole("button", { name: "Drag grid row line 10" }))
      .not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reference row 3 column 5" }))
      .toBeInTheDocument();
  });

  it("suggests reference grid calibration from screenshot edges", async () => {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:fortyforge-reference")
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn()
    });
    Object.defineProperty(window, "createImageBitmap", {
      configurable: true,
      value: vi.fn(async () => ({
        close: vi.fn(),
        height: 560,
        width: 520
      }))
    });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn(),
      getImageData: vi.fn(() => createEdgeGridImageData())
    } as unknown as CanvasRenderingContext2D);

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Import Trace" }));
    fireEvent.change(screen.getByLabelText("Reference screenshot"), {
      target: {
        files: [new File(["edge grid"], "edge-grid-page.png", { type: "image/png" })]
      }
    });
    fireEvent.change(screen.getByLabelText("Grid left %"), {
      target: { value: "1.923" }
    });
    fireEvent.change(screen.getByLabelText("Grid top %"), {
      target: { value: "3.571" }
    });
    fireEvent.change(screen.getByLabelText("Grid right %"), {
      target: { value: "5.192" }
    });
    fireEvent.change(screen.getByLabelText("Grid bottom %"), {
      target: { value: "5" }
    });

    fireEvent.click(screen.getByRole("button", { name: "Suggest grid from edges" }));

    await waitFor(() =>
      expect(screen.getByText(/Suggested edge grid from image edges/i)).toBeInTheDocument()
    );
    expect(screen.getByTestId("reference-grid-overlay"))
      .toHaveAttribute("data-calibrated-grid", "true");
    expect(screen.getByText(/Grid calibration anchors: \d+ columns, \d+ rows/))
      .not.toHaveTextContent("0 columns, 0 rows");
  });

  it("scans a screenshot into editable rows with tolerant glyph matching", async () => {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:fortyforge-reference")
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn()
    });
    Object.defineProperty(window, "createImageBitmap", {
      configurable: true,
      value: vi.fn(async () => ({
        close: vi.fn(),
        height: 500,
        width: 480
      }))
    });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn(),
      getImageData: vi.fn(() => createWidenedGlyphImageData())
    } as unknown as CanvasRenderingContext2D);

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Import Trace" }));
    fireEvent.change(screen.getByLabelText("Reference screenshot"), {
      target: {
        files: [new File(["scan"], "later-font-page.png", { type: "image/png" })]
      }
    });

    fireEvent.click(screen.getByRole("button", { name: "Scan screenshot" }));

    await waitFor(() =>
      expect(screen.getByText(/Scanned later-font-page\.png into editable rows/i)).toBeInTheDocument()
    );
    expect(screen.getByRole("gridcell", {
      name: "Row 3, column 3, byte 65"
    })).toHaveTextContent("A");
  });

  it("shows the decoded X/0 row after scanning instead of the generated local header", async () => {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:fortyforge-reference")
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn()
    });
    Object.defineProperty(window, "createImageBitmap", {
      configurable: true,
      value: vi.fn(async () => ({
        close: vi.fn(),
        height: 500,
        width: 480
      }))
    });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn(),
      getImageData: vi.fn(() => createHeaderTraceImageData())
    } as unknown as CanvasRenderingContext2D);

    render(<App />);

    fireEvent.click(screen.getByRole("tab", { name: "Page" }));
    expect(screen.getByRole("button", { name: "Local clock" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    fireEvent.click(screen.getByRole("tab", { name: "Tools" }));
    fireEvent.click(screen.getByRole("button", { name: "Import Trace" }));
    fireEvent.change(screen.getByLabelText("Reference screenshot"), {
      target: {
        files: [new File(["scan"], "header-page.png", { type: "image/png" })]
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "Scan screenshot" }));

    await waitFor(() =>
      expect(screen.getByText(/Scanned header-page\.png into editable rows/i)).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole("tab", { name: "Page" }));
    expect(screen.getByRole("button", { name: "Original row" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("resets the reference panel width when the split handle is double clicked", () => {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:fortyforge-reference")
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn()
    });

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Import Trace" }));
    fireEvent.change(screen.getByLabelText("Reference screenshot"), {
      target: {
        files: [new File(["not decoded in this path"], "reset-page.png", { type: "image/png" })]
      }
    });

    const workbench = screen.getByTestId("preview-workbench");
    const resizeHandle = screen.getByRole("separator", { name: "Resize reference panel" });

    fireEvent(resizeHandle, new MouseEvent("pointerdown", { bubbles: true, clientX: 800 }));
    fireEvent(window, new MouseEvent("pointermove", { bubbles: true, clientX: 640 }));
    fireEvent(window, new MouseEvent("pointerup", { bubbles: true, clientX: 640 }));

    expect(workbench).toHaveStyle({ "--reference-panel-width": "620px" });

    fireEvent.doubleClick(resizeHandle);

    expect(workbench).toHaveStyle({ "--reference-panel-width": "460px" });
  });

  it("paints background from the studio palette without shifting existing text", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("gridcell", {
      name: "Row 1, column 1, byte 32"
    }));
    fireEvent.keyDown(screen.getByRole("grid", { name: "40 by 25 teletext grid" }), {
      key: "A"
    });
    fireEvent.click(screen.getByRole("gridcell", {
      name: "Row 1, column 1, byte 65"
    }));
    fireEvent.click(screen.getByRole("button", { name: "Background red" }));

    expect(screen.getByRole("gridcell", {
      name: "Row 1, column 1, byte 65"
    })).toHaveTextContent("A");
    expect(screen.queryByRole("gridcell", {
      name: "Row 1, column 2, byte 29"
    })).not.toBeInTheDocument();
  });

  it("keeps text on the selected cell when typing after painting a background", () => {
    render(<App />);
    const grid = screen.getByRole("grid", { name: "40 by 25 teletext grid" });

    fireEvent.click(screen.getByRole("gridcell", {
      name: "Row 1, column 1, byte 32"
    }));
    fireEvent.click(screen.getByRole("button", { name: "Background blue" }));
    fireEvent.keyDown(grid, { key: "A" });

    expect(screen.getByRole("gridcell", {
      name: "Row 1, column 1, byte 65"
    })).toHaveTextContent("A");
    expect(screen.getByText("Row 1, column 2")).toBeInTheDocument();
  });

  it("deletes text from a painted background cell without exposing helper controls", () => {
    render(<App />);
    const grid = screen.getByRole("grid", { name: "40 by 25 teletext grid" });

    fireEvent.click(screen.getByRole("gridcell", {
      name: "Row 1, column 1, byte 32"
    }));
    fireEvent.click(screen.getByRole("button", { name: "Background blue" }));
    fireEvent.keyDown(grid, { key: "A" });
    fireEvent.click(screen.getByRole("gridcell", {
      name: "Row 1, column 1, byte 65"
    }));
    fireEvent.keyDown(grid, { key: "Delete" });

    expect(screen.getByRole("gridcell", {
      name: "Row 1, column 1, byte 32"
    })).toHaveTextContent("");
    expect(screen.queryByRole("gridcell", {
      name: "Row 1, column 1, byte 29"
    })).not.toBeInTheDocument();
  });

  it("paints mosaic graphics from the studio palette", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("tab", { name: "Mosaic" }));
    fireEvent.click(screen.getByRole("gridcell", {
      name: "Row 1, column 1, byte 32"
    }));
    fireEvent.click(screen.getByRole("button", { name: "Mosaic full block" }));

    expect(screen.getByRole("gridcell", {
      name: "Row 1, column 1, byte 127"
    })).toBeInTheDocument();
  });

  it("stamps a locked mosaic preset from a framebuffer click", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("tab", { name: "Mosaic" }));
    fireEvent.click(screen.getByRole("button", { name: "Mosaic top row" }));
    fireEvent.mouseDown(screen.getByRole("img", { name: "PIT framebuffer preview" }), {
      button: 0,
      buttons: 1,
      clientX: 1,
      clientY: 21
    });

    expect(screen.getByRole("gridcell", {
      name: "Row 1, column 1, byte 67"
    })).toBeInTheDocument();
  });

  it("stamps a locked mosaic preset from a grid cell click", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("tab", { name: "Mosaic" }));
    fireEvent.click(screen.getByRole("button", { name: "Mosaic right half" }));
    fireEvent.click(screen.getByRole("gridcell", {
      name: "Row 1, column 2, byte 32"
    }));

    expect(screen.getByRole("gridcell", {
      name: "Row 1, column 2, byte 106"
    })).toBeInTheDocument();
  });

  it("repeats the locked mosaic preset to the right with ArrowRight", () => {
    render(<App />);
    const grid = screen.getByRole("grid", { name: "40 by 25 teletext grid" });

    fireEvent.click(screen.getByRole("tab", { name: "Mosaic" }));
    fireEvent.click(screen.getByRole("gridcell", {
      name: "Row 1, column 1, byte 32"
    }));
    fireEvent.click(screen.getByRole("button", { name: "Mosaic top row" }));
    fireEvent.keyDown(grid, { key: "ArrowRight" });
    fireEvent.keyDown(grid, { key: "ArrowRight" });

    expect(screen.getByRole("gridcell", {
      name: "Row 1, column 1, byte 67"
    })).toBeInTheDocument();
    expect(screen.getByRole("gridcell", {
      name: "Row 1, column 2, byte 67"
    })).toBeInTheDocument();
    expect(screen.getByRole("gridcell", {
      name: "Row 1, column 3, byte 67"
    })).toBeInTheDocument();
  });

  it("does not wrap locked mosaic preset stamping past the right row edge", () => {
    render(<App />);
    const grid = screen.getByRole("grid", { name: "40 by 25 teletext grid" });

    fireEvent.click(screen.getByRole("tab", { name: "Mosaic" }));
    fireEvent.click(screen.getByRole("gridcell", {
      name: "Row 1, column 40, byte 32"
    }));
    fireEvent.click(screen.getByRole("button", { name: "Mosaic top row" }));
    fireEvent.keyDown(grid, { key: "ArrowRight" });

    expect(screen.getByRole("gridcell", {
      name: "Row 1, column 40, byte 67"
    })).toBeInTheDocument();
    expect(screen.getByRole("gridcell", {
      name: "Row 2, column 1, byte 32"
    })).toBeInTheDocument();
  });

  it("repeats the locked mosaic preset to the left with ArrowLeft", () => {
    render(<App />);
    const grid = screen.getByRole("grid", { name: "40 by 25 teletext grid" });

    fireEvent.click(screen.getByRole("tab", { name: "Mosaic" }));
    fireEvent.click(screen.getByRole("gridcell", {
      name: "Row 1, column 3, byte 32"
    }));
    fireEvent.click(screen.getByRole("button", { name: "Mosaic bottom row" }));
    fireEvent.keyDown(grid, { key: "ArrowLeft" });

    expect(screen.getByRole("gridcell", {
      name: "Row 1, column 3, byte 112"
    })).toBeInTheDocument();
    expect(screen.getByRole("gridcell", {
      name: "Row 1, column 2, byte 112"
    })).toBeInTheDocument();
  });

  it("keeps mosaic pattern buttons on the selected cell so full and empty are reversible", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Mosaic" }));
    fireEvent.click(screen.getByRole("gridcell", {
      name: "Row 1, column 1, byte 32"
    }));
    fireEvent.click(screen.getByRole("button", { name: "Background blue" }));
    fireEvent.click(screen.getByRole("button", { name: "Graphics yellow" }));

    fireEvent.click(screen.getByRole("button", { name: "Mosaic full block" }));

    expect(screen.getByRole("gridcell", {
      name: "Row 1, column 1, byte 127"
    })).toBeInTheDocument();
    expect(screen.getByRole("gridcell", {
      name: "Row 1, column 2, byte 32"
    })).toHaveAttribute("aria-label", "Row 1, column 2, byte 32");

    fireEvent.click(screen.getByRole("button", { name: "Mosaic empty" }));

    expect(screen.getByRole("gridcell", {
      name: "Row 1, column 1, byte 64"
    })).toBeInTheDocument();
    expect(screen.getByRole("gridcell", {
      name: "Row 1, column 2, byte 32"
    })).toHaveAttribute("aria-label", "Row 1, column 2, byte 32");
  });

  it("paints individual mosaic sixels directly on the framebuffer", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Mosaic" }));
    fireEvent.mouseDown(screen.getByRole("img", { name: "PIT framebuffer preview" }), {
      button: 0,
      buttons: 1,
      clientX: 1,
      clientY: 21
    });

    expect(screen.getByRole("gridcell", {
      name: "Row 1, column 1, byte 65"
    })).toBeInTheDocument();
  });

  it("toggles an individual mosaic sixel off with a second framebuffer click", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Mosaic" }));
    const canvas = screen.getByRole("img", { name: "PIT framebuffer preview" });

    fireEvent.mouseDown(canvas, {
      button: 0,
      buttons: 1,
      clientX: 1,
      clientY: 21
    });
    expect(screen.getByRole("gridcell", {
      name: "Row 1, column 1, byte 65"
    })).toBeInTheDocument();

    fireEvent.mouseDown(canvas, {
      button: 0,
      buttons: 1,
      clientX: 1,
      clientY: 21
    });

    expect(screen.getByRole("gridcell", {
      name: "Row 1, column 1, byte 64"
    })).toBeInTheDocument();
  });

  it("undoes mosaic sixel edits with Ctrl+Z instead of treating Z as a sixel shortcut", () => {
    render(<App />);
    const grid = screen.getByRole("grid", { name: "40 by 25 teletext grid" });

    fireEvent.click(screen.getByRole("button", { name: "Mosaic" }));
    fireEvent.mouseDown(screen.getByRole("img", { name: "PIT framebuffer preview" }), {
      button: 0,
      buttons: 1,
      clientX: 1,
      clientY: 21
    });

    expect(screen.getByRole("gridcell", {
      name: "Row 1, column 1, byte 65"
    })).toBeInTheDocument();

    fireEvent.keyDown(grid, { key: "z", ctrlKey: true });

    expect(screen.getByRole("gridcell", {
      name: "Row 1, column 1, byte 32"
    })).toBeInTheDocument();
    expect(screen.queryByRole("gridcell", {
      name: "Row 1, column 1, byte 81"
    })).not.toBeInTheDocument();
  });

  it("uses graphics colour buttons as mosaic paint colour without shifting cells", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Mosaic" }));
    fireEvent.click(screen.getByRole("gridcell", {
      name: "Row 1, column 1, byte 32"
    }));
    fireEvent.click(screen.getByRole("button", { name: "Mosaic full block" }));
    fireEvent.click(screen.getByRole("gridcell", {
      name: "Row 1, column 1, byte 127"
    }));
    fireEvent.click(screen.getByRole("button", { name: "Graphics yellow" }));

    expect(screen.getByRole("gridcell", {
      name: "Row 1, column 1, byte 127"
    })).toBeInTheDocument();
    expect(screen.getByRole("gridcell", {
      name: "Row 1, column 2, byte 32"
    })).toBeInTheDocument();
    expect(screen.queryByRole("gridcell", {
      name: "Row 1, column 1, byte 19"
    })).not.toBeInTheDocument();
  });

  it("toggles individual mosaic sixels with keyboard shortcuts in Mosaic mode", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Mosaic" }));
    fireEvent.click(screen.getByRole("gridcell", {
      name: "Row 1, column 1, byte 32"
    }));
    fireEvent.keyDown(screen.getByRole("grid", { name: "40 by 25 teletext grid" }), {
      key: "W"
    });

    expect(screen.getByRole("gridcell", {
      name: "Row 1, column 1, byte 66"
    })).toBeInTheDocument();
  });

  it("copies, stamps, and undoes a block selection", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Mosaic" }));
    fireEvent.click(screen.getByRole("gridcell", {
      name: "Row 1, column 1, byte 32"
    }));
    fireEvent.click(screen.getByRole("button", { name: "Mosaic full block" }));

    fireEvent.click(screen.getByRole("tab", { name: "Tools" }));
    fireEvent.click(screen.getByRole("button", { name: "Blocks" }));

    const canvas = screen.getByRole("img", { name: "PIT framebuffer preview" });
    setCanvasBounds(canvas);
    fireEvent(canvas, canvasPointerEvent("pointerdown", 1, 0));
    fireEvent(canvas, canvasPointerEvent("pointerup", 1, 0));

    expect(screen.getByText("Rows 1-1, columns 1-1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Copy block" }));
    expect(screen.getByText("Clipboard: 1 by 1 cells")).toBeInTheDocument();

    fireEvent(canvas, canvasPointerEvent("click", 1, 2));

    expect(screen.getByRole("gridcell", {
      name: "Row 1, column 3, byte 127"
    })).toBeInTheDocument();

    fireEvent(canvas, canvasPointerEvent("click", 1, 4));

    expect(screen.getByRole("gridcell", {
      name: "Row 1, column 5, byte 32"
    })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));

    expect(screen.getByRole("gridcell", {
      name: "Row 1, column 3, byte 32"
    })).toBeInTheDocument();
  });

  it("cuts a selected block with Ctrl plus Blocks and preserves blank cells in the clipboard", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Mosaic" }));
    fireEvent.click(screen.getByRole("gridcell", {
      name: "Row 1, column 1, byte 32"
    }));
    fireEvent.click(screen.getByRole("button", { name: "Mosaic full block" }));

    fireEvent.click(screen.getByRole("tab", { name: "Blocks" }));

    const canvas = screen.getByRole("img", { name: "PIT framebuffer preview" });
    setCanvasBounds(canvas);
    fireEvent(canvas, canvasPointerEvent("pointerdown", 1, 0));
    fireEvent(canvas, canvasPointerEvent("pointermove", 1, 1));
    fireEvent(canvas, canvasPointerEvent("pointerup", 1, 1));

    fireEvent.click(screen.getByRole("tab", { name: "Blocks" }), { ctrlKey: true });

    expect(screen.getByText("Clipboard: 2 by 1 cells")).toBeInTheDocument();
    expect(screen.getByRole("gridcell", {
      name: "Row 1, column 1, byte 32"
    })).toBeInTheDocument();
    expect(screen.getByRole("gridcell", {
      name: "Row 1, column 2, byte 32"
    })).toBeInTheDocument();

    fireEvent(canvas, canvasPointerEvent("click", 1, 2));

    expect(screen.getByRole("gridcell", {
      name: "Row 1, column 3, byte 127"
    })).toBeInTheDocument();
    expect(screen.getByRole("gridcell", {
      name: "Row 1, column 4, byte 32"
    })).toBeInTheDocument();
  });

  it("enters block selection mode when opening the Blocks tab", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("tab", { name: "Blocks" }));

    const canvas = screen.getByRole("img", { name: "PIT framebuffer preview" });
    setCanvasBounds(canvas);
    fireEvent(canvas, canvasPointerEvent("pointerdown", 1, 0));
    fireEvent(canvas, canvasPointerEvent("pointermove", 2, 2));
    fireEvent(canvas, canvasPointerEvent("pointerup", 2, 2));

    expect(screen.getByText("Rows 1-2, columns 1-3")).toBeInTheDocument();
  });

  it("clears block rectangle selection with Escape", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Blocks" }));

    const canvas = screen.getByRole("img", { name: "PIT framebuffer preview" });
    setCanvasBounds(canvas);
    fireEvent(canvas, canvasPointerEvent("pointerdown", 1, 0));
    fireEvent(canvas, canvasPointerEvent("pointermove", 2, 2));
    fireEvent(canvas, canvasPointerEvent("pointerup", 2, 2));

    expect(screen.getByText("Rows 1-2, columns 1-3")).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole("grid", { name: "40 by 25 teletext grid" }), {
      key: "Escape"
    });

    expect(screen.getByText("No rectangle selected")).toBeInTheDocument();
  });

  it("cancels block placement with Escape even when the grid is not focused", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Mosaic" }));
    fireEvent.click(screen.getByRole("gridcell", {
      name: "Row 1, column 1, byte 32"
    }));
    fireEvent.click(screen.getByRole("button", { name: "Mosaic full block" }));
    fireEvent.click(screen.getByRole("tab", { name: "Blocks" }));

    const canvas = screen.getByRole("img", { name: "PIT framebuffer preview" });
    setCanvasBounds(canvas);
    fireEvent(canvas, canvasPointerEvent("pointerdown", 1, 0));
    fireEvent(canvas, canvasPointerEvent("pointerup", 1, 0));
    fireEvent.click(screen.getByRole("button", { name: "Copy block" }));

    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent(canvas, canvasPointerEvent("click", 1, 2));

    expect(screen.getByRole("gridcell", {
      name: "Row 1, column 3, byte 32"
    })).toBeInTheDocument();
    expect(screen.getByText("No rectangle selected")).toBeInTheDocument();
  });

  it("saves a copied block with an optional shortcut letter", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Mosaic" }));
    fireEvent.click(screen.getByRole("gridcell", {
      name: "Row 1, column 1, byte 32"
    }));
    fireEvent.click(screen.getByRole("button", { name: "Mosaic full block" }));

    fireEvent.click(screen.getByRole("tab", { name: "Tools" }));
    fireEvent.click(screen.getByRole("button", { name: "Blocks" }));

    const canvas = screen.getByRole("img", { name: "PIT framebuffer preview" });
    setCanvasBounds(canvas);
    fireEvent(canvas, canvasPointerEvent("pointerdown", 1, 0));
    fireEvent(canvas, canvasPointerEvent("pointerup", 1, 0));
    fireEvent.click(screen.getByRole("button", { name: "Copy block" }));

    fireEvent.change(screen.getByLabelText("Block name"), {
      target: { value: "CITYNEWS E" }
    });
    fireEvent.change(screen.getByLabelText("Shortcut letter (optional)"), {
      target: { value: "E" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Save block" }));

    expect(screen.getByText("CITYNEWS E (E)")).toBeInTheDocument();
  });

  it("saves a copied strip by name without requiring a shortcut letter", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Mosaic" }));
    fireEvent.click(screen.getByRole("gridcell", {
      name: "Row 1, column 1, byte 32"
    }));
    fireEvent.click(screen.getByRole("button", { name: "Mosaic full block" }));
    fireEvent.click(screen.getByRole("tab", { name: "Blocks" }));

    const canvas = screen.getByRole("img", { name: "PIT framebuffer preview" });
    setCanvasBounds(canvas);
    fireEvent(canvas, canvasPointerEvent("pointerdown", 1, 0));
    fireEvent(canvas, canvasPointerEvent("pointermove", 1, 2));
    fireEvent(canvas, canvasPointerEvent("pointerup", 1, 2));
    fireEvent.click(screen.getByRole("button", { name: "Copy block" }));

    fireEvent.change(screen.getByLabelText("Block name"), {
      target: { value: "PIXELCAST title strip" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Save block" }));

    expect(screen.getByText("PIXELCAST title strip")).toBeInTheDocument();
    expect(screen.queryByText("PIXELCAST title strip ()")).not.toBeInTheDocument();
  });

  it("stamps PIXELCAST from the mosaic alphabet panel", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("tab", { name: "Masthead" }));
    expect(screen.getByRole("button", { name: "Stamp masthead" })).toBeEnabled();
    expect(screen.getByText("Target: Row 1, column 2")).toBeInTheDocument();
    expect(screen.getByLabelText("Start row")).toHaveDisplayValue("1");
    expect(screen.getByLabelText("Start column")).toHaveDisplayValue("2");
    expect(screen.getByRole("option", { name: "CITYNEWS masthead alphabet" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "CITYNEWS compact masthead" })).toBeInTheDocument();
    expect(screen.getByLabelText("Alphabet")).toHaveDisplayValue("CITYNEWS compact masthead");

    fireEvent.click(screen.getByRole("tab", { name: "Tools" }));
    fireEvent.click(screen.getByRole("button", { name: "Mosaic" }));
    fireEvent.click(screen.getByRole("gridcell", {
      name: "Row 1, column 1, byte 32"
    }));
    fireEvent.click(screen.getByRole("tab", { name: "Masthead" }));

    expect(screen.getByRole("heading", { name: "Masthead" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("PIXELCAST")).toBeInTheDocument();
    expect(screen.getByText("Target: Row 1, column 1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Stamp masthead" }));

    expect(screen.getByRole("gridcell", {
      name: "Row 1, column 1, byte 127"
    })).toBeInTheDocument();
    expect(screen.getByRole("gridcell", {
      name: "Row 1, column 6, byte 75"
    })).toBeInTheDocument();
    expect(screen.getByRole("gridcell", {
      name: "Row 3, column 1, byte 32"
    })).toBeInTheDocument();
  });

  it("preserves leading spaces when stamping mosaic masthead text", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("tab", { name: "Masthead" }));
    fireEvent.change(screen.getByLabelText("Masthead text"), {
      target: { value: " PIXELCAST" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Stamp masthead" }));

    expect(screen.getByRole("gridcell", {
      name: "Row 1, column 2, byte 32"
    })).toBeInTheDocument();
    expect(screen.getByRole("gridcell", {
      name: "Row 1, column 6, byte 127"
    })).toBeInTheDocument();
  });

  it("inserts a blank spacer at the selected cell and shifts the row right", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("gridcell", {
      name: "Row 1, column 1, byte 32"
    }));
    fireEvent.keyDown(screen.getByRole("grid", { name: "40 by 25 teletext grid" }), {
      key: "A"
    });
    fireEvent.click(screen.getByRole("gridcell", {
      name: "Row 1, column 1, byte 65"
    }));
    fireEvent.click(screen.getByRole("tab", { name: "Masthead" }));
    fireEvent.click(screen.getByRole("button", { name: "Insert blank spacer" }));

    expect(screen.getByRole("gridcell", {
      name: "Row 1, column 1, byte 32"
    })).toBeInTheDocument();
    expect(screen.getByRole("gridcell", {
      name: "Row 1, column 2, byte 65"
    })).toBeInTheDocument();
  });

  it("stamps PIXELCAST at the default target before a cell is selected", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("tab", { name: "Masthead" }));
    fireEvent.click(screen.getByRole("button", { name: "Stamp masthead" }));

    expect(screen.getByRole("gridcell", {
      name: "Row 1, column 2, byte 127"
    })).toBeInTheDocument();
    expect(screen.getByRole("gridcell", {
      name: "Row 3, column 2, byte 32"
    })).toBeInTheDocument();
    expect(screen.getByText("Target: Row 1, column 2")).toBeInTheDocument();
  });

  it("stamps PIXELCAST from manually entered row and column", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("tab", { name: "Masthead" }));
    fireEvent.change(screen.getByLabelText("Start row"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("Start column"), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "Stamp masthead" }));

    expect(screen.getByRole("gridcell", {
      name: "Row 3, column 4, byte 127"
    })).toBeInTheDocument();
    expect(screen.getByText("Target: Row 3, column 4")).toBeInTheDocument();
  });

  it("uses edited mosaic text placement after a previous stamp selected a cell", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("tab", { name: "Masthead" }));
    fireEvent.click(screen.getByRole("button", { name: "Stamp masthead" }));
    fireEvent.change(screen.getByLabelText("Start row"), { target: { value: "6" } });
    fireEvent.change(screen.getByLabelText("Start column"), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "Stamp masthead" }));

    expect(screen.getByRole("gridcell", {
      name: "Row 6, column 4, byte 127"
    })).toBeInTheDocument();
    expect(screen.getByText("Target: Row 6, column 4")).toBeInTheDocument();
  });

  it("seeds the dev mosaic alphabet when loading an older saved project", () => {
    const legacyProject = JSON.parse(exportNativeProject(createDefaultProject()));
    delete legacyProject.mosaicAlphabets;
    window.localStorage.setItem("fortyforge.currentProject", JSON.stringify(legacyProject));

    render(<App />);

    fireEvent.click(screen.getByRole("gridcell", {
      name: "Row 1, column 1, byte 32"
    }));
    fireEvent.click(screen.getByRole("tab", { name: "Masthead" }));

    expect(screen.getByDisplayValue("PIXELCAST")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stamp masthead" })).toBeEnabled();
  });

  it("replaces the old one-cell PIXELCAST placeholder alphabet on load", () => {
    const project = createDefaultProject();
    project.mosaicAlphabets = [
      {
        id: "dev-pixelcast-alphabet",
        name: "Dev PIXELCAST mosaic blocks",
        description: "Old one-cell placeholder.",
        cellWidth: 1,
        cellHeight: 1,
        spacingColumns: 1,
        glyphs: {
          P: {
            character: "P",
            width: 1,
            height: 1,
            source: "generated",
            cells: [{
              sixelMask: 0x3f,
              separated: false,
              foreground: { palette: "level1", index: 7 },
              background: { palette: "level1", index: 0 }
            }]
          }
        }
      }
    ];
    window.localStorage.setItem("fortyforge.currentProject", exportNativeProject(project));

    render(<App />);

    fireEvent.click(screen.getByRole("tab", { name: "Masthead" }));
    fireEvent.click(screen.getByRole("button", { name: "Stamp masthead" }));

    expect(screen.getByRole("option", { name: "CITYNEWS masthead alphabet" })).toBeInTheDocument();
    expect(screen.getByRole("gridcell", {
      name: "Row 1, column 2, byte 127"
    })).toBeInTheDocument();
    expect(screen.getByRole("gridcell", {
      name: "Row 1, column 7, byte 75"
    })).toBeInTheDocument();
  });

  it("refreshes the built-in compact masthead alphabet when loading a saved project", () => {
    const project = createDefaultProject();
    const compactAlphabet = project.mosaicAlphabets.find(
      (alphabet) => alphabet.id === "citynews-compact-masthead"
    );

    if (!compactAlphabet) {
      throw new Error("Expected default compact masthead alphabet");
    }

    compactAlphabet.name = "CITYNEWS tight masthead";
    compactAlphabet.cellHeight = 5;
    compactAlphabet.spacingColumns = 0;
    compactAlphabet.glyphs.P = {
      character: "P",
      width: 1,
      height: 1,
      source: "generated",
      cells: [{
        sixelMask: 0x02,
        separated: false,
        foreground: { palette: "level1", index: 1 },
        background: { palette: "level1", index: 0 }
      }]
    };
    window.localStorage.setItem("fortyforge.currentProject", exportNativeProject(project));

    render(<App />);

    fireEvent.click(screen.getByRole("tab", { name: "Masthead" }));
    fireEvent.click(screen.getByRole("button", { name: "Stamp masthead" }));

    expect(screen.getByRole("option", { name: "CITYNEWS compact masthead" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "CITYNEWS tight masthead" })).not.toBeInTheDocument();
    expect(screen.getByRole("gridcell", {
      name: "Row 1, column 7, byte 75"
    })).toBeInTheDocument();
  });

  it("switches the X/0 header clock between local, none, and original modes", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("tab", { name: "Page" }));
    expect(screen.getByRole("button", { name: "Local clock" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    fireEvent.click(screen.getByRole("button", { name: "No clock" }));

    expect(screen.getByRole("button", { name: "No clock" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    fireEvent.click(screen.getByRole("button", { name: "Original row" }));

    expect(screen.getByRole("button", { name: "Original row" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("saves and reloads the current project locally", () => {
    const { unmount } = render(<App />);
    const grid = screen.getByRole("grid", { name: "40 by 25 teletext grid" });

    fireEvent.click(screen.getByRole("gridcell", {
      name: "Row 1, column 1, byte 32"
    }));
    fireEvent.keyDown(grid, { key: "S" });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByText(/Saved locally/)).toBeInTheDocument();

    unmount();
    render(<App />);

    expect(screen.getByRole("gridcell", {
      name: "Row 1, column 1, byte 83"
    })).toHaveTextContent("S");
  });

  it("saves the current page as a reusable custom template", () => {
    render(<App />);
    const grid = screen.getByRole("grid", { name: "40 by 25 teletext grid" });

    fireEvent.click(screen.getByRole("gridcell", {
      name: "Row 1, column 1, byte 32"
    }));
    fireEvent.keyDown(grid, { key: "T" });
    fireEvent.click(screen.getByRole("button", { name: "Save as template" }));

    expect(screen.getByRole("button", { name: "Custom template 1" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Blank page" }));
    expect(screen.getByRole("gridcell", {
      name: "Row 1, column 1, byte 32"
    })).toHaveTextContent("");

    fireEvent.click(screen.getByRole("button", { name: "Custom template 1" }));
    expect(screen.getByRole("gridcell", {
      name: "Row 1, column 1, byte 84"
    })).toHaveTextContent("T");
  });

  it("keeps multiple saved custom templates after reloading from local storage", () => {
    const { unmount } = render(<App />);
    const grid = screen.getByRole("grid", { name: "40 by 25 teletext grid" });

    fireEvent.click(screen.getByRole("gridcell", {
      name: "Row 1, column 1, byte 32"
    }));
    fireEvent.keyDown(grid, { key: "A" });
    fireEvent.click(screen.getByRole("button", { name: "Save as template" }));
    fireEvent.keyDown(grid, { key: "B" });
    fireEvent.click(screen.getByRole("button", { name: "Save as template" }));

    expect(screen.getByRole("button", { name: "Custom template 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Custom template 2" })).toBeInTheDocument();

    unmount();
    render(<App />);

    expect(screen.getByRole("button", { name: "Custom template 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Custom template 2" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Blank page" }));
    fireEvent.click(screen.getByRole("button", { name: "Custom template 2" }));

    expect(screen.getByRole("gridcell", {
      name: "Row 1, column 1, byte 65"
    })).toHaveTextContent("A");
    expect(screen.getByRole("gridcell", {
      name: "Row 1, column 2, byte 66"
    })).toHaveTextContent("B");
  });

  it("deletes a custom template from the right-click template menu", () => {
    render(<App />);
    const grid = screen.getByRole("grid", { name: "40 by 25 teletext grid" });

    fireEvent.click(screen.getByRole("gridcell", {
      name: "Row 1, column 1, byte 32"
    }));
    fireEvent.keyDown(grid, { key: "T" });
    fireEvent.click(screen.getByRole("button", { name: "Save as template" }));

    const customTemplate = screen.getByRole("button", { name: "Custom template 1" });

    fireEvent.contextMenu(customTemplate);
    fireEvent.click(screen.getByRole("button", { name: "Delete Custom template 1" }));

    expect(screen.queryByRole("button", { name: "Custom template 1" })).not.toBeInTheDocument();
    expect(screen.getByText(/Deleted Custom template 1/)).toBeInTheDocument();
  });

  it("does not show a delete action for built-in templates", () => {
    render(<App />);

    fireEvent.contextMenu(screen.getByRole("button", { name: "Blank page" }));

    expect(screen.queryByRole("button", { name: /Delete Blank page/ })).not.toBeInTheDocument();
  });

  it("adds and switches between subpages", () => {
    render(<App />);
    const grid = screen.getByRole("grid", { name: "40 by 25 teletext grid" });

    fireEvent.click(screen.getByRole("gridcell", {
      name: "Row 1, column 1, byte 32"
    }));
    fireEvent.keyDown(grid, { key: "A" });
    fireEvent.click(screen.getByRole("button", { name: "Add subpage" }));
    fireEvent.click(screen.getByRole("button", { name: "0001" }));

    expect(screen.getByText("Subpage 0001")).toBeInTheDocument();
    expect(screen.getByRole("gridcell", {
      name: "Row 1, column 1, byte 32"
    })).toHaveTextContent("");

    fireEvent.click(screen.getByRole("gridcell", {
      name: "Row 1, column 1, byte 32"
    }));
    fireEvent.keyDown(grid, { key: "B" });
    fireEvent.click(screen.getByRole("button", { name: "0000" }));

    expect(screen.getByRole("gridcell", {
      name: "Row 1, column 1, byte 65"
    })).toHaveTextContent("A");
  });

  it("downloads native project and TTI exports", () => {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn()
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn()
    });
    const createObjectUrl = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:fortyforge-export");
    const revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Download project" }));
    fireEvent.click(screen.getByRole("button", { name: "Download TTI" }));

    expect(createObjectUrl).toHaveBeenCalledTimes(2);
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:fortyforge-export");
  });

  it("switches between studio and playout layouts", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Playout" }));

    expect(screen.getByRole("button", { name: "Studio" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Playout" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Clean output mode for a second display or live monitor.")).toBeInTheDocument();
  });

  it("switches between Studio large and PIT strict framebuffer profiles", () => {
    render(<App />);

    const canvas = screen.getByRole("img", { name: "PIT framebuffer preview" });

    expect(screen.getByRole("button", { name: "Studio large" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(canvas).toHaveAttribute("width", "640");
    expect(canvas).toHaveAttribute("height", "500");

    fireEvent.click(screen.getByRole("button", { name: "PIT strict" }));

    expect(screen.getByRole("button", { name: "PIT strict" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(canvas).toHaveAttribute("width", "480");
    expect(canvas).toHaveAttribute("height", "500");

    fireEvent.click(screen.getByRole("button", { name: "Studio large" }));

    expect(canvas).toHaveAttribute("width", "640");
    expect(canvas).toHaveAttribute("height", "500");
  });

  it("keeps the preview on the bitmap renderer path", async () => {
    const source = await import("./components/TeletextCanvas.tsx?raw");

    expect(source.default).toContain("drawBitmapGlyph");
    expect(source.default).toContain("drawMosaicGlyph");
    expect(source.default).toContain("cell.doubleHeight");
    expect(source.default).not.toContain("fillText");
  });
});
