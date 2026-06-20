import type { Page, PageHeaderSettings, Subpage, Template, ValidationIssue } from "../../core";
import type { EditorTool } from "./TeletextCanvas";
import { ControlPalette } from "./ControlPalette";
import type { CellSelection } from "../state/editorStore";

interface ToolDockProps {
  activeTool: EditorTool;
  disabled: boolean;
  page: Page;
  selection?: CellSelection;
  subpage: Subpage;
  templates: Template[];
  validationIssues: ValidationIssue[];
  onBackgroundSelect: (colourIndex: number) => void;
  onControlSelect: (byte: number) => void;
  onHeaderClockModeChange: (mode: PageHeaderSettings["clockMode"]) => void;
  onMosaicPaint: (sixelMask: number) => void;
  onToolChange: (tool: EditorTool) => void;
}

const MOSAIC_PATTERNS = [
  { label: "Mosaic empty", mask: 0x00 },
  { label: "Mosaic full block", mask: 0x3f },
  { label: "Mosaic left half", mask: 0x15 },
  { label: "Mosaic right half", mask: 0x2a },
  { label: "Mosaic top row", mask: 0x03 },
  { label: "Mosaic bottom row", mask: 0x30 },
  { label: "Mosaic diagonal", mask: 0x25 },
  { label: "Mosaic checker", mask: 0x29 }
];

function selectionLabel(selection?: CellSelection) {
  return selection
    ? `Row ${selection.rowIndex}, column ${selection.column + 1}`
    : "No cell selected";
}

export function ToolDock({
  activeTool,
  disabled,
  page,
  selection,
  subpage,
  templates,
  validationIssues,
  onBackgroundSelect,
  onControlSelect,
  onHeaderClockModeChange,
  onMosaicPaint,
  onToolChange
}: ToolDockProps) {
  const activeTemplate = templates.find((template) => template.id === page.metadata.templateId);
  const dynamicRegionCount = templates.reduce(
    (count, template) =>
      count
      + template.regions.filter((region) => region.kind === "dynamic" || region.kind === "ticker")
        .length,
    0
  );

  return (
    <aside className="tool-dock" aria-label="Tool dock">
      <section>
        <h2>Tools</h2>
        <div className="segmented-control tool-mode-control" aria-label="Editor tool">
          <button
            aria-pressed={activeTool === "text"}
            onClick={() => onToolChange("text")}
            type="button"
          >
            Text
          </button>
          <button
            aria-pressed={activeTool === "mosaic"}
            onClick={() => onToolChange("mosaic")}
            type="button"
          >
            Mosaic
          </button>
        </div>
        <p className="section-note">
          Mosaic mode paints sixels directly on the framebuffer. Use Q W / A S / Z X for keys.
        </p>
      </section>

      <section>
        <h2>Mosaic patterns</h2>
        <div className="mosaic-pattern-grid">
          {MOSAIC_PATTERNS.map((pattern) => (
            <button
              disabled={disabled}
              key={pattern.label}
              onClick={() => onMosaicPaint(pattern.mask)}
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
          ))}
        </div>
      </section>

      <ControlPalette
        activeTool={activeTool}
        disabled={disabled}
        onBackgroundSelect={onBackgroundSelect}
        onControlSelect={onControlSelect}
      />

      <section>
        <h2>X/0 Header</h2>
        <div className="segmented-control" aria-label="X/0 header clock source">
          <button
            aria-pressed={page.metadata.header.clockMode === "local"}
            onClick={() => onHeaderClockModeChange("local")}
            type="button"
          >
            Local machine
          </button>
          <button
            aria-pressed={page.metadata.header.clockMode === "original"}
            onClick={() => onHeaderClockModeChange("original")}
            type="button"
          >
            Original row
          </button>
        </div>
      </section>

      <section>
        <h2>Selection</h2>
        <dl className="inspector-list">
          <div>
            <dt>Page</dt>
            <dd>{page.pageNumber}</dd>
          </div>
          <div>
            <dt>Subpage</dt>
            <dd>{subpage.subcode}</dd>
          </div>
          <div>
            <dt>Template</dt>
            <dd data-testid="active-template-name">
              {activeTemplate?.name ?? "No template applied"}
            </dd>
          </div>
          <div>
            <dt>Cell</dt>
            <dd>{selectionLabel(selection)}</dd>
          </div>
        </dl>
      </section>

      <section>
        <h2>Next tools</h2>
        <div className="future-tool-list">
          <span>DRCS 12x10</span>
          <span>DRCS 6x5</span>
          <span>Palette/CLUT</span>
          <span>{dynamicRegionCount} dynamic regions</span>
          <span>Issues: {validationIssues.length}</span>
        </div>
      </section>
    </aside>
  );
}
