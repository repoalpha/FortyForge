# Level 1 Artwork Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first baby-step artwork library: capture a rectangular Level 1 cell block, save it in the project, show it in the right dock, and stamp it back onto editable pages.

**Architecture:** Add `artworkBlocks` as a project-level collection, parallel to custom templates. Core commands own capture, stamp, and delete behavior; React only drives selection state and command dispatch. The canvas gets a rectangle selection overlay and the Tool Dock gets an Artwork panel for save/place/delete workflows.

**Tech Stack:** TypeScript, React, Vitest, Testing Library, existing Pixelcast Studio command/history model.

---

## File Structure

- Modify `src/core/model/types.ts`: add `ArtworkBlock`, `ArtworkBlockCategory`, `CellRectangle`, and `Project.artworkBlocks`.
- Modify `src/core/model/projectFactory.ts`: initialize `artworkBlocks: []`.
- Modify `src/core/model/schema.ts`: accept missing `artworkBlocks` from older native project JSON.
- Modify `src/core/importers/nativeProject.ts`: normalize missing `artworkBlocks` to `[]`.
- Modify `src/core/model/commands.ts`: add capture, stamp, and delete commands.
- Modify `src/core/index.ts`: export new command and type symbols through existing exports.
- Modify `src/core/model/commands.test.ts`: cover core command behavior first.
- Modify `src/core/importers/nativeProject.test.ts`: cover backward-compatible import.
- Modify `src/app/state/editorStore.ts`: expose artwork blocks through the view model.
- Modify `src/app/components/TeletextCanvas.tsx`: support rectangle selection and artwork placement click handling.
- Modify `src/app/components/ToolDock.tsx`: add Artwork mode/panel controls.
- Modify `src/app/App.tsx`: own artwork selection, selected block, capture, stamp, and delete handlers.
- Modify `src/app/App.test.tsx`: cover UI capture, library display, stamping, and undo.
- Modify `src/app/styles.css`: add small selection and artwork panel styles.

---

### Task 1: Add Artwork Types And Project Defaults

**Files:**
- Modify: `src/core/model/types.ts`
- Modify: `src/core/model/projectFactory.ts`
- Modify: `src/core/model/schema.ts`
- Modify: `src/core/importers/nativeProject.ts`
- Test: `src/core/importers/nativeProject.test.ts`

- [ ] **Step 1: Write the failing backward-compatibility test**

Add this test to `src/core/importers/nativeProject.test.ts`:

```ts
import { exportNativeProject } from "../exporters/nativeProject";
import { createDefaultProject } from "../model/projectFactory";
import { importNativeProject } from "./nativeProject";

it("defaults missing artwork blocks when importing older native projects", () => {
  const legacyProject = JSON.parse(exportNativeProject(createDefaultProject()));
  delete legacyProject.artworkBlocks;

  const imported = importNativeProject(JSON.stringify(legacyProject));

  expect(imported.artworkBlocks).toEqual([]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
npm test -- --run src/core/importers/nativeProject.test.ts --reporter=dot
```

Expected: fail because `Project` has no `artworkBlocks` property yet or import returns it as missing.

- [ ] **Step 3: Add artwork model types**

In `src/core/model/types.ts`, add these types near the template types:

```ts
export type ArtworkBlockCategory =
  | "masthead"
  | "logo"
  | "divider"
  | "letter"
  | "panel"
  | "other";

export interface CellRectangle {
  startRow: number;
  startColumn: number;
  endRow: number;
  endColumn: number;
}

export interface ArtworkBlock {
  id: string;
  name: string;
  description: string;
  category: ArtworkBlockCategory;
  width: number;
  height: number;
  cells: Cell[][];
  source?: {
    pageNumber?: string;
    templateId?: string;
    rowIndex: number;
    column: number;
  };
  createdAt: string;
  updatedAt: string;
}
```

Update `Project`:

```ts
export interface Project {
  schemaVersion: "1.0.0";
  appVersion: string;
  metadata: ProjectMetadata;
  services: Service[];
  templates: Template[];
  artworkBlocks: ArtworkBlock[];
  glyphSets: GlyphSet[];
  contentSources: ContentSource[];
  contentSnapshots: ContentSnapshot[];
  exportProfiles: ExportProfile[];
  transmissionProfiles: TransmissionProfile[];
}
```

- [ ] **Step 4: Add the default project collection**

In `src/core/model/projectFactory.ts`, add the collection beside `templates`:

```ts
templates: [],
artworkBlocks: [],
glyphSets: [],
```

- [ ] **Step 5: Update schema and import normalization**

In `src/core/model/schema.ts`, accept an optional collection:

```ts
templates: z.array(z.unknown()),
artworkBlocks: z.array(z.unknown()).optional(),
glyphSets: z.array(z.unknown()),
```

