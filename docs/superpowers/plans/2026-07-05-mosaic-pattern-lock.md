# Mosaic Pattern Lock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an explicit Freestyle/preset mosaic paint mode so selected preset patterns stay locked and can be repeated across the current row with Left/Right arrow keys.

**Architecture:** `App` owns the selected mosaic paint mode and passes it to both `ToolDock` and `TeletextCanvas`. `ToolDock` renders mode selection and highlighting; `TeletextCanvas` decides whether pointer/keyboard mosaic actions toggle individual sixels or stamp the selected preset. Existing model commands continue to write standard Level 1 mosaic cells.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, React Testing Library.

## Global Constraints

- Do not commit unless the user explicitly requests a commit.
- Freestyle is the default mosaic paint mode.
- The editor must only return to manual sixel editing when the author explicitly chooses Freestyle.
- Stamped presets must write normal Level 1 teletext mosaic bytes through the existing mosaic paint command path.
- Do not introduce per-sixel colours inside one Level 1 cell.
- Arrow stamping stays on the current row and does not wrap at column 1 or column 40.
- Pressing Right at column 40 or Left at column 1 must not create an extra undo entry.
- Keep existing graphics colour and background controls byte-stream based; do not hide or bypass row control-code state.

---

## File Structure

- Modify `src/app/App.tsx`: define the selected mosaic paint mode type/state, add a coordinate-based preset stamp callback, and pass mode/callback props to `ToolDock` and `TeletextCanvas`.
- Modify `src/app/components/ToolDock.tsx`: export the mosaic preset list/type, render a Freestyle button, make preset buttons select modes even before a cell is selected, stamp the selected cell when one exists, and apply selected state.
- Modify `src/app/components/TeletextCanvas.tsx`: consume selected mosaic paint mode, stamp preset masks on pointer/cell actions, and handle Left/Right arrow repeat stamping.
- Modify `src/app/styles.css`: add selected styling for mosaic mode buttons using existing visual language.
- Modify `src/app/App.test.tsx`: add behavior tests for locked mode selection, Freestyle return, pointer stamping, arrow repeat, and row-edge no-op.

---

### Task 1: Add Mosaic Paint Mode State And UI Selection

**Files:**
- Modify: `src/app/components/ToolDock.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/app/styles.css`
- Test: `src/app/App.test.tsx`

**Interfaces:**
- Produces: `export type MosaicPaintMode = { kind: "freestyle" } | { kind: "preset"; mask: number }`
- Produces: `export const MOSAIC_PATTERNS: Array<{ label: string; mask: number }>`
- Produces prop: `mosaicPaintMode: MosaicPaintMode`
- Produces prop: `onMosaicPaintModeChange: (mode: MosaicPaintMode) => void`
- Consumes: existing `onMosaicPaint: (sixelMask: number) => void` for immediate selected-cell stamping when a preset button is clicked and a cell is selected; preset selection itself must remain available with no selected cell.

- [ ] **Step 1: Write failing tests for mode locking and Freestyle return**

Add these tests near the existing mosaic tests in `src/app/App.test.tsx`:

```tsx
  it("keeps a selected mosaic preset highlighted until Freestyle is chosen", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("tab", { name: "Mosaic" }));

    const freestyle = screen.getByRole("button", { name: "Freestyle" });
    const topRow = screen.getByRole("button", { name: "Mosaic top row" });

    expect(freestyle).toHaveAttribute("aria-pressed", "true");
    expect(topRow).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(topRow);

    expect(topRow).toHaveAttribute("aria-pressed", "true");
    expect(freestyle).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(freestyle);

    expect(freestyle).toHaveAttribute("aria-pressed", "true");
    expect(topRow).toHaveAttribute("aria-pressed", "false");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/app/App.test.tsx`

Expected: FAIL because there is no `Freestyle` button and preset buttons do not expose `aria-pressed` selected state.

- [ ] **Step 3: Add mode type, exported pattern list, and ToolDock props**

In `src/app/components/ToolDock.tsx`, change the mosaic pattern constant and add the mode type:

```tsx
export type MosaicPaintMode =
  | { kind: "freestyle" }
  | { kind: "preset"; mask: number };

export const MOSAIC_PATTERNS = [
  { label: "Mosaic empty", mask: 0x00 },
  { label: "Mosaic full block", mask: 0x3f },
  { label: "Mosaic left half", mask: 0x15 },
  { label: "Mosaic right half", mask: 0x2a },
  { label: "Mosaic top row", mask: 0x03 },
  { label: "Mosaic bottom row", mask: 0x30 },
  { label: "Mosaic diagonal", mask: 0x25 },
  { label: "Mosaic checker", mask: 0x29 }
];
```

