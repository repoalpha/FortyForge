import "@testing-library/jest-dom/vitest";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createDefaultProject, createPixelcastPocProject, replacePageWithCarouselCommand } from "../../core";
import { FeedWorkbench } from "./FeedWorkbench";

function renderWorkbench(project = createDefaultProject()) {
  const page = project.services[0].pages[0];
  const onPlaceSnapshot = vi.fn();
  const onBindToSlot = vi.fn();
  const onCarouselPlayingChange = vi.fn();
  const onSourceSave = vi.fn();
  const onSourceSnapshotSave = vi.fn();
  const onWorkspaceChange = vi.fn();
  const onTargetPageSelect = vi.fn();

  render(
    <FeedWorkbench
      carouselPlaying
      onBindToSlot={onBindToSlot}
      onBindingRemove={vi.fn()}
      onCarouselPlayingChange={onCarouselPlayingChange}
      onPlaceSnapshot={onPlaceSnapshot}
      onSourceSave={onSourceSave}
      onSourceSnapshotSave={onSourceSnapshotSave}
      onTargetPageSelect={onTargetPageSelect}
      onWorkspaceChange={onWorkspaceChange}
      page={page}
      pages={project.services[0].pages}
      snapshots={project.contentSnapshots}
      sources={project.contentSources}
      subpage={page.subpages[0]}
      templates={project.templates}
    />
  );

  return { onBindToSlot, onCarouselPlayingChange, onPlaceSnapshot, onSourceSave, onSourceSnapshotSave, onTargetPageSelect, onWorkspaceChange, page };
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("FeedWorkbench story carousel", () => {
  it("pauses a placed carousel without invoking a placement action", () => {
    const project = createDefaultProject();
    const page = project.services[0].pages[0];
    const withCarousel = replacePageWithCarouselCommand(
      project.services[0].id,
      page.id,
      [page.subpages[0].rows, page.subpages[0].rows],
      8,
      page.subpages[0].id
    ).apply(project);
    const { onCarouselPlayingChange, onPlaceSnapshot } = renderWorkbench(withCarousel);

    fireEvent.click(screen.getByRole("button", { name: "Pause current page carousel" }));

    expect(onCarouselPlayingChange).toHaveBeenCalledWith(false);
    expect(onPlaceSnapshot).not.toHaveBeenCalled();
    expect(screen.getByRole("region", { name: "Current page carousel playback" }))
      .toHaveTextContent(/does not place, replace or remove/i);
  });

  it("keeps the authored page active until canvas preview is explicitly requested", async () => {
    const { onTargetPageSelect, onWorkspaceChange } = renderWorkbench();

    await waitFor(() => expect(onWorkspaceChange).toHaveBeenLastCalledWith(undefined));
    expect(onTargetPageSelect).toHaveBeenLastCalledWith("");
    expect(screen.getByRole("combobox", { name: "Feed target page" })).toHaveValue("");
    expect(screen.getByRole("option", { name: "Not assigned (staging only)" })).toBeInTheDocument();
  });

  it("explains where automatic feed subpages appear before a feed is fetched", () => {
    renderWorkbench();

    expect(screen.getByRole("region", { name: "Story subpage carousel guide" }))
      .toHaveTextContent("Long stories become selectable subpages automatically");
    expect(screen.getByText(/Studio returns on 0001 paused/)).toBeInTheDocument();
  });

  it("shows the timed subpage result and places every preview frame", async () => {
    const story = Array.from(
      { length: 140 },
      (_, index) => `Sentence ${index + 1} contains enough news copy for a continuation screen.`
    ).join(" ");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        contentType: "application/rss+xml",
        fetchedAt: "2026-07-21T00:00:00.000Z",
        finalUrl: "https://example.test/news.xml",
        payload: `<rss><channel><item><guid>long-story</guid><title>Long bulletin</title><description>${story}</description></item></channel></rss>`
      })
    }));
    const { onPlaceSnapshot, onSourceSnapshotSave, onTargetPageSelect, onWorkspaceChange, page } = renderWorkbench();

    fireEvent.click(screen.getByRole("button", { name: "Fetch now" }));

    await screen.findByText("Fetched and saved 1 records for NASA news.");
    expect(onWorkspaceChange).toHaveBeenLastCalledWith(undefined);
    expect(screen.getByRole("region", { name: "Story page result" }))
      .toHaveTextContent(/Result: \d+ selectable subpages/);
    expect(screen.getByText(/Placement adds subpages 0001–/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Yellow" }));
    expect(screen.getByText(/inserts one transmitted control cell/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", {
      name: /I have reviewed and approve this source/
    }));
    fireEvent.change(screen.getByRole("combobox", { name: "Feed target page" }), {
      target: { value: page.id }
    });
    expect(onTargetPageSelect).toHaveBeenCalledWith(page.id);
    fireEvent.click(screen.getByRole("button", { name: /Show \d+-subpage staging carousel on main canvas/ }));
    await waitFor(() => expect(onWorkspaceChange).toHaveBeenLastCalledWith(expect.objectContaining({
      recordCount: 1
    })));
    fireEvent.click(screen.getByRole("button", { name: /return to editable page/ }));
    await waitFor(() => expect(onWorkspaceChange).toHaveBeenLastCalledWith(undefined));
    fireEvent.change(screen.getByRole("combobox", { name: "Feed target page" }), {
      target: { value: "" }
    });
    expect(onTargetPageSelect).toHaveBeenLastCalledWith("");
    fireEvent.change(screen.getByRole("combobox", { name: "Feed target page" }), {
      target: { value: page.id }
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(screen.getByRole("checkbox", {
      name: /Allow whole-page replacement/
    }));
    const placeButton = screen.getByRole("button", {
      name: /Replace ENTIRE page with \d+ selectable subpages/
    });
    fireEvent.click(placeButton);

    await waitFor(() => expect(onPlaceSnapshot).toHaveBeenCalledOnce());
    const frames = onPlaceSnapshot.mock.calls[0][2];
    expect(frames.length).toBeGreaterThan(1);
    expect(frames[0][4].cells[1]).toEqual(expect.objectContaining({ kind: "control", byte: 0x03 }));
    expect(onPlaceSnapshot.mock.calls[0][3]).toBe(8);
    expect(onPlaceSnapshot.mock.calls[0][1].id)
      .toBe(onSourceSnapshotSave.mock.calls[0][1].id);
    expect(onPlaceSnapshot.mock.calls[0][0].cachePolicy.keepSnapshots).toBe(2);
  });

  it("switches between saved sources and restores each normalized snapshot", () => {
    const project = createDefaultProject();
    project.contentSources = [
      {
        id: "source-news",
        kind: "rss",
        label: "News wire",
        uri: "https://example.test/news.xml",
        enabled: true,
        refreshPolicy: { mode: "on-export", retryCount: 2, staleAfterSeconds: 3600 },
        cachePolicy: { keepSnapshots: 5, allowStaleOnError: true },
        fieldHints: {},
        provider: "Example News",
        policy: {
          licenceMode: "operator-licensed",
          termsUrl: "https://example.test/terms",
          permittedUse: "commercial",
          attributionRequired: true,
          attributionText: "Source: Example News",
          reviewedAt: "2026-07-21T00:00:00.000Z",
          operatorApproved: true
        }
      },
      {
        id: "source-weather",
        kind: "json",
        label: "Site weather",
        uri: "https://example.test/weather.json",
        enabled: true,
        refreshPolicy: { mode: "runtime", intervalSeconds: 900, retryCount: 2, staleAfterSeconds: 1800 },
        cachePolicy: { keepSnapshots: 5, allowStaleOnError: true },
        fieldHints: {},
        provider: "Site sensors",
        policy: {
          licenceMode: "internal",
          termsUrl: "https://example.test/internal-policy",
          permittedUse: "internal",
          attributionRequired: true,
          attributionText: "Source: Site sensors",
          reviewedAt: "2026-07-21T00:00:00.000Z",
          operatorApproved: true
        }
      }
    ];
    project.contentSnapshots = [{
      id: "weather-snapshot",
      sourceId: "source-weather",
      capturedAt: "2026-07-21T00:15:00.000Z",
      status: "ok",
      attributionText: "Source: Site sensors",
      sourceUri: "https://example.test/weather.json",
      records: [{ id: "tank-1", title: "Tank one", summary: "Level 73 percent", fields: {} }]
    }];

    renderWorkbench(project);
    fireEvent.change(screen.getByRole("combobox", { name: "Data source" }), {
      target: { value: "source-weather" }
    });

    expect(screen.getByRole("textbox", { name: "Source name" })).toHaveValue("Site weather");
    expect(screen.getByRole("textbox", { name: "Feed URL" })).toHaveValue("https://example.test/weather.json");
    expect(screen.getByRole("combobox", { name: "Source format" })).toHaveValue("json");
    expect(screen.getByRole("combobox", { name: "Refresh mode" })).toHaveValue("interval");
    expect(screen.getByRole("checkbox", { name: "Source enabled" })).toBeChecked();
    expect(screen.getByText(/Automation is ON while Pixelcast Studio is open/)).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Tank one" })).toBeInTheDocument();
  });

  it("saves an explicit automation pause without deleting the source", () => {
    const project = createPixelcastPocProject();
    const { onSourceSave } = renderWorkbench(project);

    fireEvent.change(screen.getByRole("combobox", { name: "Refresh mode" }), {
      target: { value: "interval" }
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "Source enabled" }));
    expect(screen.getByText(/Automation is OFF/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save schedule and source" }));

    expect(onSourceSave).toHaveBeenCalledWith(expect.objectContaining({
      enabled: false,
      refreshPolicy: expect.objectContaining({ mode: "interval" })
    }));
  });
});
