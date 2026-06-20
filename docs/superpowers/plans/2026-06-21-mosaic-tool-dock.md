# Mosaic Tool Dock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the passive right inspector/control split with a Mosaic-first tool dock and implement direct Level 1 sixel painting on the framebuffer.

**Architecture:** Keep the existing project model and renderer. Add a focused mosaic-mask command in core, extend `TeletextCanvas` with sub-cell hit testing, and replace the right-side UI composition with a single active `ToolDock` component.

**Tech Stack:** React, TypeScript, Vite, Vitest, Testing Library, canvas framebuffer renderer.

---

## File Structure

- Modify `src/core/model/commands.ts`: add a single-sixel editing command.
- Modify `src/core/model/commands.test.ts`: cover set, clear, and toggle operations.
- Modify `src/core/index.ts`: export the new command.
- Modify `src/app/components/TeletextCanvas.tsx`: add Mosaic mode pointer and keyboard handling.
- Modify `src/app/components/TeletextCanvas.test.tsx`: cover sub-sixel hit mapping if exported as a helper.
- Create `src/app/components/ToolDock.tsx`: active right-side tool dock, replacing default inspector usage.
- Modify `src/app/App.tsx`: manage active tool state, route mosaic operations, remove default `InspectorPanel`.
- Modify `src/app/App.test.tsx`: cover layout, sixel painting, keyboard editing, X/0 controls, and existing control insertion.
- Modify `src/app/styles.css`: collapse the layout to three columns and style the new dock.
- Modify `docs/technical/renderer-and-pit-integration.md`: record the Mosaic tool direction.

## Task 1: Add Core Sixel Mask Command

**Files:**
- Modify: `src/core/model/commands.ts`
- Modify: `src/core/model/commands.test.ts`
- Modify: `src/core/index.ts`

- [ ] **Step 1: Write failing tests**

Add tests in `src/core/model/commands.test.ts`:

```ts
it("sets, clears, and toggles individual mosaic sixels", () => {
  const project = createDefaultProject();
  const location = ["service-default", "page-100", "page-100-subpage-0000", 5, 4] as const;

  const withTopLeft = applyEditorCommand(
    project,
    editMosaicSixelCommand(...location, 0, "set")
  );
  expect(withTopLeft.services[0].pages[0].subpages[0].rows[5].cells[4]).toEqual(
    expect.objectContaining({
      kind: "mosaic",
      byte: 0x41,
      mosaic: expect.objectContaining({ sixelMask: 0b000001 })
    })
  );

  const withBottomRight = applyEditorCommand(
    withTopLeft,
    editMosaicSixelCommand(...location, 5, "toggle")
  );
  expect(withBottomRight.services[0].pages[0].subpages[0].rows[5].cells[4].mosaic?.sixelMask)
    .toBe(0b100001);

  const clearedTopLeft = applyEditorCommand(
    withBottomRight,
    editMosaicSixelCommand(...location, 0, "clear")
  );
  expect(clearedTopLeft.services[0].pages[0].subpages[0].rows[5].cells[4].mosaic?.sixelMask)
    .toBe(0b100000);
});
```

- [ ] **Step 2: Verify red**

Run: `npm test -- src/core/model/commands.test.ts --run`

Expected: fail because `editMosaicSixelCommand` is not exported.

- [ ] **Step 3: Implement command**

In `commands.ts`, add:

```ts
export type MosaicSixelOperation = "set" | "clear" | "toggle";

export function editMosaicSixelCommand(
  serviceId: string,
  pageId: string,
  subpageId: string,
  rowIndex: number,
  column: number,
  sixelIndex: number,
  operation: MosaicSixelOperation
): EditorCommand {
  const bit = 1 << sixelIndex;

  return {
    id: "edit-mosaic-sixel",
    label: "Edit mosaic sixel",
    apply: (project) => {
      const next = cloneProject(project);
      const row = findMutableRow(next, { serviceId, pageId, subpageId, rowIndex, column });

      if (!row || column < 0 || column >= row.cells.length || sixelIndex < 0 || sixelIndex > 5) {
        return project;
      }

      const current = row.cells[column];
      const currentMask = current.kind === "mosaic" && current.mosaic
        ? current.mosaic.sixelMask
        : current.byte & 0x3f;
      const nextMask = operation === "set"
        ? currentMask | bit
        : operation === "clear"
          ? currentMask & ~bit
          : currentMask ^ bit;

      row.cells[column] = {
        column,
        kind: "mosaic",
        byte: 0x40 | (nextMask & 0x3f),
        mosaic: {
          separated: current.kind === "mosaic" ? current.mosaic?.separated ?? false : false,
          sixelMask: nextMask & 0x3f,
          foreground: current.kind === "mosaic" && current.mosaic
            ? current.mosaic.foreground
            : { palette: "level1", index: 7 },
          background: current.kind === "mosaic" && current.mosaic
            ? current.mosaic.background
            : { palette: "level1", index: 0 }
        },
        annotations: current.annotations ?? []
      };

      return next;
    }
  };
}
```

