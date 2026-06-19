# Pi-Teletext Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first working Pi-Teletext Editor desktop app with a standards-grounded data model, Level 1/1.5 authoring foundation, validation, preview, templates, and deterministic export/import foundations.

**Architecture:** Use a Tauri + TypeScript app with a UI-independent `src/core` domain package. The React UI consumes core commands, renderer, validation, templates, and import/export adapters. The app stores readable `.pttx` project files and exports compatibility formats.

**Tech Stack:** Tauri, TypeScript, React, Vite, Vitest, Playwright, Rust shell commands for local file access.

---

## File Structure

- Create `package.json`, `tsconfig.json`, `vite.config.ts`, and test config for TypeScript/Vite/Vitest.
- Create `src/core/model` for project, page, row, cell, glyph, and profile types.
- Create `src/core/standards` for ETSI-informed tables and capability metadata.
- Create `src/core/validation` for structured validation rules.
- Create `src/core/render` for Level 1/1.5 render state.
- Create `src/core/templates` for built-in templates.
- Create `src/core/importers` and `src/core/exporters` for `.pttx`, TTI, and packet preview adapters.
- Create `src/app` for React UI, app state, command execution, and desktop workflow.
- Create `src-tauri` with minimal Tauri shell once browser-mode UI and core tests pass.
- Create `tests` or colocated `*.test.ts` files for every core module.

## Task 1: Scaffold The TypeScript App

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `src/app/App.tsx`
- Create: `src/app/main.tsx`
- Create: `src/app/styles.css`
- Create: `src/core/index.ts`

- [ ] **Step 1: Create package scripts and dependencies**

Use this package baseline:

```json
{
  "name": "pi-teletext-editor",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "preview": "vite preview"
  },
  "dependencies": {
    "@vitejs/plugin-react": "^5.0.0",
    "vite": "^7.0.0",
    "typescript": "^5.5.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "lucide-react": "^0.468.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "vitest": "^2.1.0",
    "@testing-library/react": "^16.0.0",
    "@testing-library/jest-dom": "^6.4.0",
    "jsdom": "^25.0.0",
    "playwright": "^1.48.0"
  }
}
```

- [ ] **Step 2: Add minimal app shell**

`src/app/App.tsx` should render the first screen directly: page navigator, teletext canvas shell, inspector, and bottom validation panel. Do not create a marketing landing page.

- [ ] **Step 3: Verify scaffold**

Run:

```powershell
npm install
npm run build
npm run test
```

Expected: build succeeds; test command exits successfully even before tests are added if Vitest finds no test files.

## Task 2: Implement The Core Project Model

**Files:**
- Create: `src/core/model/types.ts`
- Create: `src/core/model/projectFactory.ts`
- Create: `src/core/model/schema.ts`
- Create: `src/core/model/projectFactory.test.ts`
- Modify: `src/core/index.ts`

- [ ] **Step 1: Write model factory tests**

Add tests that create a default project and assert:

```ts
expect(project.schemaVersion).toBe("1.0.0");
expect(project.services[0].pages[0].subpages[0].rows).toHaveLength(25);
expect(project.services[0].pages[0].subpages[0].rows[1].cells).toHaveLength(40);
```

- [ ] **Step 2: Define TypeScript interfaces**

Implement the types from `docs/technical/pi-teletext-editor-technical-design.md`: `Project`, `Service`, `Page`, `Subpage`, `TeletextRow`, `Cell`, `ControlCode`, `EnhancementPacket`, `GlyphSet`, `Template`, `ExportProfile`, and `TransmissionProfile`.

- [ ] **Step 3: Implement `createDefaultProject`**

Create page 100 with one subpage, 25 rows, and 40 cells per row. Empty cells should export as byte `0x20`.

- [ ] **Step 4: Verify**

Run:

```powershell
npm run test -- src/core/model/projectFactory.test.ts
```

Expected: all model factory tests pass.

## Task 3: Add Standards Tables And Control Codes

