export function App() {
  const columns = Array.from({ length: 40 }, (_, index) => index + 1);
  const rows = Array.from({ length: 25 }, (_, index) => index);

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

        <section>
          <h2>Pages</h2>
          <button className="page-pill" type="button">
            100.00 Index
          </button>
        </section>

        <section>
          <h2>Templates</h2>
          <div className="template-list">
            <button type="button">Blank page</button>
            <button type="button">Index page</button>
            <button type="button">Pixel art canvas</button>
          </div>
        </section>
      </aside>

      <section className="workspace" aria-label="Teletext workspace">
        <header className="toolbar">
          <div>
            <p className="eyebrow">Level 1 authoring</p>
            <h2>Page 100</h2>
          </div>
          <div className="toolbar-actions">
            <button type="button">Preview Level 1</button>
            <button type="button">Export</button>
          </div>
        </header>

        <div className="canvas-frame">
          <div className="column-ruler" aria-hidden="true">
            {columns.map((column) => (
              <span key={column}>{column % 10}</span>
            ))}
          </div>
          <div className="teletext-grid" role="grid" aria-label="40 by 25 teletext grid">
            {rows.map((row) =>
              columns.map((column) => (
                <button
                  aria-label={`Row ${row}, column ${column}`}
                  className={row === 0 ? "cell header-cell" : "cell"}
                  key={`${row}-${column}`}
                  type="button"
                >
                  {row === 0 && column <= 8 ? " " : ""}
                </button>
              ))
            )}
          </div>
        </div>

        <footer className="status-panel">
          <span>40 bytes per row</span>
          <span>No validation issues</span>
          <span>Packet preview ready after model wiring</span>
        </footer>
      </section>

      <aside className="inspector" aria-label="Inspector">
        <section>
          <h2>Inspector</h2>
          <p>Select a cell to inspect character, control code, and byte effects.</p>
        </section>
        <section>
          <h2>Validation</h2>
          <p>No export-blocking issues.</p>
        </section>
      </aside>
    </main>
  );
}
