import "@testing-library/jest-dom/vitest";

import { render, screen, within } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { App } from "./App";

describe("App", () => {
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
        name: "Row 0, column 1, byte 87"
      })
    ).toHaveTextContent("W");
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
    expect(source.default).not.toContain("fillText");
  });
});
