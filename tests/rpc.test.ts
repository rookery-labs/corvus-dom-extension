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
    expect(response.error?.code).toBe(-32000);
    expect(response.error?.message).toContain("not found");
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
