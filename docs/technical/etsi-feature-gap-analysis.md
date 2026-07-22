# ETSI EN 300 706 Feature Gap Analysis

Source baseline: ETSI EN 300 706 V1.2.1, Enhanced Teletext specification.

## Current Pixelcast Studio Coverage

Implemented or partially implemented:

- 40-column by 25-row page grid with fixed 40-byte row storage.
- Page, subpage, service, template, glyph-set, export-profile, and transmission-profile model roots.
- X/0 header policy for `original` and `local` clock composition.
- Level 1 spacing controls for alpha colours, graphics colours, background, hold/release graphics, separated/contiguous graphics, and double height.
- SAA5050 English G0 text rendering.
- Basic Level 1 mosaic rendering as 2 by 3 sixel blocks.
- Native JSON, TTI snapshot export/import foundation, and packet-preview data.
- Basic subpage creation and switching.

## Gaps Found In This Pass

### Level 1 Authoring Gaps

- Mosaic editing was not operational in the UI. The core model had `paintMosaicCommand`, but the studio palette had no way to call it. Fixed by adding `Mosaic full block` as the first direct mosaic-paint action.
- Typed characters after a graphics control still rendered through the text glyph path. Fixed by treating visible bytes in graphics mode as mosaic masks in the framebuffer preview.
- X/0 was visually forced to a dark blue band by the editor, even when the row had no background control. Fixed by rendering row 0 from the same Level 1 background state as other rows.
- The studio preview was locked to the older 480-pixel-wide framebuffer. Fixed by widening the canvas cell width to 16 pixels, making the framebuffer 640 by 500.

Still missing:

- A full mosaic editor with six independent toggleable blocks per cell.
- Hold graphics substitution for spaces after a held mosaic.
- Double width and double size rendering.
- Conceal/reveal preview behaviour.
- Flash/steady preview timing.
- Box/start-box/end-box behaviour.
- Delete/compact control-code command that pulls row content left.
- Validation for illegal or awkward control-code placement, especially double-height continuation rows.

### Packet And Header Gaps

ETSI defines X/0 as page address, control bits, and 32 display bytes. Pixelcast Studio models the display row and header policy, but does not yet encode the full Hamming-protected X/0 packet fields.

Missing:

- Full Hamming 8/4 and 24/18 encoding.
- Odd parity byte output for raw packet streams.
- C4-C14 page header control bit editing.
- Exact page-subcode bit packing.
- Magazine and packet-address bit packing.

### Enhancement And Navigation Gaps

Missing:

- X/26 enhancement packet authoring and rendering.
- X/27 Fastext/editorial page links.
- X/28 page-specific defaults for character sets, side panels, CLUTs, default screen/row colour, and black-background substitution.
- M/29 magazine-wide enhancement defaults.
- Packet 8/30 broadcast service data.
- TOP/FLOF navigation tables.

### Level 2.5 And 3.5 Gaps

Missing:

- CLUT management and remapping.
- Side-panel rendering.
- Object definition pages and object invocation.
- DRCS download pages and DRCS page association.
- 12x10x1, 12x10x2, 12x10x4, and 6x5x4 glyph editing/rendering beyond model validation.
- Compatibility preview that shows what drops when targeting Level 1, 1.5, 2.5, or 3.5.

## PIT/PTI Reference Requirement

The PIT/pi-teletext checkout is available in WSL2 at `/home/nzste/projects/pi-teletext` with remote `https://github.com/repoalpha/pi-teletext.git`. This gives Pixelcast Studio a local source and test reference for renderer behaviour, though a running PIT/RPI target is still needed for live playout round trips.

PIT findings to fold into the gap list:

- Strict PIT rendering is documented around a canonical `480x500` framebuffer. Pixelcast Studio's current `640x500` Studio preview should become a selectable editor profile alongside a strict PIT comparison profile.
- PIT generates `12x20` SAA5050 glyphs from Mullard ROM data with margin and half-dot rounding behaviour. Pixelcast Studio's current SAA5050 bitmap path is close in spirit but still needs pixel comparison.
- PIT implements hold graphics, separated/contiguous mosaics, background state, and double-height top/bottom row handling in its core renderer/cell pipeline.

Compare next:

- X/0 row colour and local-clock behaviour.
- SAA5050 glyph alignment.
- Graphics-mode typed bytes and directly painted mosaic cells.
- Double-height, double-width, and double-size rows.
- TTI/T42 packet export reload behaviour.
