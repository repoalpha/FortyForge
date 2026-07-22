import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

import type { Template, TemplatePackageManifest } from "../model/types";
import { projectSchema } from "../model/schema";

function templateContentHash(template: Template) {
  const bytes = strToU8(JSON.stringify(template));
  let hash = 0x811c9dc5;
  for (const byte of bytes) hash = Math.imul(hash ^ byte, 0x01000193);
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function baseRowBytes(template: Template) {
  return new Uint8Array(template.rows.flatMap((row) => row.cells.map((cell) => cell.byte)));
}

function previewSvg(template: Template) {
  const escape = (value: string) => value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&apos;"
  })[character]!);
  const rows = template.rows.map((row) => row.cells.map((cell) => {
    if (cell.byte < 0x20) return " ";
    return cell.character?.value ?? (cell.byte === 0x20 ? " " : String.fromCharCode(cell.byte));
  }).join(""));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 500"><rect width="480" height="500" fill="#000"/><g fill="#fff" font-family="monospace" font-size="16">${rows.map((row, index) => `<text x="4" y="${18 + index * 20}">${escape(row)}</text>`).join("")}</g></svg>`;
}

export function exportTemplatePackage(template: Template, createdAt = new Date().toISOString()) {
  const manifest: TemplatePackageManifest = {
    format: "pixelcast-template",
    formatVersion: "1",
    templateId: template.id,
    templateVersion: template.templateVersion,
    requiredPixelcastVersion: template.requiredPixelcastVersion,
    createdAt,
    contentHash: templateContentHash(template)
  };

  const files: Record<string, Uint8Array> = {
    "manifest.json": strToU8(`${JSON.stringify(manifest, null, 2)}\n`),
    "layout.json": strToU8(`${JSON.stringify(template, null, 2)}\n`),
    "base/page.bin": baseRowBytes(template),
    "enhancements.json": strToU8("[]\n"),
    "preview.svg": strToU8(previewSvg(template)),
    "artwork/README.txt": strToU8("Artwork and mosaic alphabets used by this template are stored here when present.\n")
  };
  for (const fixture of template.fixtures) {
    files[`fixtures/${fixture.kind}.json`] = strToU8(`${JSON.stringify(fixture, null, 2)}\n`);
  }
  return zipSync(files, { level: 6 });
}

export function importTemplatePackage(bytes: Uint8Array): Template {
  const files = unzipSync(bytes);
  if (!files["manifest.json"] || !files["layout.json"]) {
    throw new Error("Invalid Pixelcast template package");
  }
  const manifest = JSON.parse(strFromU8(files["manifest.json"])) as TemplatePackageManifest;
  if (manifest.format !== "pixelcast-template" || manifest.formatVersion !== "1") {
    throw new Error("Unsupported Pixelcast template package");
  }
  const template = JSON.parse(strFromU8(files["layout.json"])) as Template;
  const parsed = projectSchema.shape.templates.element.parse(template) as Template;
  if (parsed.id !== manifest.templateId || parsed.templateVersion !== manifest.templateVersion) {
    throw new Error("Template manifest does not match layout");
  }
  if (manifest.contentHash !== templateContentHash(parsed)) {
    throw new Error("Template package content hash does not match layout");
  }
  const base = files["base/page.bin"];
  if (!base || base.length !== 1000 || !base.every((byte, index) => byte === baseRowBytes(parsed)[index])) {
    throw new Error("Template package base page does not match layout");
  }
  return parsed;
}
