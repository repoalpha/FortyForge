import { describe, expect, it } from "vitest";

import { createPixelcastPocProject } from "../core";
import { automaticBoundSourceIdsDue } from "./feedAutomation";

describe("Studio feed automation", () => {
  it("refreshes only enabled interval sources which have live page bindings and are due", () => {
    const now = new Date("2026-07-22T02:00:00.000Z");
    const project = createPixelcastPocProject(now);
    const news = project.contentSources.find((source) => source.id === "source-news")!;
    const weather = project.contentSources.find((source) => source.id === "source-weather")!;
    const finance = project.contentSources.find((source) => source.id === "source-forex")!;

    news.refreshPolicy = { mode: "interval", intervalSeconds: 60, retryCount: 1 };
    weather.refreshPolicy = { mode: "interval", intervalSeconds: 60, retryCount: 1 };
    weather.enabled = false;
    finance.refreshPolicy = { mode: "manual", retryCount: 1 };
    project.contentSnapshots = [{
      id: "news-old",
      sourceId: news.id,
      capturedAt: "2026-07-22T01:58:00.000Z",
      status: "ok",
      records: []
    }];

    expect(automaticBoundSourceIdsDue(project, now)).toEqual([news.id]);
  });

  it("waits until the configured interval after the latest failed attempt", () => {
    const now = new Date("2026-07-22T02:00:00.000Z");
    const project = createPixelcastPocProject(now);
    const news = project.contentSources.find((source) => source.id === "source-news")!;

    news.refreshPolicy = { mode: "interval", intervalSeconds: 300, retryCount: 1 };
    project.contentSnapshots = [{
      id: "news-error",
      sourceId: news.id,
      capturedAt: "2026-07-22T01:59:00.000Z",
      status: "error",
      errorMessage: "offline",
      records: []
    }];

    expect(automaticBoundSourceIdsDue(project, now)).toEqual([]);
  });
});
