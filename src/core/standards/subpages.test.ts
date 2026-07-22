import { describe, expect, it } from "vitest";

import { displaySubpageSubcode, MAX_DISPLAY_SUBPAGES } from "./subpages";

describe("ETSI display subpages", () => {
  it("uses 0000 for a single page and sequential non-zero decimal subcodes for rotating pages", () => {
    expect(displaySubpageSubcode(0, 1)).toBe("0000");
    expect(displaySubpageSubcode(0, 12)).toBe("0001");
    expect(displaySubpageSubcode(8, 12)).toBe("0009");
    expect(displaySubpageSubcode(9, 12)).toBe("0010");
    expect(displaySubpageSubcode(11, 12)).toBe("0012");
  });

  it("enforces the ETSI display-page range", () => {
    expect(displaySubpageSubcode(MAX_DISPLAY_SUBPAGES - 1, MAX_DISPLAY_SUBPAGES)).toBe("0079");
    expect(() => displaySubpageSubcode(0, MAX_DISPLAY_SUBPAGES + 1)).toThrow(/between 1 and 79/i);
  });
});
