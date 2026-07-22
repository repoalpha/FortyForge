import { describe, expect, it } from "vitest";

import {
  g0CharacterForLevel1Byte,
  level1ByteForG0Character,
  normalizeTextForLevel1
} from "./g0Charset";

describe("English teletext G0 charset", () => {
  it("decodes the UK national-option and engineering-test positions", () => {
    expect([0x23, 0x5b, 0x5c, 0x5d, 0x5e, 0x5f, 0x60, 0x7b, 0x7c, 0x7d, 0x7e, 0x7f]
      .map(g0CharacterForLevel1Byte).join(""))
      .toBe("\u00a3\u2190\u00bd\u2192\u2191#\u2013\u00bc\u2016\u00be\u00f7\u2588");
  });

  it("encodes visible G0 characters back to their transmitted bytes", () => {
    expect(["\u00a3", "\u2190", "\u00bd", "\u2192", "\u2191", "#", "\u2013", "\u00bc", "\u2016", "\u00be", "\u00f7", "\u2588"]
      .map(level1ByteForG0Character))
      .toEqual([0x23, 0x5b, 0x5c, 0x5d, 0x5e, 0x5f, 0x60, 0x7b, 0x7c, 0x7d, 0x7e, 0x7f]);
  });

  it("does not encode ASCII lookalikes into UK national-option glyphs", () => {
    expect(["[", "\\", "]", "^", "_", "`", "{", "|", "}", "~"]
      .map(level1ByteForG0Character))
      .toEqual(Array.from({ length: 10 }, () => undefined));
  });

  it("transliterates common source punctuation before encoding", () => {
    expect(normalizeTextForLevel1("More […] {detail}\\path_name"))
      .toBe("More (...) (detail)/path-name");
  });
});
