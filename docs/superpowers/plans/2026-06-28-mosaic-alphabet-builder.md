# Mosaic Alphabet Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` or `superpowers:test-driven-development` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let FortyForge build reusable mosaic lettering from archive-style cell blocks, then stamp words such as `PIXELCAST` without relying on browser fonts or fragile OCR heuristics.

**User intent:** Preserve the current mosaic editor and import-trace improvements. Avoid another over-fitted recognition engine. Start with a controlled glyph palette that can be captured from known mosaic lettering and manually edited, then add constrained generation for missing letters.

**Architecture:** Add a project-level `mosaicAlphabets` collection. A mosaic alphabet contains fixed-size glyphs made from existing Level 1 mosaic cells: sixel masks, separated/contiguous state, foreground, and background. Core helpers/commands capture glyphs from authored cells and stamp text back into rows. React only collects the selected letter/text/options and dispatches commands.

**Tech Stack:** TypeScript, React, Vitest, Testing Library, existing FortyForge command/history model.

**Non-goals for this first pass:**

- Do not alter `renderLevel1Row`, `TeletextCanvas`, PIT rendering assumptions, or SAA5050 text glyph rendering.
- Do not introduce AI bitmap generation into the page renderer.
- Do not infer missing letters directly from noisy screenshots yet.
- Do not replace the current mosaic-paint/sixel-edit tools.

---

## File Structure

- Modify `src/core/model/types.ts`: add `MosaicAlphabet`, `MosaicGlyph`, `MosaicGlyphCell`, `MosaicGlyphSource`, and `Project.mosaicAlphabets`.
- Modify `src/core/model/projectFactory.ts`: initialize `mosaicAlphabets: []`.
- Modify `src/core/model/schema.ts`: allow legacy imports where `mosaicAlphabets` is missing.
- Modify `src/core/importers/nativeProject.ts`: normalize missing `mosaicAlphabets` to `[]`.
- Add `src/core/mosaicAlphabet/mosaicAlphabet.ts`: pure helpers for glyph capture, validation, and word layout.
- Add `src/core/mosaicAlphabet/mosaicAlphabet.test.ts`: pure unit tests for capture/layout.
- Modify `src/core/model/commands.ts`: add capture/save/delete/stamp commands.
- Modify `src/core/model/commands.test.ts`: command-level tests.
- Modify `src/core/index.ts`: export new helpers, commands, and types.
- Modify `src/app/state/editorStore.ts`: expose `mosaicAlphabets` in the editor view model if needed.
- Add `src/app/components/MosaicAlphabetPanel.tsx`: UI for glyph availability, `PIXELCAST` preview/stamp, and capture controls.
- Modify `src/app/components/ToolDock.tsx`: mount the panel near existing Mosaic patterns.
- Modify `src/app/App.tsx`: own panel state and command handlers.
- Modify `src/app/App.test.tsx`: UI integration tests.
- Modify `src/app/styles.css`: small panel/glyph availability styles.
- Add or update `docs/technical/mosaic-alphabet-notes.md`: document the feature, limitations, and how it protects mosaic regressions.

---

## Data Model

Add these interfaces in `src/core/model/types.ts` near `GlyphSet`/`Template`:

```ts
export type MosaicGlyphSource = "captured" | "generated" | "edited";

export interface MosaicGlyphCell {
  sixelMask: number;
  separated: boolean;
  foreground: TeletextColourRef;
  background: TeletextColourRef;
}

export interface MosaicGlyph {
  character: string;
  width: number;
  height: number;
  cells: MosaicGlyphCell[];
  source: MosaicGlyphSource;
  note?: string;
}

export interface MosaicAlphabet {
  id: string;
  name: string;
  description: string;
  sourceReference?: SourceReference;
  cellWidth: number;
  cellHeight: number;
  spacingColumns: number;
  glyphs: Record<string, MosaicGlyph>;
}
```

Add to `Project`:

```ts
mosaicAlphabets: MosaicAlphabet[];
```

