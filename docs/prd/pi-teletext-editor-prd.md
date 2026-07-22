# Pi-Teletext Editor Product Requirements Document

Date: 2026-06-20
Status: Draft v1 for implementation planning

## Executive Summary

Pi-Teletext Editor is a standalone, local-first desktop application for creating professional `pi-teletext` pages and services. It keeps the retro teletext character intact while giving authors a modern design surface, strong validation, templates, and deterministic export into existing Raspberry Pi teletext workflows.

The product uses ETSI EN 300 706 semantics as its canonical core. The editor should preserve the page, row, packet, control-code, magazine, subpage, Level 1, Level 1.5, and enhanced-mode concepts that make teletext distinctive. It should discard analogue-only assumptions from the authoring model unless they are needed for compatibility exports or transmission timing simulation.

Version 1 should be excellent at Level 1 and Level 1.5 authoring. Level 2.5 and Level 3.5 should be represented in the data model, renderer boundaries, and validation surfaces from the start, with staged feature delivery for X/26 local enhancements, X/28/M/29 defaults, CLUTs, side panels, and DRCS glyph assets.

The native project format should be readable, versioned, and diffable. Compact binary streams are export artifacts, not the only source of truth. The editor should export to TTI and packet-oriented formats used by VBIT2, raspi-teletext, and vbit-py ecosystems.

The editor should also support dynamic content sources. Authors should be able to bind RSS/Atom feeds, weather data, local files, simple JSON/CSV, and carefully configured web extracts into named template regions such as headline lists, club notices, weather panels, and bottom tickers. Pixelcast Studio designs and validates those bindings; `pi-teletext` or a companion update worker can refresh the source data and regenerate only the affected pages or rows.

## Goals

- Make it simple to create attractive 40-column teletext pages without needing to memorize every control code.
- Preserve byte-level correctness: every visible row and export path must respect teletext's 40-byte row nature.
- Treat control characters as first-class editable objects with names, previews, and byte effects.
- Support page templates, subpage carousels, page metadata, navigation links, Fastext/TOP-friendly workflows, and service-level organization.
- Support dynamic content regions that can be updated from feeds, weather sources, topic-specific web data, local data files, and manual source snapshots.
- Support classic mosaics and staged support for later 12x10 and 6x5 DRCS glyph workflows.
- Provide deterministic import/export for practical toolchain compatibility.
- Define a future low-bandwidth transmission profile suitable for constrained links such as LoRaWAN.
- Create a technical foundation suitable for AI-assisted page generation and image-to-teletext art conversion.

## Non-Goals For V1

- Full broadcast automation, live scheduling, or real LoRaWAN transport.
- Complete Level 2.5/3.5 editing parity with specialist tools.
- A browser-only SaaS editor.
- A full AI image conversion studio.
- Analogue VBI waveform generation inside the editor.
- A general-purpose web scraper or CMS. Dynamic sources must be explicit, bounded, cached, and formatted into teletext-safe regions.

These remain planned integration or post-v1 work, but the v1 data model must not block them.

## Target Users

- Teletext hobbyists and artists creating pages for Raspberry Pi, VBIT, or archive workflows.
- Makers building low-bandwidth information displays with a retro presentation layer.
- Clubs, community groups, weather stations, and radio/ham organisations that want small automatically updated information services.
- Service authors managing multiple pages, subpages, and templates.
- Technical users who need packet-exact export, validation, and control-code visibility.
- Future AI agents that need a well-specified file format and renderer to generate pages safely.

## Product Shape

- Primary product: professional desktop app.
- Shell: Tauri desktop application.
- UI technology: TypeScript frontend, reusable renderer/domain packages.
- Storage: local project files with autosave and explicit export.
- Dynamic content: opt-in refresh from configured sources, with cached snapshots for offline editing and deterministic export.
- Visual identity: modern pro tool around an authentic retro teletext canvas.
- Integration stance: standalone editor that interfaces with `pi-teletext`, VBIT2, raspi-teletext, vbit-py, and compatible file formats.

## Standards Position

