import { describe, expect, it } from "vitest";

import { getControlCodeByByte } from "./controlCodes";
import { isPresentationLevel } from "./levels";
import { parsePageAddress } from "./pageAddress";

describe("teletext standards tables", () => {
  it("looks up Level 1 control codes by byte", () => {
    expect(getControlCodeByByte(0x01)?.mnemonic).toBe("ALPHA_RED");
    expect(getControlCodeByByte(0x11)?.mnemonic).toBe("GRAPHICS_RED");
    expect(getControlCodeByByte(0x1e)?.mnemonic).toBe("HOLD_GRAPHICS");
  });

  it("describes controls with labels and level support", () => {
    const alphaRed = getControlCodeByByte(0x01);

    expect(alphaRed?.label).toBe("Alpha red");
    expect(alphaRed?.supportedLevels).toContain("1");
    expect(alphaRed?.description.length).toBeGreaterThan(0);
  });

  it("checks presentation level identifiers", () => {
    expect(isPresentationLevel("1")).toBe(true);
    expect(isPresentationLevel("2.5")).toBe(true);
    expect(isPresentationLevel("4")).toBe(false);
  });

  it("parses page addresses into magazine and page parts", () => {
    expect(parsePageAddress("100")).toEqual({
      magazine: 1,
      pageNumber: "100"
    });
    expect(parsePageAddress("800")?.magazine).toBe(8);
    expect(parsePageAddress("999")).toBeNull();
    expect(parsePageAddress("10")).toBeNull();
  });
});
