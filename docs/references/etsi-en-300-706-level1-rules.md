# ETSI EN 300 706 Level 1 Rules Reference

Source: ETSI EN 300 706 V1.2.1, downloaded locally as `docs/references/etsi-en-300-706-v1.2.1.pdf`.

This note is a working summary for FortyForge implementation. It paraphrases the standard so the code can be checked against stable local rules without copying large sections of the PDF.

## Row Defaults

- Every display row starts with Level 1 defaults.
- Foreground starts as alpha white.
- Background starts as black background.
- Text/alpha mode is active at row start.
- Steady, end box, normal size, contiguous mosaics, and release mosaics are row-start defaults.
- Attribute effects persist until another relevant attribute changes them or the row ends.

## X/0 Header And Display Rows

- Packet X/0 is the page header packet. It contains page address, control bits, and 32 data bytes normally intended for display.
- The header packet's control bits include suppress-header and inhibit-display behavior; these are packet metadata, not ordinary visible row cells in the editor.
- FortyForge currently models the visible editor page as 25 rows: `X/0` plus rows `1` to `24`.
- Row labels in the editor should show `X/0` for the page header and `1` to `24` for body display rows.
- Column labels in the editor should show author-facing positions `01` to `40`, while internal arrays remain zero-based `0` to `39`.
- ETSI page-header packet X/0 reserves the final eight data bytes for the real-time clock in normal services. FortyForge maps that service clock slot to visible columns `33` to `40` in the 40-column editor view.
- Header clock modes are `local` (generate an `HH:MM:SS` clock into columns `33` to `40`), `none` (leave the generated clock slot blank), and `original` (show the authored/imported row exactly).
- In local or no-clock mode, generated header text and the clock slot may fill empty X/0 cells, but authored characters/control codes on X/0 must be preserved so the row remains editable.

## Spacing Attributes

- Control codes occupy character cells.
- Unless hold mosaics substitutes a held mosaic, a control-code cell displays as a space.
- `Set-At` attributes affect the current cell immediately.
- `Set-After` attributes affect following character cells.

## Foreground And Mode

- Alpha colour controls `0x00` to `0x07` select text mode and set foreground colour.
- Mosaic colour controls `0x10` to `0x17` select mosaic mode and set foreground colour.
- Foreground colour persists until another alpha or mosaic colour control, or the row ends.
- Colour controls also cancel conceal.

## Background

- `0x1c` Black Background sets the background to black immediately and does not change foreground.
- `0x1d` New Background sets the background immediately from the foreground currently in force.
- After `New Background`, following characters or mosaics can be invisible until another foreground colour is selected.
- Therefore a friendly editor helper for blue background with visible white text should emit `Alpha Blue`, `New Background`, then `Alpha White` before text.
- In mosaic mode, the equivalent helper should use mosaic colour controls so graphics mode and mosaic foreground are restored.

## Delete/Recompute Rule

- FortyForge should not store hidden formatting state in cells.
- Rendering must recompute state left-to-right from row bytes.
- If a generated blue-background helper sequence is fully deleted, the row returns to the start-of-row defaults: white foreground on black background.
- If only `Alpha Blue` is deleted but `New Background` remains, `New Background` adopts the default white foreground, making the following background white. That is correct for the remaining byte stream.

## Enhanced Colour Caveat

- X/28 and M/29 packets can define CLUTs, default row/screen colours, colour-table remapping, and black-background substitution.
- FortyForge currently implements the Level 1 default palette model for editor preview. Enhanced CLUT/remapping behavior belongs in the Level 2.5/3.5 roadmap.
