import { describe, expect, it } from "vitest";

import { createPixelcastPocProject, refreshProjectSources } from "../core/index";
import { createBroadcastBundle } from "./bundle";

describe("Pixelcast Publisher broadcast bundle", () => {
  it("produces a hashed channel release for Subscriber devices", async () => {
    const refreshed = await refreshProjectSources(createPixelcastPocProject(), async (source) => ({
      payload: source.id === "source-news"
        ? JSON.stringify([{ id: "news", title: "News", body: "Publisher to Subscriber" }])
        : source.id === "source-weather"
          ? JSON.stringify({ current: { temperature_2m: 20, weather_code: 0 } })
          : JSON.stringify([{ id: "usd", title: "USD", currency: "USD", rate: 0.7, move: "0" }])
    }), new Date("2026-07-19T00:00:00.000Z"));
    refreshed.project.services[0].pages[1].metadata.header.showLocalDate = true;
    const bundle = createBroadcastBundle(refreshed.project, { now: new Date("2026-07-19T00:05:00.000Z") });

    expect(bundle.manifest.format).toBe("pixelcast-broadcast");
    expect(bundle.channel.format).toBe("pixelcast-channel");
    expect(bundle.channel.releaseId).toBe(bundle.manifest.releaseId);
    expect(bundle.manifest.pages).toHaveLength(4);
    expect(bundle.manifest.pages.every((page) => page.byteLength === 1000 && page.sha256.length === 64)).toBe(true);
    expect(bundle.manifest.pages.find((page) => page.pageNumber === "102")).toMatchObject({
      repeatWeight: 2,
      priority: "high",
      showLocalDate: true
    });
  });
});
