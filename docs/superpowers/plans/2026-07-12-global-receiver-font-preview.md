# Global Receiver Font Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make receiver-font selection an immediately visible, project-wide Pixelcast Studio preview preference that survives refresh and never changes transmitted teletext bytes.

**Architecture:** `App` owns one validated receiver-profile preference initialized from a dedicated local-storage key and passes it to `TeletextCanvas` and `ToolDock`. The canvas renderer resolves complete deterministic bitmap tables, while page metadata and export paths remain untouched. A styled native select preserves accessibility without introducing a custom menu component.

**Tech Stack:** React 19, TypeScript, Canvas 2D, browser local storage, Vite, Vitest, React Testing Library.

## Global Constraints

- Receiver font is a global Pixelcast Studio preview preference, not page or transmission data.
- The preference changes only through deliberate interaction with the receiver-font selector.
- The preference survives refresh and applies to every page.
- `saa5050-classic` is the safe default for missing, unknown, or unreadable persisted values.
- Browser fonts must not render the teletext framebuffer.
- TTI, packet streams, native page bytes, and pi-teletext are unchanged.
- Keep existing unrelated dirty files untouched.

---

### Task 1: Complete And Prove Bedstead Rendering

**Files:**
- Create: `src/app/preview/bedsteadFont.ts`
- Modify: `src/app/preview/bitmapGlyphRenderer.ts:1-480`
- Modify: `src/app/preview/bitmapGlyphRenderer.test.ts:145-180`
- Modify: `docs/third-party-notices.md`

**Interfaces:**
- Produces: `BEDSTEAD_GLYPHS: Readonly<Record<string, readonly string[]>>`.
- Preserves: `getBitmapGlyph(value: string, profileId?: TeletextFontProfileId): BitmapGlyph`.
- Consumes: CC0 Bedstead 002.002 `bedstead-20.bdf` printable ASCII glyph data.

- [ ] **Step 1: Add a failing representative-coverage test**

Add this test beside the existing Bedstead `A` test:

```ts
it("uses Bedstead bitmaps across ordinary page text", () => {
  for (const character of ["B", "e", "d", "s", "t", "0"]) {
    const classic = getBitmapGlyph(character, "saa5050-classic");
    const bedstead = getBitmapGlyph(character, "bedstead-extended");

    expect(bedstead, character).toHaveLength(20);
    expect(bedstead.every((row) => row.length === 12), character).toBe(true);
    expect(bedstead, character).not.toEqual(classic);
  }
});

it("covers the complete printable ASCII range with Bedstead bitmaps", () => {
  for (let byte = 0x20; byte <= 0x7e; byte += 1) {
    const glyph = getBitmapGlyph(String.fromCodePoint(byte), "bedstead-extended");

    expect(glyph, `byte ${byte}`).toHaveLength(20);
    expect(glyph.every((row) => row.length === 12), `byte ${byte}`).toBe(true);
  }
});
```

- [ ] **Step 2: Run the renderer test and verify RED**

Run: `npx vitest run src/app/preview/bitmapGlyphRenderer.test.ts`

Expected: FAIL for `B` because the current one-glyph Bedstead subset falls back to classic.

- [ ] **Step 3: Bundle the complete deterministic printable table**

Use the generated `bedsteadFont.ts` already present in the working tree. It contains all 95 printable character keys from `0x20` through `0x7e`, each mapped to exactly 20 strings of 12 binary pixels, and starts with:

```ts
// Generated from Bedstead 002.002 bedstead-20.bdf (CC0 1.0).
// Source: https://fontlibrary.org/en/font/bedstead
export const BEDSTEAD_GLYPHS: Readonly<Record<string, readonly string[]>> = {
  "0": [
    "000000000000",
    "000000000000",
    "000000110000",
    "000001111000",
    "000011111100",
    "000111001110",
    "001110000111",
    "001100000011",
    "001100000011",
    "001100000011",
    "001100000011",
    "001110000111",
    "000111001110",
    "000011111100",
    "000001111000",
    "000000110000",
    "000000000000",
    "000000000000",
    "000000000000",
    "000000000000"
  ]
};
```

Do not hand-edit generated glyph rows. Confirm table completeness by checking that every code point from `0x20` through `0x7e` resolves to a `12x20` bitmap in the renderer test.

In `bitmapGlyphRenderer.ts`, import the table, remove the one-letter inline table, and retain safe fallback:

