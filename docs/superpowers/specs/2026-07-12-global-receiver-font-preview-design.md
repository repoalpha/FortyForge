# Global Receiver Font Preview Design

## Goal

FortyForge must let an author switch the entire application preview between deterministic receiver font profiles to judge the visual character of a service. The selection is a design-time viewing preference, not teletext page data, and must remain selected after a browser refresh until the author deliberately changes it.

## Scope

This change covers the FortyForge preview preference, selector presentation, canvas rendering, persistence, and tests. It does not add a font-selection code to TTI, packet streams, or other teletext exports, and it does not change the pi-teletext runtime.

## Teletext Boundary

Level 1 teletext transmits character and control bytes, not the receiver's character-generator design. Historical receivers rendered the same bytes differently according to their hardware. FortyForge will model that distinction explicitly:

- Page bytes and export formats remain independent of receiver font choice.
- FortyForge applies one global receiver font profile to every page preview.
- pi-teletext may later expose the same stable profile IDs as runtime configuration, but a deployed device will normally be configured to use one renderer profile.
- FortyForge and pi-teletext do not share packages or source files. Stable profile IDs and independently maintained deterministic glyph tables are their interoperability contract.

## Profiles

The first selectable profiles remain:

- `saa5050-classic`: the current Mullard SAA5050-derived bitmap rendering.
- `bedstead-extended`: printable English G0/ASCII bitmaps generated from the CC0 Bedstead 002.002 `bedstead-20.bdf` source.

Both profiles render through deterministic bitmap tables. Browser fonts are not used for the teletext canvas. Missing Bedstead glyphs outside the bundled printable range fall back to the classic profile.

## State And Persistence

The active receiver font becomes application preview state rather than page metadata.

- Use one dedicated local-storage key for the active profile.
- Initialize the preference from that key, accepting only known profile IDs.
- Default to `saa5050-classic` when the key is missing or invalid.
- Write the key only when the author deliberately changes the receiver-font control.
- Apply the active profile to every current and subsequently opened page.
- Refreshing or reopening FortyForge restores the preference.
- Native project import/export and teletext exports do not carry or modify this preference.

Existing page-level `receiverFontProfileId` data is no longer authoritative. Native project import will continue accepting it to avoid breaking saved projects, but rendering and new project creation will not depend on it. The obsolete field will remain ignored in this change and can be removed in a separate project-schema cleanup.

## User Interface

The receiver-font control remains in the Tools pane but represents a global preview setting.

- Label the control `Receiver font`.
- Add concise supporting text explaining that it changes all previews and does not alter transmitted page bytes.
- Style the control to match FortyForge: rounded border, dark surface, clear hover/focus states, comfortable spacing, and a deliberate dropdown indicator.
- Do not build a custom menu when a styled native select provides the required keyboard and accessibility behavior.
- Switching options must redraw the canvas immediately without requiring Save, page navigation, refresh, or server restart.

## Rendering Flow

`App` owns the global receiver-font preference and passes it directly to every `TeletextCanvas`. `TeletextCanvas` includes it in the canvas drawing effect dependencies and passes it to `drawBitmapGlyph`. Glyph lookup resolves the requested profile before drawing each character.

The DOM grid remains an accessibility and editing surface; the receiver profile changes the framebuffer-style canvas glyphs. Mosaic geometry and control-code behavior are unaffected.

## Failure Handling

- Unknown persisted profile IDs fall back to `saa5050-classic` without preventing startup.
- Missing Bedstead glyphs fall back to the classic glyph for the same character.
- Storage access failures leave the current in-memory selection usable for the session.
- The selector always reflects the profile currently supplied to the canvas.

## Testing

Automated tests must verify:

- Representative uppercase, lowercase, and numeric Bedstead glyphs differ from classic glyphs and remain `12x20`.
- Selecting Bedstead updates the global preview profile supplied to the canvas.
- Switching pages does not change the selected profile.
- Refresh initialization restores the saved global profile.
- Invalid persisted values fall back to classic.
- Profile changes do not alter page bytes or exported teletext data.
- The control has an accessible label and retains native keyboard behavior.

Final verification requires the full test suite, a production build, and a browser check on page 100 confirming a visibly different `0` and ordinary text when switching profiles.
