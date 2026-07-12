# FortyForge Renderer And PIT Integration

## Decision

FortyForge must not rely on HTML and CSS layout for the teletext display. The editor UI can use React for tools, panels, inspectors, templates, and workflow controls, but the page preview must be an embedded framebuffer-style render target. The render target starts as a TypeScript canvas renderer and is intentionally shaped so it can later be replaced by the real PIT renderer through WebAssembly or Tauri native commands.

## Layout Modes

### Studio Mode

Studio Mode is the default laptop layout. It keeps the page navigator and templates on the left, the framebuffer preview in the center, and an active tool dock on the right. The right side is reserved for authoring tools rather than passive inspection: Mosaic mode, control-code insertion, background controls, X/0 clock policy, and later DRCS, palette, and 12x10/6x5 glyph tools.

### Playout Mode

Playout Mode is for dual-screen or live use. The clean display should be detachable or fullscreen, while the editing tools remain on the operator screen. In v1 this can be represented as a layout mode in the app; later Tauri can open a second window bound to the same page model.

## Studio Control Editing

Studio Mode should expose control characters as deliberate editable objects rather than hidden formatting. The first implementation provides a manual control palette for Level 1 colour, graphics, background, and size control bytes. Colour and graphics controls should display literal Level 1 swatches so authors can see the intended foreground choice before insertion. Later studio helpers can auto-insert required controls at row or region boundaries when a user changes foreground/background intent, while still leaving the resulting bytes visible and editable.

Control insertion must preserve the 40-byte row contract. The studio palette inserts the selected control byte at the cursor, shifts following cells one column to the right, and drops the final byte in that row. This gives authors a word-processor-style insert action while keeping the stored page immediately packet-safe. A later complementary delete/compact command should pull row content left when authors remove a control byte.

Mosaic editing is a first-class tool mode. In Mosaic mode the framebuffer cell is treated as a `2x3` sixel target: normal pointer clicks toggle sixels, right-click or alternate-button painting clears them, and `Q W / A S / Z X` toggles the six individual blocks from the keyboard. Pattern buttons in the tool dock provide whole-cell accelerators such as empty, full block, halves, diagonals, and checkerboard. Graphics colour buttons act as mosaic paint colour while Mosaic mode is active, so choosing a colour does not insert a row-shifting Level 1 control byte into the artwork. Level 1 keeps one foreground colour and one background state per character cell; per-sixel colour belongs to later enhanced/DRCS workflows, not the v1 Level 1 mosaic model.

## X/0 Header Policy

Packet X/0 is a special page header row, not merely row zero artwork. It identifies the page, terminates the previous page in the stream, carries control/address metadata in the packet form, and normally contributes the visible top-row header text. FortyForge stores row 0 as editable/importable bytes, but also stores a page header policy:

- `original`: preserve and export the authored/imported row 0 bytes exactly as the source page supplied them.
- `local`: compose row 0 at render/export time from page metadata and the local machine clock, using the normal `HH:MM/SS` X/0 clock slot in columns 33 to 40, so a Raspberry Pi or other runtime can keep the displayed clock current without resending a whole page from the editor.
- `none`: compose the generated header/title area but leave the X/0 clock slot blank.

Static exports such as TTI snapshot the composed local header at export time. In `local` and `none` mode, generated X/0 character cells are owned by the header policy rather than imported screenshot text; authored control codes before the clock slot may still style the row. This prevents duplicated or stale captured clocks such as screenshot timestamps being exported over the active service clock. Packet-stream and PIT integrations should carry the same policy forward so the runtime can regenerate X/0 locally when supported.

## Renderer Boundary

The renderer boundary should use deterministic data:

- `TeletextRow[]` or packed page bytes as input.
- Presentation mode as input: Level 1, 1.5, 2.5, or 3.5.
- Selection metadata as optional editor overlay input.
- Pixel output into a canvas or native framebuffer.

Initial TypeScript implementation:

- Draws a fixed 40 by 25 character grid into selectable preview profiles:
  - `Studio large`: `640x500`, using `16x20` editor cells for comfortable laptop editing.
  - `PIT strict`: `480x500`, using `12x20` cells for canonical runtime comparison.
- Draws preview text from SAA5050 English bitmap data rather than browser fonts.
- Expands the Mullard `5x10` source to PIT-shaped `12x20` glyph bitmaps with a one-pixel left margin and PIT-style corner filling. This is why text is crisper than the earlier centered/scaled `6x10` preview path.
- Draws Level 1 mosaic cells as contiguous `2x3` sixel blocks across the full cell height in the editor preview. This avoids a visible horizontal gap when authors stack mosaic cells vertically. PIT's current integer rasterisation produces three 6-pixel rows in a `12x20` cell and leaves two bottom scanlines as background, so exact mosaic parity may later need a strict-runtime toggle if PIT preserves that behaviour.
- Draws typed bytes in graphics mode as mosaic masks for a practical G1 graphics preview.
- Draws X/0 with normal Level 1 background state instead of forcing a special editor-only colour band.
- Supports direct `2x3` sixel painting on the framebuffer in Mosaic mode.
- Preserves hit testing by mapping pointer coordinates back to row and column.
- Draws selection as an overlay, not as document layout.
- Keeps DOM grid semantics available for accessibility and tests until a richer canvas accessibility layer exists.

