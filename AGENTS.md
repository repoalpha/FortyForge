# FortyForge Agent Notes

## Project Role

FortyForge is the standalone desktop editor for pi-teletext pages. It is separate from the pi-teletext/PIT runtime, but it must stay interoperable with it through page data, packet streams, exports, and eventually renderer comparison.

## PIT Reference Project

When working on renderer behaviour, packet output, page timing, or Raspberry Pi sync, check the sibling pi-teletext/PIT project as the runtime reference before making assumptions. Look for a nearby checkout with names such as:

- `../pi-teletext`
- `../PIT`
- `../pit`
- `../raspi-teletext`

If no PIT checkout is present, say that clearly and ask for the local path before claiming renderer parity. FortyForge can still use standards-based behaviour and documented sources, but exact visual parity should be verified against PIT output.

## Renderer Guidance

- Do not use browser fonts for the teletext framebuffer preview.
- Keep the canvas/framebuffer path byte and glyph-table driven.
- Compare SAA5050 text, mosaic graphics, double-height rows, colour controls, and X/0 header behaviour against PIT when the reference checkout is available.
- Treat PIT as the eventual authority for live playout appearance; FortyForge's TypeScript renderer is the fast editor preview until a PIT/WASM/native bridge exists.

## Git Hygiene

There may be unrelated scratch files in the workspace. Do not delete or stage untracked files unless the user explicitly asks.
