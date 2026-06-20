import { useEffect, useMemo, useState } from "react";

import { ControlPalette } from "./components/ControlPalette";
import { InspectorPanel } from "./components/InspectorPanel";
import { PageNavigator } from "./components/PageNavigator";
import { TeletextCanvas } from "./components/TeletextCanvas";
import { TemplateLibrary } from "./components/TemplateLibrary";
import { ValidationPanel } from "./components/ValidationPanel";
import {
  applyTemplateCommand,
  composeExportRows,
  createEditorHistory,
  exportNativeProject,
  importNativeProject,
  insertControlCodeWithRowShiftCommand,
  insertTextCommand,
  saveCurrentPageAsTemplateCommand,
  setPageHeaderClockModeCommand
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
const LOCAL_PROJECT_KEY = "fortyforge.currentProject";

function loadInitialHistory() {
  const savedProject = window.localStorage.getItem(LOCAL_PROJECT_KEY);

  if (!savedProject) {
    return createInitialEditorHistory();
  }

  try {
    return createEditorHistory(importNativeProject(savedProject));
  } catch {
    return createInitialEditorHistory();
  }
}

export function App() {
  const [history, setHistory] = useState(loadInitialHistory);
  const [selection, setSelection] = useState<CellSelection | undefined>();
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("studio");
  const [clockNow, setClockNow] = useState(() => new Date());
  const [saveMessage, setSaveMessage] = useState("Not saved");
  const editor = useMemo(() => createEditorViewModel(history.present), [history.present]);
  const displayRows = useMemo(
    () => composeExportRows(editor.page, editor.subpage, clockNow),
    [clockNow, editor.page, editor.subpage]
  );

  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(new Date()), 30000);

    return () => window.clearInterval(timer);
  }, []);

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
        insertControlCodeWithRowShiftCommand(
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

  function commitHeaderClockMode(mode: "original" | "local") {
    setHistory((currentHistory) =>
      commitEditorHistory(
        currentHistory,
        setPageHeaderClockModeCommand(editor.service.id, editor.page.id, mode)
      )
    );
  }

  function saveProject() {
    window.localStorage.setItem(LOCAL_PROJECT_KEY, exportNativeProject(history.present));
    setSaveMessage(`Saved locally ${new Date().toLocaleTimeString()}`);
  }

  function saveTemplate() {
    setHistory((currentHistory) => {
      const nextHistory = commitEditorHistory(
        currentHistory,
        saveCurrentPageAsTemplateCommand(editor.service.id, editor.page.id)
      );
      window.localStorage.setItem(LOCAL_PROJECT_KEY, exportNativeProject(nextHistory.present));
      return nextHistory;
    });
    setSaveMessage(`Saved template locally ${new Date().toLocaleTimeString()}`);
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
            <button onClick={saveTemplate} type="button">Save as template</button>
            <button onClick={saveProject} type="button">Save</button>
            <button type="button">Export</button>
          </div>
        </header>

        <TeletextCanvas
          onCellSelect={setSelection}
          onTextInput={commitText}
          rows={displayRows}
          selection={selection}
        />

        {layoutMode === "playout" ? (
          <p className="playout-note">Clean output mode for a second display or live monitor.</p>
        ) : null}

        <ValidationPanel
          issues={editor.validationIssues}
          packetPreview={editor.packetPreview}
        />
        <p className="save-status" role="status">{saveMessage}</p>
      </section>

      <InspectorPanel
        page={editor.page}
        subpage={editor.subpage}
        templates={editor.templates}
        validationIssues={editor.validationIssues}
        selection={selection}
        onHeaderClockModeChange={commitHeaderClockMode}
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
