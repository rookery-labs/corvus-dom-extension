# Specification: In-Memory WeakRef Element Registry Lifecycle

**Spec ID:** `SPEC-REG-001`  
**Status:** VALIDATED  
**Component:** `corvus-dom-extension` (Built-in GeckoSession WebExtension)

---

## 1. Architectural Motivation

When an autonomous agent (System 1 or System 2) inspects a pruned DOM representation, it refers to targets via integer node IDs (e.g., `nodeId = 42`).
Directly holding hard references (`Element`) in an array or map causes persistent memory leaks, prevents Garbage Collection (GC) of dynamic single-page application (SPA) nodes, and leads to stale interactions when DOM subtrees are replaced.

To solve this, Corvus employs a dual-tier registry combining `WeakRef<Element>` and `WeakMap<Element, number>`.

---

## 2. Registry Data Structures

```typescript
class ElementRegistry {
  // Mapping from integer ID to WeakRef of the DOM element
  private readonly idToElement: Map<number, WeakRef<Element>>;

  // Mapping from DOM element to integer ID for fast reverse lookup
  private readonly elementToId: WeakMap<Element, number>;

  // Monotonically increasing identifier sequence
  private nextId: number = 1;
}
```

---

## 3. Lifecycle & Garbage Collection Invariants

### 3.1 Allocation & Lookup
1. **Registration:**
   - When traversing DOM nodes during `dom.observation`:
     - If `elementToId.has(element)`, reuse the existing `nodeId`.
     - Otherwise, allocate `id = nextId++`.
     - Store `elementToId.set(element, id)` and `idToElement.set(id, new WeakRef(element))`.
2. **Resolution (`deref`):**
   - When an action arrives (`action.execute` with `nodeId`):
     - Lookup `ref = idToElement.get(nodeId)`.
     - If `!ref`, fail with error code `-32001` (`NODE_NOT_FOUND`).
     - Resolve `const element = ref.deref()`.
     - If `!element`, fail with error code `-32002` (`NODE_GARBAGE_COLLECTED`).
     - Verify `element.isConnected`. If false, fail with error code `-32003` (`NODE_DETACHED`).

### 3.2 Dynamic Mutation Synchronization
- A `MutationObserver` monitors child removals and attribute mutations in the active document.
- Pruned sweeps periodically clean up dangling keys in `idToElement` where `ref.deref() === undefined`.
- When navigating to a new URL (`beforeunload` or navigation commit), the registry is explicitly reset:
  - `idToElement.clear()`.
  - `nextId = 1`.