Export it from `src/core/index.ts`.

- [ ] **Step 4: Verify green**

Run: `npm test -- src/core/model/commands.test.ts --run`

Expected: all tests pass.

## Task 2: Add Canvas Sub-Sixel Painting

**Files:**
- Modify: `src/app/components/TeletextCanvas.tsx`
- Modify: `src/app/components/TeletextCanvas.test.tsx`

- [ ] **Step 1: Write failing helper tests**

Add tests for `sixelIndexFromCellPoint`:

```ts
expect(sixelIndexFromCellPoint(0, 0, 16, 20)).toBe(0);
expect(sixelIndexFromCellPoint(15, 0, 16, 20)).toBe(1);
expect(sixelIndexFromCellPoint(0, 9, 16, 20)).toBe(2);
expect(sixelIndexFromCellPoint(15, 9, 16, 20)).toBe(3);
expect(sixelIndexFromCellPoint(0, 19, 16, 20)).toBe(4);
expect(sixelIndexFromCellPoint(15, 19, 16, 20)).toBe(5);
```

- [ ] **Step 2: Verify red**

Run: `npm test -- src/app/components/TeletextCanvas.test.tsx --run`

Expected: fail because helper does not exist.

- [ ] **Step 3: Implement helper and props**

Add props:

```ts
activeTool: "text" | "mosaic";
onMosaicSixelEdit: (rowIndex: number, column: number, sixelIndex: number, operation: "set" | "clear" | "toggle") => void;
```

Add pointer handling:

```ts
const operation = event.shiftKey ? "toggle" : event.button === 2 ? "clear" : "set";
```

Call `onMosaicSixelEdit` only when `activeTool === "mosaic"`.

- [ ] **Step 4: Verify green**

Run: `npm test -- src/app/components/TeletextCanvas.test.tsx --run`

Expected: all tests pass.

## Task 3: Replace Right Side With Tool Dock

**Files:**
- Create: `src/app/components/ToolDock.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/app/App.test.tsx`
- Modify: `src/app/styles.css`

- [ ] **Step 1: Write failing UI tests**

Add tests:

```ts
expect(screen.queryByRole("complementary", { name: "Inspector" })).not.toBeInTheDocument();
expect(screen.getByRole("complementary", { name: "Tool dock" })).toBeInTheDocument();
expect(screen.getByRole("button", { name: "Mosaic" })).toHaveAttribute("aria-pressed", "true");
```

Add pointer test:

```ts
fireEvent.click(screen.getByRole("button", { name: "Mosaic" }));
fireEvent.pointerDown(canvas, { clientX: 1, clientY: 21, button: 0 });
expect(screen.getByRole("gridcell", { name: "Row 1, column 1, byte 65" })).toBeInTheDocument();
```

- [ ] **Step 2: Verify red**

Run: `npm test -- src/app/App.test.tsx --run`

Expected: fail because `ToolDock` and canvas painting are not wired.

- [ ] **Step 3: Implement ToolDock and layout**

Create `ToolDock.tsx` with:

- Tool mode segmented buttons.
- Mosaic common pattern buttons.
- Foreground graphics controls.
- Background controls.
- X/0 local/original buttons.
- Selection summary.
- Future tool slots labelled DRCS and Palette.

Change CSS grid to:

```css
.app-shell {
  grid-template-columns: 260px minmax(720px, 1fr) 320px;
}
```

Remove `InspectorPanel` from default Studio layout.

- [ ] **Step 4: Verify green**

Run: `npm test -- src/app/App.test.tsx --run`

Expected: all tests pass.

## Task 4: Full Verification And Docs

**Files:**
- Modify: `docs/technical/renderer-and-pit-integration.md`

- [ ] **Step 1: Update docs**

Record that the right side is now an active authoring dock, with Mosaic mode first and DRCS/palette tools later.

- [ ] **Step 2: Run focused tests**

Run: `npm test -- src/core/model/commands.test.ts src/app/components/TeletextCanvas.test.tsx src/app/App.test.tsx --run`

Expected: all selected tests pass.

- [ ] **Step 3: Run full validation**

Run: `npm test -- --run`

Expected: full Vitest suite passes.

Run: `npm run build`

Expected: TypeScript and Vite build pass.

Run: `git diff --check`

Expected: exit code 0.
