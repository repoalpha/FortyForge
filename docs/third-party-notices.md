# Third-Party Notices

## textmodes/font SAA5050

Pixelcast Studio includes SAA5050 English bitmap glyph data adapted from `github.com/textmodes/font`, commit `205964d7c0bcb5a432951a10cca17ff1fe27cd5d`.

- Source: https://github.com/textmodes/font
- Package reference: https://pkg.go.dev/github.com/textmodes/font/rom/mullard
- License: MIT
- Copyright: Copyright (c) 2017 textmodes

The imported data is used by the editor preview renderer as 5 by 10 glyph bitmaps with a 6-pixel character advance.

## Bedstead

Pixelcast Studio includes printable ASCII bitmap glyphs generated from Bedstead 002.002's `bedstead-20.bdf`.

- Source: https://fontlibrary.org/en/font/bedstead
- License: CC0 1.0 Universal / dedicated to the public domain

The imported data is used only by the selectable Bedstead receiver-preview profile.

## Philips-later receiver profile derived from TDAText

Pixelcast Studio includes deterministic 12 by 20 bitmap glyphs generated from the
TDAText font family by Dmitry Tretyakov. TDAText is based on Philips
SAA52xx/SAA55xx/TDA93xx character-generator designs.

- Source: https://gitverse.ru/tinelix/TDAText
- License: SIL Open Font License 1.1
- Reserved Font Name: TDAText
- Bundled license: `docs/licenses/TDAText-OFL-1.1.txt`

Pixelcast Studio labels the generated preview data `Philips later / TDA`; it does not
use the reserved font name as the name of a modified font.

## ETS Teletext

Pixelcast Studio includes the printable G0 bitmap glyphs from the `teletext2` font in
`tv-fonts` 1.1. The original 12 by 10 ETS bitmap master is represented as exact
12 by 20 character cells by doubling each source row.

- Source: https://www.kraxel.org/releases/tv-fonts/
- Debian source package: https://packages.debian.org/source/sid/fonts/tv-fonts
- Package license: X11/MIT
- Original bitmap font data: public domain

The glyphs are used only by the selectable `ETS 1990s / EBU Level 2.5`
receiver-preview profile. Teletext page bytes remain unchanged.

## English scanner dictionaries

Pixelcast Studio uses the following packages to rank general English OCR candidates
when importing historical raster captures. They are not page-specific word or
phrase fixtures.

- `dictionary-en-gb` 3.0.0, from the wooorm dictionaries project — MIT and BSD
  licensed: https://github.com/wooorm/dictionaries/tree/main/dictionaries/en-GB
- `nspell` 2.1.5, by Titus Wormer and contributors — MIT licensed:
  https://github.com/wooorm/nspell
- `@derock.ir/words-frequency` 1.2.0, a 20,000-word Project Gutenberg frequency
  list packaged by Sajjad Shirazy — MIT licensed:
  https://www.npmjs.com/package/@derock.ir/words-frequency