In `src/core/importers/nativeProject.ts`, normalize it before parsing:

```ts
const normalized = {
  ...parsed,
  artworkBlocks: "artworkBlocks" in parsed ? parsed.artworkBlocks : []
};

return projectSchema.parse(normalized) as Project;
```

- [ ] **Step 6: Run the import test**

Run:

```powershell
npm test -- --run src/core/importers/nativeProject.test.ts --reporter=dot
```

Expected: pass.

---

### Task 2: Capture, Stamp, And Delete Artwork Commands

**Files:**
- Modify: `src/core/model/commands.ts`
- Modify: `src/core/index.ts`
- Test: `src/core/model/commands.test.ts`

- [ ] **Step 1: Write failing command tests**

Add imports in `src/core/model/commands.test.ts`:

```ts
import {
  deleteArtworkBlockCommand,
  saveSelectionAsArtworkBlockCommand,
  stampArtworkBlockCommand
} from "./commands";
```

Add these tests:

```ts
it("captures a rectangular Level 1 artwork block from the current subpage", () => {
  const project = applyEditorCommand(
    createDefaultProject(),
    insertTextCommand("service-default", "page-100", "page-100-subpage-0000", 4, 2, "BBC")
  );

  const next = applyEditorCommand(
    project,
    saveSelectionAsArtworkBlockCommand(
      "service-default",
      "page-100",
      "page-100-subpage-0000",
      { startRow: 4, startColumn: 2, endRow: 4, endColumn: 4 },
      { name: "BBC logo", category: "logo" },
      new Date("2026-06-24T00:00:00.000Z")
    )
  );

  expect(next.artworkBlocks).toHaveLength(1);
  expect(next.artworkBlocks[0]).toEqual(expect.objectContaining({
    id: "artwork-block-1",
    name: "BBC logo",
    category: "logo",
    width: 3,
    height: 1
  }));
  expect(next.artworkBlocks[0].cells[0].map((cell) => cell.character?.value)).toEqual([
    "B",
    "B",
    "C"
  ]);
});

it("stamps a saved artwork block exactly onto another page area", () => {
  const project = applyEditorCommand(
    createDefaultProject(),
    insertTextCommand("service-default", "page-100", "page-100-subpage-0000", 4, 2, "BBC")
  );
  const withBlock = applyEditorCommand(
    project,
    saveSelectionAsArtworkBlockCommand(
      "service-default",
      "page-100",
      "page-100-subpage-0000",
      { startRow: 4, startColumn: 2, endRow: 4, endColumn: 4 },
      { name: "BBC logo", category: "logo" },
      new Date("2026-06-24T00:00:00.000Z")
    )
  );

  const next = applyEditorCommand(
    withBlock,
    stampArtworkBlockCommand(
      "service-default",
      "page-100",
      "page-100-subpage-0000",
      "artwork-block-1",
      8,
      10
    )
  );

  const row = next.services[0].pages[0].subpages[0].rows[8];
  expect(row.cells.slice(10, 13).map((cell) => cell.character?.value)).toEqual(["B", "B", "C"]);
  expect(row.cells[10].column).toBe(10);
  expect(row.cells[12].column).toBe(12);
});

it("rejects artwork stamps that would run outside the 40 by 25 grid", () => {
  const project = applyEditorCommand(
    createDefaultProject(),
    insertTextCommand("service-default", "page-100", "page-100-subpage-0000", 4, 2, "BBC")
  );
  const withBlock = applyEditorCommand(
    project,
    saveSelectionAsArtworkBlockCommand(
      "service-default",
      "page-100",
      "page-100-subpage-0000",
      { startRow: 4, startColumn: 2, endRow: 4, endColumn: 4 },
      { name: "BBC logo", category: "logo" },
      new Date("2026-06-24T00:00:00.000Z")
    )
  );

  const next = applyEditorCommand(
    withBlock,
    stampArtworkBlockCommand(
      "service-default",
      "page-100",
      "page-100-subpage-0000",
      "artwork-block-1",
      8,
      38
    )
  );

  expect(next).toBe(withBlock);
});

it("rejects unsupported DRCS cells when capturing artwork blocks", () => {
  const project = createDefaultProject();
  const page = project.services[0].pages[0];
  page.subpages[0].rows[4].cells[2] = {
    column: 2,
    kind: "drcs",
    byte: 0x20,
    drcs: { glyphSetId: "set-1", glyphId: "glyph-1" },
    annotations: []
  };

  const next = applyEditorCommand(
    project,
    saveSelectionAsArtworkBlockCommand(
      "service-default",
      "page-100",
      "page-100-subpage-0000",
      { startRow: 4, startColumn: 2, endRow: 4, endColumn: 2 },
      { name: "Future glyph", category: "other" },
      new Date("2026-06-24T00:00:00.000Z")
    )
  );

  expect(next).toBe(project);
});

it("deletes an artwork block without mutating page content", () => {
  const project = applyEditorCommand(
    createDefaultProject(),
    insertTextCommand("service-default", "page-100", "page-100-subpage-0000", 4, 2, "BBC")
  );
  const withBlock = applyEditorCommand(
    project,
    saveSelectionAsArtworkBlockCommand(
      "service-default",
      "page-100",
      "page-100-subpage-0000",
      { startRow: 4, startColumn: 2, endRow: 4, endColumn: 4 },
      { name: "BBC logo", category: "logo" },
      new Date("2026-06-24T00:00:00.000Z")
    )
  );

  const next = applyEditorCommand(withBlock, deleteArtworkBlockCommand("artwork-block-1"));

  expect(next.artworkBlocks).toEqual([]);
  expect(next.services[0].pages[0].subpages[0].rows[4].cells[2].character?.value).toBe("B");
});
```