Add these props to `ToolDockProps`:

```tsx
  mosaicPaintMode: MosaicPaintMode;
  onMosaicPaintModeChange: (mode: MosaicPaintMode) => void;
```

Destructure the props in `ToolDock`:

```tsx
  mosaicPaintMode,
  onMosaicPaintModeChange,
```

- [ ] **Step 4: Render Freestyle and selectable preset buttons**

Replace the Mosaic patterns section button list in `ToolDock.tsx` with this structure:

```tsx
        <div className="mosaic-pattern-grid">
          <button
            aria-pressed={mosaicPaintMode.kind === "freestyle"}
            className={mosaicPaintMode.kind === "freestyle" ? "active" : ""}
            onClick={() => onMosaicPaintModeChange({ kind: "freestyle" })}
            type="button"
          >
            Freestyle
          </button>
          {MOSAIC_PATTERNS.map((pattern) => {
            const selected = mosaicPaintMode.kind === "preset"
              && mosaicPaintMode.mask === pattern.mask;

            return (
              <button
                aria-pressed={selected}
                className={selected ? "active" : ""}
                key={pattern.label}
                onClick={() => {
                  onMosaicPaintModeChange({ kind: "preset", mask: pattern.mask });

                  if (!disabled) {
                    onMosaicPaint(pattern.mask);
                  }
                }}
                type="button"
              >
                <span
                  aria-hidden="true"
                  className="mosaic-pattern-icon"
                >
                  {Array.from({ length: 6 }, (_, sixelIndex) => (
                    <span
                      className={(pattern.mask & (1 << sixelIndex)) !== 0 ? "sixel-on" : ""}
                      key={sixelIndex}
                    />
                  ))}
                </span>
                {pattern.label}
              </button>
            );
          })}
        </div>
```

This preserves the existing behavior where clicking a preset stamps the selected cell when a cell is selected, while also allowing the author to choose a locked preset before clicking the canvas.

- [ ] **Step 5: Add App state and pass props**

In `src/app/App.tsx`, update the ToolDock import:

```tsx
import {
  ToolDock,
  type MosaicPaintMode,
  type TraceCalibrationPosition,
  type TraceDockStatus
} from "./components/ToolDock";
```

Add state near `mosaicForeground`:

```tsx
  const [mosaicPaintMode, setMosaicPaintMode] =
    useState<MosaicPaintMode>({ kind: "freestyle" });
```

Pass props to `ToolDock`:

```tsx
        mosaicPaintMode={mosaicPaintMode}
        onMosaicPaintModeChange={setMosaicPaintMode}
```

- [ ] **Step 6: Add selected styling**

In `src/app/styles.css`, add this after the `.mosaic-pattern-grid button` block:

```css
.mosaic-pattern-grid button.active,
.mosaic-pattern-grid button[aria-pressed="true"] {
  background: #f2d15c;
  border-color: #f2d15c;
  color: #101214;
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npm test -- src/app/App.test.tsx`

Expected: PASS for the new mode-locking test and all existing App tests.

---

### Task 2: Stamp Locked Presets From Canvas And Grid Cell Clicks

**Files:**
- Modify: `src/app/App.tsx`
- Modify: `src/app/components/TeletextCanvas.tsx`
- Test: `src/app/App.test.tsx`

**Interfaces:**
- Consumes: `MosaicPaintMode` from `ToolDock.tsx`.
- Produces prop: `mosaicPaintMode?: MosaicPaintMode` on `TeletextCanvas`.
- Produces prop: `onMosaicPresetPaint?: (rowIndex: number, column: number, sixelMask: number) => void` on `TeletextCanvas`.

- [ ] **Step 1: Write failing tests for canvas and grid preset stamping**

Add these tests near the existing mosaic tests in `src/app/App.test.tsx`:

```tsx
  it("stamps a locked mosaic preset from a framebuffer click", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("tab", { name: "Mosaic" }));
    fireEvent.click(screen.getByRole("button", { name: "Mosaic top row" }));
    fireEvent.mouseDown(screen.getByRole("img", { name: "PIT framebuffer preview" }), {
      button: 0,
      buttons: 1,
      clientX: 1,
      clientY: 21
    });

    expect(screen.getByRole("gridcell", {
      name: "Row 1, column 1, byte 67"
    })).toBeInTheDocument();
  });

  it("stamps a locked mosaic preset from a grid cell click", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("tab", { name: "Mosaic" }));
    fireEvent.click(screen.getByRole("button", { name: "Mosaic right half" }));
    fireEvent.click(screen.getByRole("gridcell", {
      name: "Row 1, column 2, byte 32"
    }));

    expect(screen.getByRole("gridcell", {
      name: "Row 1, column 2, byte 106"
    })).toBeInTheDocument();
  });
```

