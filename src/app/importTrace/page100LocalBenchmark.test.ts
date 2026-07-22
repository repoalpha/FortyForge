import { describe, expect, it } from "vitest";

import { scanTeletextScreenshot, type TraceCell, type TraceImageData } from "./screenshotTrace";

declare const process: {
  env?: Record<string, string | undefined>;
  getBuiltinModule?: (name: string) => {
    readFile?: (path: string, encoding: string) => Promise<string>;
  };
};

interface TraceFixture {
  width: number;
  height: number;
  data: number[];
}

const fixturePath = process.env?.PIXELCAST_TRACE_FIXTURE
  ?? process.env?.FORTYFORGE_TRACE_FIXTURE;
const maybeDescribe = fixturePath ? describe : describe.skip;

async function loadFixture(path: string): Promise<TraceImageData> {
  const readFile = process.getBuiltinModule?.("node:fs/promises").readFile;

  if (!readFile) {
    throw new Error("Node fs/promises is unavailable for the local trace benchmark.");
  }

  const fixture = JSON.parse(await readFile(path, "utf8")) as TraceFixture;

  return {
    width: fixture.width,
    height: fixture.height,
    data: new Uint8ClampedArray(fixture.data)
  };
}

function textAt(cells: TraceCell[], rowIndex: number, startColumn: number, length: number) {
  return cells
    .slice(rowIndex * 40 + startColumn, rowIndex * 40 + startColumn + length)
    .map((cell) => cell.value ?? " ")
    .join("");
}

maybeDescribe("page100 local trace benchmark", () => {
  it("recovers key Ceefax text and preserves the page100 footer as double-height text", async () => {
    const scan = scanTeletextScreenshot(await loadFixture(fixturePath ?? ""));

    expect(textAt(scan.cells, 7, 0, 16)).toContain("NEWS HEADLINES");
    expect(textAt(scan.cells, 8, 0, 16)).toContain("NEWS IN DETAIL");
    expect(textAt(scan.cells, 9, 0, 12)).toContain("NEWS FLASH");
    expect(textAt(scan.cells, 10, 0, 12)).toContain("NEWS INDEX");
    expect(textAt(scan.cells, 11, 0, 10)).toContain("NEWSREEL");

    const footerCells = scan.cells.slice(21 * 40, 21 * 40 + 24);
    const doubleHeightFooterCells = footerCells.filter((cell) => cell.doubleHeight === "top");

    expect(doubleHeightFooterCells.length).toBeGreaterThanOrEqual(16);
    expect(textAt(scan.cells, 21, 0, 24)).toContain("BBC RADIO FOR SCHOOLS");
  });

  it("keeps the Ceefax logo and divider bands as continuous mosaics", async () => {
    const scan = scanTeletextScreenshot(await loadFixture(fixturePath ?? ""));
    const logoRows = [2, 3, 4, 5].flatMap((rowIndex) =>
      scan.cells.slice(rowIndex * 40 + 8, rowIndex * 40 + 32)
    );
    const dividerSpans = [
      [6, 0, 40],
      [9, 24, 40],
      [12, 0, 24],
      [14, 24, 40],
      [15, 0, 24],
      [17, 24, 40],
      [18, 0, 24],
      [20, 0, 40],
      [23, 0, 40]
    ] as const;
    const dividerCells = dividerSpans.flatMap(([rowIndex, startColumn, endColumn]) =>
      scan.cells.slice(rowIndex * 40 + startColumn, rowIndex * 40 + endColumn)
    );

    expect(logoRows.filter((cell) => cell.kind === "mosaic").length).toBeGreaterThanOrEqual(64);
    expect(dividerCells.filter((cell) => cell.kind === "mosaic").length).toBeGreaterThanOrEqual(200);
    expect(dividerCells.filter((cell) => cell.kind === "text").length).toBeLessThanOrEqual(8);
  });
});
