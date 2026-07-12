# Edge Assisted Trace Grid Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deterministic edge-projection pass that suggests 40 x 25 trace grid lines from screenshot colour transitions, then expose it in Import Trace.

**Architecture:** Keep the existing manual grid and hint workflow. Add a small image-analysis helper in `screenshotTrace.ts` that scores local vertical/horizontal colour edges near expected teletext grid lines and returns calibrated `xLines`/`yLines`. The React app applies those suggested lines as grid calibration anchors, so existing tracing and manual editing paths continue to work.

**Tech Stack:** TypeScript, Vitest, React Testing Library, existing FortyForge trace image data structures.

---

### Task 1: Trace Edge Projection Helper

**Files:**
- Modify: `src/app/importTrace/screenshotTrace.ts`
- Test: `src/app/importTrace/screenshotTrace.test.ts`

- [ ] Write failing tests that draw shifted vertical and horizontal colour-transition edges and expect the detector to return matching `xLines`/`yLines`.
- [ ] Implement `detectEdgeAssistedTraceGrid(image, bounds, options?)`.
- [ ] Use local edge-energy projection over quantized Level 1 colours, searching near each expected line.
- [ ] Return the existing `TraceGrid` shape with `xLines` and `yLines`, so all current classifier code can use it.
- [ ] Run `npm test -- --run src/app/importTrace/screenshotTrace.test.ts`.

### Task 2: Import Trace UI Action

**Files:**
- Modify: `src/app/App.tsx`
- Modify: `src/app/components/ToolDock.tsx`
- Test: `src/app/App.test.tsx`

- [ ] Write a failing app test that loads a reference screenshot and clicks `Suggest grid from edges`.
- [ ] Add a ToolDock callback/button for applying edge suggestions.
- [ ] In `App.tsx`, decode the reference image, call `detectEdgeAssistedTraceGrid`, convert suggested lines into calibration anchors, and update the visible grid.
- [ ] Report a status message with line counts/confidence.
- [ ] Run `npm test -- --run src/app/App.test.tsx`.

### Task 3: Verification

**Files:**
- No new files.

- [ ] Run `npm run build`.
- [ ] Run `npm test -- --run`.
- [ ] Confirm manual `Tag cells` and `Move grid lines` modes remain separate.
