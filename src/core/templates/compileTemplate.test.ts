import { describe, expect, it } from "vitest";

import { createPixelcastPocProject } from "../model/pocProjectFactory";
import { refreshProjectSources } from "../content/refreshSources";
import { getControlCodeByByte } from "../standards/controlCodes";
import { getBuiltInTemplate } from "./builtInTemplates";
import { compileProjectContent } from "./compileTemplate";

describe("template content compiler", () => {
  it("generates bounded, attributed Level 1 pages and continuation subpages", async () => {
    const project = createPixelcastPocProject();
    const longBody = Array.from({ length: 80 }, (_, index) => `sentence ${index + 1}`).join(" ");
    const refreshed = await refreshProjectSources(project, async (source) => ({
      payload: source.id === "source-news"
        ? JSON.stringify([{ id: "story", title: "Long story", body: longBody }])
        : source.id === "source-weather"
          ? JSON.stringify({ current: { temperature_2m: 21, weather_code: 1 } })
          : JSON.stringify([{ id: "usd", title: "USD", currency: "USD", rate: 0.7, move: "+0.1" }])
    }), new Date("2026-07-19T01:00:00.000Z"));
    const snapshots = compileProjectContent(refreshed.project);
    const news = snapshots.filter((snapshot) => snapshot.pageNumber === "102");

    expect(news.length).toBeGreaterThan(1);
    expect(news[0].subcode).toBe("0001");
    expect(news[1].subcode).toBe("0002");
    expect(news.every((snapshot) => snapshot.rows.length === 25)).toBe(true);
    expect(news.every((snapshot) => snapshot.rows.every((row) => row.cells.length === 40))).toBe(true);
    expect(news.map((snapshot) => snapshot.rows[24].cells
      .map((cell) => cell.character?.value ?? " ")
      .join("").trim())).toEqual(news.map((_, index) => `P102  ${index + 1}/${news.length}  MORE`));
    expect(news.at(-1)?.attributions).toContain("Source: Pixelcast demo wire");
    expect(news.flatMap((snapshot) => snapshot.diagnostics.filter((item) => item.severity === "error"))).toEqual([]);
  });

  it("blocks publication when source rights are not approved", () => {
    const project = createPixelcastPocProject();
    project.contentSources[0].policy.operatorApproved = false;
    const news = compileProjectContent(project).find((snapshot) => snapshot.pageNumber === "102");

    expect(news?.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "source-rights-unapproved", severity: "error" })
    ]));
  });

  it("transmits a selected feed colour at the start of every generated row", () => {
    const project = createPixelcastPocProject();
    const newsPage = project.services[0].pages.find((page) => page.pageNumber === "102")!;
    newsPage.contentBindings[0].transform.textColour = 3;
    const template = structuredClone(getBuiltInTemplate("article-page")!);
    const region = template.regions.find((candidate) => candidate.id === "main-content")!;
    region.lockedControlCodes = true;
    template.rows[2].cells[0] = {
      column: 0,
      kind: "control",
      byte: 0x04,
      controlCode: getControlCodeByByte(0x04),
      annotations: []
    };
    template.rows[2].cells[5] = {
      column: 5,
      kind: "control",
      byte: 0x01,
      controlCode: getControlCodeByByte(0x01),
      annotations: []
    };
    project.templates.push(template);
    project.contentSnapshots.push({
      id: "news-colour-snapshot",
      sourceId: "source-news",
      capturedAt: "2026-07-22T01:00:00.000Z",
      status: "ok",
      records: [{ id: "colour-story", title: "Colour test headline", fields: {} }]
    });

    const compiled = compileProjectContent(project).find((snapshot) => snapshot.pageNumber === "102")!;

    expect(compiled.rows[2].cells[0]).toEqual(expect.objectContaining({ kind: "control", byte: 0x03 }));
    expect(compiled.rows[2].cells[1]).toEqual(expect.objectContaining({ kind: "character", byte: 0x43 }));
    expect(compiled.rows[2].cells[5].kind).not.toBe("control");
    expect(compiled.rows[3].cells[0]).toEqual(expect.objectContaining({ kind: "control", byte: 0x03 }));
    expect(compiled.diagnostics).toEqual([]);
  });
});
