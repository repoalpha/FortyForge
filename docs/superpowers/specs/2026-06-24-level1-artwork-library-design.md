# Level 1 Artwork Library Design

## Purpose

Pixelcast Studio needs a way to turn corrected imported teletext artwork into reusable assets. The first target is masthead graphics, logos, dividers, and other pixel art made from normal Level 1 teletext cells. The first implementation should let an author capture a rectangular block from the current page, save it to a local artwork library, and stamp it back onto any editable page.

This is the foundation for later style alphabets such as a CEEFAX-style masthead font where the author can type `HAMFAX` or `STEVEFAX` and have Pixelcast Studio lay down matching mosaic letters.

## Scope

Version 1 is intentionally small:

- Select a rectangular area on the 40 by 25 canvas.
- Save the selected cells as a named artwork block.
- Show saved artwork blocks in an Artwork Library panel.
- Stamp a block onto the current page at a chosen target cell.
- Keep all saved and stamped content as normal Level 1 cells.
- Preserve existing undo, redo, local save, native project export, TTI export, and PIT compatibility.

Version 1 does not generate new letters automatically, infer alphabets, use AI, or introduce DRCS/custom glyphs.

## Data Model

Add a project-level artwork library alongside templates:

```ts
interface ArtworkBlock {
  id: string;
  name: string;
  description?: string;
  category: "masthead" | "logo" | "divider" | "letter" | "panel" | "other";
  width: number;
  height: number;
  cells: Cell[][];
  source?: {
    pageNumber?: string;
    templateId?: string;
    rowIndex: number;
    column: number;
  };
  createdAt: string;
  updatedAt: string;
}
```

The cells are stored as Pixelcast Studio cell data, not images. A captured CEEFAX masthead fragment is therefore a real teletext patch made of character, mosaic, control, and empty cells with any supported cell background metadata.

The initial schema can store `artworkBlocks?: ArtworkBlock[]` so older project files load safely. Native project import should default missing libraries to an empty array.

## Editing Flow

Add a rectangle selection mode to the canvas:

1. The author chooses a start cell.
2. The author drags or shift-clicks to define a rectangular selection.
3. The selected rectangle is visibly outlined on the canvas.
4. The right dock offers `Save as artwork block`.
5. The author gives the block a name and category.
6. Pixelcast Studio copies the selected cells into `project.artworkBlocks`.

The rectangle selection should work on existing traced/imported pages, hand-edited pages, and normal templates.

## Placement Flow

Add an Artwork Library section in the right dock:

1. The author selects an artwork block.
2. The block preview shows a small teletext-native thumbnail.
3. The author clicks a target cell on the page.
4. Pixelcast Studio stamps the block into the current subpage starting at that cell.
5. Stamps that would run outside the 40 by 25 grid are refused with a clear warning.

Stamping should be an editor command so it participates in undo and redo. It should replace cells in the target rectangle exactly, including mosaics, text, control codes, and backgrounds.

## Level 1 Compatibility

The artwork library must not store arbitrary bitmap pixels in version 1. Every block must be reconstructible as normal Level 1 page cells. This keeps the asset library compatible with:

- Pixelcast Studio editing.
- Native project JSON export/import.
- TTI export.
- PIT playout.
- Future renderer comparison.

If a captured region contains unsupported future cell kinds, version 1 should refuse the capture and show a warning rather than silently degrading the artwork.

## UI Placement

The first UI should be practical rather than fancy:

- Canvas gains a rectangular selection overlay.
- Right dock gains an `Artwork` mode or panel.
- The panel contains capture controls, saved block list, and selected block details.
- Existing Text, Mosaic, and Import Trace workflows remain available.

The panel should make the source workflow obvious: correct a traced masthead once, select it, save it, then reuse it.

## Commands

Add focused core commands:

- `saveSelectionAsArtworkBlockCommand(projectLocation, rectangle, metadata)`
- `stampArtworkBlockCommand(projectLocation, blockId, targetCell)`
- `deleteArtworkBlockCommand(blockId)`
- Optional later: `renameArtworkBlockCommand(blockId, name)`

The commands should clone project state and keep the same immutability expectations as existing page, template, and mosaic commands.

## Tests

Core tests:

- Capturing a rectangle stores the expected width, height, and cell data.
- Stamping a block reproduces the captured cells exactly.
- Stamping near the right or bottom edge is rejected without changing the page.
- Unsupported cell kinds are rejected.
- Deleting an artwork block does not mutate pages.

UI tests:

- The author can select a rectangle and save it as an artwork block.
- Saved artwork appears in the library.
- Selecting a saved block and clicking the canvas stamps it into the page.
- Stamped content can be undone with Ctrl+Z.

## Roadmap

After block capture and stamping work, add a `Style Alphabet` layer:

- Group artwork blocks into a named style.
- Map blocks to characters such as `A`, `B`, `C`, and space.
- Let the author type a word such as `HAMFAX`.
- Lay out matching blocks left to right with configurable spacing.
- Show missing-letter warnings so the author can hand-create only the missing glyphs.

The style alphabet should still produce Level 1 cells. AI or computer vision can later help extract candidate letter blocks from screenshots, but human-corrected blocks should remain the trusted asset source.

## Deferred Decisions

- Whether duplicate block names are allowed. The recommended version 1 behaviour is to allow duplicates but assign stable IDs, matching current custom template behaviour.
