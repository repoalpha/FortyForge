import { renderLevel1Row } from "../render/renderLevel1";
import type { Project, TeletextColourRef, TeletextRow } from "./types";

function sameLevel1Colour(left: TeletextColourRef, right: TeletextColourRef) {
  return left.palette === "level1"
    && right.palette === "level1"
    && left.index === right.index;
}

/**
 * Canonicalizes editor-only mosaic palettes into the exact Level 1 row state.
 *
 * A traced cell can describe blue-on-yellow pixels while the transmitted row
 * is already yellow-on-blue. Those pixels are exactly equivalent when the
 * sixel mask is complemented, so no extra control cell (and no artwork) needs
 * to be sacrificed. PIT only receives the row bytes, while Studio also has the
 * richer cell metadata; keeping both representations canonical prevents the
 * two previews from disagreeing.
 */
export function normalizeMosaicTransmissionRows(rows: TeletextRow[]) {
  let normalizedCells = 0;

  for (const row of rows) {
    const transmitted = renderLevel1Row(row).cells;

    row.cells.forEach((cell, column) => {
      if (cell.kind !== "mosaic" || !cell.mosaic) return;

      const wireCell = transmitted[column];
      if (wireCell.mode !== "graphics" || wireCell.source !== cell) return;
      if (
        wireCell.foreground.palette !== "level1"
        || wireCell.background.palette !== "level1"
        || cell.mosaic.foreground.palette !== "level1"
        || cell.mosaic.background.palette !== "level1"
      ) {
        return;
      }

      const authoredMask = cell.mosaic.sixelMask & 0x3f;
      const wireSeparated = wireCell.heldMosaicSeparated ?? wireCell.separatedGraphics;
      const separationAffectsPixels = authoredMask !== 0
        && !sameLevel1Colour(cell.mosaic.foreground, cell.mosaic.background);

      if (cell.mosaic.separated !== wireSeparated && separationAffectsPixels) {
        return;
      }

      let wireMask = 0;

      for (let sixel = 0; sixel < 6; sixel += 1) {
        const authoredColour = (authoredMask & (1 << sixel)) !== 0
          ? cell.mosaic.foreground
          : cell.mosaic.background;

        if (sameLevel1Colour(authoredColour, wireCell.foreground)) {
          wireMask |= 1 << sixel;
        } else if (!sameLevel1Colour(authoredColour, wireCell.background)) {
          // The row state cannot reproduce this cell without real controls.
          return;
        }
      }

      const alreadyCanonical = cell.byte === (0x40 | wireMask)
        && cell.mosaic.sixelMask === wireMask
        && sameLevel1Colour(cell.mosaic.foreground, wireCell.foreground)
        && sameLevel1Colour(cell.mosaic.background, wireCell.background)
        && cell.mosaic.separated === wireSeparated;

      if (alreadyCanonical) return;

      cell.byte = 0x40 | wireMask;
      cell.mosaic = {
        ...cell.mosaic,
        foreground: { ...wireCell.foreground },
        background: { ...wireCell.background },
        separated: wireSeparated,
        sixelMask: wireMask
      };
      if (cell.background) {
        cell.background = { ...wireCell.background };
      }
      normalizedCells += 1;
    });
  }

  return normalizedCells;
}

export function normalizeProjectMosaicTransmission(project: Project) {
  let normalizedCells = 0;

  for (const service of project.services) {
    for (const page of service.pages) {
      for (const subpage of page.subpages) {
        normalizedCells += normalizeMosaicTransmissionRows(subpage.rows);
      }
    }
  }

  for (const template of project.templates) {
    normalizedCells += normalizeMosaicTransmissionRows(template.rows);
  }

  return normalizedCells;
}
