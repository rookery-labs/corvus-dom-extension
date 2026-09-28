# Specification: DOM Pruning & Accessibility Tree Extraction Rules

**Spec ID:** `SPEC-DOM-001`  
**Status:** VALIDATED  
**Component:** `corvus-dom-extension` (Built-in GeckoSession WebExtension)

---

## 1. Objectives and Constraints

The Corvus DOM Pruner converts live browser DOM structures into a high-density, low-token representation tailored for System 1 (reflex action mapping) and System 2 (deliberate planning).

### Key Performance Indicators (KPIs)
- **Token Reduction:** >= 85% token volume reduction compared to raw HTML.
- **Latency Budget:** Execution time <= 15 ms on typical DOMs (1,000 to 5,000 nodes).
- **Interactive Recall:** 100% retention of actionable interactive elements and ARIA semantic landmarks.

---

## 2. Pruning & Filtering Rules

### 2.1 Blacklisted Element Types (Immediate Removal)
The following tags must be unconditionally discarded along with all their children:
- `<script>`, `<noscript>`, `<style>`, `<template>`
- `<iframe>`, `<embed>`, `<object>` (isolated context)
- `<svg>`, `<canvas>` (non-semantic graphical payloads, replaced by `<graphic role="img" label="..." />` if accessible label exists)
- `<meta>`, `<link>`, `<head>`

### 2.2 Visibility & Bounding Box Filters
An element is designated as **Invisible** and omitted if any of the following apply:
1. Computed style evaluation:
   - `display === "none"`
   - `visibility === "hidden"` or `visibility === "collapse"`
   - `opacity === "0"`
2. Geometric layout:
   - `offsetWidth === 0 && offsetHeight === 0` (unless containing visible inline text or children).
   - Positioned completely outside the visible viewport scroll boundary when clipping is enabled.
3. Accessibility hiding:
   - `aria-hidden === "true"` (unless explicitly overriding for interactive descendants).

### 2.3 Attribute Whitelist & Normalization
All style attributes, verbose class names, tracking IDs, and custom `data-*` attributes are stripped. Only the following whitelisted attributes are preserved:
- Semantic IDs: `id` (only if referenced by `aria-labelledby`, `aria-describedby`, or `for`).
- Interactive Controls: `type`, `name`, `value`, `placeholder`, `checked`, `disabled`, `readonly`, `selected`.
- Hyperlinks: `href` (normalized or relative path).
- Accessibility Attributes: `role`, `aria-label`, `aria-labelledby`, `aria-describedby`, `aria-expanded`, `aria-checked`, `aria-disabled`, `aria-haspopup`.
- Informational: `title`, `alt`.

---

## 3. Preservation of Interactive Elements

An element is marked **Interactive** (and assigned a persistent numeric `nodeId` in the WeakRef registry) if it meets any of the following criteria:
1. Native interactive tag: `<button>`, `<a>` (with `href`), `<input>`, `<select>`, `<textarea>`, `<summary>`, `<details>`.
2. Explicit ARIA interactive role: `role="button"`, `role="link"`, `role="checkbox"`, `role="radio"`, `role="combobox"`, `role="menuitem"`, `role="tab"`, `role="switch"`.
3. Focusable / Keyboard accessible: `tabindex >= 0`.
4. Attached Event Listeners: Has explicit `onclick` or bound pointer event handlers detected via DOM property inspection.

---

## 4. Text Representation Format

The pruned tree emits a clean, human/LLM-readable YAML-like indented tree:
```
[#1] root document "Corvus Search"
  [#2] navigation "Main"
    [#3] link "Home" [href="/"]
    [#4] link "Settings" [href="/settings"]
  [#5] main
    [#6] searchbox "Search query" [value=""]
    [#7] button "Search" [disabled=false]
```
Each interactive node is prefixed with its registered `[#<nodeId>]` token for immediate targeting by System 1 and System 2.