- [ ] **Step 2: Run the command tests to verify they fail**

Run:

```powershell
npm test -- --run src/core/model/commands.test.ts --reporter=dot
```

Expected: fail because the artwork commands are not exported yet.

- [ ] **Step 3: Implement helper types and functions in commands**

In `src/core/model/commands.ts`, add imports:

```ts
import type {
  ArtworkBlockCategory,
  CellRectangle,
  // keep existing type imports
} from "./types";
```

Add helper functions near existing helpers:

```ts
const ROW_COUNT = 25;
const COLUMN_COUNT = 40;

function normalizeRectangle(rectangle: CellRectangle): CellRectangle {
  return {
    startRow: Math.min(rectangle.startRow, rectangle.endRow),
    startColumn: Math.min(rectangle.startColumn, rectangle.endColumn),
    endRow: Math.max(rectangle.startRow, rectangle.endRow),
    endColumn: Math.max(rectangle.startColumn, rectangle.endColumn)
  };
}

function rectangleInsideGrid(rectangle: CellRectangle) {
  return rectangle.startRow >= 0
    && rectangle.startColumn >= 0
    && rectangle.endRow < ROW_COUNT
    && rectangle.endColumn < COLUMN_COUNT;
}

function cloneCellForColumn(cell: Cell, column: number): Cell {
  return {
    ...structuredClone(cell),
    column
  } as Cell;
}

function isLevel1ArtworkCell(cell: Cell) {
  return cell.kind === "empty"
    || cell.kind === "character"
    || cell.kind === "control"
    || cell.kind === "mosaic";
}
```

- [ ] **Step 4: Implement capture, stamp, and delete commands**

Add these exports to `src/core/model/commands.ts`:

```ts
export function saveSelectionAsArtworkBlockCommand(
  serviceId: string,
  pageId: string,
  subpageId: string,
  rectangle: CellRectangle,
  metadata: {
    name: string;
    category: ArtworkBlockCategory;
    description?: string;
  },
  now = new Date()
): EditorCommand {
  return {
    id: "save-selection-as-artwork-block",
    label: "Save selection as artwork block",
    apply: (project) => {
      const normalized = normalizeRectangle(rectangle);

      if (!rectangleInsideGrid(normalized)) {
        return project;
      }

      const service = project.services.find((item) => item.id === serviceId);
      const page = service?.pages.find((item) => item.id === pageId);
      const subpage = page?.subpages.find((item) => item.id === subpageId);

      if (!page || !subpage) {
        return project;
      }

      const cells = subpage.rows
        .slice(normalized.startRow, normalized.endRow + 1)
        .map((row) =>
          row.cells
            .slice(normalized.startColumn, normalized.endColumn + 1)
            .map((cell, columnOffset) => cloneCellForColumn(cell, columnOffset))
        );

      if (cells.some((row) => row.some((cell) => !isLevel1ArtworkCell(cell)))) {
        return project;
      }

      const next = cloneProject(project);
      const blockNumber = next.artworkBlocks.length + 1;
      const timestamp = now.toISOString();

      next.artworkBlocks.push({
        id: `artwork-block-${blockNumber}`,
        name: metadata.name.trim() || `Artwork block ${blockNumber}`,
        description: metadata.description ?? "",
        category: metadata.category,
        width: normalized.endColumn - normalized.startColumn + 1,
        height: normalized.endRow - normalized.startRow + 1,
        cells,
        source: {
          pageNumber: page.pageNumber,
          templateId: page.metadata.templateId,
          rowIndex: normalized.startRow,
          column: normalized.startColumn
        },
        createdAt: timestamp,
        updatedAt: timestamp
      });

      return next;
    }
  };
}

export function stampArtworkBlockCommand(
  serviceId: string,
  pageId: string,
  subpageId: string,
  blockId: string,
  targetRow: number,
  targetColumn: number
): EditorCommand {
  return {
    id: "stamp-artwork-block",
    label: "Stamp artwork block",
    apply: (project) => {
      const block = project.artworkBlocks.find((item) => item.id === blockId);

      if (!block || targetRow < 0 || targetColumn < 0) {
        return project;
      }

      if (targetRow + block.height > ROW_COUNT || targetColumn + block.width > COLUMN_COUNT) {
        return project;
      }

      const next = cloneProject(project);
      const service = next.services.find((item) => item.id === serviceId);
      const page = service?.pages.find((item) => item.id === pageId);
      const subpage = page?.subpages.find((item) => item.id === subpageId);

      if (!subpage) {
        return project;
      }

      block.cells.forEach((row, rowOffset) => {
        row.forEach((cell, columnOffset) => {
          const column = targetColumn + columnOffset;
          subpage.rows[targetRow + rowOffset].cells[column] = cloneCellForColumn(cell, column);
        });
      });

      return next;
    }
  };
}

export function deleteArtworkBlockCommand(blockId: string): EditorCommand {
  return {
    id: "delete-artwork-block",
    label: "Delete artwork block",
    apply: (project) => {
      if (!project.artworkBlocks.some((block) => block.id === blockId)) {
        return project;
      }

      const next = cloneProject(project);
      next.artworkBlocks = next.artworkBlocks.filter((block) => block.id !== blockId);

      return next;
    }
  };
}
```

