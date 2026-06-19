import { describe, expect, it } from "vitest";

import { createDefaultProject } from "../model/projectFactory";
import { applyTemplate } from "./applyTemplate";
import { BUILT_IN_TEMPLATES } from "./builtInTemplates";

describe("built-in templates", () => {
  it("includes the planned v1 template set", () => {
    expect(BUILT_IN_TEMPLATES.map((template) => template.id)).toEqual(
      expect.arrayContaining([
        "blank-page",
        "index-page",
        "article-page",
        "weather-page",
        "status-display",
        "subtitle-newsflash",
        "pixel-art-canvas",
        "carousel-page"
      ])
    );
  });

  it("defines dynamic-capable regions for content-driven templates", () => {
    const articleTemplate = BUILT_IN_TEMPLATES.find(
      (template) => template.id === "article-page"
    );
    const weatherTemplate = BUILT_IN_TEMPLATES.find(
      (template) => template.id === "weather-page"
    );
    const newsflashTemplate = BUILT_IN_TEMPLATES.find(
      (template) => template.id === "subtitle-newsflash"
    );

    expect(articleTemplate?.regions).toContainEqual(
      expect.objectContaining({
        id: "main-content",
        kind: "dynamic",
        acceptedContentKinds: expect.arrayContaining(["rss", "atom", "json", "manual"])
      })
    );
    expect(weatherTemplate?.regions).toContainEqual(
      expect.objectContaining({
        id: "weather-summary",
        kind: "dynamic",
        acceptedContentKinds: expect.arrayContaining(["weather"])
      })
    );
    expect(newsflashTemplate?.regions).toContainEqual(
      expect.objectContaining({
        id: "bottom-ticker",
        kind: "ticker",
        bounds: expect.objectContaining({ startRow: 24, endRow: 24 })
      })
    );
  });
});

describe("applyTemplate", () => {
  it("replaces page rows while preserving page address metadata", () => {
    const project = createDefaultProject();
    const updated = applyTemplate(project, "service-default", "page-100", "index-page");
    const updatedPage = updated.services[0].pages[0];
    const updatedRows = updatedPage.subpages[0].rows;

    expect(updated).not.toBe(project);
    expect(updatedPage.id).toBe("page-100");
    expect(updatedPage.pageNumber).toBe("100");
    expect(updatedPage.magazine).toBe(1);
    expect(updatedPage.metadata.templateId).toBe("index-page");
    expect(updatedRows).toHaveLength(25);
    expect(updatedRows[1].cells).toHaveLength(40);
    expect(updatedRows[1].cells.some((cell) => cell.kind === "character")).toBe(true);
    expect(project.services[0].pages[0].metadata.templateId).toBeUndefined();
  });
});
