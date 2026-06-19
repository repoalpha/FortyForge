# Pi-Teletext Editor Technical Design

Date: 2026-06-20
Status: Draft v1 for implementation planning

## Architecture Summary

Pi-Teletext Editor is a Tauri + TypeScript desktop app with a strict separation between:

- Authoring model: readable project data and normalized teletext semantics.
- Renderer: converts project state into edit, preview, debug, and export views.
- Validation engine: detects byte, mode, page, glyph, and export issues.
- Encoders/importers: deterministic adapters for TTI, T42/raw packets, images, and staged legacy formats.
- Desktop shell: local file access, settings, project autosave, and hardware/toolchain integration.

The app should be built as reusable TypeScript packages first, with the Tauri UI consuming those packages. This keeps the renderer, validator, and exporters testable outside the desktop shell and useful for future command-line, server, or AI workflows.

## Proposed Repository Layout

```text
package.json
tsconfig.json
vite.config.ts
src-tauri/
src/
  app/
    App.tsx
    state/
    components/
    screens/
  core/
    model/
    standards/
    validation/
    render/
    importers/
    exporters/
    templates/
    low-bandwidth/
  test-fixtures/
docs/
  prd/
  technical/
  superpowers/plans/
```

The `src/core` package should remain UI-independent. React components should not contain encoder or validation logic.

## Data Model

The native project format is a readable JSON document. JSON is the v1 storage baseline because it is simple, diffable, easy for AI tools to generate safely, and easy to validate with schemas. A compact bundle can be added as an export profile.

### Top-Level Types

```ts
export type PresentationLevel = "1" | "1.5" | "2.5" | "3.5";

export interface Project {
  schemaVersion: "1.0.0";
  appVersion: string;
  metadata: ProjectMetadata;
  services: Service[];
  templates: Template[];
  glyphSets: GlyphSet[];
  exportProfiles: ExportProfile[];
  transmissionProfiles: TransmissionProfile[];
}

export interface ProjectMetadata {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  author: string;
  tags: string[];
  sourceReferences: SourceReference[];
}

export interface Service {
  id: string;
  name: string;
  defaultPresentationLevel: PresentationLevel;
  defaultLanguage: TeletextLanguage;
  pages: Page[];
  navigation: ServiceNavigation;
  settings: ServiceSettings;
}

export interface Page {
  id: string;
  magazine: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  pageNumber: string;
  title: string;
  subpages: Subpage[];
  metadata: PageMetadata;
  links: PageLink[];
}

export interface Subpage {
  id: string;
  subcode: string;
  rows: TeletextRow[];
  enhancementPackets: EnhancementPacket[];
  glyphReferences: GlyphReference[];
  carousel: CarouselSettings;
}
```

### Cell And Row Types

```ts
export interface TeletextRow {
  index: number;
  cells: Cell[];
  locked: boolean;
  label: string;
}

export interface Cell {
  column: number;
  kind: "empty" | "character" | "control" | "mosaic" | "drcs";
  byte: number;
  character?: TeletextCharacter;
  controlCode?: ControlCode;
  mosaic?: MosaicCell;
  drcs?: DrcsCell;
  annotations: CellAnnotation[];
}

export interface ControlCode {
  id: string;
  byte: number;
  mnemonic: string;
  category:
    | "colour"
    | "graphics"
    | "background"
    | "size"
    | "flash"
    | "conceal"
    | "box"
    | "hold"
    | "release"
    | "charset";
  label: string;
  supportedLevels: PresentationLevel[];
  description: string;
}

export interface MosaicCell {
  separated: boolean;
  sixelMask: number;
  foreground: TeletextColourRef;
  background: TeletextColourRef;
}
```

Invariant: `TeletextRow.cells.length` is always 40 for exportable rows. Row 0 may be edited through a header surface, but export adapters own header packet assembly.

### Enhancement And Glyph Types

```ts
export interface EnhancementPacket {
  id: string;
  packetType: "X/26" | "X/27" | "X/28" | "M/29" | "DRCS";
  designationCode: number;
  presentationLevels: PresentationLevel[];
  triplets: EnhancementTriplet[];
  source: "authored" | "imported" | "generated";
}

export interface EnhancementTriplet {
  address: number;
  mode: number;
  data: number;
  label: string;
}

export interface GlyphSet {
  id: string;
  name: string;
  scope: "page" | "service" | "global";
  glyphs: Glyph[];
  source: "authored" | "imported" | "ai-generated";
}

export interface Glyph {
  id: string;
  codePoint: number;
  mode: "12x10x1" | "12x10x2" | "12x10x4" | "6x5x4";
  width: 12 | 6;
  height: 10 | 5;
  bitsPerPixel: 1 | 2 | 4;
  pixels: number[];
}
```

