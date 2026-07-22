import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { ContentSource } from "../core/index";
import type { SourceLoader } from "../core/index";

function localPath(uri: string) {
  if (uri.startsWith("file:")) return fileURLToPath(uri);
  return path.resolve(uri);
}

export const nodeSourceLoader: SourceLoader = async (source: ContentSource) => {
  if (/^https?:\/\//i.test(source.uri)) {
    const headers: Record<string, string> = {
      "user-agent": "Pixelcast-Publisher/0.2"
    };
    if (source.credentialEnvironmentVariable) {
      const credential = process.env[source.credentialEnvironmentVariable];
      if (!credential) throw new Error(`credential ${source.credentialEnvironmentVariable} is not configured`);
      headers.authorization = `Bearer ${credential}`;
    }
    const response = await fetch(source.uri, { headers, signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
    return { payload: await response.text(), sourceUri: response.url };
  }
  return { payload: await readFile(localPath(source.uri), "utf8"), sourceUri: source.uri };
};
