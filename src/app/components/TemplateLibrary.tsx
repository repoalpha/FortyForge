import { useMemo, useState } from "react";

import type {
  CellRectangle,
  ContentSourceKind,
  Template,
  TemplateBlockKind,
  TemplateRegion
} from "../../core";

interface TemplateLibraryProps {
  templates: Template[];
  rectangleSelection?: CellRectangle;
  onTemplateApply: (templateId: string) => void;
  onTemplateDelete?: (templateId: string) => void;
  onTemplateExport?: (templateId: string) => void;
  onTemplateImport?: (file: File) => void;
  onTemplateRegionAdd?: (templateId: string, region: TemplateRegion) => void;
}

function isCustomTemplate(template: Template) {
  return template.id.startsWith("custom-template-");
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "content";
}

export function TemplateLibrary({
  templates,
  rectangleSelection,
  onTemplateApply,
  onTemplateDelete,
  onTemplateExport,
  onTemplateImport,
  onTemplateRegionAdd
}: TemplateLibraryProps) {
  const [deleteTemplateId, setDeleteTemplateId] = useState<string>();
  const [designerTemplateId, setDesignerTemplateId] = useState("");
  const [slotLabel, setSlotLabel] = useState("Main content");
  const [blockKind, setBlockKind] = useState<TemplateBlockKind>("text");
  const [contentKind, setContentKind] = useState<ContentSourceKind>("manual");
  const [attributionRequired, setAttributionRequired] = useState(false);
  const deleteTemplate = templates.find((template) => template.id === deleteTemplateId);
  const customTemplates = templates.filter(isCustomTemplate);
  const builtInTemplates = templates.filter((template) => !isCustomTemplate(template));
  const designerTemplate = customTemplates.find((template) => template.id === designerTemplateId)
    ?? customTemplates.at(-1);
  const fit = useMemo(() => {
    if (!rectangleSelection) return undefined;
    const rows = rectangleSelection.endRow - rectangleSelection.startRow + 1;
    const columns = rectangleSelection.endColumn - rectangleSelection.startColumn + 1;
    return { rows, columns, cells: rows * columns };
  }, [rectangleSelection]);

  function templateButton(template: Template) {
    return (
      <div className="template-entry" key={template.id}>
        <button
          className="template-apply"
          onClick={() => onTemplateApply(template.id)}
          onContextMenu={(event) => {
            if (!isCustomTemplate(template)) {
              setDeleteTemplateId(undefined);
              return;
            }
            event.preventDefault();
            setDeleteTemplateId(template.id);
          }}
          title={`${template.description} · v${template.templateVersion}`}
          type="button"
        >
          <span>{template.name}</span>
          <small aria-hidden="true">
            {isCustomTemplate(template) ? "SAVED" : template.category} · {template.regions.length} slots
          </small>
        </button>
        {isCustomTemplate(template) && onTemplateExport ? (
          <button
            aria-label={`Export ${template.name} to disk`}
            className="template-export"
            onClick={() => onTemplateExport(template.id)}
            title="Download portable .pixelcast-template file"
            type="button"
          >
            Export
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <section>
      <h2>Templates</h2>
      {onTemplateImport ? (
        <label className="template-import">
          Import template from disk
          <input
            accept=".pixelcast-template,application/zip"
            aria-label="Import Pixelcast template file"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onTemplateImport(file);
              event.target.value = "";
            }}
            type="file"
          />
        </label>
      ) : null}
      <h3 className="template-library-heading">Saved templates</h3>
      <div aria-label="Saved templates" className="template-list template-list-saved">
        {customTemplates.length > 0
          ? customTemplates.map(templateButton)
          : <p className="section-note">No saved templates yet.</p>}
      </div>
      <h3 className="template-library-heading">Built-in templates</h3>
      <div aria-label="Built-in templates" className="template-list">
        {builtInTemplates.map(templateButton)}
      </div>

      {customTemplates.length > 0 && onTemplateRegionAdd ? (
        <div className="template-designer" aria-label="Template slot designer">
          <h3>Template workbench</h3>
          <label>
            Template
            <select value={designerTemplate?.id ?? ""} onChange={(event) => setDesignerTemplateId(event.target.value)}>
              {customTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
            </select>
          </label>
          <label>
            Slot name
            <input value={slotLabel} onChange={(event) => setSlotLabel(event.target.value)} />
          </label>
          <label>
            Block
            <select value={blockKind} onChange={(event) => setBlockKind(event.target.value as TemplateBlockKind)}>
              {(["text", "headline-list", "story", "key-value-table", "schedule", "weather", "ticker", "attribution"] as const)
                .map((kind) => <option key={kind} value={kind}>{kind}</option>)}
            </select>
          </label>
          <label>
            Content
            <select value={contentKind} onChange={(event) => setContentKind(event.target.value as ContentSourceKind)}>
              {(["manual", "rss", "atom", "weather", "json", "csv", "text"] as const)
                .map((kind) => <option key={kind} value={kind}>{kind}</option>)}
            </select>
          </label>
          <label className="template-check">
            <input checked={attributionRequired} onChange={(event) => setAttributionRequired(event.target.checked)} type="checkbox" />
            Require attribution
          </label>
          <p className="template-fit">
            {fit ? `${fit.rows} rows × ${fit.columns} columns · ${fit.cells} writable cells` : "Select a rectangle with the Blocks tool."}
          </p>
          <button
            disabled={!designerTemplate || !rectangleSelection}
            onClick={() => {
              if (!designerTemplate || !rectangleSelection) return;
              const id = `${slug(slotLabel)}-${designerTemplate.regions.length + 1}`;
              onTemplateRegionAdd(designerTemplate.id, {
                id,
                label: slotLabel,
                bounds: structuredClone(rectangleSelection),
                kind: blockKind === "ticker" ? "ticker" : "dynamic",
                acceptedContentKinds: [contentKind],
                lockedControlCodes: true,
                overflowPolicy: blockKind === "story" ? "add-subpage" : "wrap",
                fallbackText: "Content unavailable",
                blockKind,
                characterPolicy: "level1-replace",
                attributionRequired
              });
            }}
            type="button"
          >
            Create slot from selection
          </button>
          {designerTemplate ? <small>v{designerTemplate.templateVersion} · {designerTemplate.regions.length} slots</small> : null}
        </div>
      ) : null}

      {deleteTemplate && isCustomTemplate(deleteTemplate) && onTemplateDelete ? (
        <button
          className="template-delete"
          onClick={() => {
            onTemplateDelete(deleteTemplate.id);
            setDeleteTemplateId(undefined);
          }}
          type="button"
        >
          Delete {deleteTemplate.name}
        </button>
      ) : null}
    </section>
  );
}
