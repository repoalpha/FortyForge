export interface ParsedPageAddress {
  magazine: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  pageNumber: string;
}

const PAGE_ADDRESS_PATTERN = /^[1-8][0-9a-fA-F]{2}$/;

export function parsePageAddress(value: string): ParsedPageAddress | null {
  const trimmed = value.trim();

  if (!PAGE_ADDRESS_PATTERN.test(trimmed)) {
    return null;
  }

  return {
    magazine: Number(trimmed[0]) as ParsedPageAddress["magazine"],
    pageNumber: trimmed.toUpperCase()
  };
}
