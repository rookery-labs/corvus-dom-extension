# Corvus DOM Extension — Agent Instructions & Domain Constraints

**Designated Primary Subagent:** `dom_extension_dev`  
**Quality Assurance Auditor:** `qa_sdd_validator`

---

## Technical Domain

This repository encapsulates the built-in TypeScript WebExtension running in `GeckoSession` tab contexts, responsible for DOM pruning, accessibility tree extraction, in-memory WeakRef element mapping, and JSON-RPC 2.0 communication.

## Key Invariants & Rules

1. **Aggressive Pruning & Token Budget (`specs/pruning-rules.md`):**
   - Must achieve >= 70-85% token reduction within <= 15 ms.
   - Unconditionally discard `<script>`, `<style>`, `<svg>`, `<iframe>`, `<template>`, `<noscript>`.
   - Strip CSS classes and inline style rules.
   - Preserve interactive elements (`button`, `a` with `href`, `input`, `select`, `textarea`, `summary`, `tabindex >= 0`, ARIA interactive roles) and whitelisted attributes.
2. **Dual-Tier WeakRef Element Registry (`specs/registry-lifecycle.md`):**
   - Map numeric ID to `WeakRef<Element>` (`Map<number, WeakRef<Element>>`).
   - Reverse index with `WeakMap<Element, number>`.
   - Verify `element.isConnected` and resolve `.deref()` on every interaction.
   - Purge dead entries during sweeps or navigation commits.
3. **JSON-RPC 2.0 Contracts (`specs/jsonrpc-contracts.json`):**
   - Strictly validate `dom.observation`, `action.execute`, and `agent.status_update`.
4. **Branch & Worktree Isolation (Sanctuary of `main`):**
   - Strictly prohibit direct commits or pushes on `main`.
   - All work must be conducted in dedicated branches (`feat/...`, `fix/...`) within an isolated worktree (`just worktree-add`).
   - Merge only when `npm test` and `npm run typecheck` are 100% green.
5. **Renovate Automated Dependencies & Zero-Touch Release:**
   - Automated dependency PRs (patch/minor) merge automatically to `main` upon passing all Vitest tests and typechecks.
   - Merges to `main` automatically publish a new semantic release and tag.
6. **Testing Protocol:**
   - Run `npm test` and `npm run build` before every commit.

