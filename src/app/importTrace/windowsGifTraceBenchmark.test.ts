import { describe, expect, it } from "vitest";

import { scanTeletextScreenshot, type TraceCell, type TraceImageData } from "./screenshotTrace";

declare const process: {
  env?: Record<string, string | undefined>;
  getBuiltinModule?: (name: string) => {
    execFile?: (
      file: string,
      arguments_: string[],
      options: { maxBuffer: number },
      callback: (error: Error | null, stdout: string, stderr: string) => void
    ) => void;
  };
};

const fixtureDirectory = process.env?.FORTYFORGE_TRACE_GIF_DIR ?? "tests\\fixtures\\importTrace";

const readGifScript = [
  "param([string]$path)",
  "Add-Type -AssemblyName System.Drawing",
  "$bitmap = [System.Drawing.Bitmap]::FromFile($path)",
  "$bytes = [System.Collections.Generic.List[byte]]::new()",
  "for ($y = 0; $y -lt $bitmap.Height; $y++) {",
  "  for ($x = 0; $x -lt $bitmap.Width; $x++) {",
  "    $pixel = $bitmap.GetPixel($x, $y)",
  "    [void]$bytes.Add($pixel.R); [void]$bytes.Add($pixel.G); [void]$bytes.Add($pixel.B); [void]$bytes.Add(255)",
  "  }",
  "}",
  "$result = @{ width = $bitmap.Width; height = $bitmap.Height; data = $bytes.ToArray() }",
  "$bitmap.Dispose()",
  "$result | ConvertTo-Json -Compress"
].join("\n");

const readImageDimensionsScript = [
  "param([string]$path)",
  "Add-Type -AssemblyName System.Drawing",
  "$bitmap = [System.Drawing.Bitmap]::FromFile($path)",
  "$result = @{ width = $bitmap.Width; height = $bitmap.Height }",
  "$bitmap.Dispose()",
  "$result | ConvertTo-Json -Compress"
].join("\n");

const readResizedImageScript = [
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
  "$result = @{ width = $targetWidth; height = $targetHeight; data = $bytes.ToArray() }",
  "$bitmap.Dispose()",
  "$result | ConvertTo-Json -Compress"
].join("\n");

function readWindowsImage(name: string): Promise<TraceImageData> {
  const execFile = process.getBuiltinModule?.("node:child_process").execFile;

  if (!execFile || !fixtureDirectory) {
    throw new Error("Windows image benchmark requires node:child_process.");
  }

  return new Promise((resolve, reject) => {
    const path = `${fixtureDirectory}\\${name}`.replace(/'/g, "''");
    const command = `& { ${readGifScript} } '${path}'`;

    execFile(
      "powershell.exe",
      ["-NoProfile", "-Command", command],
      { maxBuffer: 8 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`${error.message}\n${stderr}`));
          return;
        }

        const fixture = JSON.parse(stdout) as { width: number; height: number; data: number[] };
        resolve({
          width: fixture.width,
          height: fixture.height,
          data: new Uint8ClampedArray(fixture.data)
        });
      }
    );
  });
}

function readWindowsImageResized(name: string, width: number, height: number): Promise<TraceImageData> {
  const execFile = process.getBuiltinModule?.("node:child_process").execFile;

  if (!execFile || !fixtureDirectory) {
    throw new Error("Windows image benchmark requires node:child_process.");
  }

  return new Promise((resolve, reject) => {
    const path = `${fixtureDirectory}\\${name}`.replace(/'/g, "''");
    const command = `& { ${readResizedImageScript} } '${path}' ${width} ${height}`;

    execFile(
      "powershell.exe",
      ["-NoProfile", "-Command", command],
      { maxBuffer: 8 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`${error.message}\n${stderr}`));
          return;
        }

        const fixture = JSON.parse(stdout) as { width: number; height: number; data: number[] };
        resolve({
          width: fixture.width,
          height: fixture.height,
          data: new Uint8ClampedArray(fixture.data)
        });
      }
    );
  });
}

