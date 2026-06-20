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

Mosaic editing is a first-class tool mode. In Mosaic mode the framebuffer cell is treated as a `2x3` sixel target: pointer painting sets sixels directly, right-click or alternate-button painting clears them, and `Q W / A S / Z X` toggles the six individual blocks from the keyboard. Pattern buttons in the tool dock provide whole-cell accelerators such as empty, full block, halves, diagonals, and checkerboard. Level 1 keeps one foreground colour and one background state per character cell; per-sixel colour belongs to later enhanced/DRCS workflows, not the v1 Level 1 mosaic model.

## X/0 Header Policy

Packet X/0 is a special page header row, not merely row zero artwork. It identifies the page, terminates the previous page in the stream, carries control/address metadata in the packet form, and normally contributes the visible top-row header text. FortyForge stores row 0 as editable/importable bytes, but also stores a page header policy:

- `original`: preserve and export the authored/imported row 0 bytes exactly as the source page supplied them.
- `local`: compose row 0 at render/export time from page metadata and the local machine clock, so a Raspberry Pi or other runtime can keep the displayed clock current without resending a whole page from the editor.

Static exports such as TTI snapshot the composed local header at export time. Packet-stream and PIT integrations should carry the same policy forward so the runtime can regenerate X/0 locally when supported.

## Renderer Boundary

The renderer boundary should use deterministic data:

- `TeletextRow[]` or packed page bytes as input.
- Presentation mode as input: Level 1, 1.5, 2.5, or 3.5.
- Selection metadata as optional editor overlay input.
- Pixel output into a canvas or native framebuffer.

Initial TypeScript implementation:

- Draws a fixed 40 by 25 character grid into a 640 by 500 editor canvas for the current Studio preview.
- Draws preview text from SAA5050 English bitmap data rather than browser fonts.
- Draws Level 1 mosaic cells as crisp 2 by 3 sixel blocks.
- Draws typed bytes in graphics mode as mosaic masks for a practical G1 graphics preview.
- Draws X/0 with normal Level 1 background state instead of forcing a special editor-only colour band.
- Supports direct `2x3` sixel painting on the framebuffer in Mosaic mode.
- Preserves hit testing by mapping pointer coordinates back to row and column.
- Draws selection as an overlay, not as document layout.
- Keeps DOM grid semantics available for accessibility and tests until a richer canvas accessibility layer exists.

The bundled TypeScript SAA5050 table gives crisp non-antialiased pixels and removes dependence on HTML/CSS text rendering. It is adapted from the MIT-licensed `textmodes/font` Mullard SAA5050 data. The next renderer milestone is visual comparison against PIT output so FortyForge can match the runtime exactly.

The local PIT checkout is available in WSL2 at `/home/nzste/projects/pi-teletext` with remote `https://github.com/repoalpha/pi-teletext.git`. Its strict renderer profile uses a canonical `480x500` framebuffer, so FortyForge's `640x500` Studio preview is an editor readability profile rather than exact playout parity. A later preview control should expose both:

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

- Current text rendering is crisper than browser fonts, but it is not yet proven identical to PIT because PIT applies margin and half-dot shaping around the Mullard source data.
- Current mosaic rendering covers direct sixel drawing and graphics-mode typed bytes, but still needs hold-graphics substitution and separated-mosaic parity tests.
- Current double-height rendering still needs PIT-style top and bottom half handling across paired rows.
- Current expanded editor preview is useful, but strict PIT comparison must happen at `480x500`.

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