Rationale:

- `width` and `height` stay cell-based, so this remains pure teletext.
- `cells` are normal Level 1 mosaic sixel masks, so PIT/framebuffer parity stays achievable.
- `source` lets us distinguish letters actually captured from Page 120-style material from generated placeholders.

---

## Task 1: Project Model And Legacy Import

**Files:**

- Modify: `src/core/model/types.ts`
- Modify: `src/core/model/projectFactory.ts`
- Modify: `src/core/model/schema.ts`
- Modify: `src/core/importers/nativeProject.ts`
- Test: `src/core/importers/nativeProject.test.ts`

- [ ] Write a failing import test:

```ts
it("defaults missing mosaic alphabets when importing older native projects", () => {
  const legacyProject = JSON.parse(exportNativeProject(createDefaultProject()));
  delete legacyProject.mosaicAlphabets;

  const imported = importNativeProject(JSON.stringify(legacyProject));

  expect(imported.mosaicAlphabets).toEqual([]);
});
```

- [ ] Add the model types and `Project.mosaicAlphabets`.
- [ ] Initialize `mosaicAlphabets: []` in `createDefaultProject`.
- [ ] Update schema/import normalization so old `.pttx` projects load cleanly.
- [ ] Run:

```powershell
npm test -- --run src/core/importers/nativeProject.test.ts --reporter=dot
```

---

## Task 2: Pure Mosaic Alphabet Helpers

**Files:**

- Add: `src/core/mosaicAlphabet/mosaicAlphabet.ts`
- Add: `src/core/mosaicAlphabet/mosaicAlphabet.test.ts`

- [ ] Create helper tests before implementation:

```ts
it("captures a rectangular mosaic glyph from authored cells", () => {
  // Build a 2x2 region with masks [0x3f, 0x15, 0x2a, 0x00].
  // Capture it as "P".
  // Expect width=2, height=2, 4 cells, source="captured".
});

it("lays out PIXELCAST from known glyphs and spacing", () => {
  // Given a test alphabet with glyphs P I X E L C A S T.
  // Expect layout cells in character order with one spacing column between glyphs.
});

it("reports missing glyphs without stamping bogus characters", () => {
  // Given an alphabet missing X.
  // layoutMosaicText("PIXELCAST") reports ["X"] and omits/marks the missing span.
});
```

- [ ] Implement `captureMosaicGlyph(rows, bounds, character, fallbackColours)`:

```ts
export function captureMosaicGlyph(
  rows: TeletextRow[],
  bounds: CellRectangle,
  character: string,
  source: MosaicGlyphSource = "captured"
): MosaicGlyph
```

Rules:

- Bounds are inclusive.
- Non-mosaic cells become empty mosaic cells (`sixelMask: 0`) using the rendered/current background.
- Mosaic cells preserve `sixelMask`, `separated`, `foreground`, and `background`.
- Clamp masks to `0x00..0x3f`.

- [ ] Implement `layoutMosaicText(alphabet, text)`:

```ts
export interface MosaicTextLayout {
  width: number;
  height: number;
  missing: string[];
  cells: Array<{
    rowOffset: number;
    columnOffset: number;
    glyphCharacter: string;
    cell: MosaicGlyphCell;
  }>;
}
```

Rules:

- Text is normalized to uppercase for glyph lookup in the first pass.
- Spacing uses `alphabet.spacingColumns`.
- Missing glyphs are reported and not silently replaced with nonsense.
- The helper is pure and does not mutate project state.

- [ ] Export helpers from `src/core/index.ts`.
- [ ] Run:

```powershell
npm test -- --run src/core/mosaicAlphabet/mosaicAlphabet.test.ts --reporter=dot
```

---

## Task 3: Core Commands For Capture, Save, Delete, And Stamp

**Files:**

- Modify: `src/core/model/commands.ts`
- Modify: `src/core/model/commands.test.ts`
- Modify: `src/core/index.ts`

- [ ] Write command tests first:

```ts
it("saves a captured mosaic glyph into a new alphabet", () => {
  // Paint a small P-like region.
  // captureMosaicGlyphCommand(..., { alphabetName: "Page 120 masthead", character: "P" }).
  // Expect project.mosaicAlphabets[0].glyphs.P exists.
});

it("updates an existing glyph without changing unrelated glyphs", () => {
  // Save P then I; update P.
  // Expect I unchanged and P replaced.
});

it("stamps PIXELCAST as mosaic cells without altering cells outside the target area", () => {
  // Seed an alphabet with known PIXELCAST glyphs.
  // stampMosaicTextCommand(..., "PIXELCAST", row, col).
  // Expect masks/colours placed and neighbours untouched.
});

it("refuses to stamp if required glyphs are missing", () => {
  // Missing X should leave the project unchanged.
});
```

- [ ] Add command interfaces:

```ts
export interface CaptureMosaicGlyphOptions {
  alphabetId?: string;
  alphabetName: string;
  character: string;
  bounds: CellRectangle;
  cellWidth?: number;
  cellHeight?: number;
  spacingColumns?: number;
}

export interface StampMosaicTextOptions {
  alphabetId: string;
  text: string;
  rowIndex: number;
  column: number;
}
```

- [ ] Implement `captureMosaicGlyphCommand(...)`.
- [ ] Implement `deleteMosaicAlphabetCommand(alphabetId)`.
- [ ] Implement `stampMosaicTextCommand(...)`.

Stamping rules:

- Abort and return the original project if the alphabet is missing.
- Abort if `layoutMosaicText` reports missing glyphs.
- Abort if the layout would exceed row 24 or column 39.
- Write only `kind: "mosaic"` cells.
- Preserve each glyph cell’s foreground/background.
- Use `byte: 0x40 | (sixelMask & 0x3f)`.

- [ ] Export commands from `src/core/index.ts`.
- [ ] Run:

```powershell
npm test -- --run src/core/model/commands.test.ts --reporter=dot
```

---

## Task 4: Seed A Minimal `PIXELCAST` Development Alphabet

**Files:**

- Add: `src/core/mosaicAlphabet/devPixelcastAlphabet.ts` or keep test-only fixture in `mosaicAlphabet.test.ts`
- Test: `src/core/mosaicAlphabet/mosaicAlphabet.test.ts`

- [ ] Add a small fixture alphabet containing `P I X E L C A S T`.
- [ ] Keep it deliberately labelled as a development/test alphabet, not as a historical Page 120 extraction.
- [ ] Use this fixture for TDD and UI tests only until real captured glyphs exist.

Rationale: This lets us ship the placement pipeline and refine the UI before solving the harder extraction/generation problem. It avoids pretending generated shapes are authentic.

---

## Task 5: Minimal UI Panel

**Files:**

- Add: `src/app/components/MosaicAlphabetPanel.tsx`
- Modify: `src/app/components/ToolDock.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/app/App.test.tsx`
- Modify: `src/app/styles.css`

- [ ] Write UI tests first:

```ts
it("shows mosaic alphabet availability for PIXELCAST", async () => {
  // Seed/store a dev alphabet.
  // Expect P I X E L C A S T marked available.
});

it("stamps PIXELCAST at the selected cell", async () => {
  // Select a cell, type PIXELCAST, click Stamp.
  // Expect the canvas/model to contain mosaic cells.
});

it("does not stamp text with missing glyphs and shows missing letters", async () => {
  // Alphabet missing X.
  // Expect warning and no project mutation.
});
```

- [ ] Panel fields:

  - Alphabet selector.
  - Text input defaulting to `PIXELCAST`.
  - “Stamp mosaic text” button.
  - Missing glyph indicator.
  - “Capture selected block as letter” controls can be present but initially disabled until rectangle selection exists.

- [ ] Mount the panel under existing “Mosaic patterns” in `ToolDock`.
- [ ] In `App.tsx`, dispatch `stampMosaicTextCommand` using current selected cell.
- [ ] Keep active tool behavior unchanged: stamping is a command button, not a replacement for paint mode.
- [ ] Run:

