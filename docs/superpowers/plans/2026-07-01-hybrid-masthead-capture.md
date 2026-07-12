# Hybrid Masthead Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a usable hybrid masthead workflow that copies exact rectangular Level 1 cell blocks, previews them on the canvas, stamps them undoably, and saves them as reusable artwork blocks.

**Architecture:** Add a small core cell-block model and command surface, persist saved artwork blocks at project level, then layer rectangular selection and clipboard state into the React app. The canvas remains renderer-driven; selection and stamp previews are overlays, not renderer output.

**Tech Stack:** TypeScript, React, Vitest, Testing Library, existing FortyForge command/history model.

---

## File Structure

- Modify `src/core/model/types.ts`: add `ArtworkBlock`, `ArtworkBlockCategory`, `CellBlock`, and `CellRectangle` helpers used by both commands and UI.
- Modify `src/core/model/projectFactory.ts`: initialize `artworkBlocks: []`.
- Modify `src/core/model/schema.ts`: default older native projects to `artworkBlocks: []`.
- Modify `src/core/model/commands.ts`: add rectangle normalization, `copyCellsFromRectangle`, `stampCellBlockCommand`, and `saveCellBlockAsArtworkCommand`.
- Modify `src/core/model/commands.test.ts`: add core tests for exact clone, bounds refusal, and artwork persistence.
- Modify `src/core/importers/nativeProject.test.ts`: verify older projects import with an empty artwork library.
- Modify `src/core/index.ts`: export new commands and types through existing barrel exports.
- Modify `src/app/state/editorStore.ts`: keep the existing view model shape; `project.artworkBlocks` is already reachable through `editor.project`.
- Modify `src/app/components/TeletextCanvas.tsx`: add rectangle-selection mode, rectangle overlay, and cell-block ghost preview.
- Modify `src/app/components/TeletextCanvas.test.tsx`: add unit tests for rectangle drag and Escape cancellation.
- Modify `src/app/components/ToolDock.tsx`: add a `Blocks` tab with copy, stamp, save-as-letter, and saved-block list controls.
- Modify `src/app/App.tsx`: own rectangle/clipboard state and wire commands into editor history.
- Modify `src/app/App.test.tsx`: add integration tests for copy, stamp, undo, and save-as-letter.
- Modify `src/app/styles.css`: style rectangle overlay, ghost preview, and compact Blocks panel.

---

### Task 1: Core Cell-Block Model And Commands

**Files:**
- Modify: `src/core/model/types.ts`
- Modify: `src/core/model/commands.ts`
- Modify: `src/core/model/commands.test.ts`
- Modify: `src/core/index.ts`

- [ ] **Step 1: Write failing core tests**

Add these imports in `src/core/model/commands.test.ts`:

```ts
import {
  copyCellsFromRectangle,
  saveCellBlockAsArtworkCommand,
  stampCellBlockCommand
} from "./commands";
```

Add these tests inside `describe("editor commands", () => { ... })`:

```ts
  it("copies a rectangular cell block as cloned cell data", () => {
    const project = createDefaultProject();
    const withMosaic = applyEditorCommand(
      project,
      paintMosaicCommand("service-default", "page-100", "page-100-subpage-0000", 6, 4, 0x3f)
    );
    const withText = applyEditorCommand(
      withMosaic,
      insertTextCommand("service-default", "page-100", "page-100-subpage-0000", 6, 5, "E")
    );

    const block = copyCellsFromRectangle(
      withText,
      "service-default",
      "page-100",
      "page-100-subpage-0000",
      { startRow: 6, startColumn: 4, endRow: 6, endColumn: 5 }
    );

    expect(block).toEqual(expect.objectContaining({ width: 2, height: 1 }));
    expect(block?.cells[0][0].mosaic?.sixelMask).toBe(0x3f);
    expect(block?.cells[0][1].character?.value).toBe("E");

    const sourceCell = withText.services[0].pages[0].subpages[0].rows[6].cells[4];
    expect(block?.cells[0][0]).not.toBe(sourceCell);
  });

  it("stamps a copied cell block exactly and keeps source columns normalized", () => {
    const project = createDefaultProject();
    const withMosaic = applyEditorCommand(
      project,
      paintMosaicCommand("service-default", "page-100", "page-100-subpage-0000", 6, 4, 0x2a)
    );
    const block = copyCellsFromRectangle(
      withMosaic,
      "service-default",
      "page-100",
      "page-100-subpage-0000",
      { startRow: 6, startColumn: 4, endRow: 6, endColumn: 4 }
    );

    if (!block) {
      throw new Error("Expected copied block");
    }

    const stamped = applyEditorCommand(
      withMosaic,
      stampCellBlockCommand(
        "service-default",
        "page-100",
        "page-100-subpage-0000",
        block,
        { rowIndex: 9, column: 10 }
      )
    );
    const target = stamped.services[0].pages[0].subpages[0].rows[9].cells[10];

    expect(target).toEqual(expect.objectContaining({
      column: 10,
      kind: "mosaic",
      byte: 0x6a,
      mosaic: expect.objectContaining({ sixelMask: 0x2a })
    }));
    expect(stamped.services[0].pages[0].subpages[0].rows[6].cells[4].mosaic?.sixelMask)
      .toBe(0x2a);
  });

  it("does not stamp a block outside the 40 by 25 page bounds", () => {
    const project = createDefaultProject();
    const block = {
      width: 2,
      height: 1,
      cells: [[
        { column: 0, kind: "empty" as const, byte: 0x20, annotations: [] },
        { column: 1, kind: "empty" as const, byte: 0x20, annotations: [] }
      ]],
      source: { rowIndex: 1, column: 1 }
    };

    const next = applyEditorCommand(
      project,
      stampCellBlockCommand(
        "service-default",
        "page-100",
        "page-100-subpage-0000",
        block,
        { rowIndex: 1, column: 39 }
      )
    );

    expect(next).toBe(project);
  });

  it("saves a copied cell block as a project artwork block", () => {
    const project = createDefaultProject();
    const block = {
      width: 1,
      height: 1,
      cells: [[
        { column: 0, kind: "empty" as const, byte: 0x20, annotations: [] }
      ]],
      source: { rowIndex: 2, column: 3 }
    };

    const next = applyEditorCommand(
      project,
      saveCellBlockAsArtworkCommand(block, {
        id: "artwork-letter-e",
        name: "CITYNEWS E",
        category: "letter",
        assignedCharacter: "E",
        now: new Date("2026-07-01T00:00:00.000Z")
      })
    );

    expect(next.artworkBlocks).toHaveLength(1);
    expect(next.artworkBlocks[0]).toEqual(expect.objectContaining({
      id: "artwork-letter-e",
      name: "CITYNEWS E",
      category: "letter",
      assignedCharacter: "E",
      width: 1,
      height: 1
    }));
    expect(next.artworkBlocks[0].cells[0][0]).not.toBe(block.cells[0][0]);
  });
```

- [ ] **Step 2: Run core tests and verify they fail**

Run:

```bash
npx vitest run src/core/model/commands.test.ts --reporter verbose
```

Expected: FAIL because `copyCellsFromRectangle`, `stampCellBlockCommand`, `saveCellBlockAsArtworkCommand`, and `Project.artworkBlocks` do not exist yet.

- [ ] **Step 3: Add types**

In `src/core/model/types.ts`, add after `MosaicAlphabet`:

```ts
export type ArtworkBlockCategory = "masthead" | "logo" | "divider" | "letter" | "panel" | "other";

export interface CellBlock {
  width: number;
  height: number;
  cells: Cell[][];
  source: {
    rowIndex: number;
    column: number;
  };
}

export interface ArtworkBlock {
  id: string;
  name: string;
  description?: string;
  category: ArtworkBlockCategory;
  assignedCharacter?: string;
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

In `Project`, add after `mosaicAlphabets: MosaicAlphabet[];`:

```ts
  artworkBlocks: ArtworkBlock[];
```

- [ ] **Step 4: Add core command implementation**

In `src/core/model/commands.ts`, update the type import:

```ts
  ArtworkBlock,
  ArtworkBlockCategory,
  CellBlock,
