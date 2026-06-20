# PIT Live Round Trip

## Goal

FortyForge should be able to pull a currently displayed PIT page, edit it, and push the changed page back without recompiling PIT.

## What Is Possible Now

FortyForge already has the pieces for a file-based round trip if PIT exposes or watches page files:

- Pull: copy a `.tti` page file from the PIT host into the local workspace.
- Import: use the existing TTI importer to load the page into FortyForge.
- Edit: use the FortyForge grid, control palette, mosaic painter, templates, and subpages.
- Push: export TTI from FortyForge and copy it back to PIT's watched page directory.
- Reload: rely on PIT watching the directory, or run a reload command over SSH.

This is the safest first live workflow because it moves page data, not runtime code.

## Required PIT Information

To implement a real live connector, FortyForge needs the local PIT source path or a running PIT target with:

- Hostname and SSH user.
- Watched page directory, if any.
- Accepted formats: TTI, T42, raw packets, or a PIT-native file.
- Reload mechanism: filesystem watcher, signal, HTTP endpoint, command, or service reload.
- Current-display source: which file or packet stream represents the currently visible page.

## Proposed V1 Connector

1. Add a `PitTargetProfile` setting:
   - host
   - remote page directory
   - import glob
   - export format
   - reload command

2. Add `Pull from PIT`:
   - list remote page files over SSH
   - copy selected TTI/T42 file into a local cache
   - import into the current project

3. Add `Push to PIT`:
   - export selected page/subpage to TTI first
   - later T42/raw packet stream
   - copy atomically to a temporary remote filename
   - rename into place
   - run reload command only when needed

4. Add conflict handling:
   - store last pulled checksum
   - warn if the remote file changed before push
   - keep local project history intact

## Open Gap

FortyForge currently has a push-plan helper and TTI import/export, but no live SSH UI and no T42/raw importer. Once the PIT folder or running target details are available, the next implementation step is a tested connector around the actual PIT file layout.