- [ ] **Step 5: Export commands**

In `src/core/index.ts`, add:

```ts
deleteArtworkBlockCommand,
saveSelectionAsArtworkBlockCommand,
stampArtworkBlockCommand,
```

- [ ] **Step 6: Run the command tests**

Run:

```powershell
npm test -- --run src/core/model/commands.test.ts --reporter=dot
```

Expected: pass.

---

### Task 3: Expose Artwork Blocks In The App View Model

**Files:**
- Modify: `src/app/state/editorStore.ts`
- Test: `src/app/App.test.tsx`

- [ ] **Step 1: Add a failing UI-facing expectation**

In the later App tests, the UI will rely on `editor.artworkBlocks`. First make TypeScript prove the view model includes it by updating `EditorViewModel` use sites after adding:

```ts
artworkBlocks: ArtworkBlock[];
```

Run:

```powershell
npm test -- --run src/app/App.test.tsx --reporter=dot
```

Expected: fail until `ArtworkBlock` is imported and returned.

- [ ] **Step 2: Modify the view model**

In `src/app/state/editorStore.ts`, import `ArtworkBlock`:

```ts
ArtworkBlock,
```

Update the interface:

```ts
export interface EditorViewModel {
  project: Project;
  service: Service;
  page: Page;
  subpage: Subpage;
  templates: Template[];
  artworkBlocks: ArtworkBlock[];
  validationIssues: ValidationIssue[];
  packetPreview: PacketPreview;
}
```

Return it from `createEditorViewModel`:

```ts
artworkBlocks: project.artworkBlocks,
```

- [ ] **Step 3: Run affected tests**

Run:

```powershell
npm test -- --run src/app/App.test.tsx src/core/model/commands.test.ts --reporter=dot
```

Expected: pass.

---

### Task 4: Canvas Rectangle Selection And Artwork Placement Hooks

**Files:**
- Modify: `src/app/components/TeletextCanvas.tsx`
- Test: `src/app/components/TeletextCanvas.test.tsx`

- [ ] **Step 1: Write failing component tests for rectangle overlay callbacks**

Add a test in `src/app/components/TeletextCanvas.test.tsx` that renders the canvas with `activeTool="artwork"` and verifies shift-click extends the selection:

```tsx
it("extends artwork rectangle selection with shift click", () => {
  const onArtworkSelectionChange = vi.fn();

  render(
    <TeletextCanvas
      activeTool="artwork"
      artworkSelection={{ startRow: 2, startColumn: 3, endRow: 2, endColumn: 3 }}
      onArtworkSelectionChange={onArtworkSelectionChange}
      onCellDelete={vi.fn()}
      onCellSelect={vi.fn()}
      onTextInput={vi.fn()}
      rows={createRows()}
    />
  );

  fireEvent.click(screen.getByRole("gridcell", { name: "Row 4, column 8, byte 32" }), {
    shiftKey: true
  });

  expect(onArtworkSelectionChange).toHaveBeenCalledWith({
    startRow: 2,
    startColumn: 3,
    endRow: 4,
    endColumn: 7
  });
});
```

Add a test for block placement:

