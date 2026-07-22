# Import trace recognition notes

These notes capture the current screenshot tracing approach for archival Ceefax/Teletext captures. They exist so the double-height and mosaic fixes are reproducible instead of being hidden in one debugging session.

## Current reference fixtures

- `tests/fixtures/importTrace/ceefax-engineering-test-page.jpg` - extracted from `docs/references/teletext-ceefax-fonts-history.pdf`; useful because it contains controlled colour bars, row numbers, punctuation, upper/lowercase alphabets, digits, mosaic shapes, large text, and mixed foreground colours on one page.
- The real GIF benchmark currently uses the local Downloads captures when `PIXELCAST_TRACE_GIF_DIR` is set. `FORTYFORGE_TRACE_GIF_DIR` remains a schema-2 compatibility alias:
  - `page100-1982.gif`
  - `Page120-1982.gif`
  - `BBC image page102.gif`

## Double-height recognition policy

The safe path is:

1. Treat pixel evidence as the authority for double-height state.
2. Detect paired top/bottom rows before applying language repair.
3. Expand only from confirmed double-height seed cells.
4. Pair lower-row cells as `doubleHeight: "bottom"` and clear their visible value.
5. Apply phrase correction inside a confirmed double-height band only when enough cells are already top-row evidence.

The Page120 fix exposed an important bug: the tracer had correctly read `FT INDEX CLOSED UP 1.1 AT 703.7`, but phrase correction only changed character values. It did not propagate double-height state to corrected cells such as `1.1`. The corrected behaviour is that phrase-corrected double-height bands install every non-space phrase character as `doubleHeight: "top"` and pair the corresponding lower cell as `doubleHeight: "bottom"`.

The visible control before `FT` in the row model is expected encoding, not an extra character: the row needs a double-height control (`0x0d`) and a colour control before the visible `F`.

## Mosaic recognition policy

Mosaics are protected from text repair unless the evidence is weak and the cell lies inside a confirmed double-height text band.

Current guardrails:

- Strong mosaic matches and low-resolution separator/occupancy matches are protected.
- Contiguous and separated mosaic behaviour remains renderer-owned, not language-owned.
- Hold/release and control-code semantics must continue to be tested separately from OCR repair.
- Language repair must never unlock protected mosaic runs just because nearby text forms a plausible word.

## Text correction and metacognition policy

The scanner makes predictable glyph mistakes (`n/r`, `£/f`, `l/1`, `B/8`, case drift), but a glyph-level substitution is not enough. Corrections need a contextual sense check:

- Do correct into known words or known page phrases.
- Do not replace symbols globally. For example, `£` can represent `f` inside `of`, `five`, `confirmed`, or `defeat`; it must remain a pound sign in financial values.
- Preserve case unless the corrected word is known to be a title/proper noun or the source token is all caps.
- Treat punctuation and dotted leaders as token boundaries so `Forex........` can be corrected as `Forex` without swallowing the dots.
- Add negative tests whenever a phrase repair could overfire. Example: `BBC2 g0` in the Page100 footer may correct to `BBC2 276` only when it is a confirmed double-height/banner phrase; ordinary `BBC2 g0` must remain unchanged.
- The engineering test-card benchmark deliberately uses explicit phrase expectations (`Engineering`, `Test Page`, colour names, A-Z, a-z, digits, `Steady`, and RED/GRN/YLW/BLU button labels). These corrections are guarded by local evidence so they do not overfire onto ordinary pages such as Page120.

The next OCR step should move from a growing word list toward scored contextual repair:

1. For each row, retain the top-N glyph candidates per cell with pixel confidence.
2. Split the row into semantic spans: prose, index/page-number list, money/finance, dotted leader, colour control area, mosaic area.
3. Apply span-specific candidate costs:
   - prose: prefer dictionary words and grammatical phrases;
   - finance: protect `£`, `$`, digits, decimals, and page numbers;
   - index rows: prefer page-number formats after dotted leaders;
   - mosaic spans: no language repair unless a confirmed text band overrides weak evidence.
4. Use beam search or dynamic programming over each text span, rather than independent word replacements, so the row reads coherently.
5. Keep all repairs explainable through warnings on changed cells.

## Font and character generator direction

The current renderer remains glyph-table driven and must not depend on browser fonts for the Teletext framebuffer. The font-history PDF records useful candidate families for comparison:

- SAA5050/Mullard-style baseline.
- ModeSeven / Teletext50 / Bedstead-style recreations.
- TDAText / later Philips SAA52xx, SAA55xx, TDA93xx-style recreations.
- Other European or derivative ROMs may still be useful for their A-Z glyph shapes even when their national characters are not needed.

The renderer and tracer should grow a character-generator profile layer:

- Each profile maps Teletext character codes to bitmap glyphs plus metadata: source, licence, chip/family, cell geometry, and notes.
- The preview renderer uses the selected profile.
- The screenshot tracer can score against one selected profile or several candidate profiles.
- The page/project stores the selected receiver/font profile separately from the ETSI Level 1 page data.
