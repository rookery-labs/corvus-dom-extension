import { describe, it, expect, beforeEach } from "vitest";
import { ElementRegistry } from "../src/registry.js";

describe("ElementRegistry (SDD Specification SPEC-REG-001)", () => {
  let registry: ElementRegistry;

  beforeEach(() => {
    registry = new ElementRegistry();
    document.body.innerHTML = "";
  });

  it("should assign monotonically increasing IDs and deduplicate same element", () => {
    const btn1 = document.createElement("button");
    const btn2 = document.createElement("button");
    document.body.appendChild(btn1);
    document.body.appendChild(btn2);

    const id1 = registry.register(btn1);
    const id2 = registry.register(btn2);
    const id1Repeat = registry.register(btn1);

    expect(id1).toBe(1);
    expect(id2).toBe(2);
    expect(id1Repeat).toBe(1);
  });

  it("should retrieve registered elements via deref", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);

    const id = registry.register(input);
    const resolved = registry.get(id);

    expect(resolved).toBe(input);
    expect(registry.isNodeConnected(id)).toBe(true);
  });

  it("should identify detached elements when removed from document", () => {
    const div = document.createElement("div");
    document.body.appendChild(div);

    const id = registry.register(div);
    expect(registry.isNodeConnected(id)).toBe(true);

    document.body.removeChild(div);
    expect(registry.isNodeConnected(id)).toBe(false);
  });

  it("should sweep disconnected elements", () => {
    const el1 = document.createElement("span");
    const el2 = document.createElement("span");
    document.body.appendChild(el1);
    document.body.appendChild(el2);

    registry.register(el1);
    registry.register(el2);
    expect(registry.size()).toBe(2);

    document.body.removeChild(el1);
    const swept = registry.sweep();
    expect(swept).toBe(1);
    expect(registry.size()).toBe(1);
  });

  it("should reset completely upon navigation", () => {
    const el = document.createElement("p");
    document.body.appendChild(el);
    registry.register(el);

    registry.reset();
    expect(registry.size()).toBe(0);

    const newEl = document.createElement("p");
    document.body.appendChild(newEl);
    const newId = registry.register(newEl);
    expect(newId).toBe(1);
  });

  describe("SPEC-REG-001 Node Resolution & Error Codes", () => {
    it("should return NODE_NOT_FOUND (-32001) for unregistered nodeId", () => {
      const res = registry.resolve(9999);
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.code).toBe(-32001);
        expect(res.error).toBe("NODE_NOT_FOUND");
        expect(res.message).toContain("was never registered");
      }
    });

    it("should return NODE_GARBAGE_COLLECTED (-32002) when weak reference derefs to undefined", () => {
      const fakeId = 777;
      (registry as any).idToElement.set(fakeId, { deref: () => undefined });

      const res = registry.resolve(fakeId);
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.code).toBe(-32002);
        expect(res.error).toBe("NODE_GARBAGE_COLLECTED");
        expect(res.message).toContain("garbage collected");
      }
    });

    it("should return NODE_DETACHED (-32003) when element is removed from DOM tree", () => {
      const div = document.createElement("div");
      document.body.appendChild(div);

      const id = registry.register(div);
      document.body.removeChild(div);

      const res = registry.resolve(id);
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.code).toBe(-32003);
        expect(res.error).toBe("NODE_DETACHED");
        expect(res.message).toContain("detached");
        expect(res.element).toBe(div);
      }
    });

    it("should return success and live element when element is connected", () => {
      const btn = document.createElement("button");
      document.body.appendChild(btn);

      const id = registry.register(btn);
      const res = registry.resolve(id);

      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.element).toBe(btn);
      }
    });

    it("should transition from NODE_GARBAGE_COLLECTED to NODE_NOT_FOUND only after sweep()", () => {
      const fakeId = 888;
      (registry as any).idToElement.set(fakeId, { deref: () => undefined });

      // Prior to sweep, it is recognized as GC'd
      const preSweep = registry.resolve(fakeId);
      expect(preSweep.success).toBe(false);
      if (!preSweep.success) {
        expect(preSweep.code).toBe(-32002);
      }

      // After sweep, dangling key is purged
      registry.sweep();
      const postSweep = registry.resolve(fakeId);
      expect(postSweep.success).toBe(false);
      if (!postSweep.success) {
        expect(postSweep.code).toBe(-32001);
      }
    });
  });

  describe("Post-Sweep Element Restoration (SPEC-REG-001 Lifecycle)", () => {
    it("should restore element in idToElement and preserve existingId when re-registering after sweep()", () => {
      const button = document.createElement("button");
      button.textContent = "Re-attached Button";
      document.body.appendChild(button);

      // 1. Initial registration
      const initialId = registry.register(button);
      expect(initialId).toBe(1);
      expect(registry.has(initialId)).toBe(true);
      expect(registry.get(initialId)).toBe(button);

      // 2. Detach from DOM
      document.body.removeChild(button);
      expect(button.isConnected).toBe(false);

      // 3. Sweep purges detached elements from idToElement
      const swept = registry.sweep();
      expect(swept).toBe(1);
      expect(registry.has(initialId)).toBe(false);
      expect(registry.get(initialId)).toBeNull();

      // Resolve returns -32001 (NODE_NOT_FOUND) while element is swept
      const sweptResolve = registry.resolve(initialId);
      expect(sweptResolve.success).toBe(false);
      if (!sweptResolve.success) {
        expect(sweptResolve.code).toBe(-32001);
      }

      // 4. Re-attach element to active DOM
      document.body.appendChild(button);
      expect(button.isConnected).toBe(true);

      // 5. Re-register the re-attached element
      const reRegisteredId = registry.register(button);

      // Verify exact ID preservation and idToElement restoration
      expect(reRegisteredId).toBe(initialId);
      expect(registry.has(initialId)).toBe(true);
      expect(registry.get(initialId)).toBe(button);

      // 6. Verify resolve succeeds and returns live element
      const resolved = registry.resolve(initialId);
      expect(resolved.success).toBe(true);
      if (resolved.success) {
        expect(resolved.element).toBe(button);
      }
    });

    it("should restore WeakRef and return NODE_DETACHED (-32003) if re-registered before re-attachment", () => {
      const div = document.createElement("div");
      document.body.appendChild(div);

      const id = registry.register(div);
      document.body.removeChild(div);

      // Sweep removes detached entry
      const swept = registry.sweep();
      expect(swept).toBe(1);
      expect(registry.has(id)).toBe(false);

      // Re-register while still detached
      const reRegisteredId = registry.register(div);
      expect(reRegisteredId).toBe(id);
      expect(registry.has(id)).toBe(true);

      // Resolution should now find the node but correctly report NODE_DETACHED (-32003)
      const res = registry.resolve(id);
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.code).toBe(-32003);
        expect(res.error).toBe("NODE_DETACHED");
        expect(res.element).toBe(div);
      }
    });

    it("should preserve monotonic nextId counter sequence without skipping when elements are restored", () => {
      const el1 = document.createElement("span");
      const el2 = document.createElement("span");
      document.body.appendChild(el1);
      document.body.appendChild(el2);

      const id1 = registry.register(el1); // 1
      const id2 = registry.register(el2); // 2
      expect(id1).toBe(1);
      expect(id2).toBe(2);

      // Detach and sweep el1
      document.body.removeChild(el1);
      const swept = registry.sweep();
      expect(swept).toBe(1);

      // Re-attach and re-register el1
      document.body.appendChild(el1);
      const restoredId1 = registry.register(el1);
      expect(restoredId1).toBe(1);

      // Register a brand new element
      const el3 = document.createElement("span");
      document.body.appendChild(el3);
      const id3 = registry.register(el3);

      // ID should be 3, proving nextId was not disrupted
      expect(id3).toBe(3);
    });

    it("should handle multiple sweep and re-registration cycles idempotently", () => {
      const input = document.createElement("input");
      document.body.appendChild(input);

      const id = registry.register(input);

      for (let cycle = 0; cycle < 3; cycle++) {
        // Detach and sweep
        document.body.removeChild(input);
        registry.sweep();
        expect(registry.has(id)).toBe(false);

        // Re-attach and re-register
        document.body.appendChild(input);
        const reId = registry.register(input);
        expect(reId).toBe(id);
        expect(registry.has(id)).toBe(true);

        const res = registry.resolve(id);
        expect(res.success).toBe(true);
        if (res.success) {
          expect(res.element).toBe(input);
        }
      }
    });
  });
});
