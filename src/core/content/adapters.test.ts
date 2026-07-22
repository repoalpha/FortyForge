import { describe, expect, it } from "vitest";

import { createPixelcastPocProject } from "../model/pocProjectFactory";
import { parseSourcePayload } from "./adapters";

describe("content adapters", () => {
  it("normalizes RSS without preserving embedded HTML", () => {
    const source = createPixelcastPocProject().contentSources[0];
    source.kind = "rss";
    const records = parseSourcePayload(source, `<?xml version="1.0"?><rss><channel><item><guid>one</guid><title>First story</title><description><![CDATA[<p>Readable copy</p>]]></description><link>https://example.test/one</link></item></channel></rss>`);

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ id: "one", title: "First story", summary: "Readable copy", url: "https://example.test/one" });
  });

  it("decodes numeric and named HTML entities before teletext layout", () => {
    const source = createPixelcastPocProject().contentSources[0];
    source.kind = "rss";
    const records = parseSourcePayload(source, `<?xml version="1.0"?><rss><channel><item><guid>entity</guid><title>NASA&#8217;s test &amp; result</title><description>One&nbsp;line</description></item></channel></rss>`);

    expect(records[0].title).toBe("NASA’s test & result");
    expect(records[0].summary).toBe("One line");
  });

  it("normalizes quoted CSV fields", () => {
    const source = createPixelcastPocProject().contentSources[0];
    source.kind = "csv";
    const records = parseSourcePayload(source, "id,title,status\nQF1,\"Brisbane, Domestic\",ON TIME\n");

    expect(records[0].title).toBe("Brisbane, Domestic");
    expect(records[0].fields.status).toBe("ON TIME");
  });

  it("normalizes Open-Meteo current and daily records", () => {
    const source = createPixelcastPocProject().contentSources[1];
    const records = parseSourcePayload(source, JSON.stringify({
      current: { temperature_2m: 21, weather_code: 1 },
      daily: { time: ["2026-07-19"], weather_code: [2] }
    }));

    expect(records.map((record) => record.title)).toEqual(["Current conditions", "2026-07-19"]);
    expect(records[0].fields.temperature_2m).toBe(21);
  });
});
