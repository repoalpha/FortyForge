import type { Project, TeletextRow } from "../model/types";
import { getBuiltInTemplate } from "./builtInTemplates";

function cloneRows(rows: TeletextRow[]): TeletextRow[] {
  return structuredClone(rows) as TeletextRow[];
}

function headerClockModeForTemplate(
  templateId: string,
  currentClockMode: Project["services"][number]["pages"][number]["metadata"]["header"]["clockMode"]
) {
  if (templateId === "blank-page") {
    return "original";
  }

  if (templateId === "header-page") {
    return "local";
  }

  return currentClockMode;
}

export function applyTemplate(
  project: Project,
  serviceId: string,
  pageId: string,
  templateId: string
): Project {
  const template = project.templates.find((item) => item.id === templateId)
    ?? getBuiltInTemplate(templateId);

  if (!template) {
    throw new Error(`Unknown template ${templateId}`);
  }

  return {
    ...project,
    services: project.services.map((service) => {
      if (service.id !== serviceId) {
        return service;
      }

      return {
        ...service,
        pages: service.pages.map((page) => {
          if (page.id !== pageId) {
            return page;
          }

          return {
            ...page,
            metadata: {
              ...page.metadata,
              header: {
                ...page.metadata.header,
                clockMode: headerClockModeForTemplate(templateId, page.metadata.header.clockMode)
              },
              templateId
            },
            subpages: page.subpages.map((subpage, index) => ({
              ...subpage,
              rows: index === 0 ? cloneRows(template.rows) : subpage.rows
            }))
          };
        })
      };
    })
  };
}
