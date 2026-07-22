// English/UK G0 national-option positions used by the SAA5050 and PIT.
// The transmitted values are seven-bit teletext codes, not ASCII at these
// positions.
const UK_G0_CHARACTERS: Readonly<Record<number, string>> = {
  0x23: "\u00a3",
  0x5b: "\u2190",
  0x5c: "\u00bd",
  0x5d: "\u2192",
  0x5e: "\u2191",
  0x5f: "#",
  0x60: "\u2013",
  0x7b: "\u00bc",
  0x7c: "\u2016",
  0x7d: "\u00be",
  0x7e: "\u00f7",
  0x7f: "\u2588"
};

const UK_G0_BYTES = new Map(
  Object.entries(UK_G0_CHARACTERS).map(([byte, value]) => [value, Number(byte)])
);

const COMPATIBLE_INPUTS: Readonly<Record<string, number>> = {
  "\u2010": 0x2d,
  "\u2011": 0x2d,
  "\u2012": 0x60,
  "\u2014": 0x60,
  "\u2212": 0x60,
  "'": 0x27,
  "\u2018": 0x27,
  "\u2019": 0x27,
  "\u201c": 0x22,
  "\u201d": 0x22
};

export function g0CharacterForLevel1Byte(byte: number) {
  const level1Byte = byte & 0x7f;

  if (level1Byte < 0x20) {
    return "";
  }

  return UK_G0_CHARACTERS[level1Byte] ?? String.fromCharCode(level1Byte);
}

export function normalizeTextForLevel1(value: string) {
  return value
    .replace(/…/g, "...")
    .replace(/[\[\{]/g, "(")
    .replace(/[\]\}]/g, ")")
    .replace(/\\/g, "/")
    .replace(/_/g, "-");
}

export function level1ByteForG0Character(value: string) {
  const firstCharacter = [...value][0] ?? " ";
  const mappedByte = UK_G0_BYTES.get(firstCharacter) ?? COMPATIBLE_INPUTS[firstCharacter];

  if (mappedByte !== undefined) {
    return mappedByte;
  }

  const byte = firstCharacter.charCodeAt(0);

  // These transmitted byte positions are national-option glyphs in the UK
  // SAA5050 set, not their ASCII lookalikes. Encoding "[" as 0x5b, for
  // example, displays a left arrow on the receiver.
  if (UK_G0_CHARACTERS[byte] !== undefined) {
    return undefined;
  }

  return byte >= 0x20 && byte <= 0x7f ? byte : undefined;
}