```

Add this interface near existing command option interfaces:

```ts
export interface SaveCellBlockAsArtworkOptions {
  id?: string;
  name: string;
  description?: string;
  category: ArtworkBlockCategory;
  assignedCharacter?: string;
  now?: Date;
}
```

Add these helpers after `findMutableSubpage`:

```ts
function normalizedRectangle(bounds: CellRectangle) {
  return {
    startRow: Math.min(bounds.startRow, bounds.endRow),
    endRow: Math.max(bounds.startRow, bounds.endRow),
    startColumn: Math.min(bounds.startColumn, bounds.endColumn),
    endColumn: Math.max(bounds.startColumn, bounds.endColumn)
  };
}

function isRectangleInsidePage(bounds: ReturnType<typeof normalizedRectangle>) {
  return (
    bounds.startRow >= 0
    && bounds.startColumn >= 0
    && bounds.endRow < 25
    && bounds.endColumn < 40
  );
}

function cloneCellForColumn(cell: Cell, column: number): Cell {
  return {
    ...structuredClone(cell),
    column
  } as Cell;
}
```

Add these exports before `captureMosaicGlyphCommand`:

```ts
export function copyCellsFromRectangle(
  project: Project,
  serviceId: string,
  pageId: string,
  subpageId: string,
  bounds: CellRectangle
): CellBlock | undefined {
  const rectangle = normalizedRectangle(bounds);

  if (!isRectangleInsidePage(rectangle)) {
    return undefined;
  }

  const subpage = findMutableSubpage(project, serviceId, pageId, subpageId);

  if (!subpage) {
    return undefined;
  }

  const cells: Cell[][] = [];

  for (let rowIndex = rectangle.startRow; rowIndex <= rectangle.endRow; rowIndex += 1) {
    const row = subpage.rows.find((item) => item.index === rowIndex);

    if (!row) {
      return undefined;
    }

    cells.push(
      row.cells
        .slice(rectangle.startColumn, rectangle.endColumn + 1)
        .map((cell, columnOffset) => cloneCellForColumn(cell, columnOffset))
    );
  }

  return {
    width: rectangle.endColumn - rectangle.startColumn + 1,
    height: rectangle.endRow - rectangle.startRow + 1,
    cells,
    source: {
      rowIndex: rectangle.startRow,
      column: rectangle.startColumn
    }
  };
}

export function stampCellBlockCommand(
  serviceId: string,
  pageId: string,
  subpageId: string,
  block: CellBlock,
  target: { rowIndex: number; column: number }
): EditorCommand {
  return {
    id: "stamp-cell-block",
    label: "Stamp cell block",
    apply: (project) => {
      if (
        target.rowIndex < 0
        || target.column < 0
        || target.rowIndex + block.height > 25
        || target.column + block.width > 40
      ) {
        return project;
      }

      const next = cloneProject(project);
      const subpage = findMutableSubpage(next, serviceId, pageId, subpageId);

      if (!subpage) {
        return project;
      }

      for (let rowOffset = 0; rowOffset < block.height; rowOffset += 1) {
        const row = subpage.rows.find((item) => item.index === target.rowIndex + rowOffset);

        if (!row) {
          return project;
        }

        for (let columnOffset = 0; columnOffset < block.width; columnOffset += 1) {
          row.cells[target.column + columnOffset] = cloneCellForColumn(
            block.cells[rowOffset][columnOffset],
            target.column + columnOffset
          );
        }
      }

      return next;
    }
  };
}

