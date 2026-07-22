export const MAX_DISPLAY_SUBPAGES = 79;

export function displaySubpageSubcode(pageIndex: number, pageCount: number) {
  if (!Number.isInteger(pageIndex) || pageIndex < 0) {
    throw new Error("Subpage index must be a non-negative integer.");
  }
  if (!Number.isInteger(pageCount) || pageCount < 1 || pageCount > MAX_DISPLAY_SUBPAGES) {
    throw new Error(`Display pages support between 1 and ${MAX_DISPLAY_SUBPAGES} subpages.`);
  }
  if (pageIndex >= pageCount) {
    throw new Error("Subpage index is outside the display page set.");
  }

  return pageCount === 1
    ? "0000"
    : (pageIndex + 1).toString(10).padStart(4, "0");
}