**Files:**
- Create: `src/core/standards/controlCodes.ts`
- Create: `src/core/standards/levels.ts`
- Create: `src/core/standards/pageAddress.ts`
- Create: `src/core/standards/controlCodes.test.ts`
- Modify: `src/core/index.ts`

- [ ] **Step 1: Write control-code tests**

Assert these codes exist with labels and supported levels:

```ts
expect(getControlCodeByByte(0x01)?.mnemonic).toBe("ALPHA_RED");
expect(getControlCodeByByte(0x11)?.mnemonic).toBe("GRAPHICS_RED");
expect(getControlCodeByByte(0x1e)?.mnemonic).toBe("HOLD_GRAPHICS");
expect(isPresentationLevel("2.5")).toBe(true);
expect(parsePageAddress("100")?.magazine).toBe(1);
```

- [ ] **Step 2: Implement tables**

Include Level 1 colour, graphics, hold/release, background, flash, conceal, double-height, and box controls. Each table entry must include byte, mnemonic, label, category, supported levels, and description.

- [ ] **Step 3: Verify**

Run:

```powershell
npm run test -- src/core/standards/controlCodes.test.ts
```

Expected: all standards tests pass.

## Task 4: Implement Validation Engine

**Files:**
- Create: `src/core/validation/types.ts`
- Create: `src/core/validation/validateProject.ts`
- Create: `src/core/validation/validateProject.test.ts`
- Modify: `src/core/index.ts`

- [ ] **Step 1: Write validation tests**

Cover:

```ts
expect(validateProject(createDefaultProject()).filter(i => i.severity === "error")).toHaveLength(0);
```

Then mutate one row to 41 cells and assert an `error` with scope `row`. Mutate two pages to page `100` and assert a duplicate page `error`.

- [ ] **Step 2: Implement validation**

Rules:

- Rows must contain exactly 40 cells.
- Row indexes must be 0-24.
- Page addresses must parse.
- Page addresses must be unique within a service.
- Glyph pixels must match width * height.
- Export profiles must declare at least one target format.

- [ ] **Step 3: Verify**

Run:

```powershell
npm run test -- src/core/validation/validateProject.test.ts
```

Expected: validation tests pass.

## Task 5: Build Level 1 Render State

**Files:**
- Create: `src/core/render/types.ts`
- Create: `src/core/render/renderLevel1.ts`
- Create: `src/core/render/renderLevel1.test.ts`
- Modify: `src/core/index.ts`

- [ ] **Step 1: Write render tests**

Create a row with `ALPHA_RED`, text `HELLO`, `GRAPHICS_GREEN`, and one mosaic cell. Assert the rendered cells after control codes carry the expected foreground and mode.

- [ ] **Step 2: Implement renderer**

Process each row left-to-right. Control cells update render state and do not draw visible glyphs. Character and mosaic cells use the active state. Default foreground is white, background is black, mode is text, hold graphics is off.

- [ ] **Step 3: Verify**

Run:

```powershell
npm run test -- src/core/render/renderLevel1.test.ts
```

Expected: render tests pass.

## Task 6: Add Templates

**Files:**
- Create: `src/core/templates/builtInTemplates.ts`
- Create: `src/core/templates/applyTemplate.ts`
- Create: `src/core/templates/applyTemplate.test.ts`
- Modify: `src/core/index.ts`

- [ ] **Step 1: Write template tests**

Assert built-in templates include `blank-page`, `index-page`, `article-page`, `weather-page`, `status-display`, `subtitle-newsflash`, `pixel-art-canvas`, and `carousel-page`.

- [ ] **Step 2: Implement template application**

`applyTemplate(project, serviceId, pageId, templateId)` should replace page rows with template rows and keep page address metadata stable.

- [ ] **Step 3: Verify**

Run:

```powershell
npm run test -- src/core/templates/applyTemplate.test.ts
```

Expected: template tests pass.

## Task 7: Add Native Project Import And Export