The glyph model intentionally covers Level 2.5-compatible 12x10x1 assets and Level 3.5-oriented higher colour/depth assets. V1 validates and stores these assets even before full glyph editing ships.

## Native Project Format

Native file extension: `.pttx`.

Baseline encoding:

- UTF-8 JSON.
- Stable object keys when saved.
- Schema version in root.
- No binary blobs in v1 JSON. Source images and large derived assets should be referenced by relative path or included only in future container exports.
- IDs use stable UUIDs.
- Dates use ISO 8601.

Project writes should use atomic save:

1. Serialize to temporary file in same directory.
2. Flush.
3. Rename over target file.
4. Keep a recoverable autosave copy.

## Standards Layer

`src/core/standards` owns tables and semantics:

- Character set definitions.
- Level 1 control-code table.
- Colour and palette defaults.
- Presentation-level capability matrix.
- Packet constants and row limits.
- Page number and magazine validation.
- DRCS mode definitions.

This layer should be data-driven where possible. UI code consumes labels and capability metadata from the standards layer.

## Rendering Pipeline

Renderer input: `Subpage`, `RenderOptions`, and standards tables.

Renderer output:

```ts
export interface RenderedPage {
  mode: RenderMode;
  rows: RenderedRow[];
  diagnostics: RenderDiagnostic[];
  activeStateByCell: CellRenderState[][];
}

export type RenderMode =
  | "edit"
  | "preview-level-1"
  | "preview-level-1.5"
  | "preview-level-2.5"
  | "preview-level-3.5"
  | "monochrome"
  | "attribute-debug"
  | "packet-debug";
```

Rendering stages:

1. Normalize rows to 40-cell arrays.
2. Apply Level 1 control-code state left-to-right per row.
3. Apply Level 1.5 enhancement overlays where supported.
4. Reserve hooks for Level 2.5/3.5 X/26, palette, side panel, and DRCS effects.
5. Emit `RenderedPage` for canvas display and validation overlays.

The first renderer can use DOM/CSS grid for edit mode and canvas for exact preview. If performance or visual fidelity suffers, preview can move fully to canvas while edit mode remains DOM-accessible.

## Validation Engine

Validation returns structured issues:

```ts
export interface ValidationIssue {
  id: string;
  severity: "info" | "warning" | "error";
  scope: "project" | "service" | "page" | "subpage" | "row" | "cell" | "export";
  message: string;
  recommendation: string;
  location?: ValidationLocation;
  affectedExportProfiles: string[];
}
```

Validation rules:

- Rows intended for packet export contain exactly 40 bytes.
- Page numbers use valid magazine/page forms and do not collide in a service.
- Subpage identifiers are stable and exportable.
- Cells map to bytes available in selected character sets.
- Control codes are valid for selected presentation level.
- Double-height usage is flagged when the paired row cannot render as intended.
- Enhancement packets are valid for selected presentation level and export profile.
- Glyph dimensions and bits-per-pixel match declared DRCS mode.
- Export profile does not silently drop unsupported features.

## Import And Export Adapters

Adapters share a common interface:

```ts
export interface Importer<TOptions = unknown> {
  id: string;
  label: string;
  extensions: string[];
  import(input: ArrayBuffer | string, options: TOptions): Promise<ImportResult>;
}

export interface Exporter<TOptions = unknown> {
  id: string;
  label: string;
  extensions: string[];
  validate(project: Project, options: TOptions): ValidationIssue[];
  export(project: Project, options: TOptions): Promise<ExportResult>;
}
```

### Native JSON

- Imports and exports `.pttx`.
- Validates schema version and migrates supported older versions.
- Preserves all authoring metadata.

### TTI

Primary compatibility format for VBIT2/wxTED-style workflows.

- Export selected page, selected service, or page set.
- Preserve page number, subpage metadata, row output lines, and supported Level 1/1.5 metadata.
- Import into normalized pages and record source warnings for unsupported commands.
- Keep TTI extensions isolated in adapter-specific mapping tables.

### T42 And Raw Packets

Primary stream bridge for raspi-teletext/vbit-style workflows.

- Encode packet streams as 42-byte packets: MRAG plus 40 transmitted data bytes.
- Packet encoder owns parity and Hamming coding.
- Export can target single page packet preview or service stream.
- Import decodes as a receiver would, reconstructing pages where possible.

### Images

- PNG export for still review.
- Animated GIF export for carousel/subpage preview after the core renderer is stable.
- Image export uses the same renderer as preview to prevent drift.

### EP1/TTX

- Staged compatibility adapters.
- EP1 is treated as legacy/proprietary and warning-rich.
- TTX support follows documented CebraText/compatible conventions once test fixtures exist.

## Low-Bandwidth Transmission Profile

