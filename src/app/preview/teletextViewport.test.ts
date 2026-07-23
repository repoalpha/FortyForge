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

  it("keeps every preview on the canonical teletext cell proportions", () => {
    expect(getTeletextPreviewProfile("studio-large")).toEqual({
      id: "studio-large",
      label: "Studio large",
      displayWidth: 640,
      smoothing: "pixelated",
      columns: 40,
      rows: 25,
      cellWidth: 12,
      cellHeight: 20,
      width: 480,
      height: 500
    });

    expect(getTeletextPreviewProfile("receiver-smooth")).toEqual({
      id: "receiver-smooth",
      label: "Receiver smooth",
      displayWidth: 640,
      smoothing: "smooth",
      columns: 40,
      rows: 25,
      cellWidth: 24,
      cellHeight: 40,
      width: 960,
      height: 1000
    });

    expect(getTeletextPreviewProfile("pit-strict")).toEqual({
      id: "pit-strict",
      label: "PIT strict",
      displayWidth: 480,
      smoothing: "pixelated",
      columns: 40,
      rows: 25,
      cellWidth: 12,
      cellHeight: 20,
      width: 480,
      height: 500
    });

    for (const profileId of ["studio-large", "receiver-smooth", "pit-strict"] as const) {
      const profile = getTeletextPreviewProfile(profileId);
      expect(profile.cellWidth / profile.cellHeight).toBe(0.6);
    }

    expect(getTeletextPreviewProfile("receiver-smooth").cellWidth)
      .toBe(getTeletextPreviewProfile("pit-strict").cellWidth * 2);
    expect(getTeletextPreviewProfile("receiver-smooth").cellHeight)
      .toBe(getTeletextPreviewProfile("pit-strict").cellHeight * 2);
  });
});