**Files:**
- Create: `src/core/exporters/nativeProject.ts`
- Create: `src/core/importers/nativeProject.ts`
- Create: `src/core/importers/nativeProject.test.ts`
- Modify: `src/core/index.ts`

- [ ] **Step 1: Write round-trip test**

Create default project, export to JSON, import it, and assert page 100 row/cell counts and metadata are preserved.

- [ ] **Step 2: Implement deterministic JSON export**

Use stable object shape from the model factory. Validate imported schema version is `1.0.0`.

- [ ] **Step 3: Verify**

Run:

```powershell
npm run test -- src/core/importers/nativeProject.test.ts
```

Expected: native project round-trip passes.

## Task 8: Add TTI Export And Import Foundation

**Files:**
- Create: `src/core/exporters/tti.ts`
- Create: `src/core/importers/tti.ts`
- Create: `src/core/importers/tti.test.ts`
- Modify: `src/core/index.ts`

- [ ] **Step 1: Write TTI tests**

Export a default page to TTI and assert output contains page metadata and row lines. Import the exported TTI and assert the first page has 25 rows and 40 cells per row.

- [ ] **Step 2: Implement TTI v1 subset**

Support a documented subset:

- Page number.
- Subpage identifier.
- Output lines for rows 0-24.
- Level 1 cell bytes.
- Warnings for unsupported TTI commands.

- [ ] **Step 3: Verify**

Run:

```powershell
npm run test -- src/core/importers/tti.test.ts
```

Expected: TTI round-trip subset passes with no warnings for default project.

## Task 9: Add Packet Preview Exporter

**Files:**
- Create: `src/core/exporters/packetPreview.ts`
- Create: `src/core/exporters/packetPreview.test.ts`
- Modify: `src/core/index.ts`

- [ ] **Step 1: Write packet preview tests**

Export page 100 and assert each display row packet has two MRAG bytes plus 40 payload bytes.

- [ ] **Step 2: Implement packet preview**

The first version may emit a packet preview object rather than final T42 binary. It must define packet number, magazine, row, MRAG bytes, payload bytes, and whether parity/Hamming coding is final or preview.

- [ ] **Step 3: Verify**

Run:

```powershell
npm run test -- src/core/exporters/packetPreview.test.ts
```

Expected: packet preview tests pass.

## Task 10: Build The Editor UI Skeleton

**Files:**
- Modify: `src/app/App.tsx`
- Create: `src/app/state/editorStore.ts`
- Create: `src/app/components/TeletextCanvas.tsx`
- Create: `src/app/components/PageNavigator.tsx`
- Create: `src/app/components/InspectorPanel.tsx`
- Create: `src/app/components/ValidationPanel.tsx`
- Create: `src/app/components/TemplateLibrary.tsx`
- Modify: `src/app/styles.css`

- [ ] **Step 1: Add UI component tests**

Use React Testing Library to assert the app renders page `100`, a 40-column canvas row, template library labels, and validation issue count.

- [ ] **Step 2: Implement UI**

Implement a three-panel professional editor:

- Left: pages and templates.
- Center: 40x25 teletext canvas.
- Right: inspector and validation.
- Bottom: byte ruler and packet preview panel.

- [ ] **Step 3: Verify**

Run:

```powershell
npm run test
npm run build
```

Expected: all tests pass and app builds.

## Task 11: Add Editing Commands

**Files:**
- Create: `src/core/model/commands.ts`
- Create: `src/core/model/commands.test.ts`
- Modify: `src/app/state/editorStore.ts`
- Modify: `src/app/components/TeletextCanvas.tsx`

- [ ] **Step 1: Write command tests**

Cover `setCell`, `insertText`, `insertControlCode`, `paintMosaic`, `applyTemplate`, `addGlyph`, undo, and redo.

- [ ] **Step 2: Implement immutable commands**

Each command returns a new project state and an inverse command. Preserve row/cell counts after every command.

- [ ] **Step 3: Wire canvas editing**

