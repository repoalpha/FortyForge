import type { Page, Subpage, Template, ValidationIssue } from "../../core";

interface InspectorPanelProps {
  page: Page;
  subpage: Subpage;
  templates: Template[];
  validationIssues: ValidationIssue[];
}

export function InspectorPanel({
  page,
  subpage,
  templates,
  validationIssues
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
            <dd>{activeTemplate?.name ?? "No template applied"}</dd>
          </div>
        </dl>
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
