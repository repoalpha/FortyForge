# FortyForge Agent Notes

## Project Role

FortyForge is the standalone desktop editor for pi-teletext pages. It is separate from the pi-teletext/PIT runtime, but it must stay interoperable with it through page data, packet streams, exports, and eventually renderer comparison.

## PIT Reference Project

When working on renderer behaviour, packet output, page timing, or Raspberry Pi sync, check the pi-teletext/PIT project as the runtime reference before making assumptions.

Primary local PIT checkout:

- WSL distro: `Ubuntu`
- Linux path: `/home/nzste/projects/pi-teletext`
- Windows UNC path: `\\wsl.localhost\Ubuntu\home\nzste\projects\pi-teletext`
- Remote: `https://github.com/repoalpha/pi-teletext.git`

Useful command pattern from PowerShell:

```powershell
wsl.exe -d Ubuntu --cd /home/nzste/projects/pi-teletext -- git status --short
```

If the WSL checkout is unavailable, look for a nearby checkout with names such as:

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
- PIT strict rendering is documented around a canonical `480x500` framebuffer. Wider FortyForge studio previews are editor scale/profile decisions and must not be claimed as exact PIT parity.
- Key PIT files to review before renderer changes: `src/core/src/renderer.cpp`, `src/core/src/cell.cpp`, `src/core/src/glyph.cpp`, `src/core/src/mosaic.cpp`, `src/compiler/src/page_compiler.cpp`, `tests/test_framebuffer.cpp`, `tests/test_glyph.cpp`, `tests/test_mosaic.cpp`, and `tests/test_teletext_state.cpp`.
- PIT's SAA5050 path uses Mullard ROM data to produce `12x20` glyphs with margin/rounding behaviour. Match that output before calling FortyForge text rendering visually complete.
- PIT implements hold graphics, separated/contiguous mosaics, background colour state, and double-height top/bottom row rendering in the core pipeline. Use those behaviours as parity tests for FortyForge.

## Git Hygiene

There may be unrelated scratch files in the workspace. Do not delete or stage untracked files unless the user explicitly asks.