export function saveCellBlockAsArtworkCommand(
  block: CellBlock,
  options: SaveCellBlockAsArtworkOptions
): EditorCommand {
  return {
    id: "save-cell-block-as-artwork",
    label: "Save cell block as artwork",
    apply: (project) => {
      const next = cloneProject(project);
      const timestamp = (options.now ?? new Date()).toISOString();
      const artwork: ArtworkBlock = {
        id: options.id ?? `artwork-block-${next.artworkBlocks.length + 1}`,
        name: options.name,
        description: options.description,
        category: options.category,
        assignedCharacter: options.assignedCharacter,
        width: block.width,
        height: block.height,
        cells: block.cells.map((row) =>
          row.map((cell, column) => cloneCellForColumn(cell, column))
        ),
        source: {
          rowIndex: block.source.rowIndex,
          column: block.source.column
        },
        createdAt: timestamp,
        updatedAt: timestamp
      };

      next.artworkBlocks.push(artwork);

      return next;
    }
  };
}
```

- [ ] **Step 5: Export commands**

In `src/core/index.ts`, add to the command export list:

```ts
  copyCellsFromRectangle,
  saveCellBlockAsArtworkCommand,
  stampCellBlockCommand,
```

- [ ] **Step 6: Run core tests and verify they pass**

Run:

```bash
npx vitest run src/core/model/commands.test.ts --reporter verbose
```

Expected: PASS.

---

### Task 2: Persist Artwork Blocks In Projects

**Files:**
- Modify: `src/core/model/projectFactory.ts`
- Modify: `src/core/model/schema.ts`
- Modify: `src/core/importers/nativeProject.test.ts`

- [ ] **Step 1: Write failing native import/default tests**

In `src/core/importers/nativeProject.test.ts`, add:

```ts
  it("defaults missing artwork blocks when importing older native projects", () => {
    const legacyProject = createDefaultProject();

    delete (legacyProject as Partial<typeof legacyProject>).artworkBlocks;

    const imported = importNativeProject(JSON.stringify(legacyProject));

    expect(imported.artworkBlocks).toEqual([]);
  });
```

In `src/core/model/commands.test.ts`, the previous Task 1 save test already asserts default project support through `project.artworkBlocks`.

- [ ] **Step 2: Run import tests and verify failure**

Run:

```bash
npx vitest run src/core/importers/nativeProject.test.ts src/core/model/commands.test.ts --reporter verbose
```

Expected: FAIL because default projects and schema do not yet carry `artworkBlocks`.

- [ ] **Step 3: Add defaults**

In `src/core/model/projectFactory.ts`, add after `mosaicAlphabets: [...]`:

```ts
    artworkBlocks: [],
```

In `src/core/model/schema.ts`, add after `mosaicAlphabets`:

```ts
  artworkBlocks: z.array(z.unknown()).default([]),
```

- [ ] **Step 4: Run persistence tests**

Run:

```bash
npx vitest run src/core/importers/nativeProject.test.ts src/core/model/commands.test.ts --reporter verbose
```

Expected: PASS.

---

### Task 3: Canvas Rectangle Selection And Preview

**Files:**
- Modify: `src/app/components/TeletextCanvas.tsx`
- Modify: `src/app/components/TeletextCanvas.test.tsx`
- Modify: `src/app/components/ToolDock.tsx`
- Modify: `src/app/styles.css`

- [ ] **Step 1: Write failing canvas tests**

In `src/app/components/TeletextCanvas.test.tsx`, add tests using existing render helpers. The test should render `TeletextCanvas` with `activeTool="blocks"`, drag from row 2 column 3 to row 4 column 6, and assert `onRectangleSelect` receives:

```ts
{
  startRow: 2,
  startColumn: 2,
  endRow: 4,
  endColumn: 5
}
```

Also add an Escape test that passes `rectangleSelection` and asserts `onRectangleClear` is called when the access grid receives Escape.

- [ ] **Step 2: Run canvas tests and verify failure**

Run:

```bash
npx vitest run src/app/components/TeletextCanvas.test.tsx --reporter verbose
```

Expected: FAIL because the `blocks` tool and rectangle props do not exist.

- [ ] **Step 3: Extend canvas types and props**

In `src/app/components/TeletextCanvas.tsx`, change:

```ts
export type EditorTool = "text" | "mosaic" | "import-trace";
```

to:

```ts
export type EditorTool = "text" | "mosaic" | "import-trace" | "blocks";
```

Import `CellBlock` and `CellRectangle`:

```ts
import type { Cell, CellBlock, CellRectangle, MosaicSixelOperation, TeletextRow } from "../../core";
```

Add props:

```ts
  blockPreview?: {
    block: CellBlock;
    target: CellSelection;
  };
  rectangleSelection?: CellRectangle;
  onBlockPreviewTargetChange?: (selection: CellSelection) => void;
  onBlockStamp?: (selection: CellSelection) => void;
  onRectangleClear?: () => void;
  onRectangleSelect?: (rectangle: CellRectangle) => void;