function readWindowsImageDimensions(name: string): Promise<{ width: number; height: number }> {
  const execFile = process.getBuiltinModule?.("node:child_process").execFile;

  if (!execFile || !fixtureDirectory) {
    throw new Error("Windows image benchmark requires node:child_process.");
  }

  return new Promise((resolve, reject) => {
    const path = `${fixtureDirectory}\\${name}`.replace(/'/g, "''");
    const command = `& { ${readImageDimensionsScript} } '${path}'`;

    execFile(
      "powershell.exe",
      ["-NoProfile", "-Command", command],
      { maxBuffer: 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`${error.message}\n${stderr}`));
          return;
        }

        resolve(JSON.parse(stdout) as { width: number; height: number });
      }
    );
  });
}

function textAt(cells: TraceCell[], rowIndex: number) {
  return cells
    .slice(rowIndex * 40, (rowIndex + 1) * 40)
    .map((cell) => cell.value ?? " ")
    .join("")
    .trimEnd();
}

function expectDoubleHeightPhrase(cells: TraceCell[], rowIndex: number, phrase: string) {
  const rowText = textAt(cells, rowIndex);
  const startColumn = rowText.indexOf(phrase);

  expect(startColumn).toBeGreaterThanOrEqual(0);

  [...phrase].forEach((character, offset) => {
    if (character === " ") {
      return;
    }

    const topCell = cells[rowIndex * 40 + startColumn + offset];
    const bottomCell = cells[(rowIndex + 1) * 40 + startColumn + offset];

    expect(topCell).toEqual(expect.objectContaining({
      value: character,
      doubleHeight: "top"
    }));
    expect(bottomCell).toEqual(expect.objectContaining({
      kind: "space",
      value: undefined,
      doubleHeight: "bottom"
    }));
  });
}

function rowCellSymbol(cell: { kind: string; byte?: number; character?: { value?: string } }) {
  if (cell.kind === "control") {
    return `C${cell.byte?.toString(16)}`;
  }

  if (cell.kind === "character") {
    return cell.character?.value ?? "?";
  }

  return cell.kind;
}

