# Masthead Spacing And Line Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the compact masthead option by replacing it with a tight CITYNEWS style, support intentional masthead spaces/spacers, and add an undoable Ctrl+K full-line clear shortcut.

**Architecture:** Keep masthead rendering in the existing `MosaicAlphabet` layout/stamp pipeline. Add blank/space support as layout behaviour, add a row-clear command in core model commands, and expose keyboard/UI actions through the existing App/TeletextCanvas/ToolDock flow.

**Tech Stack:** TypeScript, React, Vitest, Testing Library.

---

### Task 1: Tight CITYNEWS Alphabet And Space Layout

**Files:**
- Modify: `src/core/mosaicAlphabet/devPixelcastAlphabet.ts`
- Modify: `src/core/mosaicAlphabet/mosaicAlphabet.ts`
- Test: `src/core/mosaicAlphabet/mosaicAlphabet.test.ts`

- [x] Write failing tests asserting the tight alphabet uses 3x5 glyphs with 0 spacing and layout preserves spaces as blank advances.
- [x] Run `npm test -- --run src/core/mosaicAlphabet/mosaicAlphabet.test.ts --reporter=dot` and confirm failure.
- [x] Replace compact 2-column generated glyphs with the same CITYNEWS glyphs at zero spacing; update label/description to `CITYNEWS tight masthead`.
- [x] Treat space characters in `layoutMosaicText` as blank advances instead of missing glyphs.
- [x] Re-run the core mosaic alphabet tests.

### Task 2: App Masthead And Spacer UI

**Files:**
- Modify: `src/app/components/ToolDock.tsx`
- Modify: `src/app/App.tsx`
- Test: `src/app/App.test.tsx`

- [x] Write failing tests asserting the Masthead tab exposes `CITYNEWS tight masthead`, spaces in mosaic text shift the stamp, and an `Insert blank spacer` button shifts the selected row.
- [x] Run focused App tests and confirm failure.
- [x] Add `onBlankSpacerInsert` prop to ToolDock and render an `Insert blank spacer` button in the Masthead tab.
- [x] Wire the button in App to insert a space character/control-like spacer at the selected cell using existing row-shift insertion behaviour.
- [x] Re-run focused App tests.

### Task 3: Ctrl+K Clear Line

**Files:**
- Modify: `src/core/model/commands.ts`
- Modify: `src/core/index.ts`
- Modify: `src/app/components/TeletextCanvas.tsx`
- Modify: `src/app/App.tsx`
- Test: `src/core/model/commands.test.ts`
- Test: `src/app/App.test.tsx`

- [x] Write failing core test for an undoable clear-row command that resets all 40 cells on the selected row to empty spaces.
- [x] Write failing App test that Ctrl+K clears the selected row and Ctrl+Z restores it.
- [x] Implement `clearRowCommand` in core model commands and export it.
- [x] Add `onRowClear` to TeletextCanvas and trigger it on Ctrl/Cmd+K when a cell is selected.
- [x] Wire App to commit `clearRowCommand` and preserve row selection.
- [x] Re-run focused command/App tests.

### Task 4: Verification

- [x] Run `npm test -- --run src/core/mosaicAlphabet/mosaicAlphabet.test.ts src/core/model/commands.test.ts src/app/App.test.tsx --reporter=dot`.
- [x] Run `npm run build`.
- [x] Report exact verification results.