```

- [ ] **Step 4: Add rectangle interaction state**

Inside `TeletextCanvas`, add:

```ts
  const rectangleAnchorRef = useRef<CellSelection | undefined>();
```

Add helpers:

```ts
  function rectangleFromCells(first: CellSelection, second: CellSelection): CellRectangle {
    return {
      startRow: first.rowIndex,
      startColumn: first.column,
      endRow: second.rowIndex,
      endColumn: second.column
    };
  }

  function drawRectangleOverlay(
    context: CanvasRenderingContext2D,
    rectangle: CellRectangle,
    colour: string,
    fill = false
  ) {
    const startRow = Math.min(rectangle.startRow, rectangle.endRow);
    const endRow = Math.max(rectangle.startRow, rectangle.endRow);
    const startColumn = Math.min(rectangle.startColumn, rectangle.endColumn);
    const endColumn = Math.max(rectangle.startColumn, rectangle.endColumn);
    const x = startColumn * viewport.cellWidth + 1;
    const y = startRow * viewport.cellHeight + 1;
    const width = (endColumn - startColumn + 1) * viewport.cellWidth - 2;
    const height = (endRow - startRow + 1) * viewport.cellHeight - 2;

    if (fill) {
      context.fillStyle = colour;
      context.fillRect(x, y, width, height);
      return;
    }

    context.strokeStyle = colour;
    context.lineWidth = 2;
    context.strokeRect(x, y, width, height);
  }
```

- [ ] **Step 5: Draw rectangle and preview overlays**

In the drawing effect after the single-cell selection overlay, add:

```ts
    if (rectangleSelection) {
      drawRectangleOverlay(context, rectangleSelection, "#62d6ff");
    }

    if (blockPreview) {
      drawRectangleOverlay(
        context,
        {
          startRow: blockPreview.target.rowIndex,
          startColumn: blockPreview.target.column,
          endRow: blockPreview.target.rowIndex + blockPreview.block.height - 1,
          endColumn: blockPreview.target.column + blockPreview.block.width - 1
        },
        "rgba(98, 214, 255, 0.22)",
        true
      );
      drawRectangleOverlay(
        context,
        {
          startRow: blockPreview.target.rowIndex,
          startColumn: blockPreview.target.column,
          endRow: blockPreview.target.rowIndex + blockPreview.block.height - 1,
          endColumn: blockPreview.target.column + blockPreview.block.width - 1
        },
        "#62d6ff"
      );
    }
```

Update the effect dependency list to include `blockPreview` and `rectangleSelection`.

- [ ] **Step 6: Route pointer events for blocks mode**

In canvas `onClick`, before `selectCell(target.hit)`, add:

```ts
              if (activeTool === "blocks" && blockPreview) {
                onBlockStamp?.(target.hit);
                return;
              }
```

In `onPointerDown`, replace the current first line with:

```ts
            if (activeTool === "blocks") {
              const target = hitTestCanvasPointer(event);

              if (target) {
                rectangleAnchorRef.current = target.hit;
                onRectangleSelect?.(rectangleFromCells(target.hit, target.hit));
                selectCell(target.hit);
              }
              return;
            }

            isPaintingRef.current = activeTool === "mosaic";
```

In `onPointerMove`, add before the painting branch:

```ts
            if (activeTool === "blocks") {
              const target = hitTestCanvasPointer(event);

              if (target && blockPreview) {
                onBlockPreviewTargetChange?.(target.hit);
              }

              if (target && rectangleAnchorRef.current && event.buttons !== 0) {
                onRectangleSelect?.(rectangleFromCells(rectangleAnchorRef.current, target.hit));
              }
              return;
            }
```

In `onPointerUp`, add:

```ts
            rectangleAnchorRef.current = undefined;
