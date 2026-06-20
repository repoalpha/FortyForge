import type { Page, Service } from "../../core";

interface PageNavigatorProps {
  service: Service;
  pages: Page[];
  activeSubpageId?: string;
  onSubpageAdd(): void;
  onSubpageSelect(subpageId: string): void;
}

export function PageNavigator({
  service,
  pages,
  activeSubpageId,
  onSubpageAdd,
  onSubpageSelect
}: PageNavigatorProps) {
  return (
    <section>
      <h2>Pages</h2>
      <p className="section-note">{service.name}</p>
      <div className="page-list">
        {pages.map((page) => (
          <div className="page-group" key={page.id}>
            <button className="page-pill" type="button">
              {page.pageNumber}.00 {page.title}
            </button>
            <div className="subpage-list" aria-label={`Subpages for page ${page.pageNumber}`}>
              {page.subpages.map((subpage) => (
                <button
                  aria-pressed={activeSubpageId === subpage.id}
                  key={subpage.id}
                  onClick={() => onSubpageSelect(subpage.id)}
                  type="button"
                >
                  {subpage.subcode}
                </button>
              ))}
              <button onClick={onSubpageAdd} type="button">
                Add subpage
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
