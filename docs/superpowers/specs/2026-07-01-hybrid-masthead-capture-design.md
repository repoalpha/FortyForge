# Hybrid Masthead Capture Design

## Purpose

Pixelcast Studio should stop relying on guessed mosaic-font tables as the primary way to recreate mastheads such as `PIXELCAST`. The editor should let the author capture exact Level 1 mosaic blocks from a trusted source masthead, move or stamp those blocks into the right place, and then reuse those captured blocks as the source for a masthead alphabet.

The immediate workflow is to use the corrected `CITYNEWS` masthead as source material. Letters that already exist in `CITYNEWS`, such as `C`, `I`, `T`, `Y`, `N`, `E`, `W`, and `S`, should be copied exactly. Missing letters for `PIXELCAST`, such as `P`, `X`, `L`, and `A`, can still come from inferred or hand-authored blocks, but they should be editable and replaceable with captured blocks when better source artwork exists.

## Scope

Version 1 builds a hybrid capture workflow on top of the existing Level 1 artwork-library direction:

- Select a rectangular cell area on the teletext canvas.
- Copy that selection into an in-memory masthead clipboard.
- Show a ghost preview of the copied block while choosing the destination.
- Stamp the block onto the current page as real Level 1 cells.
- Save the same block into the project artwork library with category `letter` or `masthead`.
- Use saved letter blocks as future inputs for a masthead alphabet.

Version 1 does not need optical character recognition, automatic source-image segmentation, bitmap storage, or fully automatic `PIXELCAST` perfection. The feature should make exact manual repair easy first.

## User Flow

The author starts on a page or template containing a good source masthead.

1. Switch to rectangular selection mode.
2. Drag across a letter or word block, such as the `E` in `CITYNEWS`.
3. Click `Copy block`.
4. Move the pointer or selected target cell to the desired location.
5. See the copied cells as a cell-aligned preview.
6. Click or press `Enter` to stamp.
7. Optionally click `Save as letter` and assign the block to a character such as `E`.

This should support two common cases:

- Copy a whole word or masthead section and reposition it.
- Copy one letter at a time, fix spacing manually, then save the final letter blocks for typed masthead output.

## Data Model

The existing artwork-library model remains the persistent model. A masthead clipboard is transient UI state, not saved by itself:

```ts
interface MastheadClipboardBlock {
  width: number;
  height: number;
  cells: Cell[][];
  source: {
    rowIndex: number;
    column: number;
  };
}
```

Saved blocks should use the project-level `ArtworkBlock` shape from the Level 1 artwork library design. Letter blocks should use `category: "letter"` and store the assigned character in metadata or description until a dedicated style-alphabet model is introduced.

## Canvas Interaction

The current single-cell selection should remain available for normal editing. Rectangular selection is an explicit mode so existing text, mosaic, and import-trace tools keep their current behavior.

In rectangular selection mode:

- Pointer drag defines the rectangle.
- Shift-click extends the rectangle from the anchor cell.
- Escape clears the rectangle or cancels a pending stamp preview.
- A copied block preview snaps to the 40 by 25 cell grid.
- Stamping outside the page bounds is refused before changing the project.

The selection outline and stamp preview should be drawn over the canvas preview without changing renderer output.

## Commands

Core editing should stay command-driven:

- `copyCellsFromRectangle(projectLocation, rectangle)` returns a `MastheadClipboardBlock`.
- `stampCellBlockCommand(projectLocation, block, target)` writes a block into the current subpage.
- `saveCellBlockAsArtworkCommand(projectLocation, block, metadata)` persists a copied block as an artwork-library entry.

Stamping must replace the target rectangle exactly with cloned cell data, including mosaic masks, control codes, foreground, background, separated graphics state, and empty cells.

## UI Placement

The right dock should add a practical `Artwork` or `Blocks` panel. For the first slice, it needs:

- Selection details: row, column, width, height.
- `Copy block` button enabled only when a rectangle exists.
- Clipboard details: copied width and height.
- `Stamp copied block` mode with a visible target preview.
- `Save as letter` controls: character, name, and category.
- Saved block list using small teletext-native previews when available.

The masthead tab can later consume saved letter blocks. Its generated alphabet dropdown should not be the only repair path.

## Style Alphabet Roadmap

After capture and stamping are stable, add a `Masthead Style Alphabet` layer:

- Map saved letter artwork blocks to characters.
- Store per-letter advance widths and optional side bearings.
- Let typed text such as `PIXELCAST` lay out captured blocks left to right.
- Warn about missing letters instead of substituting poor inferred glyphs silently.
- Let the author override spacing between specific letter pairs.

This keeps the current generated `CITYNEWS compact masthead` useful as a starter alphabet, but captured blocks become the trusted final source.

## Testing

Core tests should cover:

- Copying a rectangle returns exact cloned cell data.
- Stamping a copied block reproduces those cells exactly.
- Mutating the source after copy does not mutate the clipboard block.
- Stamping outside the page bounds returns the original project unchanged.
- Saving a copied block creates an artwork entry with stable dimensions and cloned cells.

UI tests should cover:

- Dragging a rectangular selection displays the expected dimensions.
- Copying a selection enables block stamping.
- Clicking a target cell stamps the copied block.
- Escape cancels a pending preview without changing the page.
- Saved letter blocks appear in the artwork panel.

## Implementation Order

Build the smallest useful workflow first:

1. Core rectangle copy and block stamp functions with tests.
2. Canvas rectangle selection overlay.
3. In-memory copy and ghost stamp preview.
4. Undoable block stamping.
5. Save copied block into the artwork library.
6. Masthead alphabet mapping from saved letter blocks.

This order makes it possible to fix bad `PIXELCAST` letters manually before the full alphabet layer exists.
