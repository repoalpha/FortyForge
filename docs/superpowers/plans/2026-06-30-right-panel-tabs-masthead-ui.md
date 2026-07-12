# Right Panel Tabs and Masthead UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add tabbed organisation to the right tool dock and move masthead lettering controls into a dedicated, less crowded panel.

**Architecture:** Keep `ToolDock` as the right-side inspector but add local tab state to choose which group is visible. Preserve the existing mosaic paint and masthead stamping callbacks so renderer/model behaviour does not change.

**Tech Stack:** React, TypeScript, Vitest, Testing Library, existing FortyForge component CSS.

---

### Task 1: Add tests for right-panel tabs

**Files:**
- Modify: `src/app/App.test.tsx`

- [ ] **Step 1: Write failing tests**

Add tests that assert:

```tsx
it("groups the right tool dock into tabs and shows masthead controls only on the Masthead tab", () => {
  render(<App />);

  expect(screen.getByRole("tab", { name: "Tools" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("tab", { name: "Masthead" })).toHaveAttribute("aria-selected", "false");
  expect(screen.queryByRole("button", { name: "Stamp PIXELCAST" })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("tab", { name: "Masthead" }));

  expect(screen.getByRole("tab", { name: "Masthead" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("button", { name: "Stamp PIXELCAST" })).toBeEnabled();
  expect(screen.getByRole("option", { name: "CITYNEWS masthead alphabet" })).toBeInTheDocument();
  expect(screen.getByRole("option", { name: "CITYNEWS compact masthead" })).toBeInTheDocument();
});

it("keeps mosaic paint controls on the Mosaic tab", () => {
  render(<App />);

  fireEvent.click(screen.getByRole("tab", { name: "Mosaic" }));

  expect(screen.getByRole("button", { name: "Mosaic full block" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Stamp PIXELCAST" })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Verify red**

Run:

```powershell
npx vitest run src/app/App.test.tsx -t "right tool dock|Mosaic tab" --reporter=dot
```

Expected: fail because `ToolDock` has no tab roles yet and masthead controls are always visible.

### Task 2: Implement tabs in ToolDock

**Files:**
- Modify: `src/app/components/ToolDock.tsx`
- Modify: `src/app/styles.css`

- [ ] **Step 1: Add tab state and tab buttons**

Add a `dockTab` state with values `tools`, `mosaic`, `masthead`, `trace`, and `page`. Render a compact tab strip at the top of `ToolDock` using `role="tablist"` and `role="tab"` buttons.

- [ ] **Step 2: Move sections behind tabs**

Show:

- `Tools`: tool mode selector and selection summary.
- `Mosaic`: mosaic pattern buttons and mosaic-specific palette controls.
- `Masthead`: alphabet/style dropdown, text, row, column, stamp button.
- `Trace`: reference trace controls.
- `Page`: X/0 header, validation/next tools, template/page summary.

Keep all existing callbacks and state values intact.

- [ ] **Step 3: Add small CSS**

Add a compact `.tool-dock-tabs` style that wraps cleanly on laptop widths and a `.tool-dock-panel` spacing style.

- [ ] **Step 4: Verify green**

Run:

```powershell
npx vitest run src/app/App.test.tsx -t "right tool dock|Mosaic tab" --reporter=dot
```

Expected: both new tests pass.

### Task 3: Regression checks

**Files:**
- Existing tests only.

- [ ] **Step 1: Run touched tests**

Run:

```powershell
npm test -- --run src/app/App.test.tsx --reporter=dot
```

Expected: all App tests pass.

- [ ] **Step 2: Run build**

Run:

```powershell
npm run build
```

Expected: TypeScript and Vite build pass.

- [ ] **Step 3: Browser smoke**

Open or reload `http://127.0.0.1:5174/` and verify:

- Right tool dock shows tabs.
- Masthead controls are on the Masthead tab.
- Stamp button remains enabled.
- Default row/column placement still stamps row 1 column 2.