The bundled TypeScript SAA5050 table gives crisp non-antialiased pixels and removes dependence on HTML/CSS text rendering. It is adapted from the MIT-licensed `textmodes/font` Mullard SAA5050 data. FortyForge now mirrors PIT's glyph expansion logic in TypeScript; the next renderer milestone is automated image comparison against PIT output so FortyForge can catch row/column differences.

Lowercase entry is supported by the SAA5050 glyph table and the text tool now preserves typed case. The previous keyboard path uppercased every printable key before committing it to the page model, which made lowercase glyphs unreachable even though the renderer could draw them.

The local PIT checkout is available in WSL2 at `/home/nzste/projects/pi-teletext` with remote `https://github.com/repoalpha/pi-teletext.git`. Its strict renderer profile uses a canonical `480x500` framebuffer, so FortyForge's `640x500` Studio preview is an editor readability profile rather than exact playout parity. The preview control now exposes both:

- `PIT strict`: `480x500`, matching the runtime framebuffer for pixel comparison.
- `Studio large`: wider editor pixels for comfortable laptop editing.

### SAA5050 Font Source Candidates

The studio preview now uses an authentic SAA5050 source. Candidate and follow-up paths:

- `textmodes/font` Mullard ROM data: MIT-licensed bitmap package exposing SAA5050 English glyphs as 5 by 10 bitmaps with a 6-pixel advance. This is now the in-app text glyph source.
- Teletext50/Bedstead: CC0-licensed font work described as pixelated Teletext output generated by the Mullard SAA5050 and BBC Micro Mode 7. This remains useful for visual reference and documentation.
- PIT/native renderer bridge: preferred long-term path if the existing runtime already has the exact display renderer we trust.

The implementation keeps the current `drawBitmapGlyph` boundary, with imported SAA5050 glyph data and recorded licence attribution in `docs/third-party-notices.md`.

Immediate renderer priorities:

- Compare the SAA5050 renderer against PIT output and record any row/column differences.
- Keep the TypeScript framebuffer renderer as a fast editor preview, but compare it against PIT output once the PIT renderer bridge exists.
- Treat double-width, double-size, conceal, hold graphics, and illegal-row validation as decoder behaviours, not CSS styles.
- Add a complete sixel mosaic editor, beyond the current full-block paint action.
- Allow the framebuffer preview to occupy the full available screen in Playout mode.

Future PIT-backed implementation:

- Compile the existing PIT rendering core to WebAssembly, or expose it through Tauri native commands.
- Use the same renderer interface so editor tools do not care whether rendering comes from TypeScript, WASM, or native code.
- Prefer byte-accurate page input over styled text input.

## PIT Renderer Findings

Confirmed local PIT reference: `/home/nzste/projects/pi-teletext`.

Key files:

- `src/core/src/renderer.cpp`: strict framebuffer render path, background fills, SAA5050 alpha drawing, mosaic drawing, and double-height top/bottom row rendering.
- `src/core/src/glyph.cpp`: Mullard SAA5050 source conversion to `12x20` glyph output with margin and half-dot rounding behaviour.
- `src/core/src/mosaic.cpp`: sixel mosaic rasterisation, including separated mosaic inset handling.
- `src/core/src/cell.cpp`: Level 1 control-state interpretation, graphics mode, held graphics, and mosaic byte decoding.
- `src/compiler/src/page_compiler.cpp`: generated row helpers and practical examples of graphics/background control placement.
- `tests/test_framebuffer.cpp`, `tests/test_glyph.cpp`, `tests/test_mosaic.cpp`, `tests/test_teletext_state.cpp`: best starting point for parity-driven FortyForge tests.

Practical implications for FortyForge:

- Current text rendering is no longer browser-font or centered `6x10` output. It follows PIT's `12x20` Mullard expansion and half-dot corner shaping.
- The apparent wider letter spacing in `Studio large` comes from the editor profile's `16x20` cells. PIT strict output should be judged in the `480x500` `PIT strict` mode, where the cell advance is the PIT/SAA-shaped `12x20` advance.
- Some reference screenshots appear to use later service-specific masthead/text rendering rather than raw SAA5050. PIT contains custom post-1993 CEEFAX/BBC masthead overlay drawing paths in `renderer.cpp`, so visual differences in those regions should not automatically be treated as SAA5050 glyph bugs.
- Current editor mosaic rendering fills the full cell height for contiguous sixels to support hand editing without visible row gaps. PIT's `mosaic.cpp` still documents the stricter integer geometry, so this difference is recorded and should be rechecked during automated PIT image comparisons.
- Current double-height rendering still needs PIT-style top and bottom half handling across paired rows.
- The expanded editor preview remains useful, but strict PIT comparison must happen through the `PIT strict` `480x500` profile.

