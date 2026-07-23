import { getBuiltInTemplate } from "../templates/builtInTemplates";
import type { ContentBinding, ContentSource, Page, Project, Template } from "./types";
import { createDefaultProject } from "./projectFactory";

function binding(
  id: string,
  sourceId: string,
  regionId: string,
  pageId: string,
  fields: Array<{ sourceField: string; label?: string; maxChars: number }>,
  overflowPolicy: ContentBinding["transform"]["overflowPolicy"] = "wrap"
): ContentBinding {
  return {
    id,
    sourceId,
    templateRegionId: regionId,
    targetPageId: pageId,
    transform: {
      maxItems: 20,
      fields: fields.map((field) => ({ ...field, includeWhenEmpty: false })),
      sort: "source",
      textCase: "preserve",
      controlStyle: "region-default",
      textColour: 7,
      overflowPolicy
    },
    policy: {
      approval: "automatic",
      staleAfterSeconds: 86_400,
      allowStale: true,
      onFailure: "keep-last-valid"
    }
  };
}

function pageFromTemplate(template: Template, pageNumber: string, title: string): Page {
  const id = `page-${pageNumber}`;
  return {
    id,
    magazine: Number(pageNumber[0]) as Page["magazine"],
    pageNumber,
    title,
    subpages: [{
      id: `${id}-subpage-0000`,
      subcode: "0000",
      rows: structuredClone(template.rows),
      enhancementPackets: [],
      glyphReferences: [],
      carousel: { enabled: false, delaySeconds: 10, priority: "normal" }
    }],
    contentBindings: [],
    metadata: {
      description: template.description,
      tags: [template.category, "poc"],
      publicationState: "ready",
      templateId: template.id,
      targetPresentationLevel: "1",
      receiverFontProfileId: "ets-1990s",
      header: { clockMode: "local", showLocalDate: false }
    },
    links: []
  };
}

function source(
  id: string,
  kind: ContentSource["kind"],
  label: string,
  uri: string,
  attributionText: string
): ContentSource {
  return {
    id,
    kind,
    label,
    uri,
    enabled: true,
    refreshPolicy: { mode: "on-export", staleAfterSeconds: 86_400, retryCount: 1 },
    cachePolicy: { keepSnapshots: 5, allowStaleOnError: true },
    fieldHints: {},
    provider: label,
    policy: {
      licenceMode: "internal",
      termsUrl: "",
      permittedUse: "internal",
      attributionRequired: true,
      attributionText,
      reviewedAt: "2026-07-19T00:00:00.000Z",
      operatorApproved: true
    }
  };
}

export function createPixelcastPocProject(now = new Date("2026-07-19T00:00:00.000Z")): Project {
  const project = createDefaultProject(now);
  const service = project.services[0];
  project.appVersion = "0.2.0";
  project.metadata.title = "Pixelcast POC Service";
  project.metadata.description = "End-to-end Publisher and Subscriber proof of concept.";
  service.name = "Pixelcast Demo Channel";

  const index = pageFromTemplate(getBuiltInTemplate("index-page")!, "100", "Index");
  index.links = [
    { label: "News", pageNumber: "102" },
    { label: "Brisbane weather", pageNumber: "400" },
    { label: "AUD exchange", pageNumber: "500" }
  ];
  const news = pageFromTemplate(getBuiltInTemplate("article-page")!, "102", "News");
  news.contentBindings = [binding("binding-news", "source-news", "main-content", news.id, [
    { sourceField: "title", maxChars: 80 },
    { sourceField: "body", maxChars: 900 }
  ], "add-subpage")];
  const weather = pageFromTemplate(getBuiltInTemplate("weather-page")!, "400", "Brisbane Weather");
  weather.contentBindings = [binding("binding-weather", "source-weather", "weather-summary", weather.id, [
    { sourceField: "title", maxChars: 40 },
    { sourceField: "temperature_2m", label: "Temperature", maxChars: 20 },
    { sourceField: "wind_speed_10m", label: "Wind", maxChars: 20 },
    { sourceField: "weather_code", label: "Code", maxChars: 20 }
  ])];
  const finance = pageFromTemplate(getBuiltInTemplate("finance-page")!, "500", "AUD Exchange");
  finance.contentBindings = [binding("binding-forex", "source-forex", "finance-table", finance.id, [
    { sourceField: "currency", maxChars: 8 },
    { sourceField: "rate", label: "Rate", maxChars: 16 },
    { sourceField: "move", label: "Move", maxChars: 16 }
  ])];
  service.pages = [index, news, weather, finance];
  service.schedule = {
    enabled: true,
    defaultDwellSeconds: 10,
    entries: service.pages.map((page, index) => ({
      pageId: page.id,
      enabled: true,
      dwellSeconds: page.pageNumber === "102" ? 14 : 10,
      repeatWeight: page.pageNumber === "102" ? 2 : 1,
      priority: page.pageNumber === "102" ? "high" : "normal"
    }))
  };
  project.contentSources = [
    source("source-news", "json", "Pixelcast demo news wire", "examples/feeds/news.json", "Source: Pixelcast demo wire"),
    source("source-weather", "weather", "Open-Meteo fixture", "examples/feeds/brisbane-weather.json", "Weather: Open-Meteo.com"),
    source("source-forex", "json", "RBA-format fixture", "examples/feeds/aud-forex.json", "Source: RBA-style demo data")
  ];
  return project;
}
