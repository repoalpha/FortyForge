# Mosaic Pattern Off State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an explicit inactive Mosaic paint mode so presets can be latched, toggled off, and no mosaic painting occurs until the author activates a mode.

**Architecture:** Keep Mosaic paint state owned by `App` and passed to `ToolDock` and `TeletextCanvas`. Extend the existing discriminated union with `inactive`, then make canvas/grid mosaic handlers no-op for painting unless the active mode is `freestyle` or `preset`.

**Tech Stack:** React, TypeScript, Vitest, Testing Library.

## Global Constraints

- The Mosaic paint mode has three states: inactive, freestyle, and preset.
- Inactive is the initial state.
- Existing teletext data commands remain unchanged. This is an editor interaction state change only.
- The Mosaic tool can be selected without automatically enabling a paint mode.
- Do not commit changes unless the user explicitly requests a commit.

---

## File Structure

- Modify `src/app/components/ToolDock.tsx`: extend `MosaicPaintMode`, render inactive-aware pressed states, and toggle an already-active preset back to inactive.
- Modify `src/app/components/TeletextCanvas.tsx`: keep selection behavior while inactive, but skip sixel toggling, preset stamping, and arrow-repeat stamping unless a paint mode is active.
- Modify `src/app/App.tsx`: initialize Mosaic paint mode to inactive.
- Modify `src/app/App.test.tsx`: update expectations for initial inactive mode and add the preset-toggle-off regression.

### Task 1: Inactive Mosaic Paint Mode

**Files:**
- Modify: `src/app/components/ToolDock.tsx`
- Modify: `src/app/components/TeletextCanvas.tsx`
- Modify: `src/app/App.tsx`
- Test: `src/app/App.test.tsx`

**Interfaces:**
- Consumes: existing `MosaicPaintMode` prop passed from `App` into `ToolDock` and `TeletextCanvas`.
- Produces: `MosaicPaintMode = { kind: "inactive" } | { kind: "freestyle" } | { kind: "preset"; mask: number }`.

- [ ] **Step 1: Write failing tests**

Update the existing preset highlight test in `src/app/App.test.tsx` so `Freestyle` starts inactive after opening the Mosaic tab:

```tsx
it("keeps a selected mosaic preset highlighted until Freestyle is chosen", () => {
  render(<App />);

  fireEvent.click(screen.getByRole("tab", { name: "Mosaic" }));

  const freestyle = screen.getByRole("button", { name: "Freestyle" });
  const topRow = screen.getByRole("button", { name: "Mosaic top row" });

  expect(freestyle).toHaveAttribute("aria-pressed", "false");
  expect(topRow).toHaveAttribute("aria-pressed", "false");

  fireEvent.click(topRow);

  expect(topRow).toHaveAttribute("aria-pressed", "true");
  expect(freestyle).toHaveAttribute("aria-pressed", "false");

  fireEvent.click(freestyle);

  expect(freestyle).toHaveAttribute("aria-pressed", "true");
  expect(topRow).toHaveAttribute("aria-pressed", "false");
});
```

Add this new regression test near the Mosaic preset tests in `src/app/App.test.tsx`:

```tsx
it("turns off a latched mosaic preset when the active preset is clicked again", () => {
  render(<App />);

  fireEvent.click(screen.getByRole("tab", { name: "Mosaic" }));

  const topRow = screen.getByRole("button", { name: "Mosaic top row" });
  fireEvent.click(topRow);
  fireEvent.click(topRow);

  expect(topRow).toHaveAttribute("aria-pressed", "false");
  expect(screen.getByRole("button", { name: "Freestyle" }))
    .toHaveAttribute("aria-pressed", "false");

  fireEvent.click(screen.getByRole("gridcell", {
    name: "Row 1, column 1, byte 32"
  }));

  expect(screen.getByRole("gridcell", {
    name: "Row 1, column 1, byte 32"
  })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- --run src/app/App.test.tsx -t "mosaic preset|Mosaic"`

Expected: at least one failure showing `Freestyle` still starts pressed or the active preset remains pressed after the second click.

- [ ] **Step 3: Implement minimal code**

In `src/app/components/ToolDock.tsx`, change the union to:

```ts
export type MosaicPaintMode =
  | { kind: "inactive" }
  | { kind: "freestyle" }
  | { kind: "preset"; mask: number };
```

Keep the `Freestyle` button active only for `freestyle` and make each preset button toggle off when already selected:

```tsx
<button
  aria-pressed={mosaicPaintMode.kind === "freestyle"}
  className={mosaicPaintMode.kind === "freestyle" ? "active" : ""}
  disabled={disabled}
  onClick={() => onMosaicPaintModeChange({ kind: "freestyle" })}
  type="button"
>
  Freestyle
</button>
```

```tsx
onClick={() => {
  onMosaicPaintModeChange(
    selected ? { kind: "inactive" } : { kind: "preset", mask: pattern.mask }
  );
}}
```

In `src/app/App.tsx`, initialize state as inactive:

```ts
const [mosaicPaintMode, setMosaicPaintMode] =
  useState<MosaicPaintMode>({ kind: "inactive" });
```

In `src/app/components/TeletextCanvas.tsx`, change the default prop to inactive:

```ts
mosaicPaintMode = { kind: "inactive" },
```

Then make `applyMosaicPointerEdit` return after selection when inactive:

```ts
if (mosaicPaintMode.kind === "inactive") {
  return;
}
```

Leave the existing `preset` branch and freestyle sixel edit path unchanged after that guard.

- [ ] **Step 4: Run targeted tests**

Run: `npm test -- --run src/app/App.test.tsx -t "mosaic preset|Mosaic"`

Expected: all selected App tests pass.

- [ ] **Step 5: Run full verification**

Run: `npm test -- --run`

Expected: all tests pass.

- [ ] **Step 6: Review diff**

Run: `git diff -- src/app/App.tsx src/app/components/ToolDock.tsx src/app/components/TeletextCanvas.tsx src/app/App.test.tsx docs/superpowers/specs/2026-07-07-mosaic-pattern-off-state-design.md docs/superpowers/plans/2026-07-07-mosaic-pattern-off-state.md`

Expected: diff only contains the inactive mode behavior, tests, and the spec/plan docs.
