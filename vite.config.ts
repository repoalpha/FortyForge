import react from "@vitejs/plugin-react";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { IncomingMessage, ServerResponse } from "node:http";
import { defineConfig, type Plugin } from "vite";

const MAX_FEED_BYTES = 1_000_000;
const MAX_REDIRECTS = 4;

function isPrivateAddress(address: string) {
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    return a === 0
      || a === 10
      || a === 127
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168)
      || a >= 224;
  }

  const normalized = address.toLowerCase();
  return normalized === "::1"
    || normalized === "::"
    || normalized.startsWith("fc")
    || normalized.startsWith("fd")
    || normalized.startsWith("fe8")
    || normalized.startsWith("fe9")
    || normalized.startsWith("fea")
    || normalized.startsWith("feb")
    || normalized.startsWith("::ffff:127.")
    || normalized.startsWith("::ffff:10.")
    || normalized.startsWith("::ffff:192.168.");
}

async function validateRemoteUrl(value: string) {
  const url = new URL(value);
  if (!(["http:", "https:"] as string[]).includes(url.protocol)) {
    throw new Error("Only HTTP and HTTPS feed URLs are allowed.");
  }
  if (url.username || url.password) {
    throw new Error("Credentials are not allowed in a feed URL.");
  }
  if (url.port && !(["80", "443"] as string[]).includes(url.port)) {
    throw new Error("Feed URLs must use the standard HTTP or HTTPS port.");
  }
  const addresses = await lookup(url.hostname, { all: true });
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error("Local and private network addresses cannot be previewed.");
  }
  return url;
}

async function fetchRemoteFeed(initialUrl: string) {
  let url = await validateRemoteUrl(initialUrl);

  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const response = await fetch(url, {
      headers: {
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, application/json, text/plain;q=0.8",
        "User-Agent": "Pixelcast-Studio/0.2 feed-preview"
      },
      redirect: "manual",
      signal: AbortSignal.timeout(15_000)
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("The feed redirected without a destination.");
      url = await validateRemoteUrl(new URL(location, url).toString());
      continue;
    }
    if (!response.ok) throw new Error(`Feed returned HTTP ${response.status}.`);
    const declaredLength = Number(response.headers.get("content-length") ?? 0);
    if (declaredLength > MAX_FEED_BYTES) throw new Error("Feed is larger than the 1 MB preview limit.");
    const payload = await response.text();
    if (new TextEncoder().encode(payload).byteLength > MAX_FEED_BYTES) {
      throw new Error("Feed is larger than the 1 MB preview limit.");
    }
    return {
      payload,
      contentType: response.headers.get("content-type") ?? "text/plain",
      finalUrl: url.toString(),
      fetchedAt: new Date().toISOString()
    };
  }

  throw new Error("The feed redirected too many times.");
}

function feedPreviewMiddleware(request: IncomingMessage, response: ServerResponse, next: () => void) {
  const requestUrl = new URL(request.url ?? "/", "http://pixelcast.local");
  if (requestUrl.pathname !== "/api/pixelcast/feed-preview") {
    next();
    return;
  }

  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  const sourceUrl = requestUrl.searchParams.get("url");
  if (!sourceUrl) {
    response.statusCode = 400;
    response.end(JSON.stringify({ error: "A feed URL is required." }));
    return;
  }

  void fetchRemoteFeed(sourceUrl)
    .then((result) => response.end(JSON.stringify(result)))
    .catch((error: unknown) => {
      response.statusCode = 502;
      response.end(JSON.stringify({
        error: error instanceof Error ? error.message : "Could not fetch feed."
      }));
    });
}

function pixelcastFeedPreviewPlugin(): Plugin {
  return {
    name: "pixelcast-feed-preview",
    configureServer(server) {
      server.middlewares.use(feedPreviewMiddleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(feedPreviewMiddleware);
    }
  };
}

export default defineConfig({
  plugins: [react(), pixelcastFeedPreviewPlugin()]
});
