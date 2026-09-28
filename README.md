# Corvus DOM Extension

Built-in WebExtension for **Corvus Browser** (GeckoSession) responsible for aggressive DOM pruning, Accessibility (A11y) tree extraction, in-memory WeakRef element mapping, and JSON-RPC 2.0 action dispatching.

## Architecture

- **DOM Pruning (`src/pruner.ts`):** Strips `<script>`, `<style>`, `<svg>`, `<iframe>`, classes, and non-semantic attributes while strictly preserving interactive nodes and ARIA roles.
- **WeakRef Registry (`src/registry.ts`):** Dual-tier `Map<number, WeakRef<Element>>` and `WeakMap<Element, number>` preventing memory leaks and maintaining clean node ID references.
- **JSON-RPC 2.0 Bus (`src/rpc.ts`):** Inter-process messaging with GeckoView Android orchestrator (`dom.observation`, `action.execute`, `agent.status_update`).

## Specifications (SDD)

- [DOM Pruning Rules](specs/pruning-rules.md)
- [JSON-RPC 2.0 Contracts](specs/jsonrpc-contracts.json)
- [WeakRef Registry Lifecycle](specs/registry-lifecycle.md)

## Development & Testing (TDD)

```bash
# Install dependencies
npm install

# Run unit and contract test suite
npm test

# Build extension
npm run build
```

## License

Licensed under the [Apache License 2.0](LICENSE).
