import { level1ByteForG0Character, normalizeTextForLevel1 } from "../standards/g0Charset";
import { displaySubpageSubcode, MAX_DISPLAY_SUBPAGES } from "../standards/subpages";
import type {
  Cell,
  CompiledPageSnapshot,
  ContentBinding,
  ContentSnapshot,
  NormalizedContentRecord,
  Page,
  Project,
  Template,
  TemplateCompileDiagnostic,
  TemplateRegion,
  TeletextRow
} from "../model/types";
import { getBuiltInTemplate } from "./builtInTemplates";

function cloneRows(rows: TeletextRow[]) {
  return structuredClone(rows) as TeletextRow[];
}

function fieldValue(record: NormalizedContentRecord, field: string): string {
  const direct = record[field as keyof NormalizedContentRecord];
  const value = direct ?? record.fields[field];
  return value === undefined || value === null ? "" : String(value);
}

function applyTextCase(value: string, mode: ContentBinding["transform"]["textCase"]) {
  if (mode === "upper") return value.toUpperCase();
  if (mode === "teletext-title") {
    return value.toLowerCase().replace(/(^|\s)\S/g, (character) => character.toUpperCase());
  }
  return value;
}

function wrapText(value: string, width: number): string[] {
  const paragraphs = value.replace(/\r/g, "").split("\n");
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let current = "";
    for (const word of words) {
      if (word.length > width) {
        if (current) lines.push(current);
        for (let offset = 0; offset < word.length; offset += width) {
          lines.push(word.slice(offset, offset + width));
        }
        current = "";
      } else if (!current) {
        current = word;
      } else if (current.length + 1 + word.length <= width) {
        current += ` ${word}`;
      } else {
        lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

function sortedRecords(records: NormalizedContentRecord[], binding: ContentBinding) {
  const selected = records.slice();
  if (binding.transform.sort === "newest-first" || binding.transform.sort === "oldest-first") {
    selected.sort((left, right) => {
      const leftDate = Date.parse(left.updatedAt ?? left.publishedAt ?? "") || 0;
      const rightDate = Date.parse(right.updatedAt ?? right.publishedAt ?? "") || 0;
      return binding.transform.sort === "newest-first" ? rightDate - leftDate : leftDate - rightDate;
    });
  } else if (binding.transform.sort === "priority") {
    selected.sort((left, right) => (right.priority ?? 0) - (left.priority ?? 0));
  }
  return selected.slice(0, binding.transform.maxItems);
}

function recordLines(record: NormalizedContentRecord, binding: ContentBinding, width: number) {
  const mappings = binding.transform.fields.length > 0
    ? binding.transform.fields
    : [{ sourceField: "title", maxChars: width, includeWhenEmpty: false }];
  const lines: string[] = [];

  for (const mapping of mappings) {
    const raw = fieldValue(record, mapping.sourceField);
    if (!raw && !mapping.includeWhenEmpty) continue;
    const label = mapping.label ? `${mapping.label}: ` : "";
    const value = normalizeTextForLevel1(
      applyTextCase(`${label}${raw}`, binding.transform.textCase)
    )
      .slice(0, Math.max(mapping.maxChars, width));
    lines.push(...wrapText(value, width));
  }
  return lines;
}

function contentLines(
  binding: ContentBinding,
  records: NormalizedContentRecord[],
  region: TemplateRegion,
  attribution: string
) {
  const width = region.bounds.endColumn - region.bounds.startColumn + 1;
  const lines = sortedRecords(records, binding).flatMap((record, index, selected) => [
    ...recordLines(record, binding, width),
    ...(index < selected.length - 1 ? [""] : [])
  ]);

  if (region.attributionRequired) {
    if (!attribution.trim()) return { lines, attributionMissing: true };
    lines.push(...Array.from({ length: binding.transform.attributionGapRows ?? 0 }, () => ""));
    lines.push(...wrapText(attribution, width));
  }

  return { lines: lines.length > 0 ? lines : wrapText(region.fallbackText, width), attributionMissing: false };
}

function blankCell(column: number): Cell {
  return { column, kind: "empty", byte: 0x20, annotations: [] };
}

function textCell(column: number, character: string, region: TemplateRegion): Cell | undefined {
  const byte = level1ByteForG0Character(character);
  if (byte === undefined && region.characterPolicy === "level1-reject") return undefined;
  const value = byte === undefined ? "?" : character;
  return {
    column,
    kind: value === " " ? "empty" : "character",
    byte: byte ?? 0x3f,
    ...(value === " " ? {} : { character: { value, charset: "G0" as const } }),
    annotations: []
  };
}

function writeRegion(
  rows: TeletextRow[],
  region: TemplateRegion,
  lines: string[],
  pageId: string,
  diagnostics: TemplateCompileDiagnostic[]
) {
  const width = region.bounds.endColumn - region.bounds.startColumn + 1;
  const writable = region.writableColumns ? new Set(region.writableColumns) : undefined;

  for (let rowOffset = 0; rowOffset <= region.bounds.endRow - region.bounds.startRow; rowOffset += 1) {
    const row = rows[region.bounds.startRow + rowOffset];
    const source = (lines[rowOffset] ?? "").padEnd(width, " ").slice(0, width);
    for (let columnOffset = 0; columnOffset < width; columnOffset += 1) {
      const column = region.bounds.startColumn + columnOffset;
      if (writable && !writable.has(column)) continue;
      if (region.lockedControlCodes && row.cells[column]?.kind === "control") continue;
      const cell = textCell(column, source[columnOffset], region);
      if (!cell) {
        diagnostics.push({
          severity: "error",
          code: "unsupported-character",
          message: `Region ${region.label} contains a character unavailable in Level 1.`,
          pageId,
          regionId: region.id
        });
        row.cells[column] = blankCell(column);
      } else {
        row.cells[column] = cell;
      }
    }
  }
}

function writeContinuationFooter(
  rows: TeletextRow[],
  pageNumber: string,
  current: number,
  total: number
) {
  if (total <= 1) return;
  const label = `P${pageNumber}  ${current}/${total}  MORE`.padEnd(40, " ").slice(0, 40);
  const row = rows[24];
  for (let column = 0; column < 40; column += 1) {
    const character = label[column];
    const byte = level1ByteForG0Character(character) ?? 0x3f;
    row.cells[column] = {
      column,
      kind: character === " " ? "empty" : "character",
      byte,
      ...(character === " " ? {} : { character: { value: character, charset: "G0" as const } }),
      annotations: []
    };
  }
}

function templateForPage(project: Project, page: Page): Template | undefined {
  if (!page.metadata.templateId) return undefined;
  return project.templates.find((item) => item.id === page.metadata.templateId)
    ?? getBuiltInTemplate(page.metadata.templateId);
}

export function compilePageContent(project: Project, page: Page): CompiledPageSnapshot[] {
  const template = templateForPage(project, page);
  if (!template || page.contentBindings.length === 0) {
    return page.subpages.map((subpage) => ({
      pageId: page.id,
      pageNumber: page.pageNumber,
      subpageId: subpage.id,
      subcode: subpage.subcode,
      rows: cloneRows(subpage.rows),
      enhancementPackets: structuredClone(subpage.enhancementPackets),
      sourceTimestamps: {},
      attributions: [],
      diagnostics: []
    }));
  }

  const work = page.contentBindings.map((binding) => {
    const region = template.regions.find((item) => item.id === binding.templateRegionId);
    const source = project.contentSources.find((item) => item.id === binding.sourceId);
    const snapshot = project.contentSnapshots
      .filter((item) => item.sourceId === binding.sourceId && item.status !== "error")
      .sort((left, right) => right.capturedAt.localeCompare(left.capturedAt))[0];
    if (!region || !source) return { binding, region, source, snapshot, chunks: [[]] as string[][], missing: true };
    const result = contentLines(binding, snapshot?.records ?? [], region, source.policy.attributionText);
    const capacity = region.bounds.endRow - region.bounds.startRow + 1;
    const overflow = result.lines.length > capacity;
    let chunks = [result.lines.slice(0, capacity)];
    if (overflow && binding.transform.overflowPolicy === "add-subpage") {
      chunks = Array.from({ length: Math.ceil(result.lines.length / capacity) }, (_, index) =>
        result.lines.slice(index * capacity, (index + 1) * capacity)
      );
    } else if (overflow && binding.transform.overflowPolicy === "ellipsis") {
      chunks[0][capacity - 1] = `${chunks[0][capacity - 1].slice(0, Math.max(0,
        region.bounds.endColumn - region.bounds.startColumn - 2))}...`;
    }
    return { binding, region, source, snapshot, chunks, missing: false, attributionMissing: result.attributionMissing, overflow };
  });

  const requestedPageCount = Math.max(1, ...work.map((item) => item.chunks.length));
  const pageCount = Math.min(requestedPageCount, MAX_DISPLAY_SUBPAGES);
  return Array.from({ length: pageCount }, (_, index) => {
    const sourceSubpage = page.subpages[Math.min(index, page.subpages.length - 1)] ?? page.subpages[0];
    const rows = cloneRows(template.rows);
    const diagnostics: TemplateCompileDiagnostic[] = [];
    const sourceTimestamps: Record<string, string> = {};
    const attributions = new Set<string>();

    if (requestedPageCount > MAX_DISPLAY_SUBPAGES) {
      diagnostics.push({
        severity: "error",
        code: "subpage-limit",
        message: `Generated content requires ${requestedPageCount} subpages; display pages support at most ${MAX_DISPLAY_SUBPAGES}.`,
        pageId: page.id
      });
    }

    for (const item of work) {
      if (item.missing || !item.region || !item.source) {
        diagnostics.push({ severity: "error", code: "invalid-binding", message: "Binding source or template region is missing.", pageId: page.id });
        continue;
      }
      if (!item.source.policy.operatorApproved) {
        diagnostics.push({ severity: "error", code: "source-rights-unapproved", message: `Source ${item.source.label} has not been approved for publication.`, pageId: page.id, regionId: item.region.id, sourceId: item.source.id });
      }
      if (!item.snapshot && item.binding.policy.onFailure === "reject-publication") {
        diagnostics.push({ severity: "error", code: "source-unavailable", message: `Source ${item.source.label} has no valid snapshot.`, pageId: page.id, regionId: item.region.id, sourceId: item.source.id });
      }
      if (item.snapshot && item.binding.policy.staleAfterSeconds) {
        const ageSeconds = (Date.now() - Date.parse(item.snapshot.capturedAt)) / 1000;
        if (ageSeconds > item.binding.policy.staleAfterSeconds && !item.binding.policy.allowStale) {
          diagnostics.push({ severity: "error", code: "source-stale", message: `Source ${item.source.label} is stale.`, pageId: page.id, regionId: item.region.id, sourceId: item.source.id });
        }
      }
      if (item.attributionMissing) {
        diagnostics.push({ severity: "error", code: "missing-attribution", message: `Region ${item.region.label} requires attribution.`, pageId: page.id, regionId: item.region.id, sourceId: item.source.id });
      }
      if (item.overflow && item.binding.transform.overflowPolicy === "reject-update") {
        diagnostics.push({ severity: "error", code: "region-overflow", message: `Content does not fit region ${item.region.label}.`, pageId: page.id, regionId: item.region.id, sourceId: item.source.id });
      }
      if (item.snapshot) sourceTimestamps[item.source.id] = item.snapshot.capturedAt;
      if (item.source.policy.attributionRequired && item.source.policy.attributionText) attributions.add(item.source.policy.attributionText);
      writeRegion(rows, item.region, item.chunks[Math.min(index, item.chunks.length - 1)] ?? [], page.id, diagnostics);
    }

    writeContinuationFooter(rows, page.pageNumber, index + 1, pageCount);

    return {
      pageId: page.id,
      pageNumber: page.pageNumber,
      subpageId: `${page.id}-generated-${index.toString().padStart(4, "0")}`,
      subcode: displaySubpageSubcode(index, pageCount),
      rows,
      enhancementPackets: structuredClone(sourceSubpage.enhancementPackets),
      sourceTimestamps,
      attributions: [...attributions],
      diagnostics
    };
  });
}

export function compileProjectContent(project: Project) {
  return project.services.flatMap((service) => service.pages.flatMap((page) => compilePageContent(project, page)));
}
