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
});