`Mosaic top row` mask `0x03` becomes byte `0x43` decimal `67`. `Mosaic right half` mask `0x2a` becomes byte `0x6a` decimal `106`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/app/App.test.tsx`

Expected: FAIL because pointer/cell clicks still use freestyle sixel toggle or selection-only behavior after a preset is selected.

- [ ] **Step 3: Add coordinate-based preset paint callback in App**

In `src/app/App.tsx`, add this function near `commitMosaicPaint`:

```tsx
  function commitMosaicPresetPaint(rowIndex: number, column: number, sixelMask: number) {
    setHistory((currentHistory) =>
      commitEditorHistory(
        currentHistory,
        paintMosaicCommand(
          editor.service.id,
          editor.page.id,
          editor.subpage.id,
          rowIndex,
          column,
          sixelMask,
          mosaicForeground
        )
      )
    );
    setSelection({ rowIndex, column });
  }
```

Pass props to `TeletextCanvas`:

```tsx
            mosaicPaintMode={mosaicPaintMode}
            onMosaicPresetPaint={commitMosaicPresetPaint}
```

- [ ] **Step 4: Add TeletextCanvas props and import type**

In `src/app/components/TeletextCanvas.tsx`, add the type import:

```tsx
import type { MosaicPaintMode } from "./ToolDock";
```

Add props to `TeletextCanvasProps`:

```tsx
  mosaicPaintMode?: MosaicPaintMode;
  onMosaicPresetPaint?: (rowIndex: number, column: number, sixelMask: number) => void;
```

Destructure with default:

```tsx
  mosaicPaintMode = { kind: "freestyle" },
  onMosaicPresetPaint,
```

- [ ] **Step 5: Route pointer edits through preset stamping when locked**

In `TeletextCanvas.tsx`, replace the body of `applyMosaicPointerEdit` with:

```tsx
  function applyMosaicPointerEdit(event: CanvasPointerLikeEvent) {
    const target = hitTestCanvasPointer(event);

    if (!target) {
      return;
    }

    selectCell(target.hit);

    if (activeTool !== "mosaic") {
      return;
    }

    event.preventDefault();

    if (mosaicPaintMode.kind === "preset") {
      onMosaicPresetPaint?.(
        target.hit.rowIndex,
        target.hit.column,
        mosaicPaintMode.mask
      );
      return;
    }

    if (onMosaicSixelEdit) {
      onMosaicSixelEdit(
        target.hit.rowIndex,
        target.hit.column,
        target.sixelIndex,
        operationFromPointerEvent(event)
      );
    }
  }
```

- [ ] **Step 6: Route grid cell clicks through preset stamping when locked**

In the grid cell button `onClick`, replace the current handler with:

```tsx
                onClick={() => {
                  const nextSelection = { rowIndex: row.index, column: cell.column };

                  if (activeTool === "mosaic" && mosaicPaintMode.kind === "preset") {
                    onMosaicPresetPaint?.(row.index, cell.column, mosaicPaintMode.mask);
                    gridRef.current?.focus({ preventScroll: true });
                    return;
                  }

                  selectCell(nextSelection);
                }}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npm test -- src/app/App.test.tsx`

Expected: PASS for canvas/grid preset stamping and all existing App tests.

---

### Task 3: Repeat Locked Presets With Left And Right Arrows

**Files:**
- Modify: `src/app/components/TeletextCanvas.tsx`
- Test: `src/app/App.test.tsx`

**Interfaces:**
- Consumes: `mosaicPaintMode?: MosaicPaintMode`.
- Consumes: `onMosaicPresetPaint?: (rowIndex: number, column: number, sixelMask: number) => void`.

- [ ] **Step 1: Write failing tests for arrow repeat and row-edge no-op**

Add these tests near the existing mosaic tests in `src/app/App.test.tsx`:

```tsx
  it("repeats the locked mosaic preset to the right with ArrowRight", () => {
    render(<App />);
    const grid = screen.getByRole("grid", { name: "40 by 25 teletext grid" });

    fireEvent.click(screen.getByRole("tab", { name: "Mosaic" }));
    fireEvent.click(screen.getByRole("gridcell", {
      name: "Row 1, column 1, byte 32"
    }));
    fireEvent.click(screen.getByRole("button", { name: "Mosaic top row" }));
    fireEvent.keyDown(grid, { key: "ArrowRight" });
    fireEvent.keyDown(grid, { key: "ArrowRight" });

    expect(screen.getByRole("gridcell", {
      name: "Row 1, column 1, byte 67"
    })).toBeInTheDocument();
    expect(screen.getByRole("gridcell", {
      name: "Row 1, column 2, byte 67"
    })).toBeInTheDocument();
    expect(screen.getByRole("gridcell", {
      name: "Row 1, column 3, byte 67"
    })).toBeInTheDocument();
  });

  it("does not wrap locked mosaic preset stamping past the right row edge", () => {
    render(<App />);
    const grid = screen.getByRole("grid", { name: "40 by 25 teletext grid" });

    fireEvent.click(screen.getByRole("tab", { name: "Mosaic" }));
    fireEvent.click(screen.getByRole("gridcell", {
      name: "Row 1, column 40, byte 32"
    }));
    fireEvent.click(screen.getByRole("button", { name: "Mosaic top row" }));
    fireEvent.keyDown(grid, { key: "ArrowRight" });

    expect(screen.getByRole("gridcell", {
      name: "Row 1, column 40, byte 67"
    })).toBeInTheDocument();
    expect(screen.getByRole("gridcell", {
      name: "Row 2, column 1, byte 32"
    })).toBeInTheDocument();
  });

  it("repeats the locked mosaic preset to the left with ArrowLeft", () => {
    render(<App />);
    const grid = screen.getByRole("grid", { name: "40 by 25 teletext grid" });

    fireEvent.click(screen.getByRole("tab", { name: "Mosaic" }));
    fireEvent.click(screen.getByRole("gridcell", {
      name: "Row 1, column 3, byte 32"
    }));
    fireEvent.click(screen.getByRole("button", { name: "Mosaic bottom row" }));
    fireEvent.keyDown(grid, { key: "ArrowLeft" });

    expect(screen.getByRole("gridcell", {
      name: "Row 1, column 3, byte 112"
    })).toBeInTheDocument();
    expect(screen.getByRole("gridcell", {
      name: "Row 1, column 2, byte 112"
    })).toBeInTheDocument();
  });