## Screenshot Reference Trace

FortyForge now treats screenshot tracing as a manual-first reference workflow. Clean screenshots can be loaded beside the editor canvas so an author can copy the page by hand with the normal text, mosaic, and control-code tools. This is the primary workflow until automatic reconstruction is consistently useful.

The deterministic decoder still exists as an optional assist for clean framebuffer-like screenshots. It is intentionally scoped away from photos, perspective captures, noisy video frames, or arbitrary web images.

The first implementation lives in `src/app/importTrace/screenshotTrace.ts` and:

- Assumes a clean `40x25` grid. PIT strict `480x500` and exact scaled screenshots are the best inputs, but the trace path can now consume a manually aligned grid rectangle for screenshots with borders or shifted capture.
- Quantizes pixels to the Level 1 eight-colour palette.
- Classifies cells as space, text, mosaic, coloured region, or uncertain.
- Matches text against the SAA5050/PIT-shaped glyph bitmaps.
- Matches contiguous mosaic cells against deterministic `2x3` sixel masks.
- Compares double-height row-pair candidates against ordinary single-height interpretation, so structural double-height control codes are chosen only when the paired render wins rather than from OCR similarity alone.
- Re-scores mosaic-region cells by brute-forcing all 64 sixel masks against the source pixels. The scorer prefers neighbouring mosaic-region background state over the current cell's dominant colour, which avoids inverting foreground-heavy masthead cells.
- Reconstructs editable `TeletextRow[]` output, inserting row-local foreground/mode control bytes when preceding blank cells are available.
- Preserves uncertain cells as editable blanks with `Trace confidence` annotations and reports warnings in the Import Trace dock.

The right tool dock now has an `Import Trace` mode with a reference screenshot file input. Loading a file creates a side-by-side reference panel in the main workspace with fit/zoom controls, a draggable split handle, and a 40 by 25 overlay grid. The reference stays visible when authors switch back to Text or Mosaic mode so it can be copied by hand. The import dock exposes manual edge-inset controls for the overlay grid; these insets are converted into the decoder's grid rectangle before `Try auto trace` runs. The current editor page is left untouched until that button is pressed. Pressing `Try auto trace` explicitly runs the decoder: the browser decodes the stored reference file into canvas `ImageData`, the trace pipeline reconstructs rows, and FortyForge replaces the current subpage through the same editor history path as other commands. The imported result is editable, undoable, and exportable as native project JSON or TTI.

Known limits for this first slice:

- Manual crop/alignment is still basic: authors set percentage edge insets rather than dragging grid anchors on the image. A future refinement should allow clicking a few known grid intersections and repeating the spacing across the page.
- Control-code minimisation is conservative. It uses previous blank cells to preserve visible cell positions when inserting colour or graphics controls.
- Hold graphics, separated mosaics, and all X/0 header policy details are not fully inferred from screenshots yet.
- AI-assisted correction is deliberately out of scope until deterministic confidence reporting is useful.

## RPI/PIT Sync

FortyForge should update a Raspberry Pi or similar target without recompiling PIT. The editor should publish data, not code:

- Export TTI/T42/raw packet files into a watched folder.
- Download native project JSON and TTI snapshots directly from the editor for manual VBIT/PIT workflows.
- Optionally push those files over SSH/SCP to an RPI target.
- Later provide a live sync mode that writes atomic page updates and signals PIT to reload or lets PIT watch the folder.
- Keep a future streaming profile for low-bandwidth links such as LoRaWAN.

The key rule is that PIT consumes changing page data or packet streams. A display update must not require rebuilding the runtime.

See `docs/technical/pit-live-roundtrip.md` for the proposed pull/edit/push workflow.

## Subpage And ETSI Backlog

Subpages are now first-class editor objects: the page navigator can add a new fixed-width subpage and switch between subcodes such as `0000` and `0001` without losing row data. This is the correct foundation for ETSI-style carousel pages, but full standards behaviour still needs timing and transmission policy work.

Remaining ETSI/PIT alignment items:

- Subpage cycle timing, hold behaviour, and export selection for page sets.
- Packet X/26 enhancement handling, Fastext/TOP links, and Level 1.5/2.5/3.5 compatibility views.
- Parity/Hamming packet encoding for byte-accurate T42/raw outputs.
- Visual regression checks against PIT output once the PIT reference project or live target is available.
