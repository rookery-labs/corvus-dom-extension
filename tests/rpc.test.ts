import { describe, it, expect, beforeEach } from "vitest";
import { DomPruner } from "../src/pruner.js";
import { ElementRegistry } from "../src/registry.js";
import { JsonRpcDispatcher } from "../src/rpc.js";

describe("JsonRpcDispatcher (SDD Specification jsonrpc-contracts.json)", () => {
  let registry: ElementRegistry;
  let pruner: DomPruner;
  let dispatcher: JsonRpcDispatcher;

  beforeEach(() => {
    registry = new ElementRegistry();
    pruner = new DomPruner(registry);
    dispatcher = new JsonRpcDispatcher(pruner, registry);
    document.body.innerHTML = "";
  });

  it("should process dom.observation request and return structured tree", async () => {
    document.body.innerHTML = `
      <main>
        <h1>Corvus Browser</h1>
        <button id="search-btn">Search</button>
      </main>
    `;

    const request = {
      jsonrpc: "2.0" as const,
      id: "req-1",
      method: "dom.observation",
      params: { maxDepth: 10 },
    };

    const response = await dispatcher.handleRequest(request, document);
    expect(response.error).toBeUndefined();
    expect(response.result).toBeDefined();
    expect(response.result.tree).toContain("Corvus Browser");
    expect(response.result.tree).toContain("button");
    expect(response.result.interactiveCount).toBe(1);
  });

  it("should execute click action on registered button", async () => {
    let clicked = false;
    const button = document.createElement("button");
    button.textContent = "Click Me";
    button.addEventListener("click", () => {
      clicked = true;
    });
    document.body.appendChild(button);

    const nodeId = registry.register(button);

    const request = {
      jsonrpc: "2.0" as const,
      id: "req-2",
      method: "action.execute",
      params: {
        nodeId,
        actionType: "click" as const,
      },
    };

    const response = await dispatcher.handleRequest(request, document);
    expect(response.error).toBeUndefined();
    expect(response.result.success).toBe(true);
    expect(clicked).toBe(true);
  });

  it("should execute type action on registered input", async () => {
    const input = document.createElement("input");
    input.type = "text";
    document.body.appendChild(input);

    const nodeId = registry.register(input);

    const request = {
      jsonrpc: "2.0" as const,
      id: "req-3",
      method: "action.execute",
      params: {
        nodeId,
        actionType: "type" as const,
        text: "hello corvus",
      },
    };

    const response = await dispatcher.handleRequest(request, document);
    expect(response.error).toBeUndefined();
    expect(response.result.success).toBe(true);
    expect(input.value).toBe("hello corvus");
  });

  it("should return JSON-RPC error when targeting non-existent node", async () => {
    const request = {
      jsonrpc: "2.0" as const,
      id: "req-4",
      method: "action.execute",
      params: {
        nodeId: 9999,
        actionType: "click" as const,
      },
    };

    const response = await dispatcher.handleRequest(request, document);
    expect(response.result).toBeUndefined();
    expect(response.error).toBeDefined();
    expect(response.error?.code).toBe(-32001);
    expect(response.error?.message).toContain("not found");
  });

  it("should return error code -32002 (NODE_GARBAGE_COLLECTED) during action execution", async () => {
    const fakeId = 777;
    (registry as any).idToElement.set(fakeId, { deref: () => undefined });

    const request = {
      jsonrpc: "2.0" as const,
      id: "req-gc",
      method: "action.execute",
      params: {
        nodeId: fakeId,
        actionType: "click" as const,
      },
    };

    const response = await dispatcher.handleRequest(request, document);
    expect(response.result).toBeUndefined();
    expect(response.error?.code).toBe(-32002);
    expect(response.error?.message).toContain("garbage collected");
  });

  it("should return error code -32003 (NODE_DETACHED) during action execution", async () => {
    const button = document.createElement("button");
    document.body.appendChild(button);
    const nodeId = registry.register(button);
    document.body.removeChild(button);

    const request = {
      jsonrpc: "2.0" as const,
      id: "req-detached",
      method: "action.execute",
      params: {
        nodeId,
        actionType: "click" as const,
      },
    };

    const response = await dispatcher.handleRequest(request, document);
    expect(response.result).toBeUndefined();
    expect(response.error?.code).toBe(-32003);
    expect(response.error?.message).toContain("detached");
  });

  it("should execute hover action on registered element dispatching mouseover and mouseenter", async () => {
    let mouseOverFired = false;
    let mouseOverBubbled = false;
    let mouseEnterFired = false;
    let mouseEnterBubbled = false;

    const card = document.createElement("div");
    card.addEventListener("mouseover", (e) => {
      mouseOverFired = true;
      mouseOverBubbled = e.bubbles;
    });
    card.addEventListener("mouseenter", (e) => {
      mouseEnterFired = true;
      mouseEnterBubbled = e.bubbles;
    });
    document.body.appendChild(card);

    const nodeId = registry.register(card);

    const request = {
      jsonrpc: "2.0" as const,
      id: "req-hover",
      method: "action.execute",
      params: {
        nodeId,
        actionType: "hover" as const,
      },
    };

    const response = await dispatcher.handleRequest(request, document);
    expect(response.error).toBeUndefined();
    expect(response.result.success).toBe(true);
    expect(mouseOverFired).toBe(true);
    expect(mouseOverBubbled).toBe(true);
    expect(mouseEnterFired).toBe(true);
    expect(mouseEnterBubbled).toBe(false);
  });

  it("should execute select action on <select> element by value", async () => {
    const select = document.createElement("select");
    select.innerHTML = `
      <option value="opt1">Option 1</option>
      <option value="opt2">Option 2</option>
      <option value="opt3">Option 3</option>
    `;
    document.body.appendChild(select);

    let inputFired = false;
    let changeFired = false;
    select.addEventListener("input", () => {
      inputFired = true;
    });
    select.addEventListener("change", () => {
      changeFired = true;
    });

    const nodeId = registry.register(select);

    const request = {
      jsonrpc: "2.0" as const,
      id: "req-select-val",
      method: "action.execute",
      params: {
        nodeId,
        actionType: "select" as const,
        value: "opt2",
      },
    };

    const response = await dispatcher.handleRequest(request, document);
    expect(response.error).toBeUndefined();
    expect(response.result.success).toBe(true);
    expect(select.value).toBe("opt2");
    expect(inputFired).toBe(true);
    expect(changeFired).toBe(true);
  });

  it("should execute select action on <select> element by option text/label", async () => {
    const select = document.createElement("select");
    select.innerHTML = `
      <option value="val_us">United States</option>
      <option value="val_ca">Canada</option>
    `;
    document.body.appendChild(select);

    const nodeId = registry.register(select);

    const request = {
      jsonrpc: "2.0" as const,
      id: "req-select-text",
      method: "action.execute",
      params: {
        nodeId,
        actionType: "select" as const,
        text: "Canada",
      },
    };

    const response = await dispatcher.handleRequest(request, document);
    expect(response.error).toBeUndefined();
    expect(response.result.success).toBe(true);
    expect(select.value).toBe("val_ca");
  });

  it("should preserve prior selections on <select multiple> element", async () => {
    const select = document.createElement("select");
    select.multiple = true;
    select.innerHTML = `
      <option value="opt1" selected>Option 1</option>
      <option value="opt2">Option 2</option>
      <option value="opt3">Option 3</option>
    `;
    document.body.appendChild(select);

    const nodeId = registry.register(select);

    const request = {
      jsonrpc: "2.0" as const,
      id: "req-select-multi",
      method: "action.execute",
      params: {
        nodeId,
        actionType: "select" as const,
        value: "opt3",
      },
    };

    const response = await dispatcher.handleRequest(request, document);
    expect(response.error).toBeUndefined();
    expect(response.result.success).toBe(true);

    const options = Array.from(select.options);
    expect(options[0].selected).toBe(true);
    expect(options[1].selected).toBe(false);
    expect(options[2].selected).toBe(true);
  });

  it("should return error when select action is executed on non-select element", async () => {
    const div = document.createElement("div");
    document.body.appendChild(div);
    const nodeId = registry.register(div);

    const request = {
      jsonrpc: "2.0" as const,
      id: "req-select-err",
      method: "action.execute",
      params: {
        nodeId,
        actionType: "select" as const,
        value: "opt1",
      },
    };

    const response = await dispatcher.handleRequest(request, document);
    expect(response.result).toBeUndefined();
    expect(response.error).toBeDefined();
    expect(response.error?.message).toContain("not a <select> element");
  });

  it("should return error when select action specifies non-existent option", async () => {
    const select = document.createElement("select");
    select.innerHTML = `<option value="opt1">Option 1</option>`;
    document.body.appendChild(select);
    const nodeId = registry.register(select);

    const request = {
      jsonrpc: "2.0" as const,
      id: "req-select-missing",
      method: "action.execute",
      params: {
        nodeId,
        actionType: "select" as const,
        value: "non_existent",
      },
    };

    const response = await dispatcher.handleRequest(request, document);
    expect(response.result).toBeUndefined();
    expect(response.error).toBeDefined();
    expect(response.error?.message).toContain("not found in <select>");
  });

  it("should return Method Not Found for unknown methods", async () => {
    const request = {
      jsonrpc: "2.0" as const,
      id: "req-5",
      method: "unknown.method",
    };

    const response = await dispatcher.handleRequest(request, document);
    expect(response.error?.code).toBe(-32601);
  });
});