```ts
import { BEDSTEAD_GLYPHS } from "./bedsteadFont";

if (profileId === "bedstead-extended") {
  const bedsteadGlyph = BEDSTEAD_GLYPHS[value] ?? BEDSTEAD_GLYPHS[value.toUpperCase()];

  if (bedsteadGlyph) {
    return [...bedsteadGlyph];
  }
}
```

Add the Bedstead source, version, use, and CC0 status to `docs/third-party-notices.md`.

- [ ] **Step 4: Run the renderer test and verify GREEN**

Run: `npx vitest run src/app/preview/bitmapGlyphRenderer.test.ts`

Expected: 9 tests pass, including printable-range, uppercase, lowercase, and numeric Bedstead coverage.

- [ ] **Step 5: Commit the rendering foundation**

```bash
git add src/app/preview/bedsteadFont.ts src/app/preview/bitmapGlyphRenderer.ts src/app/preview/bitmapGlyphRenderer.test.ts docs/third-party-notices.md
git commit -m "fix: render complete Bedstead preview glyphs"
```

---

### Task 2: Global Persistent Preview Preference

**Files:**
- Modify: `src/app/App.tsx:89-220,361-405,900-930,1340-1445`
- Modify: `src/app/components/ToolDock.tsx:35-70,145-170,347-365`
- Modify: `src/app/App.test.tsx:155-175,235-250`

**Interfaces:**
- Produces: `RECEIVER_FONT_PROFILE_KEY = "fortyforge.receiverFontProfile"`.
- Produces: `loadReceiverFontProfile(): TeletextFontProfileId`.
- Produces: `receiverFontProfileId: TeletextFontProfileId` ToolDock prop.
- Preserves: `onReceiverFontProfileChange(profileId: TeletextFontProfileId): void`.
- Consumes: `TeletextCanvas.receiverFontProfileId` from Task 1's existing renderer path.

- [ ] **Step 1: Replace the selector-only test with global persistence tests**

Add tests that prove deliberate selection writes the global key and rerender restores it:

```tsx
it("persists the global receiver font preview across reloads", () => {
  const firstRender = render(<App />);
  const receiverFont = screen.getByLabelText("Receiver font");

  fireEvent.change(receiverFont, { target: { value: "bedstead-extended" } });

  expect(window.localStorage.getItem("fortyforge.receiverFontProfile"))
    .toBe("bedstead-extended");

  firstRender.unmount();
  render(<App />);

  expect(screen.getByLabelText("Receiver font")).toHaveValue("bedstead-extended");
});

it("falls back to classic for an unknown persisted receiver font", () => {
  window.localStorage.setItem("fortyforge.receiverFontProfile", "unknown-profile");

  render(<App />);

  expect(screen.getByLabelText("Receiver font")).toHaveValue("saa5050-classic");
});
```

Extend a page/subpage navigation test to select Bedstead before navigation and assert the selector remains `bedstead-extended` afterward.

- [ ] **Step 2: Run the App tests and verify RED**

Run: `npx vitest run src/app/App.test.tsx`

Expected: FAIL because selection currently mutates page metadata and does not write `fortyforge.receiverFontProfile`.

- [ ] **Step 3: Implement validated global preference loading**

Add near `LOCAL_PROJECT_KEY`:

```ts
const RECEIVER_FONT_PROFILE_KEY = "fortyforge.receiverFontProfile";
const RECEIVER_FONT_PROFILE_IDS = new Set<TeletextFontProfileId>([
  "saa5050-classic",
  "bedstead-extended"
]);

function loadReceiverFontProfile(): TeletextFontProfileId {
  try {
    const savedProfile = window.localStorage.getItem(RECEIVER_FONT_PROFILE_KEY);

    return savedProfile && RECEIVER_FONT_PROFILE_IDS.has(savedProfile as TeletextFontProfileId)
      ? savedProfile as TeletextFontProfileId
      : "saa5050-classic";
  } catch {
    return "saa5050-classic";
  }
}
```

Add global state in `App`:

```ts
const [receiverFontProfileId, setReceiverFontProfileId] =
  useState<TeletextFontProfileId>(loadReceiverFontProfile);
```

Replace `commitReceiverFontProfile` with a non-history preference update:

```ts
function changeReceiverFontProfile(profileId: TeletextFontProfileId) {
  setReceiverFontProfileId(profileId);

  try {
    window.localStorage.setItem(RECEIVER_FONT_PROFILE_KEY, profileId);
  } catch {
    // The in-memory preview remains usable when persistence is unavailable.
  }
}
```

