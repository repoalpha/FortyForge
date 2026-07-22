import { describe, expect, it } from "vitest";

import {
  createFeedPreviewPages,
  protectLeadingMosaicArtwork,
  wrapTeletextText
} from "./feedPreview";

const record = {
  id: "story-1",
  title: "A readable headline for teletext",
  summary: "This story is deliberately long enough to wrap across several lines without splitting ordinary words.",
  fields: {}
};

describe("feed preview", () => {
  it("wraps text on words and hard-wraps an overlong token", () => {
    expect(wrapTeletextText("one two three", 7)).toEqual(["one two", "three"]);
    expect(wrapTeletextText("abcdefgh", 3)).toEqual(["abc", "def", "gh"]);
  });

  it("transliterates punctuation that occupies UK national-option byte positions", () => {
    expect(wrapTeletextText("More […] {detail}\\path_name", 40))
      .toEqual(["More (...) (detail)/path-name"]);
  });

  it("paginates a record inside a bounded teletext slot and repeats attribution", () => {
    const pages = createFeedPreviewPages({
      record,
      bounds: { startRow: 6, endRow: 10, startColumn: 1, endColumn: 20 },
      attribution: "Source: Example",
      includeTitle: true,
      includeSummary: true,
      includeBody: false,
      pageNumber: "102"
    });

    expect(pages.length).toBeGreaterThan(1);
    expect(pages.every((page) => page.rows.length === 25)).toBe(true);
    expect(pages.every((page) => page.rows.every((row) => row.cells.length === 40))).toBe(true);
    expect(pages[0].rows[10].cells.slice(1, 16).map((cell) => cell.character?.value ?? " ").join(""))
      .toBe("Source: Example");
  });

  it("maps characters unavailable in Level 1 to question marks", () => {
    const [page] = createFeedPreviewPages({
      record: { ...record, title: "Rocket 🚀" },
      bounds: { startRow: 2, endRow: 20, startColumn: 1, endColumn: 39 },
      attribution: "",
      includeTitle: true,
      includeSummary: false,
      includeBody: false
    });

    expect(page.unsupportedCharacterCount).toBeGreaterThan(0);
  });

  it("places attribution directly after the selected gap instead of pinning it to the slot bottom", () => {
    const [page] = createFeedPreviewPages({
      record: { ...record, title: "Short", summary: undefined },
      bounds: { startRow: 6, endRow: 20, startColumn: 1, endColumn: 39 },
      attribution: "Source: Example",
      attributionGapRows: 1,
      includeTitle: true,
      includeSummary: false,
      includeBody: false
    });

    const rowText = (rowIndex: number) => page.rows[rowIndex].cells
      .slice(1, 16)
      .map((cell) => cell.character?.value ?? " ")
      .join("");
    expect(rowText(6)).toBe("Short          ");
    expect(rowText(7)).toBe("               ");
    expect(rowText(8)).toBe("Source: Example");
    expect(rowText(20)).toBe("               ");
  });

  it("protects a leading mosaic heading and leaves the requested spacer row", () => {
    const [base] = createFeedPreviewPages({
      record: { ...record, title: "" },
      bounds: { startRow: 2, endRow: 20, startColumn: 1, endColumn: 39 },
      attribution: "",
      includeTitle: false,
      includeSummary: false,
      includeBody: false
    });
    for (const rowIndex of [2, 3, 4]) {
      base.rows[rowIndex].cells[3] = {
        column: 3,
        kind: "mosaic",
        byte: 0x7f,
        mosaic: {
          separated: false,
          sixelMask: 0x3f,
          foreground: { palette: "level1", index: 7 },
          background: { palette: "level1", index: 0 }
        },
        annotations: []
      };
    }

    const protectedArea = protectLeadingMosaicArtwork(
      base.rows,
      { startRow: 2, endRow: 20, startColumn: 1, endColumn: 39 },
      1
    );
    expect(protectedArea.protectedThroughRow).toBe(4);
    expect(protectedArea.bounds.startRow).toBe(6);
  });
});
