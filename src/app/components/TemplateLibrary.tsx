import { useState } from "react";

import type { Template } from "../../core";

interface TemplateLibraryProps {
  templates: Template[];
  onTemplateApply: (templateId: string) => void;
  onTemplateDelete?: (templateId: string) => void;
}

function isCustomTemplate(template: Template) {
  return template.id.startsWith("custom-template-");
}

export function TemplateLibrary({
  templates,
  onTemplateApply,
  onTemplateDelete
}: TemplateLibraryProps) {
  const [deleteTemplateId, setDeleteTemplateId] = useState<string>();
  const deleteTemplate = templates.find((template) => template.id === deleteTemplateId);

  return (
    <section>
      <h2>Templates</h2>
      <div className="template-list">
        {templates.map((template) => (
          <button
            key={template.id}
            onClick={() => onTemplateApply(template.id)}
            onContextMenu={(event) => {
              if (!isCustomTemplate(template)) {
                setDeleteTemplateId(undefined);
                return;
              }

              event.preventDefault();
              setDeleteTemplateId(template.id);
            }}
            title={template.description}
            type="button"
          >
            <span>{template.name}</span>
            <small aria-hidden="true">{template.category}</small>
          </button>
        ))}
      </div>
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
