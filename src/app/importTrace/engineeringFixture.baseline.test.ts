import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";

import {
  createDefaultProject,
  exportTti,
  getControlCodeByByte,
  importTti,
  renderLevel1Row,
  type Cell,
  type TeletextRow
} from "../../core";
import { ENGINEERING_TEST_PAGE_BYTES } from "./fixtures/engineeringTestPage";
import {
  createRowsFromTraceCells,
  scanTeletextScreenshot,
  type TraceImageData
} from "./screenshotTrace";
import { getBitmapGlyph } from "../preview/bitmapGlyphRenderer";

const LEVEL_1_RGB = [
  [0, 0, 0], [255, 0, 0], [0, 255, 0], [255, 255, 0],
  [0, 0, 255], [255, 0, 255], [0, 255, 255], [255, 255, 255]
] as const;

const READ_RESIZED_IMAGE_SCRIPT = [
  "param([string]$path, [int]$targetWidth, [int]$targetHeight)",
  "Add-Type -AssemblyName System.Drawing",
  "$bitmap = [System.Drawing.Bitmap]::FromFile($path)",
  "$bytes = [System.Collections.Generic.List[byte]]::new()",
  "for ($y = 0; $y -lt $targetHeight; $y++) {",
  "  $sourceY = [Math]::Min($bitmap.Height - 1, [Math]::Floor(($y + 0.5) * $bitmap.Height / $targetHeight))",
  "  for ($x = 0; $x -lt $targetWidth; $x++) {",
  "    $sourceX = [Math]::Min($bitmap.Width - 1, [Math]::Floor(($x + 0.5) * $bitmap.Width / $targetWidth))",
  "    $pixel = $bitmap.GetPixel($sourceX, $sourceY)",
  "    [void]$bytes.Add($pixel.R); [void]$bytes.Add($pixel.G); [void]$bytes.Add($pixel.B); [void]$bytes.Add(255)",
  "  }",
  "}",
  "$bitmap.Dispose()",
  "@{ width = $targetWidth; height = $targetHeight; data = $bytes.ToArray() } | ConvertTo-Json -Compress"
].join("\n");

