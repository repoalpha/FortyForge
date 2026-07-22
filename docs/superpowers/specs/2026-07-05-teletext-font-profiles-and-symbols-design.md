# Teletext Font Profiles And Symbols Design

## Goal

Pixelcast Studio should let authors preview English Level 1 pages with selectable receiver/font profiles while keeping the underlying page bytes ETSI-compatible and renderable by the RPI/PIT C++ software. It should also expose thin-line text glyphs, such as the SAA5050 horizontal rule, as byte-correct authoring actions instead of relying on Unicode keyboard input.

## Principles

- The original Mullard/Philips SAA5050 English set remains the default baseline.
- Font selection changes rendering only; it must not change stored row bytes or keyboard semantics.
- Profiles use stable IDs that can be mirrored in the RPI/PIT renderer.
- Browser fonts must not be used for the framebuffer preview.
- Every shipped profile must be a deterministic bitmap glyph table or a deterministic transform of one.
- English keyboard input remains normal G0 bytes. National replacement character sets are out of scope for this pass.

## First Profiles

- `saa5050-classic`: the current MIT-licensed `textmodes/font` Mullard SAA5050 table, expanded to PIT-style `12x20` output.
- `bedstead-extended`: a first alternate profile from the Bedstead/Teletext50 family. Bedstead publishes BDF bitmap output and public-domain/CC0-style generation notes. It is suitable as an early Ceefax/BBC Mode 7 style profile while preserving fixed `12x20` cell geometry.
- `tdatext-later`: reserved profile ID for a later Philips/TDA-style receiver look. This should not appear as selectable until a clean glyph source is bundled.

## Storage And Protocol

- Add a receiver font profile setting to page metadata, defaulting to `saa5050-classic`.
- Native project import must default missing profile IDs for older projects.
- Exported/transmitted teletext rows remain byte streams. Receiver font profile is separate metadata/configuration for renderers that support it.
- RPI/PIT should implement the same profile IDs and glyph tables before profile-dependent output is treated as playout-authoritative.

## UI

- Add a `Text style` section under the Text/Tools pane.
- The selector label should be `Receiver font`.
- Options for this pass: `SAA5050 Classic` and `Bedstead / Teletext50`.
- Changing the selector updates the preview for the current page and is undoable like other page-authoring changes.

## Thin-Line Symbols

- Add a `Teletext symbols` section under Text/Tools.
- Include byte-correct buttons for:
  - `Horizontal rule` byte `0x60`, display `–`.
  - `Hyphen` byte `0x2d`, display `-`.
  - `Vertical rule` byte `0x7c`, display `‖`.
  - `Solid block` byte `0x7f`, display `█`.
- Buttons insert character cells with the requested byte and visible label. They must not insert Unicode code points such as `0x2013` for the horizontal rule.
- Symbols stay in alpha/text mode. They are not mosaics and should not depend on graphics colour controls.

## Rendering

- `TeletextCanvas` passes the page receiver font profile to bitmap glyph drawing.
- `drawBitmapGlyph` resolves the requested profile and glyph value to a `12x20` bitmap.
- Missing glyphs fall back to the classic SAA5050 glyph for safety.
- The Bedstead profile may initially cover the English keyboard/G0 printable range used by the UI and fall back to classic for any missing glyphs.

## Testing

- Verify the default page uses `saa5050-classic`.
- Verify selecting `Bedstead / Teletext50` changes the active page metadata and preview glyph lookup.
- Verify native import defaults older projects with missing profile IDs.
- Verify symbol insertion writes the intended byte values for `0x60`, `0x2d`, `0x7c`, and `0x7f`.
- Verify the symbol buttons are available from the Text/Tools pane.
