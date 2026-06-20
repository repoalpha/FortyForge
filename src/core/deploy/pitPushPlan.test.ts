import { describe, expect, it } from "vitest";

import { buildPitPushPlan } from "./pitPushPlan";

describe("buildPitPushPlan", () => {
  it("plans an SSH/SCP data push into a watched PIT folder", () => {
    const plan = buildPitPushPlan({
      host: "pi@teletext.local",
      localFiles: ["dist/pages/100.tti", "dist/pages/service.t42"],
      remoteDirectory: "/srv/pit/pages",
      reloadCommand: "systemctl reload pit"
    });

    expect(plan.requiresRuntimeRecompile).toBe(false);
    expect(plan.steps).toEqual([
      {
        kind: "ssh",
        label: "Ensure PIT watch directory exists",
        command: "ssh pi@teletext.local \"mkdir -p /srv/pit/pages\""
      },
      {
        kind: "scp",
        label: "Copy dist/pages/100.tti",
        command: "scp dist/pages/100.tti pi@teletext.local:/srv/pit/pages/"
      },
      {
        kind: "scp",
        label: "Copy dist/pages/service.t42",
        command: "scp dist/pages/service.t42 pi@teletext.local:/srv/pit/pages/"
      },
      {
        kind: "ssh",
        label: "Signal PIT to reload page data",
        command: "ssh pi@teletext.local \"systemctl reload pit\""
      }
    ]);
  });

  it("omits reload when PIT is expected to watch files directly", () => {
    const plan = buildPitPushPlan({
      host: "pi@teletext.local",
      localFiles: ["dist/pages/100.tti"],
      remoteDirectory: "/srv/pit/pages"
    });

    expect(plan.steps.map((step) => step.label)).toEqual([
      "Ensure PIT watch directory exists",
      "Copy dist/pages/100.tti"
    ]);
  });

  it("rejects unsafe shell fields before building commands", () => {
    expect(() =>
      buildPitPushPlan({
        host: "pi@teletext.local; reboot",
        localFiles: ["dist/pages/100.tti"],
        remoteDirectory: "/srv/pit/pages"
      })
    ).toThrow("Unsafe PIT push host");

    expect(() =>
      buildPitPushPlan({
        host: "pi@teletext.local",
        localFiles: ["dist/pages/100.tti"],
        remoteDirectory: "/srv/pit/pages; reboot"
      })
    ).toThrow("Unsafe PIT push remote directory");
  });
});
