# Teletext Font Profiles And Symbols Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add byte-compatible receiver font profile selection and a Teletext symbols palette for thin-line/text glyphs.

**Architecture:** Store the selected receiver font profile in page metadata and pass it from `App` to `TeletextCanvas` and `drawBitmapGlyph`. Keep row bytes unchanged. Add byte-specific symbol insertion so special SAA5050 glyphs write valid teletext bytes rather than Unicode code points.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, React Testing Library.

## Global Constraints

- The original Mullard/Philips SAA5050 English set remains the default baseline.
- Font selection changes rendering only; it must not change stored row bytes or keyboard semantics.
- Profiles use stable IDs that can be mirrored in the RPI/PIT renderer.
- Browser fonts must not be used for the framebuffer preview.
- English keyboard input remains normal G0 bytes.
- Symbols must insert the intended teletext byte, not Unicode code points such as `0x2013`.
- First selectable profiles are `saa5050-classic` and `bedstead-extended`; `tdatext-later` is reserved but not selectable until sourced.

---

## Task 1: Font Profile Model And Rendering

**Files:**
- Modify: `src/core/model/types.ts`
- Modify: `src/core/model/projectFactory.ts`
- Modify: `src/core/importers/nativeProject.ts`
- Modify: `src/app/preview/bitmapGlyphRenderer.ts`
- Modify: `src/app/components/TeletextCanvas.tsx`
- Modify: `src/app/App.tsx`
- Test: `src/app/preview/bitmapGlyphRenderer.test.ts`
- Test: `src/core/importers/nativeProject.test.ts`

**Interfaces:**
- Produces: `TeletextFontProfileId = "saa5050-classic" | "bedstead-extended" | "tdatext-later"`.
- Produces: `PageMetadata.receiverFontProfileId: TeletextFontProfileId`.
- Produces: `getBitmapGlyph(value: string, profileId?: TeletextFontProfileId): BitmapGlyph`.
- Produces: `drawBitmapGlyph(..., profileId?: TeletextFontProfileId)`.

- [ ] Write tests that default pages use `saa5050-classic`, native import backfills missing `receiverFontProfileId`, and `getBitmapGlyph("A", "bedstead-extended")` differs from classic while returning a 12x20 glyph.
- [ ] Run `npm test -- src/app/preview/bitmapGlyphRenderer.test.ts src/core/importers/nativeProject.test.ts` and verify the tests fail.
- [ ] Add the model type/property, default factory value, native import backfill, and profile-aware glyph lookup.
- [ ] Add a deterministic Bedstead-derived `12x20` subset for common English G0 characters and fallback to classic for missing glyphs.
- [ ] Pass `receiverFontProfileId` from `App` into `TeletextCanvas` and into `drawBitmapGlyph`.
- [ ] Run the same focused tests and verify they pass.

## Task 2: Receiver Font UI

**Files:**
- Modify: `src/core/model/commands.ts`
- Modify: `src/core/index.ts`
- Modify: `src/app/components/ToolDock.tsx`
- Modify: `src/app/App.tsx`
- Test: `src/app/App.test.tsx`

**Interfaces:**
- Produces: `setPageReceiverFontProfileCommand(serviceId, pageId, profileId)`.
- Produces ToolDock props: `receiverFontProfileId`, `onReceiverFontProfileChange`.

- [ ] Write an App test that opens the Tools/Text pane, sees `Receiver font`, selects `Bedstead / Teletext50`, and observes the active selector value.
- [ ] Run `npm test -- src/app/App.test.tsx` and verify it fails.
- [ ] Add the command and wire ToolDock select control to App history.
- [ ] Run the focused App test and verify it passes.

## Task 3: Byte-Correct Teletext Symbols

**Files:**
- Modify: `src/core/model/commands.ts`
- Modify: `src/core/index.ts`
- Modify: `src/app/components/ToolDock.tsx`
- Modify: `src/app/App.tsx`
- Test: `src/core/model/commands.test.ts`
- Test: `src/app/App.test.tsx`

**Interfaces:**
- Produces: `insertCharacterByteCommand(serviceId, pageId, subpageId, rowIndex, column, byte, value)`.
- Produces ToolDock prop: `onSymbolInsert(byte, value)`.

- [ ] Write command tests that inserting byte `0x60` with value `–` stores byte `0x60`, not `0x2013`.
- [ ] Write App tests that `Horizontal rule`, `Vertical rule`, and `Solid block` buttons insert bytes `96`, `124`, and `127`.
- [ ] Run `npm test -- src/core/model/commands.test.ts src/app/App.test.tsx` and verify failures.
- [ ] Add the command and symbols section under Text/Tools.
- [ ] Run focused tests and verify they pass.

## Task 4: Final Verification

- [ ] Run `npm test -- src/app/App.test.tsx src/app/preview/bitmapGlyphRenderer.test.ts src/core/importers/nativeProject.test.ts src/core/model/commands.test.ts`.
- [ ] Run `npm test`.
- [ ] Inspect `git diff` and report changed files plus any unrelated dirty files left untouched.