describe("Windows image trace benchmark", () => {
  it("reads the three supplied teletext captures without losing their 40 by 25 grid", async () => {
    const pages = await Promise.all([
      readWindowsImage("page100-1982.gif"),
      readWindowsImage("page120-1982.gif"),
      readWindowsImage("bbc-page102.gif")
    ]);

    expect(pages.map(({ width, height }) => [width, height])).toEqual([
      [320, 288],
      [320, 288],
      [320, 288]
    ]);
  });

  it("keeps a local copy of the engineering test-card fixture for font/profile work", async () => {
    const testCard = await readWindowsImageDimensions("ceefax-engineering-test-page.jpg");

    expect([testCard.width, testCard.height]).toEqual([1280, 960]);
  });

  it("scans the engineering test pattern as a controlled OCR and mosaic benchmark", async () => {
    const testCard = await readWindowsImageResized("ceefax-engineering-test-page.jpg", 320, 240);
    const scan = scanTeletextScreenshot(testCard);
    const rows = Array.from({ length: 25 }, (_, rowIndex) => textAt(scan.cells, rowIndex));

    expect(rows.some((row) => row.includes("ENGINEERING"))).toBe(true);
    expect(rows.some((row) => row.includes("Test Page"))).toBe(true);
    expect(rows.some((row) => row.includes("White Yellow Cyan Green Magenta Red Blue"))).toBe(true);
    expect(rows.some((row) => row.includes("@ABC DEFG HIJK LMNO PQRS TUVW XYZ"))).toBe(true);
    expect(rows.some((row) => row.includes("-abc defg hijk lmno pqrs tuvw xyz"))).toBe(true);
    expect(rows.some((row) => row.includes("0123 4567 89"))).toBe(true);
    expect(rows.some((row) => row.includes("Steady"))).toBe(true);
    expect(rows.some((row) => row.includes("RED"))).toBe(true);
    expect(rows.some((row) => row.includes("GRN"))).toBe(true);
    expect(rows.some((row) => row.includes("YLW"))).toBe(true);
    expect(rows.some((row) => row.includes("BLU"))).toBe(true);
    expect(scan.cells.filter((cell) => cell.kind === "mosaic").length).toBeGreaterThan(100);
  });

  it("keeps readable text and mosaics in the three reference captures", async () => {
    const [page100, page120, page102] = await Promise.all([
      readWindowsImage("page100-1982.gif"),
      readWindowsImage("page120-1982.gif"),
      readWindowsImage("bbc-page102.gif")
    ]);
    const page100Scan = scanTeletextScreenshot(page100);
    const page120Scan = scanTeletextScreenshot(page120);
    const page102Scan = scanTeletextScreenshot(page102);

    expect(textAt(page100Scan.cells, 7)).toContain("NEWS HEADLINES");
    expect(page100Scan.cells.slice(21 * 40, 22 * 40).filter((cell) => cell.doubleHeight === "top").length)
      .toBeGreaterThanOrEqual(16);
    expect(textAt(page100Scan.cells, 21)).toContain("BBC2 276");
    expect(textAt(page120Scan.cells, 12)).toContain("FT INDEX CLOSED UP");
    expectDoubleHeightPhrase(page120Scan.cells, 12, "FT INDEX CLOSED UP 1.1 AT 703.7");
    expect(page120Scan.rows[12].cells.slice(0, 5).map(rowCellSymbol)).toEqual([
      "empty",
      "Cd",
      "C3",
      "F",
      "T"
    ]);
    expect(Array.from({ length: 25 }, (_, rowIndex) => textAt(page120Scan.cells, rowIndex))
      .some((row) => row.includes("Forex"))).toBe(true);
    expect(Array.from({ length: 25 }, (_, rowIndex) => textAt(page120Scan.cells, rowIndex))
      .some((row) => row.includes("Street"))).toBe(true);
    expect(Array.from({ length: 25 }, (_, rowIndex) => textAt(page120Scan.cells, rowIndex))
      .some((row) => row.includes("chief"))).toBe(true);
    expect(Array.from({ length: 25 }, (_, rowIndex) => textAt(page120Scan.cells, rowIndex))
      .some((row) => row.includes("failures"))).toBe(true);
    expect(Array.from({ length: 25 }, (_, rowIndex) => textAt(page120Scan.cells, rowIndex))
      .some((row) => row.includes("Shares"))).toBe(true);
    expect(Array.from({ length: 25 }, (_, rowIndex) => textAt(page120Scan.cells, rowIndex))
      .some((row) => row.includes("Softs"))).toBe(true);
    expect(Array.from({ length: 25 }, (_, rowIndex) => textAt(page102Scan.cells, rowIndex))
      .some((row) => row.includes("Militant Tendency has been"))).toBe(true);
    expect(Array.from({ length: 25 }, (_, rowIndex) => textAt(page102Scan.cells, rowIndex))
      .some((row) => row.includes("of five members of"))).toBe(true);
    expect(Array.from({ length: 25 }, (_, rowIndex) => textAt(page102Scan.cells, rowIndex))
      .some((row) => row.includes("confirmed at"))).toBe(true);
    expect(Array.from({ length: 25 }, (_, rowIndex) => textAt(page102Scan.cells, rowIndex))
      .some((row) => row.includes("secret session of the Labour party"))).toBe(true);
    expect(Array.from({ length: 25 }, (_, rowIndex) => textAt(page102Scan.cells, rowIndex))
      .some((row) => row.includes("conference in Brighton"))).toBe(true);
    expect(Array.from({ length: 25 }, (_, rowIndex) => textAt(page102Scan.cells, rowIndex))
      .some((row) => row.includes("Afterwards Mr Peter Taaffe"))).toBe(true);
    expect(Array.from({ length: 25 }, (_, rowIndex) => textAt(page102Scan.cells, rowIndex))
      .some((row) => row.includes("editor, said"))).toBe(true);
    expect(Array.from({ length: 25 }, (_, rowIndex) => textAt(page102Scan.cells, rowIndex))
      .some((row) => row.includes("defeat of the day"))).toBe(true);
    expect(Array.from({ length: 25 }, (_, rowIndex) => textAt(page102Scan.cells, rowIndex))
      .some((row) => row.includes("rejected, again"))).toBe(true);
    expect(page120Scan.cells.filter((cell) => cell.kind === "mosaic").length).toBeGreaterThan(120);
  });
});
