import type { Page, Service } from "../../core";

interface PageNavigatorProps {
  service: Service;
  pages: Page[];
}

export function PageNavigator({ service, pages }: PageNavigatorProps) {
  return (
    <section>
      <h2>Pages</h2>
      <p className="section-note">{service.name}</p>
      <div className="page-list">
        {pages.map((page) => (
          <button className="page-pill" key={page.id} type="button">
            {page.pageNumber}.00 {page.title}
          </button>
        ))}
      </div>
    </section>
  );
}