Clicking a cell selects it. Typing inserts text. Control-code palette inserts selected control codes. Mosaic brush paints selected cells.

- [ ] **Step 4: Verify**

Run:

```powershell
npm run test
npm run build
```

Expected: command and UI tests pass.

## Task 12: Add Glyph Asset Foundation

**Files:**
- Create: `src/core/model/glyphFactory.ts`
- Create: `src/core/model/glyphFactory.test.ts`
- Create: `src/app/components/GlyphAssetPanel.tsx`
- Modify: `src/app/components/InspectorPanel.tsx`
- Modify: `src/core/validation/validateProject.ts`

- [ ] **Step 1: Write glyph tests**

Create glyphs for `12x10x1` and `6x5x4`. Assert dimensions, bits per pixel, and pixel array length validation.

- [ ] **Step 2: Implement glyph factory and panel**

Panel shows glyph sets and allows adding starter sample glyphs. Label clearly that full DRCS drawing is a staged feature while storage and validation are active.

- [ ] **Step 3: Verify**

Run:

```powershell
npm run test
npm run build
```

Expected: glyph tests pass and UI builds.

## Task 13: Add Tauri Desktop Shell

**Files:**
- Create: `src-tauri/tauri.conf.json`
- Create: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/main.rs`
- Modify: `package.json`

- [ ] **Step 1: Add Tauri scripts**

Add:

```json
{
  "tauri": "tauri",
  "tauri:dev": "tauri dev",
  "tauri:build": "tauri build"
}
```

- [ ] **Step 2: Implement shell commands**

Expose commands for open project, save project, save as, and choose export path. File writes must be atomic.

- [ ] **Step 3: Verify**

Run:

```powershell
npm run build
npm run tauri:dev
```

Expected: desktop app opens and displays the editor shell.

## Task 14: Acceptance Test Pass

**Files:**
- Create: `tests/acceptance/basic-authoring.spec.ts`
- Create: `tests/fixtures/sample-level1.pttx`

- [ ] **Step 1: Add acceptance test**

Automate:

- Open app in browser-mode Vite test target.
- Create a page from index template.
- Type text into row 1.
- Insert a colour control code.
- See validation panel report no export-blocking errors.
- Export native project through core exporter.

- [ ] **Step 2: Run all verification**

Run:

```powershell
npm run test
npm run build
```

Expected: all unit and acceptance tests pass; production build succeeds.

## Task 15: Documentation And Release Readiness

**Files:**
- Create: `README.md`
- Create: `docs/usage/getting-started.md`
- Create: `docs/format/native-pttx.md`
- Create: `docs/format/export-profiles.md`
- Modify: `docs/prd/pi-teletext-editor-prd.md`
- Modify: `docs/technical/pi-teletext-editor-technical-design.md`

- [ ] **Step 1: Document how to run**

README includes install, dev, test, build, app purpose, supported v1 scope, and compatibility targets.

- [ ] **Step 2: Document `.pttx`**

Native format doc includes schema root, service/page/subpage layout, row/cell encoding, glyph set shape, and migration policy.

- [ ] **Step 3: Final verification**

Run:

```powershell
npm run test
npm run build
git status --short
```

Expected: tests pass, build passes, and changed files are limited to the app/docs implementation.

## Acceptance Checklist

- [ ] Level 1 page can be created from a built-in template.
- [ ] Editor displays a 40x25 teletext grid with row and byte guides.
- [ ] Control codes can be inserted and inspected.
- [ ] Validation catches row length, duplicate page, unsupported character, and glyph dimension errors.
- [ ] Native `.pttx` export/import round-trips.
- [ ] TTI subset export/import round-trips for supported Level 1 content.
- [ ] Packet preview emits MRAG plus 40-byte payload records.
- [ ] Glyph model stores 12x10 and 6x5 assets.
- [ ] Tauri app opens locally and remains offline-capable.
- [ ] Documentation describes v1 scope, staged enhanced modes, and low-bandwidth profile.