The low-bandwidth profile is a documented export model in v1. A disabled UI can show projected payload size before the real transport exporter exists.

```ts
export interface TransmissionProfile {
  id: string;
  name: string;
  kind: "broadcast" | "packet-stream" | "low-bandwidth-delta";
  maxPayloadBytes: number;
  supportsDelta: boolean;
  supportsCompression: boolean;
  integrity: "crc32" | "sha256";
  scheduling: "manual" | "carousel" | "priority";
}
```

Low-bandwidth bundle model:

- Manifest: service ID, page IDs, schema version, dependency graph, and content hashes.
- Payload chunks: compressed pages, row deltas, packet deltas, glyph deltas, or template references.
- Integrity: per-chunk checksum plus manifest hash.
- Scheduling hints: priority, repeat interval, expiry, and criticality.

The editor should estimate bytes and allow authors to choose between full-page update, row-delta update, and packet-delta update during design.

## UI Structure

Primary screen regions:

- Top bar: project title, save state, preview level, export button.
- Left sidebar: service/page/subpage navigator and template library.
- Center: teletext canvas with edit/preview/debug view toggle.
- Right inspector: selection properties, control-code inspector, validation, glyph assets.
- Bottom panel: row byte ruler, packet preview, export warnings, command palette.

Keyboard should be first-class:

- Arrow keys move cursor.
- Shift+arrow selects.
- Ctrl/Cmd+C, X, V copy/cut/paste rectangular regions.
- Insert toggles insert/overwrite.
- Shortcuts insert common control codes.
- Command palette exposes every action.

## State Management

Use a command-based editing model:

```ts
export interface EditorCommand {
  id: string;
  label: string;
  apply(project: Project): Project;
  invert(project: Project): Project;
}
```

Commands make undo/redo reliable, enable collaboration later, and give AI tools a safe mutation surface. Initial commands:

- `setCell`
- `insertText`
- `insertControlCode`
- `paintMosaic`
- `clearSelection`
- `moveSelection`
- `createPage`
- `createSubpage`
- `applyTemplate`
- `addGlyph`
- `setExportProfile`

## Testing Strategy

Core tests should run without Tauri.

- Unit tests for standards tables and control-code state transitions.
- Unit tests for project schema validation and migrations.
- Unit tests for row byte validation.
- Round-trip tests for native JSON.
- TTI import/export fixture tests.
- Packet encoder tests for known MRAG/row output.
- Renderer snapshot tests for Level 1/1.5 pages.
- UI tests for basic edit flow, selection, validation panel, and export dialog.

Recommended tools:

- Vitest for core and UI unit tests.
- Playwright for app-level UI tests in browser mode before Tauri packaging.
- Rust/Tauri tests only for shell commands and file operations.

## AI-Assisted Workflows

AI should interact through the project model and command API, not raw UI automation first.

Supported AI surfaces:

- Generate page from template and content brief.
- Suggest row-safe copy edits.
- Convert content into teletext-safe text and mosaics.
- Propose layout regions.
- Convert images into mosaic/DRCS draft assets.
- Explain validation warnings and offer fixes.

Every AI-generated change should carry provenance metadata:

```ts
export interface SourceReference {
  kind: "user" | "import" | "ai" | "external";
  label: string;
  uri: string;
  capturedAt: string;
}
```

## Build And Packaging

Development:

```powershell
npm install
npm run dev
npm run test
npm run build
```

Packaging:

```powershell
npm run tauri dev
npm run tauri build
```

The implementation should delay installer polish until core authoring, validation, and export paths pass acceptance tests.

## Risks And Mitigations

- Risk: Level 2.5/3.5 scope overwhelms v1.
  Mitigation: represent enhanced data in model and validation first, ship editing features in staged slices.
- Risk: UI hides byte-level reality.
  Mitigation: permanent byte ruler, packet preview, and control-code inspector.
- Risk: Export drift from preview.
  Mitigation: renderer and exporter share normalized row/control state.
- Risk: Legacy file formats vary by tool.
  Mitigation: adapter-specific fixtures, warning-rich imports, and documented loss points.
- Risk: AI writes invalid pages.
  Mitigation: command API, schema validation, and export blockers for invalid states.

## Milestones

1. Foundation: project scaffold, core model, schema validation, sample project fixture.
2. Level 1 editor: 40x25 grid, text editing, control-code table, renderer, validation.
3. Templates and service management: page/subpage navigator, built-in templates, undo/redo.
4. Export/import: native JSON, TTI, PNG, packet preview.
5. Level 1.5 and enhanced foundations: enhancement packet model, basic Level 1.5 validation, glyph asset storage.
6. Toolchain integration: VBIT2/raspi-teletext export presets and local command hooks.
7. Low-bandwidth simulation: payload estimator and bundle manifest prototype.
