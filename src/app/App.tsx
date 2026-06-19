import { useMemo } from "react";

import { InspectorPanel } from "./components/InspectorPanel";
import { PageNavigator } from "./components/PageNavigator";
import { TeletextCanvas } from "./components/TeletextCanvas";
import { TemplateLibrary } from "./components/TemplateLibrary";
import { ValidationPanel } from "./components/ValidationPanel";
import { createEditorViewModel } from "./state/editorStore";

export function App() {
  const editor = useMemo(() => createEditorViewModel(), []);

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="Service navigator">
        <div className="brand">
          <span className="brand-mark">40</span>
          <div>
            <h1>FortyForge</h1>
            <p>Teletext page editor</p>
          </div>
        </div>

        <PageNavigator pages={editor.service.pages} service={editor.service} />

        <TemplateLibrary templates={editor.templates} />
      </aside>

      <section className="workspace" aria-label="Teletext workspace">
        <header className="toolbar">
          <div>
            <p className="eyebrow">Level {editor.page.metadata.targetPresentationLevel} authoring</p>
            <h2>Page {editor.page.pageNumber}</h2>
          </div>
          <div className="toolbar-actions">
            <button type="button">Preview Level 1</button>
            <button type="button">Export</button>
          </div>
        </header>

        <TeletextCanvas rows={editor.subpage.rows} />

        <ValidationPanel
          issues={editor.validationIssues}
          packetPreview={editor.packetPreview}
        />
      </section>

      <InspectorPanel
        page={editor.page}
        subpage={editor.subpage}
        templates={editor.templates}
        validationIssues={editor.validationIssues}
      />
    </main>
  );
}
