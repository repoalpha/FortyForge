import { useState } from "react";

import type { Page, Service } from "../../core";

interface PageNavigatorProps {
  service: Service;
  pages: Page[];
  activeSubpageId?: string;
  activePageId?: string;
  activeGeneratedSubpageIndex?: number;
  generatedSubpages?: Array<{ subcode: string }>;
  onPageAdd(pageNumber: string): void;
  onGeneratedSubpageSelect(index: number): void;
  onSubpageAdd(pageId: string): void;
  onPageSelect(pageId: string): void;
  onSubpageSelect(pageId: string, subpageId: string): void;
}

export function PageNavigator({
  service,
  pages,
  activeSubpageId,
  activePageId,
  activeGeneratedSubpageIndex,
  generatedSubpages = [],
  onPageAdd,
  onGeneratedSubpageSelect,
  onSubpageAdd,
  onPageSelect,
  onSubpageSelect
}: PageNavigatorProps) {
  const [newPageNumber, setNewPageNumber] = useState("");
  const normalizedPageNumber = newPageNumber.trim().toUpperCase();
  const canAddPage = /^[1-8][0-9A-F]{2}$/.test(normalizedPageNumber)
    && !pages.some((page) => page.pageNumber === normalizedPageNumber);

  return (
    <section>
      <h2>Pages</h2>
      <p className="section-note">{service.name}</p>
      <div className="page-list">
        {pages.map((page) => (
          <div className="page-group" key={page.id}>
            <button
              aria-pressed={activePageId === page.id}
              className="page-pill"
              onClick={() => onPageSelect(page.id)}
              type="button"
            >
              {page.pageNumber}.00 {page.title}
            </button>
            <div className="subpage-list" aria-label={`Subpages for page ${page.pageNumber}`}>
              {page.subpages.map((subpage) => (
                <button
                  aria-pressed={activeSubpageId === subpage.id}
                  key={subpage.id}
                  onClick={() => onSubpageSelect(page.id, subpage.id)}
                  type="button"
                >
                  {subpage.subcode}
                </button>
              ))}
              <button onClick={() => onSubpageAdd(page.id)} type="button">
                Add subpage
              </button>
            </div>
            {activePageId === page.id && generatedSubpages.length > 0 ? (
              <div className="live-subpage-section">
                <span className="live-subpage-label">
                  Live feed pages
                  {generatedSubpages.length > 1 ? " · carousel" : ""}
                </span>
                <div
                  className="subpage-list live-subpage-list"
                  aria-label={`Live feed subpages for page ${page.pageNumber}`}
                  role="group"
                >
                  {generatedSubpages.map((subpage, index) => (
                    <button
                      aria-label={`Live subpage ${subpage.subcode}`}
                      aria-pressed={activeGeneratedSubpageIndex === index}
                      key={`${subpage.subcode}-${index}`}
                      onClick={() => onGeneratedSubpageSelect(index)}
                      type="button"
                    >
                      {subpage.subcode}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ))}
      </div>
      <div className="page-add-controls">
        <input
          aria-label="New teletext page number"
          maxLength={3}
          onChange={(event) => setNewPageNumber(event.target.value.toUpperCase())}
          placeholder="101"
          value={newPageNumber}
        />
        <button
          disabled={!canAddPage}
          onClick={() => {
            onPageAdd(normalizedPageNumber);
            setNewPageNumber("");
          }}
          type="button"
        >
          Add page
        </button>
      </div>
      <p className="section-note">Pages use ETSI hexadecimal addresses 100–8FF.</p>
    </section>
  );
}