```tsx
it("places selected artwork blocks by clicking the canvas in artwork mode", () => {
  const onArtworkPlace = vi.fn();

  render(
    <TeletextCanvas
      activeTool="artwork"
      artworkPlacementActive
      onArtworkPlace={onArtworkPlace}
      onCellDelete={vi.fn()}
      onCellSelect={vi.fn()}
      onTextInput={vi.fn()}
      rows={createRows()}
    />
  );

  fireEvent.click(screen.getByRole("gridcell", { name: "Row 4, column 8, byte 32" }));

  expect(onArtworkPlace).toHaveBeenCalledWith({ rowIndex: 4, column: 7 });
});
```

- [ ] **Step 2: Run component tests to verify they fail**

Run:

```powershell
npm test -- --run src/app/components/TeletextCanvas.test.tsx --reporter=dot
```

Expected: fail because `artwork` tool and props do not exist yet.

- [ ] **Step 3: Extend TeletextCanvas props**

In `src/app/components/TeletextCanvas.tsx`, change:

```ts
export type EditorTool = "text" | "mosaic" | "import-trace" | "artwork";
```

Import `CellRectangle` from core types and add props:

```ts
artworkPlacementActive?: boolean;
artworkSelection?: CellRectangle;
onArtworkPlace?: (selection: CellSelection) => void;
onArtworkSelectionChange?: (rectangle: CellRectangle) => void;
```

- [ ] **Step 4: Add selection behavior**

Add helper:

```ts
function rectangleFromCells(anchor: CellSelection, focus: CellSelection) {
  return {
    startRow: anchor.rowIndex,
    startColumn: anchor.column,
    endRow: focus.rowIndex,
    endColumn: focus.column
  };
}
```

Update `selectCell` to accept the originating click event for artwork mode:

```ts
function handleCellClick(nextSelection: CellSelection, shiftKey: boolean) {
  if (activeTool === "artwork") {
    if (artworkPlacementActive && onArtworkPlace) {
      onArtworkPlace(nextSelection);
      gridRef.current?.focus({ preventScroll: true });
      return;
    }

    if (shiftKey && artworkSelection && onArtworkSelectionChange) {
      onArtworkSelectionChange(rectangleFromCells({
        rowIndex: artworkSelection.startRow,
        column: artworkSelection.startColumn
      }, nextSelection));
    } else {
      onArtworkSelectionChange?.(rectangleFromCells(nextSelection, nextSelection));
    }
  }

  selectCell(nextSelection);
}
```

Use `handleCellClick` from the canvas click and access-grid button click handlers.

- [ ] **Step 5: Draw rectangle overlay on canvas**

In the drawing effect, after drawing selected cell, add:

```ts
if (artworkSelection) {
  const startRow = Math.min(artworkSelection.startRow, artworkSelection.endRow);
  const endRow = Math.max(artworkSelection.startRow, artworkSelection.endRow);
  const startColumn = Math.min(artworkSelection.startColumn, artworkSelection.endColumn);
  const endColumn = Math.max(artworkSelection.startColumn, artworkSelection.endColumn);

  context.strokeStyle = "#7dd3fc";
  context.lineWidth = 2;
  context.setLineDash([6, 4]);
  context.strokeRect(
    startColumn * viewport.cellWidth + 2,
    startRow * viewport.cellHeight + 2,
    (endColumn - startColumn + 1) * viewport.cellWidth - 4,
    (endRow - startRow + 1) * viewport.cellHeight - 4
  );
  context.setLineDash([]);
}
```

Add `artworkSelection` to the drawing effect dependency list.

- [ ] **Step 6: Run component tests**

Run:

```powershell
npm test -- --run src/app/components/TeletextCanvas.test.tsx --reporter=dot
```

Expected: pass.

---

### Task 5: Artwork Panel In The Right Dock

**Files:**
- Modify: `src/app/components/ToolDock.tsx`
- Modify: `src/app/styles.css`
- Test: `src/app/App.test.tsx`

- [ ] **Step 1: Write failing App test for saving artwork**

Add this test to `src/app/App.test.tsx`:

```tsx
it("saves a selected rectangle as a reusable artwork block", () => {
  render(<App />);
  const grid = screen.getByRole("grid", { name: "40 by 25 teletext grid" });

  fireEvent.click(screen.getByRole("gridcell", { name: "Row 4, column 3, byte 32" }));
  fireEvent.keyDown(grid, { key: "B" });
  fireEvent.keyDown(grid, { key: "B" });
  fireEvent.keyDown(grid, { key: "C" });

  fireEvent.click(screen.getByRole("button", { name: "Artwork" }));
  fireEvent.click(screen.getByRole("gridcell", { name: "Row 4, column 3, byte 66" }));
  fireEvent.click(screen.getByRole("gridcell", { name: "Row 4, column 5, byte 67" }), {
    shiftKey: true
  });
  fireEvent.change(screen.getByLabelText("Artwork block name"), {
    target: { value: "BBC logo" }
  });
  fireEvent.click(screen.getByRole("button", { name: "Save artwork block" }));

  expect(screen.getByText("BBC logo")).toBeInTheDocument();
  expect(screen.getByText("Saved artwork block BBC logo")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the App test to verify it fails**

Run:

```powershell
npm test -- --run src/app/App.test.tsx --testNamePattern "artwork" --reporter=dot
```

Expected: fail because no Artwork tool exists.

- [ ] **Step 3: Add ToolDock props**

In `src/app/components/ToolDock.tsx`, import `ArtworkBlock`, `ArtworkBlockCategory`, and `CellRectangle`. Add props:

```ts
artworkBlocks: ArtworkBlock[];
artworkBlockName: string;
artworkSelection?: CellRectangle;
selectedArtworkBlockId?: string;
onArtworkBlockDelete: (blockId: string) => void;
onArtworkBlockNameChange: (name: string) => void;
onArtworkBlockSelect: (blockId: string) => void;
onArtworkBlockSave: () => void;
```

- [ ] **Step 4: Add the Artwork mode button**

In the tool mode button group, add:

```tsx
<button
  aria-pressed={activeTool === "artwork"}
  onClick={() => onToolChange("artwork")}
  type="button"
>
  Artwork
</button>
```

- [ ] **Step 5: Render the Artwork panel**

Add this branch before the existing mosaic panel branch:

```tsx
{activeTool === "artwork" ? (
  <section className="tool-section">
    <h3>Artwork Library</h3>
    <label>
      Artwork block name
      <input
        onChange={(event) => onArtworkBlockNameChange(event.target.value)}
        value={artworkBlockName}
      />
    </label>
    <button
      disabled={!artworkSelection}
      onClick={onArtworkBlockSave}
      type="button"
    >
      Save artwork block
    </button>
    <p className="section-note">
      {artworkSelection
        ? `Selection R${Math.min(artworkSelection.startRow, artworkSelection.endRow)}-R${Math.max(artworkSelection.startRow, artworkSelection.endRow)}, C${Math.min(artworkSelection.startColumn, artworkSelection.endColumn) + 1}-C${Math.max(artworkSelection.startColumn, artworkSelection.endColumn) + 1}`
        : "Select a rectangle on the canvas."}
    </p>
    <div className="artwork-block-list">
      {artworkBlocks.length === 0 ? (
        <p className="section-note">No artwork blocks saved yet.</p>
      ) : artworkBlocks.map((block) => (
        <div className="artwork-block-item" key={block.id}>
          <button
            aria-pressed={selectedArtworkBlockId === block.id}
            onClick={() => onArtworkBlockSelect(block.id)}
            type="button"
          >
            <span>{block.name}</span>
            <small>{block.width}x{block.height} {block.category}</small>
          </button>
          <button onClick={() => onArtworkBlockDelete(block.id)} type="button">
            Delete {block.name}
          </button>
        </div>
      ))}
    </div>
  </section>
) : null}
```

- [ ] **Step 6: Add small styles**

In `src/app/styles.css`, add:

```css
.artwork-block-list {
  display: grid;
  gap: 0.5rem;
}

.artwork-block-item {
  display: grid;
  gap: 0.35rem;
}

