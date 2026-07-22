import { XMLParser } from "fast-xml-parser";

import type { ContentSource, NormalizedContentRecord } from "../model/types";

function values<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

const HTML_ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  apos: "'",
  gt: ">",
  hellip: "…",
  laquo: "«",
  ldquo: "“",
  lsquo: "‘",
  lt: "<",
  mdash: "—",
  nbsp: " ",
  ndash: "–",
  quot: "\"",
  raquo: "»",
  rdquo: "”",
  rsquo: "’"
};

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (match, digits: string) => {
      const codePoint = Number.parseInt(digits, 16);
      return codePoint <= 0x10ffff && !(codePoint >= 0xd800 && codePoint <= 0xdfff)
        ? String.fromCodePoint(codePoint)
        : match;
    })
    .replace(/&#([0-9]+);/g, (match, digits: string) => {
      const codePoint = Number.parseInt(digits, 10);
      return codePoint <= 0x10ffff && !(codePoint >= 0xd800 && codePoint <= 0xdfff)
        ? String.fromCodePoint(codePoint)
        : match;
    })
    .replace(/&([a-z]+);/gi, (match, name: string) => HTML_ENTITIES[name.toLowerCase()] ?? match);
}

function scalar(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "object" && "#text" in value) {
    return scalar((value as Record<string, unknown>)["#text"]);
  }
  return decodeHtmlEntities(String(value).replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function recordFromObject(value: Record<string, unknown>, index: number): NormalizedContentRecord {
  const title = scalar(value.title ?? value.name ?? value.headline ?? value.flight ?? `Item ${index + 1}`);
  const fields = Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    typeof item === "string" || typeof item === "number" || typeof item === "boolean" || item === null
      ? item
      : scalar(item)
  ]));
  return {
    id: scalar(value.id ?? value.guid ?? value.url ?? value.link) || `record-${index + 1}`,
    title,
    summary: scalar(value.summary ?? value.description) || undefined,
    body: scalar(value.body ?? value.content ?? value["content:encoded"]) || undefined,
    url: scalar(value.url ?? value.link) || undefined,
    publishedAt: scalar(value.publishedAt ?? value.pubDate ?? value.published) || undefined,
    updatedAt: scalar(value.updatedAt ?? value.updated) || undefined,
    priority: typeof value.priority === "number" ? value.priority : undefined,
    fields
  };
}

function parseXml(payload: string): NormalizedContentRecord[] {
  const parsed = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" }).parse(payload) as Record<string, any>;
  const rssItems = values(parsed.rss?.channel?.item);
  const atomEntries = values(parsed.feed?.entry);
  return [...rssItems, ...atomEntries].map((item, index) => {
    const object = item as Record<string, unknown>;
    const link = typeof object.link === "object"
      ? (object.link as Record<string, unknown>)["@_href"]
      : object.link;
    return recordFromObject({ ...object, link }, index);
  });
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"' && quoted && line[index + 1] === '"') {
      field += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      fields.push(field);
      field = "";
    } else {
      field += character;
    }
  }
  fields.push(field);
  return fields;
}

function parseCsv(payload: string) {
  const lines = payload.replace(/\r/g, "").split("\n").filter((line) => line.trim());
  const headers = parseCsvLine(lines.shift() ?? "");
  return lines.map((line, index) => recordFromObject(Object.fromEntries(
    parseCsvLine(line).map((field, fieldIndex) => [headers[fieldIndex] || `field${fieldIndex + 1}`, field])
  ), index));
}

function parseWeather(payload: string): NormalizedContentRecord[] {
  const data = JSON.parse(payload) as Record<string, any>;
  const records: NormalizedContentRecord[] = [];
  if (data.current) {
    records.push(recordFromObject({
      id: "current",
      title: "Current conditions",
      ...data.current,
      units: data.current_units ?? {}
    }, 0));
  }
  const daily = data.daily as Record<string, unknown[]> | undefined;
  const dates = daily?.time ?? [];
  dates.forEach((date, index) => {
    const item = Object.fromEntries(Object.entries(daily ?? {}).map(([key, list]) => [key, list[index]]));
    records.push(recordFromObject({ id: `forecast-${date}`, title: String(date), ...item }, index + 1));
  });
  return records;
}

export function parseSourcePayload(source: ContentSource, payload: string): NormalizedContentRecord[] {
  if (source.kind === "rss" || source.kind === "atom") return parseXml(payload);
  if (source.kind === "csv") return parseCsv(payload);
  if (source.kind === "text") {
    return payload.replace(/\r/g, "").split("\n").filter(Boolean)
      .map((line, index) => recordFromObject({ id: `line-${index + 1}`, title: line }, index));
  }
  if (source.kind === "weather") return parseWeather(payload);
  if (source.kind === "json") {
    const data = JSON.parse(payload) as unknown;
    const collection = Array.isArray(data)
      ? data
      : Array.isArray((data as Record<string, unknown>)?.records)
        ? (data as Record<string, unknown>).records as unknown[]
        : [data];
    return collection.map((item, index) => recordFromObject(item as Record<string, unknown>, index));
  }
  if (source.kind === "manual") return [];
  throw new Error(`Content source kind ${source.kind} is not supported for automated publication`);
}
