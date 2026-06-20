import type { Template } from "../../core";

interface TemplateLibraryProps {
  templates: Template[];
  onTemplateApply: (templateId: string) => void;
}

export function TemplateLibrary({ templates, onTemplateApply }: TemplateLibraryProps) {
  return (
    <section>
      <h2>Templates</h2>
      <div className="template-list">
        {templates.map((template) => (
          <button
            key={template.id}
            onClick={() => onTemplateApply(template.id)}
            title={template.description}
            type="button"
          >
            <span>{template.name}</span>
            <small aria-hidden="true">{template.category}</small>
          </button>
        ))}
      </div>
    </section>
  );
}
