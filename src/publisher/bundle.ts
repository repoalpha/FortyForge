import { createHash } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { compilePageContent, exportTti, validateProject } from "../core/index";
import type { CompiledPageSnapshot, Project, ServiceScheduleEntry } from "../core/index";
import type { BroadcastManifest, BroadcastPageEntry, ChannelHead } from "./types";

function sha256(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}

function rowBytes(snapshot: CompiledPageSnapshot) {
  const bytes = new Uint8Array(1000);
  snapshot.rows.forEach((row, rowIndex) => row.cells.forEach((cell, column) => {
    if (rowIndex < 25 && column < 40) bytes[rowIndex * 40 + column] = cell.kind === "empty" ? 0x20 : cell.byte & 0x7f;
  }));
  return bytes;
}

function scheduleFor(project: Project, serviceId: string, snapshot: CompiledPageSnapshot): ServiceScheduleEntry | undefined {
  const service = project.services.find((item) => item.id === serviceId)!;
  return service.schedule.entries.find((item) =>
    item.pageId === snapshot.pageId && (!item.subpageId || item.subpageId === snapshot.subpageId)
  );
}

function ttiForSnapshot(project: Project, serviceId: string, snapshot: CompiledPageSnapshot, now: Date) {
  const copy = structuredClone(project) as Project;
  const service = copy.services.find((item) => item.id === serviceId)!;
  const page = service.pages.find((item) => item.id === snapshot.pageId)!;
  page.subpages = [{
    id: snapshot.subpageId,
    subcode: snapshot.subcode,
    rows: snapshot.rows,
    enhancementPackets: snapshot.enhancementPackets,
    glyphReferences: [],
    carousel: { enabled: false, delaySeconds: 8, priority: "normal" }
  }];
  return exportTti(copy, { serviceId, pageId: page.id, subpageId: snapshot.subpageId, now });
}

export function createBroadcastBundle(
  project: Project,
  options: { serviceId?: string; publisherId?: string; channelId?: string; now?: Date } = {}
) {
  const now = options.now ?? new Date();
  const service = project.services.find((item) => item.id === options.serviceId) ?? project.services[0];
  const validationIssues = validateProject(project);
  const snapshots = service.pages.flatMap((page) => compilePageContent(project, page));
  const compileErrors = snapshots.flatMap((snapshot) => snapshot.diagnostics.filter((item) => item.severity === "error"));
  if (validationIssues.some((item) => item.severity === "error") || compileErrors.length > 0) {
    throw new Error(`Publication blocked by ${validationIssues.length + compileErrors.length} validation error(s)`);
  }

  const publisherId = options.publisherId ?? project.metadata.id;
  const channelId = options.channelId ?? service.id;
  const sequence = now.getTime();
  const releaseSeed = `${publisherId}:${channelId}:${sequence}:${snapshots.map((item) => item.pageId + item.subcode).join(",")}`;
  const releaseId = `${now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${sha256(releaseSeed).slice(0, 12)}`;
  const files = new Map<string, string | Uint8Array>();
  const pages: BroadcastPageEntry[] = snapshots.map((snapshot) => {
    const rows = rowBytes(snapshot);
    const page = service.pages.find((item) => item.id === snapshot.pageId)!;
    const schedule = scheduleFor(project, service.id, snapshot);
    const fileBase = `${snapshot.pageNumber}-${snapshot.subcode}`;
    const rowsFile = `pages/${fileBase}.bin`;
    const ttiFile = `pages/${fileBase}.tti`;
    files.set(rowsFile, rows);
    files.set(ttiFile, ttiForSnapshot(project, service.id, snapshot, now));
    return {
      pageId: snapshot.pageId,
      pageNumber: snapshot.pageNumber,
      subpageId: snapshot.subpageId,
      subcode: snapshot.subcode,
      rowsFile,
      ttiFile,
      sha256: sha256(rows),
      byteLength: 1000,
      clockMode: page.metadata.header.clockMode,
      showLocalDate: page.metadata.header.showLocalDate,
      dwellSeconds: schedule?.dwellSeconds ?? page.subpages[0].carousel.delaySeconds ?? service.schedule.defaultDwellSeconds,
      repeatWeight: schedule?.repeatWeight ?? 1,
      priority: schedule?.priority ?? (page.subpages[0].carousel.priority === "high" ? "high" : "normal"),
      validFrom: schedule?.validFrom,
      validUntil: schedule?.validUntil,
      sourceTimestamps: snapshot.sourceTimestamps,
      attributions: snapshot.attributions
    };
  });
  const manifest: BroadcastManifest = {
    format: "pixelcast-broadcast",
    formatVersion: "1",
    publisherId,
    channelId,
    releaseId,
    sequence,
    generatedAt: now.toISOString(),
    serviceId: service.id,
    serviceName: service.name,
    presentationLevel: service.defaultPresentationLevel === "1.5" ? "1.5" : "1",
    pages
  };
  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
  files.set("manifest.json", manifestText);
  const channel: ChannelHead = {
    format: "pixelcast-channel",
    formatVersion: "1",
    publisherId,
    channelId,
    releaseId,
    sequence,
    manifestPath: `releases/${releaseId}/manifest.json`,
    manifestSha256: sha256(manifestText),
    publishedAt: now.toISOString()
  };
  return { manifest, channel, files };
}

export async function writeBroadcastBundle(
  root: string,
  bundle: ReturnType<typeof createBroadcastBundle>
) {
  const releaseDirectory = path.join(root, "releases", bundle.manifest.releaseId);
  const stagingDirectory = `${releaseDirectory}.tmp`;
  await rm(stagingDirectory, { recursive: true, force: true });
  for (const [relativePath, content] of bundle.files) {
    const target = path.join(stagingDirectory, relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
  }
  await mkdir(path.dirname(releaseDirectory), { recursive: true });
  await rename(stagingDirectory, releaseDirectory);
  const channelDirectory = path.join(root, "channels", bundle.manifest.channelId);
  await mkdir(channelDirectory, { recursive: true });
  const headPath = path.join(channelDirectory, "current.json");
  const temporaryHead = `${headPath}.tmp`;
  await writeFile(temporaryHead, `${JSON.stringify(bundle.channel, null, 2)}\n`);
  await rename(temporaryHead, headPath);
  return { releaseDirectory, headPath };
}
