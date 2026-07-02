export interface TeletextViewportOptions {
  columns: number;
  rows: number;
  cellWidth: number;
  cellHeight: number;
}

export type TeletextPreviewProfileId = "studio-large" | "pit-strict";

export interface TeletextViewport extends TeletextViewportOptions {
  width: number;
  height: number;
}

export interface TeletextPreviewProfile extends TeletextViewport {
  id: TeletextPreviewProfileId;
  label: string;
}

export interface TeletextViewportCell {
  rowIndex: number;
  column: number;
}

export function createTeletextViewport(options: TeletextViewportOptions): TeletextViewport {
  return {
    ...options,
    width: options.columns * options.cellWidth,
    height: options.rows * options.cellHeight
  };
}

const PREVIEW_PROFILES: Record<TeletextPreviewProfileId, TeletextPreviewProfile> = {
  "studio-large": {
    id: "studio-large",
    label: "Studio large",
    ...createTeletextViewport({
      columns: 40,
      rows: 25,
      cellWidth: 16,
      cellHeight: 20
    })
  },
  "pit-strict": {
    id: "pit-strict",
    label: "PIT strict",
    ...createTeletextViewport({
      columns: 40,
      rows: 25,
      cellWidth: 12,
      cellHeight: 20
    })
  }
};

export function getTeletextPreviewProfile(
  profileId: TeletextPreviewProfileId
): TeletextPreviewProfile {
  return PREVIEW_PROFILES[profileId];
}

export function hitTestTeletextViewport(
  viewport: TeletextViewport,
  x: number,
  y: number
): TeletextViewportCell | undefined {
  if (x < 0 || y < 0 || x >= viewport.width || y >= viewport.height) {
    return undefined;
  }

  return {
    rowIndex: Math.floor(y / viewport.cellHeight),
    column: Math.floor(x / viewport.cellWidth)
  };
}
