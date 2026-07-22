# Pixelcast Publisher And Subscribers

Pixelcast uses a publish/subscribe model. Pixelcast Publisher compiles a project into an immutable broadcast release. PIT devices are Pixelcast Subscribers: they poll a channel head, validate the complete release, and activate it atomically.

## POC Workflow

From the Pixelcast Studio repository:

```powershell
npm install
npm run pixelcast -- init-poc examples/pixelcast-poc.pixelcast.json
npm run pixelcast -- refresh examples/pixelcast-poc.pixelcast.json all
npm run pixelcast -- build examples/pixelcast-poc.pixelcast.json output/pixelcast
```

The Windows wrapper can be used directly as `pixelcast.cmd` from Command Prompt or as `.\pixelcast.cmd` from PowerShell.

The generated broadcast root contains:

```text
channels/<channel-id>/current.json
releases/<release-id>/manifest.json
releases/<release-id>/pages/<page>-<subcode>.bin
releases/<release-id>/pages/<page>-<subcode>.tti
reports/<release-id>.json
```

`current.json` is the channel head. It identifies the Publisher, channel, monotonically increasing sequence, release manifest, and manifest SHA-256. Every manifest page has its own SHA-256 and exact 1,000-byte Level 1 payload.

Publication writes the release into a temporary directory, renames it into place, and then atomically replaces the channel head. A Subscriber never observes a partially generated release.

## PIT Subscriber

PIT reads these environment variables:

- `PIXELCAST_ROOT`: broadcast root, default `/opt/pixelcast`.
- `PIXELCAST_CHANNEL`: subscribed channel ID, default `service-default`.

At startup and once per second, PIT checks the channel head. A newer release is accepted only when:

- channel and manifest format versions are supported;
- sequence and channel identity agree;
- the manifest SHA-256 matches;
- every page path is relative and traversal-free;
- every page is exactly 1,000 bytes and matches its SHA-256;
- at least one page is present.

If any check fails, PIT continues displaying the last valid release. The Subscriber owns the header clock, flash phase, manual navigation, dwell timing, repeat weighting, and emergency-only schedule selection.

The headless checker validates and renders a broadcast without SDL:

```sh
build-host/tools/pi-teletext-pixelcast-check /opt/pixelcast service-default /tmp/pixelcast-preview
```

## Transport

The POC copies the broadcast directory through a local, UNC, SCP, or rsync deployment step. The contract deliberately uses relative manifest paths so a later HTTPS Publisher endpoint can serve the same channel and release files unchanged. Subscriber devices consume compiled pages; they do not fetch or interpret RSS, weather, finance, or flight feeds.

## Rights And Secrets

Enabled automated sources require recorded operator approval. Sources requiring attribution cannot publish without attribution text. Web extraction is disabled in the POC. Credentials are environment-variable references and are never serialized into Pixelcast project, template, or broadcast files.

## Data Source Workspace

Studio now treats feeds as project resources rather than one temporary news form. Each source has its own name, format, endpoint, rights record, attribution, refresh mode, interval, stale threshold, normalized snapshots, and page bindings. The Feeds tab can switch among saved sources, restore their last normalized records, and jump to every page bound to the selected source.

There are two deliberately different placement operations:

- **Place one-time snapshot** writes the current record into the selected page area. Long records can create a timed subpage carousel, but later source refreshes do not rewrite it.
- **Bind source live** connects a source to a typed template slot. Publisher compilation regenerates that slot from the latest valid snapshot, preserves locked template artwork, and creates deterministic continuation subpages when the slot uses `add-subpage` overflow.

Manual refresh is usable in Studio now. `on-export` and per-source interval policies are serialized now and are the contract for the scheduled Publisher stage; Studio does not pretend that a background scheduler is running when it is not.

## Connector Staging

The source model separates transport from normalized records so Pixelcast is not restricted to news. The current HTTP preview and Publisher loaders cover RSS, Atom, JSON, CSV, and plain text. The next connector registry is reserved for:

- MQTT subscriptions and retained topics;
- authenticated HTTP APIs and inbound webhooks;
- UDP datagrams and low-speed local telemetry;
- local files, serial gateways, and operator-owned database adapters;
- ETSI/TTI/T42 or 40-byte-row teletext-native ingress.

Those connectors will normalize into the same records, source health, freshness, approval, and page-binding pipeline. A Raspberry Pi sensor may therefore send ordinary JSON or teletext-native data, while Subscribers remain purpose-neutral and only ingest validated compiled releases. Transport-specific credentials and decoding settings belong to connector configuration; ETSI page layout remains owned by the template compiler.