Pass `receiverFontProfileId` to `TeletextCanvas` instead of `editor.page.metadata.receiverFontProfileId`. Pass the same value and `changeReceiverFontProfile` to `ToolDock`.

- [ ] **Step 4: Make ToolDock consume the global value**

Add this prop:

```ts
receiverFontProfileId: TeletextFontProfileId;
```

Change the select from page metadata to the prop:

```tsx
<select
  className="receiver-font-select"
  onChange={(event) =>
    onReceiverFontProfileChange(event.target.value as TeletextFontProfileId)}
  value={receiverFontProfileId}
>
```

Replace the supporting copy with:

```tsx
<p className="section-note">
  Changes every preview. Transmitted teletext bytes stay unchanged.
</p>
```

- [ ] **Step 5: Run App and renderer tests and verify GREEN**

Run: `npx vitest run src/app/App.test.tsx src/app/preview/bitmapGlyphRenderer.test.ts`

Expected: all tests pass; selection persists and representative glyphs differ.

- [ ] **Step 6: Commit global preference behavior**

```bash
git add src/app/App.tsx src/app/App.test.tsx src/app/components/ToolDock.tsx
git commit -m "fix: make receiver font a global preview preference"
```

---

### Task 3: Styled Accessible Selector And Final Verification

**Files:**
- Modify: `src/app/components/ToolDock.tsx:347-365`
- Modify: `src/app/styles.css:430-530`
- Modify: `src/app/App.test.tsx:235-270`

**Interfaces:**
- Consumes: `receiverFontProfileId` and `onReceiverFontProfileChange` from Task 2.
- Produces: `.receiver-font-field` and `.receiver-font-select` presentation classes.

- [ ] **Step 1: Add a selector structure test**

Extend the receiver-font test:

```tsx
const receiverFont = screen.getByLabelText("Receiver font");

expect(receiverFont).toHaveClass("receiver-font-select");
expect(screen.getByText(/Changes every preview/)).toBeInTheDocument();
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npx vitest run src/app/App.test.tsx -t "receiver font"`

Expected: FAIL until the styled class and global explanatory copy exist.

- [ ] **Step 3: Apply the existing Pixelcast Studio visual language**

Wrap the label with `className="receiver-font-field"` and add:

```css
.receiver-font-field {
  color: #eef2f4;
  display: grid;
  font-size: 12px;
  font-weight: 700;
  gap: 7px;
}

.receiver-font-select {
  appearance: none;
  background-color: #202830;
  background-image:
    linear-gradient(45deg, transparent 50%, #9fb2bf 50%),
    linear-gradient(135deg, #9fb2bf 50%, transparent 50%);
  background-position:
    calc(100% - 16px) 50%,
    calc(100% - 11px) 50%;
  background-repeat: no-repeat;
  background-size: 5px 5px, 5px 5px;
  border: 1px solid #344350;
  border-radius: 8px;
  color: #eef2f4;
  cursor: pointer;
  font: inherit;
  min-height: 38px;
  padding: 8px 36px 8px 11px;
  width: 100%;
}

.receiver-font-select:hover {
  border-color: #5c7485;
}

.receiver-font-select:focus-visible {
  border-color: #62d6ff;
  box-shadow: 0 0 0 3px rgba(98, 214, 255, 0.18);
  outline: none;
}
```

- [ ] **Step 4: Run focused and full automated verification**

Run: `npx vitest run src/app/App.test.tsx -t "receiver font"`

Expected: receiver-font tests pass.

Run: `npm test`

Expected: all non-environmental tests pass; only explicitly conditional benchmark tests may skip.

Run: `npm run build`

Expected: TypeScript and Vite production build pass.

- [ ] **Step 5: Perform browser acceptance on page 100**

Open `http://127.0.0.1:5173/`, load page 100, and perform these checks:

1. Select `Bedstead / Teletext50` and confirm `0`, uppercase, and lowercase framebuffer glyphs visibly redraw.
2. Navigate to another page and confirm the whole preview remains Bedstead.
3. Refresh and confirm the selector and canvas remain Bedstead.
4. Select `SAA5050 classic` and confirm the whole preview redraws immediately.
5. Confirm no Save action or server restart is required.

- [ ] **Step 6: Commit selector presentation**

```bash
git add src/app/components/ToolDock.tsx src/app/styles.css src/app/App.test.tsx
git commit -m "style: refine receiver font selector"
```