```

In the access grid `onKeyDown`, add after undo/redo handling:

```ts
          if (event.key === "Escape" && activeTool === "blocks") {
            event.preventDefault();
            onRectangleClear?.();
            return;
          }
```

- [ ] **Step 7: Add Blocks tool button and minimal styles**

In `src/app/components/ToolDock.tsx`, extend `ToolDockTab` and tab list:

```ts
type ToolDockTab = "tools" | "mosaic" | "masthead" | "blocks" | "trace" | "page";
```

Add `{ id: "blocks", label: "Blocks" },` after Masthead.

Add a Blocks button to the tool segmented control:

```tsx
          <button
            aria-pressed={activeTool === "blocks"}
            onClick={() => onToolChange("blocks")}
            type="button"
          >
            Blocks
          </button>
```

Add effect handling:

```ts
    } else if (activeTool === "blocks") {
      setDockTab("blocks");
```

In `src/app/styles.css`, add:

```css
.block-panel-actions {
  display: grid;
  gap: 0.5rem;
}

.block-preview-meta {
  color: var(--muted-text);
  font-size: 0.85rem;
}
```

- [ ] **Step 8: Run canvas tests**

Run:

```bash
npx vitest run src/app/components/TeletextCanvas.test.tsx --reporter verbose
```

Expected: PASS.

---

### Task 4: App Clipboard, Stamp, And Undo Wiring

**Files:**
- Modify: `src/app/App.tsx`
- Modify: `src/app/components/ToolDock.tsx`
- Modify: `src/app/App.test.tsx`

- [ ] **Step 1: Write failing app integration tests**

In `src/app/App.test.tsx`, add a test that:

1. Opens Blocks mode.
2. Selects a rectangle over a known mosaic cell.
3. Clicks `Copy block`.
4. Clicks a target cell.
5. Clicks or triggers `Stamp copied block`.
6. Asserts the target cell byte matches the copied source.
7. Clicks Undo and asserts the target returns to its prior byte.

Add a second test that presses Escape in Blocks mode and asserts the rectangle dimensions text disappears.

- [ ] **Step 2: Run app tests and verify failure**

Run:

```bash
npx vitest run src/app/App.test.tsx -t "block" --reporter verbose
```

Expected: FAIL because App does not own block clipboard or expose Blocks dock controls yet.

- [ ] **Step 3: Add App state and commit functions**

In `src/app/App.tsx`, import:

```ts
  copyCellsFromRectangle,
  saveCellBlockAsArtworkCommand,
  stampCellBlockCommand,
```

Import types:

```ts
import type { CellBlock, CellRectangle, EditorCommand, PageHeaderSettings, TeletextColourRef, TeletextRow } from "../core";
```

Add state near `selection`:

```ts
  const [rectangleSelection, setRectangleSelection] = useState<CellRectangle | undefined>();
  const [blockClipboard, setBlockClipboard] = useState<CellBlock | undefined>();
  const [blockPreviewTarget, setBlockPreviewTarget] = useState<CellSelection | undefined>();
```

Add helpers after `commitMosaicTextStamp`:

```ts
  function copySelectedBlock() {
    if (!rectangleSelection) {
      return;
    }

    const copied = copyCellsFromRectangle(
      history.present,
      editor.service.id,
      editor.page.id,
      editor.subpage.id,
      rectangleSelection
    );

    setBlockClipboard(copied);
    setBlockPreviewTarget(copied ? {
      rowIndex: copied.source.rowIndex,
      column: copied.source.column
    } : undefined);
  }

  function clearBlockSelection() {
    setRectangleSelection(undefined);
    setBlockPreviewTarget(undefined);
  }

  function commitBlockStamp(target = blockPreviewTarget) {
    if (!blockClipboard || !target) {
      return;
    }

    setHistory((currentHistory) =>
      commitEditorHistory(
        currentHistory,
        stampCellBlockCommand(
          editor.service.id,
          editor.page.id,
          editor.subpage.id,
          blockClipboard,
          target
        )
      )
    );
    setSelection(target);
    setBlockPreviewTarget(target);
  }

  function commitBlockSave(name: string, assignedCharacter?: string) {
    if (!blockClipboard) {
      return;
    }

    setHistory((currentHistory) =>
      commitEditorHistory(
        currentHistory,
        saveCellBlockAsArtworkCommand(blockClipboard, {
          name,
          category: assignedCharacter ? "letter" : "masthead",
          assignedCharacter
        })
      )
    );
  }
```

Pass props into `TeletextCanvas`:

```tsx
            blockPreview={blockClipboard && blockPreviewTarget
              ? { block: blockClipboard, target: blockPreviewTarget }
              : undefined}
            onBlockPreviewTargetChange={setBlockPreviewTarget}
            onBlockStamp={commitBlockStamp}
            onRectangleClear={clearBlockSelection}
            onRectangleSelect={setRectangleSelection}
            rectangleSelection={rectangleSelection}
```

Pass props into `ToolDock`:

```tsx
        artworkBlocks={editor.project.artworkBlocks}
        blockClipboard={blockClipboard}
        rectangleSelection={rectangleSelection}
        onBlockCopy={copySelectedBlock}
        onBlockSave={commitBlockSave}
        onBlockStamp={() => commitBlockStamp()}
        onRectangleClear={clearBlockSelection}
```

- [ ] **Step 4: Add ToolDock Blocks panel props and UI**

In `ToolDockProps`, add:

```ts
  artworkBlocks: ArtworkBlock[];
  blockClipboard?: CellBlock;
  rectangleSelection?: CellRectangle;
  onBlockCopy: () => void;
  onBlockSave: (name: string, assignedCharacter?: string) => void;
  onBlockStamp: () => void;
  onRectangleClear: () => void;
```

Import types:

```ts
  ArtworkBlock,
  CellBlock,
  CellRectangle,
```

Add local state:

```ts
  const [blockName, setBlockName] = useState("Masthead block");
  const [letterCharacter, setLetterCharacter] = useState("");
```

Add helper:

```ts
function rectangleLabel(rectangle?: CellRectangle) {
  if (!rectangle) {
    return "No rectangle selected";
  }

  const startRow = Math.min(rectangle.startRow, rectangle.endRow);
  const endRow = Math.max(rectangle.startRow, rectangle.endRow);
  const startColumn = Math.min(rectangle.startColumn, rectangle.endColumn);
  const endColumn = Math.max(rectangle.startColumn, rectangle.endColumn);

  return `Rows ${startRow}-${endRow}, columns ${startColumn + 1}-${endColumn + 1}`;
}
```

Add panel:

```tsx
      {dockTab === "blocks" ? (
      <section>
        <h2>Blocks</h2>
        <p className="section-note">{rectangleLabel(rectangleSelection)}</p>
        <div className="block-panel-actions">
          <button disabled={!rectangleSelection} onClick={onBlockCopy} type="button">
            Copy block
          </button>
          <button disabled={!blockClipboard} onClick={onBlockStamp} type="button">
            Stamp copied block
          </button>
          <button disabled={!rectangleSelection && !blockClipboard} onClick={onRectangleClear} type="button">
            Clear block selection
          </button>
        </div>
        <p className="block-preview-meta">
          {blockClipboard
            ? `Clipboard: ${blockClipboard.width} by ${blockClipboard.height} cells`
            : "Clipboard empty"}
        </p>
        <label>
          Block name
          <input
            onChange={(event) => setBlockName(event.target.value)}
            type="text"
            value={blockName}
          />
        </label>
        <label>
          Letter
          <input
            aria-label="Assigned letter"
            maxLength={1}
            onChange={(event) => setLetterCharacter(event.target.value.toUpperCase())}
            type="text"
            value={letterCharacter}
          />
        </label>
        <button
          disabled={!blockClipboard || blockName.trim().length === 0}
          onClick={() => onBlockSave(blockName.trim(), letterCharacter || undefined)}
          type="button"
        >
          Save as letter
        </button>
        <h3>Saved blocks</h3>
        <div className="future-tool-list">
          {artworkBlocks.length === 0 ? (
            <span>No saved blocks</span>
          ) : artworkBlocks.map((block) => (
            <span key={block.id}>
              {block.name} {block.assignedCharacter ? `(${block.assignedCharacter})` : ""}
            </span>
          ))}
        </div>
      </section>
      ) : null}
```

- [ ] **Step 5: Run app tests**

Run:

```bash
npx vitest run src/app/App.test.tsx -t "block" --reporter verbose
```

Expected: PASS.

---

### Task 5: Save-As-Letter Persistence And Import Compatibility

**Files:**
- Modify: `src/app/App.test.tsx`
- Modify: `src/core/importers/nativeProject.test.ts`
- Modify: `src/core/exporters/nativeProject.ts` only if the current export drops unknown project fields during tests.

- [ ] **Step 1: Write failing save/import integration test**

In `src/app/App.test.tsx`, add a test that:

1. Creates a copied block.
2. Enters `CITYNEWS E` in Block name.
3. Enters `E` in Assigned letter.
4. Clicks `Save as letter`.
5. Asserts `CITYNEWS E (E)` appears in Saved blocks.

In `src/core/importers/nativeProject.test.ts`, add a test that serializes a default project with one artwork block, imports it, and asserts the block survives with `assignedCharacter: "E"`.

- [ ] **Step 2: Run focused tests and verify failure if persistence is incomplete**

Run:

```bash
npx vitest run src/app/App.test.tsx -t "Save as letter|saved blocks" src/core/importers/nativeProject.test.ts --reporter verbose
```

Expected: PASS if Tasks 2 and 4 fully covered persistence; FAIL only if schema/import wiring needs tighter handling.

- [ ] **Step 3: Fix any persistence gap**

If the import test fails because schema strips or rejects artwork data, keep `artworkBlocks: z.array(z.unknown()).default([])` in `projectSchema`. Do not over-validate nested cell data in this slice; the command tests already validate authored block shape.

- [ ] **Step 4: Re-run save/import tests**

Run:

```bash
npx vitest run src/app/App.test.tsx -t "Save as letter|saved blocks" src/core/importers/nativeProject.test.ts --reporter verbose
```

Expected: PASS.

---

### Task 6: Visual Verification In Browser

**Files:**
- No code changes expected unless visual bugs are found.

- [ ] **Step 1: Start or reuse the dev server**

Run:

```bash
npm run dev -- --host 127.0.0.1
```

Expected: Vite reports a local URL such as `http://127.0.0.1:5173/`.

- [ ] **Step 2: Use Playwright to verify workflow**

Open the app in the browser and perform:

1. Select Blocks tool.
2. Drag a rectangle over a small existing masthead/mosaic area.
3. Click `Copy block`.
4. Move to a different target cell and stamp.
5. Confirm the ghost preview is cell-aligned and the stamped block is legible.
6. Save the block as letter `E`.
7. Confirm the saved block appears in the list.

Capture a screenshot to:

```text
.tmp/hybrid-masthead-blocks-verification.png
```

- [ ] **Step 3: Run final verification suite**

Run:

```bash
npx vitest run src/core/model/commands.test.ts src/core/importers/nativeProject.test.ts src/app/components/TeletextCanvas.test.tsx src/app/App.test.tsx --reporter verbose
npm run build
```

Expected: PASS for all tests and build.

- [ ] **Step 4: Report result**

Summarize:

- The copied block workflow works.
- The target stamp is undoable.
- Saved letter blocks persist in the project.
- The screenshot path for visual verification.

---

## Self-Review Notes

- Spec coverage: The plan covers exact rectangular cell copy, ghost placement, undoable stamp, saved artwork blocks, and save-as-letter. It defers full typed masthead alphabet mapping, matching the approved design roadmap.
- Placeholder scan: No implementation steps depend on undefined future work. Task 5 explicitly handles the only conditional persistence gap.
- Type consistency: The plan consistently uses `CellBlock`, `ArtworkBlock`, `CellRectangle`, `copyCellsFromRectangle`, `stampCellBlockCommand`, and `saveCellBlockAsArtworkCommand`.
