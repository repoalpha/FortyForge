import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";

import {
  createDefaultProject,
  exportTti,
  importTti,
  renderLevel1Row
} from "../../core";
import { scanTeletextScreenshot, type TraceImageData } from "./screenshotTrace";

const EXPECTED_MASTHEAD_BYTES = [
  "17 60 70 70 70 60 70 70 70 60 70 70 70 14 7c 7c 4c 4c 4c 5c 4c 4c 5c 4c 4c 5c 4c 4c 7c 4c 4c 4c 7c 4c 6c 5c 4c 7c 7c 7c",
  "17 6a 40 44 7a 6a 40 44 7a 6a 40 74 7a 04 1d 13 7f 57 43 6a 7f 73 6a 7f 73 6a 7f 73 68 7f 73 7f 54 6f 75 7a 5f 40 40 40",
  "17 6a 40 45 6a 6a 40 45 6a 6a 40 47 6b 04 1d 13 7f 75 70 6a 7f 70 6a 7f 70 6a 7f 40 6a 7f 40 7f 55 7f 55 6a 7f 40 40 40",
  "17 42 43 43 43 42 43 43 43 42 43 43 43 14 43 43 43 43 43 43 43 43 43 43 43 43 43 43 43 43 43 43 43 43 43 43 43 43 43 43"
] as const;

function rowText(cells: ReturnType<typeof scanTeletextScreenshot>["cells"], rowIndex: number) {
  return cells
    .slice(rowIndex * 40, (rowIndex + 1) * 40)
    .map((cell) => cell.kind === "mosaic" ? "#" : (cell.value ?? " "))
    .join("");
}

describe("CEEFAX P100 fixture fidelity", () => {
  it("keeps historical text readable on the general image-only path", () => {
    const png = PNG.sync.read(readFileSync(resolve(
      "src/app/importTrace/fixtures/ceefax-p100.png"
    )));
    const scan = scanTeletextScreenshot({
      width: png.width,
      height: png.height,
      data: Uint8ClampedArray.from(png.data)
    });

    expect([0, 6, 16, 23, 24].map((rowIndex) => rowText(scan.cells, rowIndex))).toEqual([
      "P100    CEEFAX 100 Tue 01 Mar   16:27.18",
      " UK TO PLAY ITS PART   AGAINST IS    104",
      " FINANCE   BBC2 200 SUBTITLING       888",
      "   Ceefax: The world at your fingertips ",
      " Headlines   Sport   West TV  A-Z Index "
    ]);

    const doubleHeightRows = new Set(
      scan.cells
        .filter((cell) => cell.doubleHeight)
        .map((cell) => cell.rowIndex)
    );
    expect(doubleHeightRows).toEqual(new Set([6, 7]));
    const headlineCells = scan.cells
      .slice(6 * 40, 7 * 40)
      .filter((cell) => Boolean(cell.value));
    expect(headlineCells.length).toBeGreaterThanOrEqual(25);
    expect(headlineCells.every((cell) => cell.doubleHeight === "top")).toBe(true);
    expect(headlineCells
      .filter((cell) => scan.cells[7 * 40 + cell.column]?.doubleHeight === "bottom")
      .map((cell) => cell.column)).toEqual(headlineCells.map((cell) => cell.column));
  });

  it("reconstructs legal transmissible rows without mosaic or double-height regressions", () => {
    const png = PNG.sync.read(readFileSync(resolve(
      "src/app/importTrace/fixtures/ceefax-p100.png"
    )));
    const image: TraceImageData = {
      width: png.width,
      height: png.height,
      data: Uint8ClampedArray.from(png.data)
    };
    const scan = scanTeletextScreenshot(image, { recoveryProfile: "known-reference" });

    expect(scan.grid).toEqual(expect.objectContaining({
      left: 0,
      top: 0,
      width: 1000,
      height: 825,
      cellWidth: 25,
      cellHeight: 33
    }));
    expect(scan.warnings).toEqual([]);
    expect(scan.confidence).toBeGreaterThan(0.97);

    expect(rowText(scan.cells, 0)).toBe("P100    CEEFAX 100 Tue 01 Mar   16:27.18");
    expect(rowText(scan.cells, 6)).toBe(" UK TO PLAY ITS PART   AGAINST IS    104");
    expect(rowText(scan.cells, 16)).toBe(" FINANCE   BBC2 200 SUBTITLING       888");
    expect(rowText(scan.cells, 23)).toBe("   Ceefax: The world at your fingertips ");
    expect(rowText(scan.cells, 24)).toBe(" Headlines   Sport   West TV  A-Z Index ");

    const doubleHeightRows = new Set(
      scan.cells
        .filter((cell) => cell.doubleHeight)
        .map((cell) => cell.rowIndex)
    );
    expect(doubleHeightRows).toEqual(new Set([6, 7]));
    expect(scan.cells.slice(6 * 40, 7 * 40).every((cell) => cell.doubleHeight === "top")).toBe(true);
    expect(scan.cells.slice(7 * 40, 8 * 40).every((cell) => cell.doubleHeight === "bottom")).toBe(true);

    expect(scan.rows.slice(1, 5).map((row) =>
      row.cells.map((cell) => cell.byte.toString(16).padStart(2, "0")).join(" ")
    )).toEqual(EXPECTED_MASTHEAD_BYTES);
    expect(scan.rows[6].cells[0]).toEqual(expect.objectContaining({ kind: "control", byte: 0x0d }));
    expect(scan.rows[8].cells[0]).toEqual(expect.objectContaining({ kind: "control", byte: 0x04 }));
    expect(scan.g3LineCells).toHaveLength(39);
    expect(scan.g3LineCells.every((cell) => cell.rowIndex === 8 && cell.column >= 1)).toBe(true);

    for (const row of scan.rows) {
      const transmitted = renderLevel1Row(row);
      const editor = renderLevel1Row(row, {
        useCellBackgroundColours: true,
        useMosaicCellColours: true
      });

      expect(transmitted.cells.map((cell) => ({
        background: cell.background.index,
        doubleHeight: cell.doubleHeight,
        foreground: cell.foreground.index,
        mode: cell.mode
      }))).toEqual(editor.cells.map((cell) => ({
        background: cell.background.index,
        doubleHeight: cell.doubleHeight,
        foreground: cell.foreground.index,
        mode: cell.mode
      })));
    }

    const project = createDefaultProject();
    const page = project.services[0].pages[0];
    page.metadata.header.clockMode = "original";
    page.subpages[0].rows = scan.rows;

    const tti = exportTti(project);
    const roundTrippedRows = importTti(tti).services[0].pages[0].subpages[0].rows;

    expect(tti).toContain(String.fromCharCode(0x1b, 0x4d));
    expect(tti.split("\r\n").filter((line) => line.startsWith("OL,"))).toHaveLength(25);
    expect(roundTrippedRows.map((row) => row.cells.map((cell) => cell.byte)))
      .toEqual(scan.rows.map((row) => row.cells.map((cell) => cell.byte)));
  });
});
