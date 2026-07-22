# Pixelcast

Pixelcast is a standards-aware teletext production and broadcasting system.

- **Pixelcast Studio** designs byte-correct 40×25 pages, reusable templates, mosaic artwork, content slots, and services.
- **Pixelcast Publisher** refreshes approved sources, compiles templates, validates Level 1 output, and publishes immutable channel releases.
- **Pixelcast Subscribers** are PIT devices that verify and play a Publisher channel with clocks, flashing, navigation, and weighted carousels.

The authoring model always retains a complete Level 1/1.5 base page. Presentation Level 2.5 enhancements are additive work and cannot replace the backwards-compatible base.

## Studio

```powershell
npm install
npm run dev
```

Studio saves projects as `*.pixelcast.json` and imports schema-1 `.pttx`/`.pttx.json` projects. Existing `fortyforge.*` browser preferences migrate automatically to `pixelcast.*` keys.

## End-To-End POC

```powershell
npm run pixelcast -- init-poc examples/pixelcast-poc.pixelcast.json
npm run pixelcast -- refresh examples/pixelcast-poc.pixelcast.json all
npm run pixelcast -- build examples/pixelcast-poc.pixelcast.json output/pixelcast
```

This produces index, paginated news, Brisbane weather, and AUD/FOREX pages. Each channel head and page payload carries a SHA-256 hash. See [Publisher and Subscriber documentation](docs/technical/pixelcast-publisher-subscriber.md).

On the PIT checkout:

```sh
cmake -S . -B build-host -DCMAKE_BUILD_TYPE=Debug
cmake --build build-host -j2
build-host/tools/pi-teletext-pixelcast-check /path/to/output/pixelcast service-default /tmp/pixelcast-preview
```

The SDL player subscribes using `PIXELCAST_ROOT` and `PIXELCAST_CHANNEL`. It retains its last valid release when an update is missing, truncated, unsafe, or fails verification.

## Verification

```powershell
npm run build
npm test
```

PIT remains the reference renderer for strict 480×500 playout behavior. Pixelcast Studio never uses browser fonts for the teletext framebuffer.
