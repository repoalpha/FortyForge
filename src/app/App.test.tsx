import "@testing-library/jest-dom/vitest";

import { render, screen, within } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";

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

    expect(screen.getByText("0 validation issues")).toBeInTheDocument();
    expect(screen.getByText("25 packet preview records")).toBeInTheDocument();
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

  it("keeps keyboard input active after selecting a cell", () => {
    render(<App />);

    const firstBodyCell = screen.getByRole("gridcell", {
      name: "Row 1, column 1, byte 32"
    });
    fireEvent.click(firstBodyCell);

    expect(screen.getByRole("grid", { name: "40 by 25 teletext grid" })).toHaveFocus();
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
    expect(screen.getByText("Control palette")).toBeInTheDocument();
  });

  it("inserts background colour control sequences from the studio palette", () => {
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
      name: "Row 1, column 1, byte 1"
    })).toHaveTextContent("");
    expect(screen.getByRole("gridcell", {
      name: "Row 1, column 2, byte 29"
    })).toHaveTextContent("");
    expect(screen.getByRole("gridcell", {
      name: "Row 1, column 3, byte 65"
    })).toHaveTextContent("A");
  });

  it("switches the X/0 header clock between local and original modes", () => {
    render(<App />);

    expect(screen.getByRole("button", { name: "Local machine" })).toHaveAttribute(
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

  it("keeps the preview on the bitmap renderer path", async () => {
    const source = await import("./components/TeletextCanvas.tsx?raw");

    expect(source.default).toContain("drawBitmapGlyph");
    expect(source.default).toContain("drawMosaicGlyph");
    expect(source.default).toContain("cell.doubleHeight");
    expect(source.default).not.toContain("fillText");
  });
});
