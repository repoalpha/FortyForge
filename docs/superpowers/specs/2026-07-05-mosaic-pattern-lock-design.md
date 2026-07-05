# Mosaic Pattern Lock Design

## Goal

Mosaic mode needs a faster line-authoring workflow for repeated Level 1 sixel patterns. Authors should be able to select a preset pattern, stamp it into a cell, then continue stamping the same pattern across the current row with the keyboard arrow keys. The editor must only return to manual sixel editing when the author explicitly chooses Freestyle.

## User Workflow

- The Mosaic panel shows a `Freestyle` control and the existing preset mosaic patterns.
- `Freestyle` is the default mode.
- Selecting a preset pattern highlights it and keeps it selected until the author chooses another preset or `Freestyle`.
- In Freestyle, canvas clicks continue to toggle individual sixels in the clicked cell.
- In a locked preset pattern, clicking a cell or canvas cell stamps the whole selected pattern into that cell.
- After the first stamp, `ArrowRight` moves one cell right on the same row and stamps the same selected pattern into that new cell.
- `ArrowLeft` moves one cell left on the same row and stamps the same selected pattern into that new cell.
- Arrow stamping stops at the row edge. Pressing Right at column 40 or Left at column 1 does not wrap and should not create an extra undo entry.

## Teletext Constraints

- This is an editor workflow only; it must still write normal Level 1 teletext row data.
- A stamped preset writes a standard mosaic cell byte, `0x40 | sixelMask`, through the existing mosaic paint command path.
- The stamped mosaic uses the current mosaic foreground selected by graphics colour controls.
- The feature must not introduce per-sixel colours inside one Level 1 cell.
- Row control-code state remains left-to-right and byte-based. Graphics colour controls `0x10` to `0x17` select mosaic mode and foreground; background controls consume row columns and affect following cells according to ETSI Level 1 behavior.
- Future control-code optimization can improve exported row efficiency, but this feature should not hide or bypass the row's actual byte stream.

## UI Design

- Add a `Freestyle` button at the top of the Mosaic patterns section.
- Pattern buttons become selectable tools instead of only immediate one-shot actions.
- The selected preset gets the same clear selected styling used elsewhere in the dock.
- The selected mode should be obvious from the right pane without reading status text.
- Existing colour controls remain in the Mosaic tab and continue to set mosaic foreground/background behavior.

## Component Behavior

- `App` owns the selected mosaic paint mode so the ToolDock and canvas/grid keyboard handlers share one source of truth.
- The selected mode is either `freestyle` or a preset sixel mask.
- `ToolDock` receives the selected mode and selection callback, renders the mode buttons, and still activates Mosaic tool mode when the Mosaic tab opens.
- `TeletextCanvas` receives the selected mode. In Mosaic tool mode:
  - Freestyle pointer events keep using individual sixel edit callbacks.
  - Preset pointer events stamp the preset mask at the clicked cell.
  - ArrowLeft and ArrowRight in preset mode move within the current row and call the mosaic paint callback for the destination cell.
- Arrow stamping should update selection to the destination cell after the stamp.

## Testing

- Add a regression test that selecting a preset keeps the preset highlighted until Freestyle is clicked.
- Add a test that clicking a canvas/grid cell in preset mode stamps the selected mask instead of toggling one sixel.
- Add a test that Right arrow repeats the selected pattern across the current row one cell at a time.
- Add a test that Right arrow at column 40 does not wrap to the next row or create another changed cell.
- Keep existing tests for Freestyle sixel toggling and graphics colour selection passing.