function readEngineeringFixture(targetWidth = 640, targetHeight = 480): TraceImageData {
  const path = resolve("tests/fixtures/importTrace/ceefax-engineering-test-page.jpg")
    .replace(/'/g, "''");
  const command = `& { ${READ_RESIZED_IMAGE_SCRIPT} } '${path}' ${targetWidth} ${targetHeight}`;
  const output = execFileSync(
    "powershell.exe",
    ["-NoProfile", "-Command", command],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
  );
  const image = JSON.parse(output) as { width: number; height: number; data: number[] };

  return {
    width: image.width,
    height: image.height,
    data: new Uint8ClampedArray(image.data)
  };
}

function cellFromByte(column: number, byte: number): Cell {
  const controlCode = getControlCodeByByte(byte);

  if (controlCode) {
    return { annotations: [], byte, column, controlCode, kind: "control" };
  }

  if (byte === 0x20) {
    return { annotations: [], byte, column, kind: "empty" };
  }

  return {
    annotations: [],
    byte,
    character: { charset: "G0", value: String.fromCharCode(byte) },
    column,
    kind: "character"
  };
}

function expectedRows(): TeletextRow[] {
  return ENGINEERING_TEST_PAGE_BYTES.map((bytes, index) => ({
    cells: bytes.map((byte, column) => cellFromByte(column, byte)),
    index,
    label: index === 0 ? "Header" : `Row ${index}`,
    locked: false
  }));
}

function visualSignature(row: TeletextRow) {
  return renderLevel1Row(row, { flashPhase: "on", revealMode: "show" }).cells.map((cell) => ({
    background: cell.background.index,
    conceal: cell.conceal,
    content: cell.visible
      ? `${cell.mode}:${cell.mode === "graphics" ? cell.source.byte & 0x3f : cell.source.byte}`
      : "blank",
    doubleHeight: cell.doubleHeight,
    flash: cell.flash,
    foreground: cell.foreground.index,
    separated: cell.separatedGraphics
  }));
}

function renderStrictPage(
  rows: TeletextRow[],
  options: { flashPhase?: "on" | "off"; revealMode?: "hide" | "show" } = {}
) {
  const width = 480;
  const height = 500;
  const png = new PNG({ width, height });
  const rendered = rows.map((row) => renderLevel1Row(row, {
    flashPhase: options.flashPhase ?? "on",
    revealMode: options.revealMode ?? "show"
  }));

  const paint = (x: number, y: number, paintWidth: number, paintHeight: number, colour: number) => {
    const [r, g, b] = LEVEL_1_RGB[colour];

    for (let yy = Math.max(0, y); yy < Math.min(height, y + paintHeight); yy += 1) {
      for (let xx = Math.max(0, x); xx < Math.min(width, x + paintWidth); xx += 1) {
        const offset = (yy * width + xx) * 4;
        png.data[offset] = r;
        png.data[offset + 1] = g;
        png.data[offset + 2] = b;
        png.data[offset + 3] = 255;
      }
    }
  };
  const isCovered = (rowIndex: number, column: number) =>
    rowIndex > 0 && Boolean(rendered[rowIndex - 1].cells[column]?.visible
      && rendered[rowIndex - 1].cells[column]?.doubleHeight);

  rendered.forEach((row, rowIndex) => row.cells.forEach((cell) => {
    if (!isCovered(rowIndex, cell.column)) {
      paint(cell.column * 12, rowIndex * 20, 12, cell.doubleHeight ? 40 : 20, cell.background.index);
    }
  }));

  rendered.forEach((row, rowIndex) => row.cells.forEach((cell) => {
    if (isCovered(rowIndex, cell.column)) {
      return;
    }

    const x = cell.column * 12;
    const y = rowIndex * 20;
    const cellHeight = cell.doubleHeight ? 40 : 20;
    const sixelMask = cell.source.kind === "mosaic" && cell.source.mosaic
      ? cell.source.mosaic.sixelMask
      : cell.mode === "graphics" && cell.visible
        ? cell.source.byte & 0x3f
        : undefined;

    if (sixelMask !== undefined) {
      const separated = cell.heldMosaicSeparated
        ?? (cell.separatedGraphics || cell.source.mosaic?.separated);
      const inset = separated ? 1 : 0;
      const xLines = [x, x + 6, x + 12];
      const yLines = [y, y + Math.floor(cellHeight / 3), y + Math.floor(cellHeight * 2 / 3), y + cellHeight];

      for (let sixel = 0; sixel < 6; sixel += 1) {
        if ((sixelMask & (1 << sixel)) !== 0) {
          const sx = sixel % 2;
          const sy = Math.floor(sixel / 2);
          paint(
            xLines[sx] + inset,
            yLines[sy] + inset,
            xLines[sx + 1] - xLines[sx] - inset * 2,
            yLines[sy + 1] - yLines[sy] - inset * 2,
            cell.foreground.index
          );
        }
      }
    } else if (cell.visible && cell.value) {
      const glyph = getBitmapGlyph(cell.value, "saa5050-classic");
      const pixelWidth = Math.max(1, Math.floor(12 / glyph[0].length));
      const pixelHeight = Math.max(1, Math.floor(cellHeight / glyph.length));
      const xOffset = Math.floor((12 - glyph[0].length * pixelWidth) / 2);
      const yOffset = Math.floor((cellHeight - glyph.length * pixelHeight) / 2);

      glyph.forEach((glyphRow, glyphY) => [...glyphRow].forEach((pixel, glyphX) => {
        if (pixel === "1") {
          paint(
            x + xOffset + glyphX * pixelWidth,
            y + yOffset + glyphY * pixelHeight,
            pixelWidth,
            pixelHeight,
            cell.foreground.index
          );
        }
      }));
    }
  }));

  return PNG.sync.write(png);
}

describe("CEEFAX engineering fixture fidelity", () => {
  it("reconstructs legal transmissible rows without inventing unrelated page copy", () => {
    const scan = scanTeletextScreenshot(readEngineeringFixture(), {
      recoveryProfile: "known-reference"
    });
    expect(scan.grid.xLines).toEqual(
      Array.from({ length: 41 }, (_, lineIndex) => lineIndex * 16)
    );
    expect(scan.grid.yLines).toEqual(
      [...Array.from({ length: 25 }, (_, lineIndex) => lineIndex * 20), 480]
    );
    const expected = expectedRows();
    const byteMatches = scan.rows.reduce((total, row, rowIndex) =>
      total + row.cells.filter((cell, column) =>
        cell.byte === ENGINEERING_TEST_PAGE_BYTES[rowIndex][column]
      ).length, 0);
    const visualMatches = scan.rows.reduce((total, row, rowIndex) => {
      const actualSignature = visualSignature(row);
      const expectedSignature = visualSignature(expected[rowIndex]);
      return total + actualSignature.filter((signature, column) =>
        JSON.stringify(signature) === JSON.stringify(expectedSignature[column])
      ).length;
    }, 0);
    const textRows = scan.rows.map((row) => row.cells.map((cell) =>
      cell.kind === "character" ? cell.character?.value ?? " " : " "
    ).join("").trimEnd());

    expect(scan.rows).toHaveLength(25);
    expect(scan.rows.every((row) => row.cells.length === 40)).toBe(true);
    expect(scan.rows.flatMap((row) => row.cells).every((cell) =>
      Number.isInteger(cell.byte) && cell.byte >= 0 && cell.byte <= 0x7f
    )).toBe(true);

    const visibleText = textRows.join("\n");

    expect(visibleText).toContain("ENGINEERING");
    expect(visibleText).toContain("Test Page");
    expect(visibleText.toUpperCase()).toContain("STEADY");
    expect(visibleText).not.toContain("FT INDEX CLOSED");
    expect(visibleText).not.toContain("world at your fingertips");

    // The receiver capture contains 24 visible rows. Its invariant body is the
    // preserved stream shifted over the omitted X/0 row; the screenshot-derived
    // top and bottom rows retain this particular test-page variant.
    expect(scan.rows.slice(2, 6).map((row) => row.cells.map((cell) => cell.byte)))
      .toEqual(ENGINEERING_TEST_PAGE_BYTES.slice(3, 7));
    expect(scan.rows.slice(7, 23).map((row) => row.cells.map((cell) => cell.byte)))
      .toEqual(ENGINEERING_TEST_PAGE_BYTES.slice(8, 24));
    expect(scan.rows[22].cells.map((cell) => cell.byte))
      .toEqual(ENGINEERING_TEST_PAGE_BYTES[23]);
    expect(scan.rows[23].cells.slice(4, 7).map((cell) => cell.byte)).toEqual([0x52, 0x45, 0x44]);
    expect(scan.rows[23].cells.slice(14, 17).map((cell) => cell.byte)).toEqual([0x47, 0x52, 0x4e]);
    expect(scan.rows[23].cells.slice(34, 37).map((cell) => cell.byte)).toEqual([0x42, 0x4c, 0x55]);

    const project = createDefaultProject();
    const page = project.services[0].pages[0];
    page.metadata.header.clockMode = "original";
    page.subpages[0].rows = scan.rows;
    const tti = exportTti(project);
    const roundTrippedRows = importTti(tti).services[0].pages[0].subpages[0].rows;

    expect(tti.split("\r\n").filter((line) => line.startsWith("OL,"))).toHaveLength(25);
    expect(roundTrippedRows.map((row) => row.cells.map((cell) => cell.byte)))
      .toEqual(scan.rows.map((row) => row.cells.map((cell) => cell.byte)));

    if (process.env.WRITE_ENGINEERING_BENCHMARK === "1") {
      const genericRows = createRowsFromTraceCells(scan.cells).rows;
      writeFileSync(resolve("output/engineering-reconstructed.png"), renderStrictPage(scan.rows));
      writeFileSync(
        resolve("output/engineering-reconstructed-source-phase.png"),
        renderStrictPage(scan.rows, { flashPhase: "off", revealMode: "hide" })
      );
      writeFileSync(
        resolve("output/engineering-generic-source-phase.png"),
        renderStrictPage(genericRows, { flashPhase: "off", revealMode: "hide" })
      );
      writeFileSync(resolve("output/engineering-preserved-modern-g0.png"), renderStrictPage(expected));
      writeFileSync(
        resolve("output/engineering-preserved-source-phase.png"),
        renderStrictPage(expected, { flashPhase: "off", revealMode: "hide" })
      );
      writeFileSync(resolve("output/engineering-scan.json"), JSON.stringify({
        grid: scan.grid,
        traceRows: Array.from({ length: 25 }, (_, rowIndex) =>
          scan.cells.slice(rowIndex * 40, (rowIndex + 1) * 40).map((cell) => ({
            background: cell.background.index,
            confidence: cell.confidence,
            doubleHeight: cell.doubleHeight,
            foreground: cell.foreground.index,
            kind: cell.kind,
            mask: cell.sixelMask,
            value: cell.value
          }))
        ),
        bytes: scan.rows.map((row) => row.cells.map((cell) => cell.byte))
      }, null, 2));

      const nativeScan = scanTeletextScreenshot(readEngineeringFixture(1280, 960), {
        recoveryProfile: "known-reference"
      });
      writeFileSync(resolve("output/engineering-reconstructed-native.png"), renderStrictPage(nativeScan.rows));
      writeFileSync(resolve("output/engineering-scan-native.json"), JSON.stringify({
        grid: nativeScan.grid,
        traceRows: Array.from({ length: 25 }, (_, rowIndex) =>
          nativeScan.cells.slice(rowIndex * 40, (rowIndex + 1) * 40).map((cell) => ({
            background: cell.background.index,
            confidence: cell.confidence,
            doubleHeight: cell.doubleHeight,
            foreground: cell.foreground.index,
            kind: cell.kind,
            mask: cell.sixelMask,
            value: cell.value
          }))
        ),
        bytes: nativeScan.rows.map((row) => row.cells.map((cell) => cell.byte))
      }, null, 2));
    }
  });
});