```

`Mosaic bottom row` mask `0x30` becomes byte `0x70` decimal `112`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/app/App.test.tsx`

Expected: FAIL because ArrowLeft/ArrowRight do not stamp selected presets.

- [ ] **Step 3: Add arrow repeat handler**

In `TeletextCanvas.tsx`, add this helper before the JSX return:

```tsx
  function stampPresetAtSelectionOffset(offset: -1 | 1) {
    if (
      activeTool !== "mosaic"
      || mosaicPaintMode.kind !== "preset"
      || !selection
      || !onMosaicPresetPaint
    ) {
      return false;
    }

    const nextColumn = selection.column + offset;

    if (nextColumn < 0 || nextColumn > 39) {
      return true;
    }

    onMosaicPresetPaint(selection.rowIndex, nextColumn, mosaicPaintMode.mask);
    return true;
  }
```

In the grid `onKeyDown` handler, insert this after the undo/redo handling and before Delete/Backspace handling:

```tsx
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            const handled = stampPresetAtSelectionOffset(event.key === "ArrowRight" ? 1 : -1);

            if (handled) {
              event.preventDefault();
              return;
            }
          }
```

This returns `true` at row edges so browser focus does not move and no extra command is emitted.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/app/App.test.tsx`

Expected: PASS for arrow repeat and row-edge behavior.

---

### Task 4: Final Regression Verification

**Files:**
- Verify: `src/app/App.test.tsx`
- Verify: `src/app/components/ToolDock.tsx`
- Verify: `src/app/components/TeletextCanvas.tsx`
- Verify: `src/app/App.tsx`
- Verify: `src/app/styles.css`

**Interfaces:**
- Consumes all interfaces introduced in Tasks 1-3.
- Produces a verified implementation with no known test regressions.

- [ ] **Step 1: Run focused app tests**

Run: `npm test -- src/app/App.test.tsx`

Expected: PASS, including existing tests for freestyle sixel toggling, colour controls, and mosaic painting.

- [ ] **Step 2: Run full test suite**

Run: `npm test`

Expected: PASS for all non-skipped tests.

- [ ] **Step 3: Inspect changed files**

Run: `git diff -- src/app/App.tsx src/app/components/ToolDock.tsx src/app/components/TeletextCanvas.tsx src/app/styles.css src/app/App.test.tsx docs/superpowers/plans/2026-07-05-mosaic-pattern-lock.md docs/superpowers/specs/2026-07-05-mosaic-pattern-lock-design.md`

Expected: Diff only contains the planned mosaic pattern-lock changes and the already-approved spec/plan documents.

- [ ] **Step 4: Report verification evidence**

Report the exact commands run and whether they passed. Mention any unrelated pre-existing worktree changes separately and do not modify them.
