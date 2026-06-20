# FortyForge Renderer And PIT Integration

## Decision

FortyForge must not rely on HTML and CSS layout for the teletext display. The editor UI can use React for tools, panels, inspectors, templates, and workflow controls, but the page preview must be an embedded framebuffer-style render target. The render target starts as a TypeScript canvas renderer and is intentionally shaped so it can later be replaced by the real PIT renderer through WebAssembly or Tauri native commands.

## Layout Modes

### Studio Mode

Studio Mode is the default laptop layout. It keeps the page navigator and templates on the left, the framebuffer preview in the center, and the inspector, control-code details, validation, and row byte view on the right.

### Playout Mode

Playout Mode is for dual-screen or live use. The clean display should be detachable or fullscreen, while the editing tools remain on the operator screen. In v1 this can be represented as a layout mode in the app; later Tauri can open a second window bound to the same page model.

## Renderer Boundary

The renderer boundary should use deterministic data:

- `TeletextRow[]` or packed page bytes as input.
- Presentation mode as input: Level 1, 1.5, 2.5, or 3.5.
- Selection metadata as optional editor overlay input.
- Pixel output into a canvas or native framebuffer.

Initial TypeScript implementation:

- Draws a fixed 40 by 25 character grid into a canvas.
- Draws preview text from a deterministic bitmap atlas rather than browser fonts.
- Preserves hit testing by mapping pointer coordinates back to row and column.
- Draws selection as an overlay, not as document layout.
- Keeps DOM grid semantics available for accessibility and tests until a richer canvas accessibility layer exists.

The bundled TypeScript bitmap atlas is a preview backend only. It gives crisp non-antialiased pixels and removes dependence on HTML/CSS text rendering, but it is not yet the authoritative Ceefax/PIT glyph source.

Future PIT-backed implementation:

- Compile the existing PIT rendering core to WebAssembly, or expose it through Tauri native commands.
- Use the same renderer interface so editor tools do not care whether rendering comes from TypeScript, WASM, or native code.
- Prefer byte-accurate page input over styled text input.

## RPI/PIT Sync

FortyForge should update a Raspberry Pi or similar target without recompiling PIT. The editor should publish data, not code:

- Export TTI/T42/raw packet files into a watched folder.
- Optionally push those files over SSH/SCP to an RPI target.
- Later provide a live sync mode that writes atomic page updates and signals PIT to reload or lets PIT watch the folder.
- Keep a future streaming profile for low-bandwidth links such as LoRaWAN.

The key rule is that PIT consumes changing page data or packet streams. A display update must not require rebuilding the runtime.