.artwork-block-item button[aria-pressed="true"] {
  outline: 2px solid var(--accent);
}
```

- [ ] **Step 7: Run the App test**

Run:

```powershell
npm test -- --run src/app/App.test.tsx --testNamePattern "artwork" --reporter=dot
```

Expected: still fail until App wiring is added in Task 6.

---

### Task 6: App Wiring For Capture, Stamp, Delete, And Undo

**Files:**
- Modify: `src/app/App.tsx`
- Test: `src/app/App.test.tsx`

- [ ] **Step 1: Add failing App tests for stamping and undo**

Add this test to `src/app/App.test.tsx`:

```tsx
it("stamps a selected artwork block and undoes the stamp with Ctrl+Z", () => {
  render(<App />);
  const grid = screen.getByRole("grid", { name: "40 by 25 teletext grid" });

  fireEvent.click(screen.getByRole("gridcell", { name: "Row 4, column 3, byte 32" }));
  fireEvent.keyDown(grid, { key: "B" });
  fireEvent.keyDown(grid, { key: "B" });
  fireEvent.keyDown(grid, { key: "C" });

  fireEvent.click(screen.getByRole("button", { name: "Artwork" }));
  fireEvent.click(screen.getByRole("gridcell", { name: "Row 4, column 3, byte 66" }));
  fireEvent.click(screen.getByRole("gridcell", { name: "Row 4, column 5, byte 67" }), {
    shiftKey: true
  });
  fireEvent.change(screen.getByLabelText("Artwork block name"), {
    target: { value: "BBC logo" }
  });
  fireEvent.click(screen.getByRole("button", { name: "Save artwork block" }));
  fireEvent.click(screen.getByRole("button", { name: "BBC logo 3x1 logo" }));
  fireEvent.click(screen.getByRole("gridcell", { name: "Row 8, column 10, byte 32" }));

  expect(screen.getByRole("gridcell", { name: "Row 8, column 10, byte 66" }))
    .toHaveTextContent("B");
  expect(screen.getByRole("gridcell", { name: "Row 8, column 12, byte 67" }))
    .toHaveTextContent("C");

  fireEvent.keyDown(grid, { key: "z", ctrlKey: true });

  expect(screen.getByRole("gridcell", { name: "Row 8, column 10, byte 32" }))
    .toHaveTextContent("");
});
```

Add this edge rejection test:

```tsx
it("warns instead of stamping artwork outside the page edge", () => {
  render(<App />);
  const grid = screen.getByRole("grid", { name: "40 by 25 teletext grid" });

  fireEvent.click(screen.getByRole("gridcell", { name: "Row 4, column 3, byte 32" }));
  fireEvent.keyDown(grid, { key: "B" });
  fireEvent.keyDown(grid, { key: "B" });
  fireEvent.keyDown(grid, { key: "C" });

  fireEvent.click(screen.getByRole("button", { name: "Artwork" }));
  fireEvent.click(screen.getByRole("gridcell", { name: "Row 4, column 3, byte 66" }));
  fireEvent.click(screen.getByRole("gridcell", { name: "Row 4, column 5, byte 67" }), {
    shiftKey: true
  });
  fireEvent.change(screen.getByLabelText("Artwork block name"), {
    target: { value: "BBC logo" }
  });
  fireEvent.click(screen.getByRole("button", { name: "Save artwork block" }));
  fireEvent.click(screen.getByRole("button", { name: "BBC logo 3x1 logo" }));
  fireEvent.click(screen.getByRole("gridcell", { name: "Row 8, column 39, byte 32" }));

  expect(screen.getByText("Artwork block does not fit at that position.")).toBeInTheDocument();
  expect(screen.getByRole("gridcell", { name: "Row 8, column 39, byte 32" }))
    .toHaveTextContent("");
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```powershell
npm test -- --run src/app/App.test.tsx --testNamePattern "artwork" --reporter=dot
```

Expected: fail until App imports and handlers exist.

- [ ] **Step 3: Import artwork commands and types**

In `src/app/App.tsx`, import:

```ts
deleteArtworkBlockCommand,
saveSelectionAsArtworkBlockCommand,
stampArtworkBlockCommand,
```

Extend the type import:

```ts
import type {
  ArtworkBlockCategory,
  CellRectangle,
  EditorCommand,
  PageHeaderSettings,
  TeletextColourRef,
  TeletextRow
} from "../core";
```

- [ ] **Step 4: Add App state**

Near existing `useState` calls:

```ts
const [artworkSelection, setArtworkSelection] = useState<CellRectangle>();
const [artworkBlockName, setArtworkBlockName] = useState("Artwork block");
const [selectedArtworkBlockId, setSelectedArtworkBlockId] = useState<string>();
```

- [ ] **Step 5: Add fit helper and handlers**

Add helpers inside `App`:

```ts
function selectedArtworkBlock() {
  return editor.artworkBlocks.find((block) => block.id === selectedArtworkBlockId);
}

function artworkBlockFits(rowIndex: number, column: number) {
  const block = selectedArtworkBlock();

  return Boolean(block)
    && rowIndex + block.height <= 25
    && column + block.width <= 40;
}

function saveArtworkBlock() {
  if (!artworkSelection) {
    return;
  }

  const name = artworkBlockName.trim() || "Artwork block";
  setHistory((currentHistory) =>
    commitEditorHistory(
      currentHistory,
      saveSelectionAsArtworkBlockCommand(
        editor.service.id,
        editor.page.id,
        editor.subpage.id,
        artworkSelection,
        { name, category: "logo" as ArtworkBlockCategory },
        new Date()
      )
    )
  );
  setSaveMessage(`Saved artwork block ${name}`);
}

function stampArtworkBlock(target: CellSelection) {
  const block = selectedArtworkBlock();

  if (!block) {
    return;
  }

  if (!artworkBlockFits(target.rowIndex, target.column)) {
    setSaveMessage("Artwork block does not fit at that position.");
    return;
  }

  setHistory((currentHistory) =>
    commitEditorHistory(
      currentHistory,
      stampArtworkBlockCommand(
        editor.service.id,
        editor.page.id,
        editor.subpage.id,
        block.id,
        target.rowIndex,
        target.column
      )
    )
  );
  setSaveMessage(`Stamped artwork block ${block.name}`);
}

function deleteArtworkBlock(blockId: string) {
  const block = editor.artworkBlocks.find((item) => item.id === blockId);

  setHistory((currentHistory) =>
    commitEditorHistory(currentHistory, deleteArtworkBlockCommand(blockId))
  );

  if (selectedArtworkBlockId === blockId) {
    setSelectedArtworkBlockId(undefined);
  }

  if (block) {
    setSaveMessage(`Deleted artwork block ${block.name}`);
  }
}
```

- [ ] **Step 6: Pass canvas props**

Update `TeletextCanvas` usage:

```tsx
artworkPlacementActive={activeTool === "artwork" && selectedArtworkBlockId !== undefined}
artworkSelection={artworkSelection}
onArtworkPlace={stampArtworkBlock}
onArtworkSelectionChange={setArtworkSelection}
```

- [ ] **Step 7: Pass ToolDock props**

Update `ToolDock` usage:

```tsx
artworkBlocks={editor.artworkBlocks}
artworkBlockName={artworkBlockName}
artworkSelection={artworkSelection}
selectedArtworkBlockId={selectedArtworkBlockId}
onArtworkBlockDelete={deleteArtworkBlock}
onArtworkBlockNameChange={setArtworkBlockName}
onArtworkBlockSave={saveArtworkBlock}
onArtworkBlockSelect={setSelectedArtworkBlockId}
```

- [ ] **Step 8: Run artwork UI tests**

Run:

```powershell
npm test -- --run src/app/App.test.tsx --testNamePattern "artwork" --reporter=dot
```

Expected: pass.

---

### Task 7: Persist Artwork Blocks Through Native Save/Reload

**Files:**
- Modify: `src/app/App.test.tsx`
- Modify: no implementation file if Task 1 and Task 6 already store blocks in the project.

- [ ] **Step 1: Add save/reload coverage**

Extend the existing save/reload App test or add:

```tsx
it("saves and reloads artwork blocks in local project storage", () => {
  render(<App />);
  const grid = screen.getByRole("grid", { name: "40 by 25 teletext grid" });

  fireEvent.click(screen.getByRole("gridcell", { name: "Row 4, column 3, byte 32" }));
  fireEvent.keyDown(grid, { key: "B" });
  fireEvent.keyDown(grid, { key: "B" });
  fireEvent.keyDown(grid, { key: "C" });
  fireEvent.click(screen.getByRole("button", { name: "Artwork" }));
  fireEvent.click(screen.getByRole("gridcell", { name: "Row 4, column 3, byte 66" }));
  fireEvent.click(screen.getByRole("gridcell", { name: "Row 4, column 5, byte 67" }), {
    shiftKey: true
  });
  fireEvent.change(screen.getByLabelText("Artwork block name"), {
    target: { value: "BBC logo" }
  });
  fireEvent.click(screen.getByRole("button", { name: "Save artwork block" }));
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "Artwork" }));

  expect(screen.getByText("BBC logo")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test**

Run:

```powershell
npm test -- --run src/app/App.test.tsx --testNamePattern "artwork|saves and reloads" --reporter=dot
```

Expected: pass. If it fails, update `saveArtworkBlock` to write local storage using `exportNativeProject(nextHistory.present)` in the same pattern as `saveTemplate`.

---

### Task 8: Final Verification

**Files:**
- No code changes unless verification finds failures.

- [ ] **Step 1: Run the full test suite**

Run:

```powershell
npm test -- --run --reporter=dot
```

Expected: all non-skipped tests pass.

- [ ] **Step 2: Run the production build**

Run:

```powershell
npm run build
```

Expected: TypeScript passes and Vite builds successfully.

- [ ] **Step 3: Manual smoke check**

Run the app using the project’s normal dev command:

```powershell
npm run dev
```

Manual check:

- Type `BBC` or paint a small mosaic patch.
- Switch to Artwork.
- Select the patch with click then shift-click.
- Save as `BBC logo`.
- Select `BBC logo`.
- Click a blank area to stamp it.
- Press `Ctrl+Z` and confirm the stamp is undone.
- Save and reload the project, then confirm `BBC logo` remains in the Artwork Library.

Stop the dev server after the check.

---

## Self-Review Notes

- Spec coverage: the plan covers Level 1-only storage, rectangle capture, right-dock listing, exact stamping, off-grid refusal, undo/redo via commands, and native save/reload.
- Deferred roadmap: style alphabets and generated `HAMFAX`/`STEVEFAX` lettering are intentionally excluded from implementation.
- Compatibility: project import defaults missing `artworkBlocks` so older native JSON remains loadable.
