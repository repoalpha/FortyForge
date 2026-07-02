import { describe, expect, it } from "vitest";

import {
  createTeletextViewport,
  getTeletextPreviewProfile,
  hitTestTeletextViewport
} from "./teletextViewport";

describe("teletext viewport", () => {
  it("maps the 40 by 25 teletext grid to a fixed pixel framebuffer", () => {
    const viewport = createTeletextViewport({ columns: 40, rows: 25, cellWidth: 12, cellHeight: 20 });

    expect(viewport.width).toBe(480);
    expect(viewport.height).toBe(500);
    expect(viewport.cellWidth).toBe(12);
    expect(viewport.cellHeight).toBe(20);
  });

  it("hit tests framebuffer coordinates back to row and column", () => {
    const viewport = createTeletextViewport({ columns: 40, rows: 25, cellWidth: 12, cellHeight: 20 });

    expect(hitTestTeletextViewport(viewport, 0, 0)).toEqual({ rowIndex: 0, column: 0 });
    expect(hitTestTeletextViewport(viewport, 479, 499)).toEqual({ rowIndex: 24, column: 39 });
    expect(hitTestTeletextViewport(viewport, 24, 60)).toEqual({ rowIndex: 3, column: 2 });
    expect(hitTestTeletextViewport(viewport, 480, 500)).toBeUndefined();
  });

  it("exposes separate Studio large and PIT strict preview profiles", () => {
    expect(getTeletextPreviewProfile("studio-large")).toEqual({
      id: "studio-large",
      label: "Studio large",
      columns: 40,
      rows: 25,
      cellWidth: 16,
      cellHeight: 20,
      width: 640,
      height: 500
    });

    expect(getTeletextPreviewProfile("pit-strict")).toEqual({
      id: "pit-strict",
      label: "PIT strict",
      columns: 40,
      rows: 25,
      cellWidth: 12,
      cellHeight: 20,
      width: 480,
      height: 500
    });
  });
});