Primary reference: [ETSI EN 300 706](https://www.etsi.org/deliver/etsi_en/300700_300799/300706/01.02.01_60/en_300706v010201p.pdf). Supporting reference: [Teletext specifications wiki](https://teletext.wiki.zxnet.co.uk/wiki/ETS_300_706).

### Retain In The Canonical Model

- 8 magazines and page addressing conventions.
- 40-byte rows and packet-addressed page body.
- Header row, display rows, and optional extension packets.
- Level 1 control-code semantics for colour, graphics/text mode, hold/release graphics, background, conceal, flash, double height, and boxes where applicable.
- Level 1.5 enhancement packet concepts.
- Subpage/carousel concepts and service-level page organization.
- Higher-level hooks for X/26 local enhancement data, X/27 links, X/28 page defaults, M/29 magazine defaults, CLUTs, side panels, and DRCS pages.
- Packet-exact export semantics for T42/raw stream generation.

### Adapt For Digital Authoring

- Store authoring intent separately from packet export bytes where useful, as long as exports are deterministic.
- Allow named layers, templates, dynamic content bindings, annotations, validation state, source images, and AI provenance as project metadata.
- Offer simulated transmission profiles rather than assuming analogue broadcast timing.
- Use Unicode labels in the UI while keeping explicit teletext character set mapping in the model.

### Discard From The Core Authoring Model

- VBI line allocation, waveform amplitude, clock run-in, framing code, and analogue timing except as export/reference metadata.
- Receiver-specific quirks unless captured as preview profiles.
- Broadcast-only service assumptions where a digital low-bandwidth service can use explicit manifests.

## Core Workflows

### Create A Page

1. User chooses a service or creates a project.
2. User selects a template such as index page, news page, weather panel, caption/subtitle, artwork canvas, or blank page.
3. Editor creates a page with page number, magazine, subpage, language/charset, presentation level target, and export profile.
4. User edits on a 40-column canvas with row guides and optional safe-zone overlays.
5. Validation panel reports byte-level, control-code, and mode-compatibility warnings.

### Edit Text And Control Codes

1. User types normally into cells.
2. Control codes can be inserted through palette, shortcut, or inspector.
3. Control codes render as compact named chips in edit mode and as their visual effect in preview mode.
4. The inspector shows byte value, semantic name, affected cells, mode support, and export impact.

### Edit Mosaics

1. User switches cells between text and mosaic modes.
2. User paints block mosaics with separated/contiguous options.
3. Editor exposes hold graphics and release graphics behavior clearly.
4. Brush, rectangle, fill, copy, paste, flip, shift, and nudge operations operate on selected cell regions.

### Manage Pages And Subpages

1. Service navigator lists pages by magazine/page/subpage.
2. User can create, duplicate, reorder, and delete subpages.
3. Carousel settings define labels, default delay, transmission priority, and export inclusion.
4. Page metadata captures description, tags, template origin, publication state, and compatibility targets.

### Bind Dynamic Content To A Template Region

1. User chooses a template with named regions such as `main-headlines`, `weather-summary`, `club-activities`, or `bottom-ticker`.
2. User adds a content source: RSS/Atom feed, weather provider, local JSON/CSV/text file, manual snapshot, or configured web extract.
3. User maps source fields into a region using teletext-aware rules for title, summary, timestamp, priority, truncation, wrapping, colour/control-code style, fallback text, and update interval.
4. Editor previews the latest cached snapshot and shows row/byte usage before the binding can be exported.
5. A runtime update worker or `pi-teletext` adapter refreshes the source later, re-applies the formatting rules, validates the output, and writes updated page rows, subpages, or low-bandwidth deltas.

### Preview And Validate

1. Preview can switch between edit, Level 1, Level 1.5, planned Level 2.5, planned Level 3.5, monochrome, mix, and attribute-debug views.
2. Validation reports row byte count, unsupported characters, invalid control-code sequences, missing page metadata, broken links, and unsupported export features.
3. Packet preview shows derived rows and extension packets without requiring users to edit raw bytes for common work.

### Export And Import

1. User exports a page, selection, or whole service.
2. Supported v1 targets: native project JSON, TTI, raw 40x25 dump where useful, PNG screenshot, and packet stream scaffolding for T42/raw packets.
3. Supported staged targets: T42 full-service stream, animated GIF, EP1 import/export, TTX import/export, low-bandwidth bundle.
4. Import preserves source metadata and records warnings where source data cannot be represented losslessly.

## Functional Requirements

### Project And Service Management

- Create, open, save, save-as, and autosave local project files.
- Store services containing pages, subpages, templates, glyph sets, export profiles, transmission profiles, and project metadata.
- Support readable, versioned project format with schema version and migration path.
- Show dirty state and last saved path.

### Canvas Editing

- Provide a 40-column by 25-row editing grid, with rows 1-24 as the main display body and row 0 as header/editable metadata surface where applicable.
- Support cell selection, rectangular selection, copy, paste, cut, clear, shift, nudge, undo, and redo.
- Support insert and overwrite text behaviors.
- Preserve one-byte-per-cell export constraints for Level 1 body rows.
- Keep control code insertion explicit and reversible.

### Control-Code Inspector

- Show control code category, byte value, display label, affected range, and mode support.
- Explain common effects without hiding byte consequences.
- Provide quick actions for colour, text/graphics mode, hold/release graphics, background mode, flash, conceal, double height, and box controls.

### Templates

- Provide built-in templates for index, menu, article, weather, status display, subtitle/newsflash, pixel-art canvas, carousel page, and blank page.
- Templates define layout regions, row locks, suggested palettes, validation rules, and export notes.
- Layout regions can be static, editable, generated, or dynamic. Dynamic regions define row/column bounds, accepted content kinds, overflow policy, refresh hints, and fallback content.
- Users can save a page or selected rows as a reusable template.

### Dynamic Content Sources

- Support v1 model and preview support for RSS/Atom, local JSON/CSV/text, manual snapshots, and provider-style weather data. Direct web extraction should be staged and allowed only through explicit selectors and source allowlists.
- Store content source definitions separately from page layout. A source can feed several regions, and a page can combine static authored rows with multiple dynamic regions.
- Content bindings map source fields into named template regions with formatter rules: max items, sort order, title/body selection, timestamp display, teletext character mapping, control-code style, wrapping, truncation, and fallback text.
- Refresh policies define manual refresh, interval refresh, on-export refresh, runtime refresh, cache expiry, retry strategy, and whether stale content may remain on air.
- The editor must keep cached content snapshots in the project or project sidecar so authors can work offline and exports remain deterministic.
- Updates must validate before publication. A failed source refresh should keep the last valid snapshot and raise an actionable warning.
- Bottom tickers are dynamic regions with a scrolling policy. Static exports can snapshot the ticker or generate carousel frames; digital/runtime exports can update the row over time.

### Glyph And Pixel-Art Foundation

- Store glyph sets with 12x10x1, 12x10x2, 12x10x4, and 6x5x4 metadata.
- V1 exposes a glyph asset panel with starter sample assets and data model validation.
- Later versions add drawing, import, DRCS downloading page generation, and AI/image conversion.

### Validation

- Validate every row for byte count and illegal cell states.
- Validate characters against selected G0/G2/G3/DRCS availability.
- Validate page numbers, magazine mapping, subpage IDs, and duplicate page conflicts.
- Validate dynamic content bindings for region bounds, stale sources, missing fields, overflow policy, character mapping, and export profile compatibility.
- Validate export profiles and report unsupported features before export.
- Warnings must be actionable and link to the affected row/cell/page.

### Export Profiles

- Native project: readable JSON with schema version.
- TTI: primary compatibility target for VBIT2 and wxTED-style workflows.
- T42/raw packet stream: deterministic packet stream output with parity/Hamming handled by encoder.
- PNG/GIF: visual sharing and review.
- Low-bandwidth profile: specified in v1 docs and exposed as disabled/readiness status until transport tooling exists.
- Dynamic content profile: exports a refresh manifest for source bindings where the target runtime can safely refresh content without opening the editor.

## Non-Functional Requirements

- Local-first operation with no network dependency for authoring. Network access is optional and only used for explicitly configured dynamic content refreshes.
- Fast startup on modest Windows/Linux/macOS machines.
- Smooth editing at 40x25 grid scale and service navigation across hundreds of pages.
- Deterministic export output from the same project state.
- Accessible keyboard-driven workflows for expert users.
- Recoverable autosave and corruption-resistant project writes.
- Clear separation between authoring model, rendering, validation, and export adapters.
- Dynamic refreshes should be rate-limited, cached, sanitized, and resilient to offline or unavailable sources.

## UX Principles

- The canvas should feel like teletext; the surrounding application should feel like a professional editor.
- Beginners should design visually without knowing every byte rule first.
- Experts should never be blocked from seeing exact packets, bytes, and mode effects.
- Validation should teach, not scold.
- Retro constraints should become creative handles: page grid, low bandwidth, control codes, mosaics, and limited colour are product features.

## Compatibility And Inspiration

- `edit.tf`: browser simplicity, offline/shareable editing, keyboard speed, image tracing inspiration.
- ZXNet editor: broader charset support, import/export breadth, higher-level page rendering.
- QTeletextMaker: Level 2.5 emphasis, X/26 triplet editing, palette/CLUT workflows.
- wxTED: Windows editor practicality, many languages, transmission flags, carousels.
- FAB Teletext Editor: professional production features, multi-format support, mouse/keyboard editing, export/printing.
- Muttlee: live browser/service editing concept and collaborative service surface.
- Teletext Recovery Editor: service overview, page/subpage repair, T42 workflow, preservation-oriented UI.
- image2drcs and Image2Mode7-style tools: future conversion pipeline for DRCS and mosaic image workflows.

## Low-Bandwidth Profile Requirements

The v1 PRD defines but does not ship real constrained-link transport.

- Profile should encode service manifests, page dependencies, page/subpage deltas, and asset references.
- It should support whole-page, row-delta, packet-delta, and glyph-delta updates.
- It should distinguish authoring metadata from transmission payload.
- It should include estimated byte size and transmission-time simulation.
- It should support integrity checks and resumable update batches.
- It should be suitable for LoRaWAN-like constraints where payload sizes are small and latency is acceptable.
- It should be able to transmit only changed dynamic regions, ticker rows, or generated carousel subpages when source data changes.

## Success Metrics

- A new user can create and export a valid Level 1 page within 10 minutes.
- An expert user can inspect exact row bytes and control-code effects without leaving the editor.
- TTI export round-trips through import with no loss for supported Level 1/1.5 features.
- Validation catches row-length, character-set, and unsupported-mode issues before export.
- The model can represent DRCS glyph assets and enhanced-mode metadata without schema redesign.
- A user can bind an RSS/weather/local source to a template region, preview the formatted output, and export a deterministic snapshot.
- The implementation plan enables separate AI agents to build domain, renderer, UI, and export layers without inventing product behavior.

## Acceptance Scenarios

- Create a Level 1 index page from a template, edit text and mosaics, export TTI, import it back, and visually compare identical supported content.
- Insert colour and graphics control codes, switch between edit and preview mode, and inspect exact byte effects.
- Validate a page containing unsupported Level 2.5 metadata under a Level 1 export profile and receive precise warnings.
- Create a page set with page 100, page 101, and page 200 with two subpages, then export service metadata and page files.
- Add a 12x10 and 6x5 glyph asset to a project and confirm the model validates dimensions and mode compatibility.
- Generate a packet preview for a page that can be used by VBIT2/raspi-teletext-style workflows.
- Bind an RSS feed to an article/news template region, refresh it, and confirm the formatted rows remain within the region and 40-byte constraints.
- Bind a weather source to a weather template region and export a static snapshot that can be re-imported without losing authored layout.
- Configure a ham club activity feed or local JSON file for a community page and keep the last valid snapshot when the source is offline.
- Create a bottom-row ticker from feed headlines and preview both a static snapshot export and a generated carousel/runtime scrolling mode.

## Source References

- [ETSI EN 300 706 Enhanced Teletext specification](https://www.etsi.org/deliver/etsi_en/300700_300799/300706/01.02.01_60/en_300706v010201p.pdf)
- [Teletext specifications wiki](https://teletext.wiki.zxnet.co.uk/wiki/ETS_300_706)
- [VBIT2](https://github.com/peterkvt80/vbit2)
- [raspi-teletext](https://github.com/ali1234/raspi-teletext)
- [vbit-py](https://github.com/peterkvt80/vbit-py)
- [edit.tf](https://github.com/rawles/edit.tf)
- [ZXNet teletext editor](https://teletext.wiki.zxnet.co.uk/wiki/Zxnet_teletext_editor)
- [QTeletextMaker](https://github.com/gkthemac/QTeletextMaker)
- [wxTED](https://github.com/peterkvt80/wxted)
- [FAB Teletext Editor](https://www.fab-online.com/teletext/editor/)
- [Muttlee](https://github.com/peterkvt80/Muttlee)
- [MRG TTI format](https://teletext.wiki.zxnet.co.uk/wiki/MRG_TTI_format)
- [T42 packet stream](https://teletext.wiki.zxnet.co.uk/wiki/T42_packet_stream)
- [EP1 format](https://teletext.wiki.zxnet.co.uk/wiki/EP1_format)
- [image2drcs](https://github.com/gkthemac/image2drcs)
