#!/usr/bin/env node
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  compileProjectContent,
  createPixelcastPocProject,
  exportNativeProject,
  importNativeProject,
  refreshProjectSources,
  validateProject
} from "../core/index";
import type { Project } from "../core/index";
import { createBroadcastBundle, writeBroadcastBundle } from "./bundle";
import { nodeSourceLoader } from "./sourceLoader";

interface ParsedArguments {
  command: string;
  projectPath: string;
  options: Map<string, string | true>;
  positionals: string[];
}

function parseArguments(argv: string[]): ParsedArguments {
  const [command = "help", projectPath = "", ...rest] = argv;
  const options = new Map<string, string | true>();
  const positionals: string[] = [];
  for (let index = 0; index < rest.length; index += 1) {
    const item = rest[index];
    if (!item.startsWith("--")) {
      positionals.push(item);
      continue;
    }
    const equals = item.indexOf("=");
    if (equals > 2) {
      options.set(item.slice(2, equals), item.slice(equals + 1));
      continue;
    }
    const next = rest[index + 1];
    if (next && !next.startsWith("--")) {
      options.set(item.slice(2), next);
      index += 1;
    } else {
      options.set(item.slice(2), true);
    }
  }
  return { command, projectPath, options, positionals };
}

function usage() {
  return [
    "Pixelcast Publisher",
    "",
    "  npm run pixelcast -- validate service.pixelcast.json",
    "  npm run pixelcast -- init-poc examples/pixelcast-poc.pixelcast.json",
    "  npm run pixelcast -- refresh service.pixelcast.json all",
    "  npm run pixelcast -- build service.pixelcast.json ./output/pixelcast",
    "  npm run pixelcast -- publish service.pixelcast.json -- --target=pit-dev",
    "",
    "Named targets resolve through PIXELCAST_TARGET_<NAME> (legacy FORTYFORGE_TARGET_<NAME> is accepted)."
  ].join("\n");
}

async function loadProject(projectPath: string) {
  if (!projectPath) throw new Error("A Pixelcast project path is required");
  return importNativeProject(await readFile(path.resolve(projectPath), "utf8"));
}

async function saveProject(projectPath: string, project: Project) {
  const target = path.resolve(projectPath);
  const temporary = `${target}.tmp`;
  await writeFile(temporary, exportNativeProject(project));
  await rename(temporary, target);
}

function validateForPublication(project: Project) {
  const projectIssues = validateProject(project);
  const compileIssues = compileProjectContent(project).flatMap((snapshot) => snapshot.diagnostics);
  return { projectIssues, compileIssues, errors: [
    ...projectIssues.filter((item) => item.severity === "error").map((item) => `${item.id}: ${item.message}`),
    ...compileIssues.filter((item) => item.severity === "error").map((item) => `${item.code}: ${item.message}`)
  ] };
}

function targetEnvironmentName(target: string, legacy = false) {
  const prefix = legacy ? "FORTYFORGE_TARGET_" : "PIXELCAST_TARGET_";
  return `${prefix}${target.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`;
}

function resolveTarget(target: string) {
  if (!target) return "";
  if (target.includes("/") || target.includes("\\") || /^[A-Za-z]:/.test(target)) return target;
  return process.env[targetEnvironmentName(target)]
    ?? process.env[targetEnvironmentName(target, true)]
    ?? "";
}

async function refresh(project: Project, sourceOption: string | true | undefined) {
  const sourceIds = !sourceOption || sourceOption === true || sourceOption === "all"
    ? undefined
    : new Set(String(sourceOption).split(","));
  return refreshProjectSources(project, nodeSourceLoader, new Date(), sourceIds);
}

async function build(project: Project, output: string) {
  const validation = validateForPublication(project);
  if (validation.errors.length > 0) {
    throw new Error(`Publication blocked:\n${validation.errors.map((item) => `- ${item}`).join("\n")}`);
  }
  const bundle = createBroadcastBundle(project);
  const written = await writeBroadcastBundle(path.resolve(output), bundle);
  await mkdir(path.resolve(output, "reports"), { recursive: true });
  await writeFile(path.resolve(output, "reports", `${bundle.manifest.releaseId}.json`), `${JSON.stringify({
    releaseId: bundle.manifest.releaseId,
    publisherId: bundle.manifest.publisherId,
    channelId: bundle.manifest.channelId,
    generatedAt: bundle.manifest.generatedAt,
    pages: bundle.manifest.pages.length,
    validation
  }, null, 2)}\n`);
  return { bundle, written };
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArguments(argv);
  if (args.command === "help" || args.command === "--help" || !args.projectPath) {
    process.stdout.write(`${usage()}\n`);
    return 0;
  }
  if (args.command === "init-poc") {
    const project = createPixelcastPocProject(new Date());
    const target = path.resolve(args.projectPath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, exportNativeProject(project), { flag: args.options.has("force") ? "w" : "wx" });
    process.stdout.write(`${target}\n`);
    return 0;
  }
  let project = await loadProject(args.projectPath);

  if (args.command === "validate") {
    const validation = validateForPublication(project);
    process.stdout.write(`${JSON.stringify(validation, null, 2)}\n`);
    return validation.errors.length > 0 ? 1 : 0;
  }

  if (args.command === "refresh") {
    const refreshed = await refresh(project, args.options.get("source") ?? args.positionals[0]);
    await saveProject(args.projectPath, refreshed.project);
    process.stdout.write(`${JSON.stringify(refreshed.diagnostics, null, 2)}\n`);
    return refreshed.diagnostics.some((item) => item.severity === "error") ? 1 : 0;
  }

  if (args.command === "publish") {
    const refreshed = await refresh(project, args.options.get("source"));
    project = refreshed.project;
    await saveProject(args.projectPath, project);
  }

  if (args.command === "build" || args.command === "publish") {
    const output = String(args.options.get("out") || args.positionals[0] || "output/pixelcast");
    const result = await build(project, output);
    if (args.command === "publish") {
      const targetName = String(args.options.get("target") || "");
      const target = resolveTarget(targetName);
      if (targetName && !target) throw new Error(`Target ${targetName} is not configured`);
      if (target) await writeBroadcastBundle(path.resolve(target), result.bundle);
    }
    process.stdout.write(`${JSON.stringify({
      releaseId: result.bundle.manifest.releaseId,
      channelId: result.bundle.manifest.channelId,
      releaseDirectory: result.written.releaseDirectory
    }, null, 2)}\n`);
    return 0;
  }

  throw new Error(`Unknown command ${args.command}`);
}

main().then((code) => {
  process.exitCode = code;
}).catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
