# Mosaic Tool Dock Design

## Goal

FortyForge should free horizontal space around the framebuffer while giving authors a fast, professional way to paint Level 1 mosaic sixels. The right side of Studio mode becomes an active tool dock for Mosaic mode and later glyph/DRCS tools, not a passive inspector column.

## Scope

V1 implements Level 1 mosaic editing only:

- One foreground colour and one background state per character position, following Level 1 control-code behaviour.
- Six independent on/off blocks inside each mosaic character cell.
- Direct pointer painting on the framebuffer.
- Keyboard sixel shortcuts for precise editing.
- Compact tool dock controls for mosaic mode, control-code insertion, background changes, and X/0 clock policy.

V1 does not allow independent colours per sixel inside one Level 1 character. ETSI Level 1 mosaic cells use the active foreground colour and background state; colour changes are represented by control bytes and consume row columns. Level 2.5/3.5 CLUT, DRCS, 12x10, and 6x5 editing are later modes that should reuse the same sub-cell painting model.

## UI Layout

Studio mode uses three columns:

- Left: service/page/subpage/template navigation.
- Centre: toolbar, large framebuffer canvas, bottom validation/status.
- Right: `ToolDock`, reserved for active authoring tools.

The old separate right inspector is removed from the default layout. Selection details move into compact status text in the tool dock and the bottom validation area. X/0 clock controls move into the tool dock because they are page-authoring actions.

## Mosaic Interaction

The primary mosaic workflow is direct painting:

- Select `Mosaic` in the tool dock.
- Move over a cell to target one of its `2x3` sixels.
- Left click or drag sets the sixel.
- Right click or drag clears the sixel.
- Shift-click toggles the sixel.
- Whole-cell fill, empty, halves, diagonals, and checkerboard are available from pattern buttons.

Keyboard fallback:

- `Q W` edit top-left/top-right.
- `A S` edit middle-left/middle-right.
- `Z X` edit bottom-left/bottom-right.
- These shortcuts toggle sixels when Mosaic mode is active.

The tool dock also offers common patterns such as empty, half blocks, diagonals, checkerboard, and full block. These are accelerators, not the main drawing model.

## Data And Rendering

The existing `paintMosaicCommand` remains the storage path for whole-cell masks. A new command toggles a single sixel while preserving other bits in the selected cell:

- Existing mosaic cell: update its `mosaic.sixelMask`.
- Graphics-mode byte: derive the starting mask from `byte & 0x3f`.
- Empty/text/control cell: start from mask `0`.

The command writes a Level 1 mosaic cell byte as `0x40 | mask`. A zero mask is still stored as a mosaic editing cell in v1 so repeated edits remain predictable.

## Acceptance Criteria

- The app no longer renders both an inspector column and a control column on the right.
- The right dock is visibly titled as a tool area and starts with Mosaic controls.
- Clicking a sub-sixel on the framebuffer in Mosaic mode writes the expected bit into the selected cell.
- Right-clicking a sub-sixel in Mosaic mode clears that bit without opening the browser context menu.
- `Q W A S Z X` toggle individual sixels when Mosaic mode is active.
- Existing control-code and background insertion remain available from the tool dock.
- X/0 clock mode remains editable after removing the inspector panel.
- Tests cover model mask editing, pointer painting, keyboard sixel editing, and the layout change.
