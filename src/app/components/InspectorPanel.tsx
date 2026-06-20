import type { Page, PageHeaderSettings, Subpage, Template, ValidationIssue } from "../../core";
import type { CellSelection } from "../state/editorStore";

interface InspectorPanelProps {
  page: Page;
  subpage: Subpage;
  templates: Template[];
  validationIssues: ValidationIssue[];
  selection?: CellSelection;
  onHeaderClockModeChange(mode: PageHeaderSettings["clockMode"]): void;
}

export function InspectorPanel({
  page,
  subpage,
  templates,
  validationIssues,
  selection,
  onHeaderClockModeChange
}: InspectorPanelProps) {
  const activeTemplate = templates.find(
    (template) => template.id === page.metadata.templateId
  );
  const dynamicRegionCount = templates.reduce(
    (count, template) =>
      count
      + template.regions.filter((region) => region.kind === "dynamic" || region.kind === "ticker")
        .length,
    0
  );

  return (
    <aside className="inspector" aria-label="Inspector">
      <section>
        <h2>Inspector</h2>
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
            <dt>Selection</dt>
            <dd>
              {selection
                ? `Row ${selection.rowIndex}, column ${selection.column + 1}`
                : "No cell selected"}
            </dd>
          </div>
        </dl>
      </section>

      <section>
        <h2>X/0 Header</h2>
        <dl className="inspector-list">
          <div>
            <dt>Clock source</dt>
            <dd>
              {page.metadata.header.clockMode === "local" ? "Local machine" : "Original row"}
            </dd>
          </div>
        </dl>
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
        <h2>Dynamic Regions</h2>
        <p>{dynamicRegionCount} template regions ready for source bindings.</p>
      </section>

      <section>
        <h2>Validation</h2>
        <p>
          {validationIssues.length === 0
            ? "No export-blocking issues in the current page."
            : `${validationIssues.length} issues need review.`}
        </p>
      </section>
    </aside>
  );
}
