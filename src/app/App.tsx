import { useMemo, useState } from "react";

import { ControlPalette } from "./components/ControlPalette";
import { InspectorPanel } from "./components/InspectorPanel";
import { PageNavigator } from "./components/PageNavigator";
import { TeletextCanvas } from "./components/TeletextCanvas";
import { TemplateLibrary } from "./components/TemplateLibrary";
import { ValidationPanel } from "./components/ValidationPanel";
import {
  applyTemplateCommand,
  insertControlCodeCommand,
  insertTextCommand
} from "../core";
import {
  commitEditorHistory,
  createEditorViewModel,
  createInitialEditorHistory,
  redoEditorHistory,
  undoEditorHistory
} from "./state/editorStore";
import type { CellSelection } from "./state/editorStore";

type LayoutMode = "studio" | "playout";

export function App() {
  const [history, setHistory] = useState(() => createInitialEditorHistory());
  const [selection, setSelection] = useState<CellSelection | undefined>();
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("studio");
  const editor = useMemo(() => createEditorViewModel(history.present), [history.present]);

  function commitTemplate(templateId: string) {
    setHistory((currentHistory) =>
      commitEditorHistory(
        currentHistory,
        applyTemplateCommand(editor.service.id, editor.page.id, templateId)
      )
    );
  }

  function commitText(value: string) {
    if (!selection) {
      return;
    }

    setHistory((currentHistory) =>
      commitEditorHistory(
        currentHistory,
        insertTextCommand(
          editor.service.id,
          editor.page.id,
          editor.subpage.id,
          selection.rowIndex,
          selection.column,
          value
        )
      )
    );
    setSelection({
      rowIndex: selection.rowIndex,
      column: Math.min(selection.column + value.length, 39)
    });
  }

  function commitControlCode(byte: number) {
    if (!selection) {
      return;
    }

    setHistory((currentHistory) =>
      commitEditorHistory(
        currentHistory,
        insertControlCodeCommand(
          editor.service.id,
          editor.page.id,
          editor.subpage.id,
          selection.rowIndex,
          selection.column,
          byte
        )
      )
    );
    setSelection({
      rowIndex: selection.rowIndex,
      column: Math.min(selection.column + 1, 39)
    });
  }

  return (
    <main className={`app-shell ${layoutMode === "playout" ? "playout-shell" : "studio-shell"}`}>
      <aside className="sidebar" aria-label="Service navigator">
        <div className="brand">
          <span className="brand-mark">40</span>
          <div>
            <h1>FortyForge</h1>
            <p>Teletext page editor</p>
          </div>
        </div>

        <PageNavigator pages={editor.service.pages} service={editor.service} />

        <TemplateLibrary onTemplateApply={commitTemplate} templates={editor.templates} />
      </aside>

      <section className="workspace" aria-label="Teletext workspace">
        <header className="toolbar">
          <div>
            <p className="eyebrow">Level {editor.page.metadata.targetPresentationLevel} authoring</p>
            <h2>Page {editor.page.pageNumber}</h2>
          </div>
          <div className="toolbar-actions">
            <div className="segmented-control" aria-label="Layout mode">
              <button
                aria-pressed={layoutMode === "studio"}
                onClick={() => setLayoutMode("studio")}
                type="button"
              >
                Studio
              </button>
              <button
                aria-pressed={layoutMode === "playout"}
                onClick={() => setLayoutMode("playout")}
                type="button"
              >
                Playout
              </button>
            </div>
            <button
              disabled={history.past.length === 0}
              onClick={() => setHistory(undoEditorHistory)}
              type="button"
            >
              Undo
            </button>
            <button
              disabled={history.future.length === 0}
              onClick={() => setHistory(redoEditorHistory)}
              type="button"
            >
              Redo
            </button>
            <button type="button">Preview Level 1</button>
            <button type="button">Export</button>
          </div>
        </header>

        <TeletextCanvas
          onCellSelect={setSelection}
          onTextInput={commitText}
          rows={editor.subpage.rows}
          selection={selection}
        />

        {layoutMode === "playout" ? (
          <p className="playout-note">Clean output mode for a second display or live monitor.</p>
        ) : null}

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
        selection={selection}
      />
      <aside className="control-dock" aria-label="Control palette">
        <ControlPalette
          disabled={!selection}
          onControlSelect={commitControlCode}
        />
      </aside>
    </main>
  );
}