```powershell
npm test -- --run src/app/App.test.tsx --reporter=dot
```

---

## Task 6: Capture Real Glyphs From Authored Canvas Blocks

**Files:**

- Modify: `src/app/components/TeletextCanvas.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/app/components/MosaicAlphabetPanel.tsx`
- Modify: `src/app/App.test.tsx`

- [ ] Add or reuse rectangular selection from the artwork-library plan if already implemented.
- [ ] Allow the user to select a block of cells on the canvas and save it as one character.
- [ ] Store the glyph in the selected/new mosaic alphabet.
- [ ] Test that a selected 2x5 block can be saved as `P` and stamped elsewhere.

Important: if rectangle selection is not yet in the app, implement a small first version here or pause and implement the artwork-library rectangle selection plan first. Do not build screenshot extraction before cell-block capture works.

---

## Task 7: Constrained Missing-Letter Generation

**Files:**

- Add: `src/core/mosaicAlphabet/generateMissingGlyphs.ts`
- Add: `src/core/mosaicAlphabet/generateMissingGlyphs.test.ts`
- Modify: `src/app/components/MosaicAlphabetPanel.tsx`

- [ ] Start with deterministic, explainable transforms:

  - `P` from `B`: copy upper bowl, remove lower bowl.
  - `E` from `B` or `F`: vertical plus top/middle/bottom strokes.
  - `L` from `E`: vertical plus bottom.
  - `T` from `I` plus top bar.
  - `I` from a vertical stem.
  - `C` from `O` or `G`: remove right side.

- [ ] Do not auto-generate `A`, `X`, `S`, or other ambiguous letters without marking them `source: "generated"` and asking for user edit/approval.
- [ ] Add tests that generated glyphs:

  - Match the alphabet’s width/height.
  - Use only legal `0x00..0x3f` masks.
  - Preserve palette style from source glyphs.
  - Are never silently treated as captured/historical.

This is the place to be “metacognitive”: the code should expose uncertainty instead of confidently placing ugly or wrong letters.

---

## Task 8: Reference-Image Extraction Later

**Files:**

- Existing: `src/app/components/ReferenceImagePanel.tsx`
- Existing: `src/app/importTrace/*`
- Future: `src/app/importTrace/mosaicLetterTrace.ts`

- [ ] Only start this after Tasks 1-6 are stable.
- [ ] Use grid-calibrated reference images to sample cells inside a selected block.
- [ ] Convert sampled 2x3 sixel regions into candidate masks.
- [ ] Present candidates in the panel for user approval/edit before adding to the alphabet.
- [ ] Keep screenshot CV as an assistive capture step, not as the authority.

This avoids repeating the OCR over-fitting problem. The editable glyph library remains the authority.

---

## Verification Gates

Run these before calling the work complete:

```powershell
npm test -- --run src/core/mosaicAlphabet/mosaicAlphabet.test.ts --reporter=dot
npm test -- --run src/core/model/commands.test.ts --reporter=dot
npm test -- --run src/app/App.test.tsx --reporter=dot
npm test -- --run
npm run build
```

Manual checks:

- Paint/edit existing mosaics still works.
- Existing mosaic foreground/background tests still pass.
- `PIXELCAST` stamps only when every glyph is available.
- Missing glyphs are reported clearly.
- Generated glyphs, if present, are visibly labelled as generated.
- No browser fonts are used for mosaic lettering.
- Existing import-trace/double-height tests still pass.

---

## Execution Order Recommendation

1. Implement Tasks 1-3 first. This gives a testable core without UI risk.
2. Add the minimal `PIXELCAST` fixture and panel in Tasks 4-5.
3. Stop for visual/user refinement.
4. Add real capture from canvas blocks in Task 6.
5. Only then add constrained generation and reference-image extraction.

This sequence gives the user something useful quickly while keeping the renderer and current mosaic behavior stable.
