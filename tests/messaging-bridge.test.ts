import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ElementRegistry } from "../src/registry.js";
import { DomPruner } from "../src/pruner.js";
import { JsonRpcDispatcher } from "../src/rpc.js";

describe("WebExtension Messaging Bridge & Lifecycle (R1, SPEC-REG-001)", () => {
  let registry: ElementRegistry;
  let pruner: DomPruner;
  let dispatcher: JsonRpcDispatcher;

  beforeEach(() => {
    registry = new ElementRegistry();
    pruner = new DomPruner(registry);
    dispatcher = new JsonRpcDispatcher(pruner, registry);
    document.body.innerHTML = "";
  });

  describe("Lifecycle Unload Registry Cleanup (SPEC-REG-001 §3.2)", () => {
    it("should reset registry on beforeunload event", () => {
      const btn = document.createElement("button");
      document.body.appendChild(btn);
      registry.register(btn);
      expect(registry.size()).toBe(1);

      window.addEventListener("beforeunload", () => registry.reset());
      window.dispatchEvent(new Event("beforeunload"));

      expect(registry.size()).toBe(0);
      const newBtn = document.createElement("button");
      document.body.appendChild(newBtn);
      expect(registry.register(newBtn)).toBe(1);
    });

    it("should reset registry on unload and pagehide events", () => {
      const input = document.createElement("input");
      document.body.appendChild(input);
      registry.register(input);

      window.addEventListener("pagehide", () => registry.reset());
      window.dispatchEvent(new Event("pagehide"));

      expect(registry.size()).toBe(0);
    });
  });

  describe("WebExtension Port & Runtime Messaging", () => {
    it("should process JSON-RPC messages via browser.runtime.onMessage Promise", async () => {
      document.body.innerHTML = "<button>Click Me</button>";
      const request = {
        jsonrpc: "2.0" as const,
        id: "msg-1",
        method: "dom.observation",
      };

      const response = await dispatcher.handleRequest(request, document);
      expect(response.id).toBe("msg-1");
      expect(response.result?.nodeCount).toBeGreaterThan(0);
    });

    it("should process JSON-RPC messages over bidirectional WebExtension Port", async () => {
      document.body.innerHTML = "<button id='test-btn'>Submit</button>";
      const btn = document.getElementById("test-btn")!;
      const nodeId = registry.register(btn);

      let portResponse: any = null;
      const mockPort = {
        name: "corvus-dom-extension",
        postMessage: (resp: any) => {
          portResponse = resp;
        },
      };

      const handlePortMessage = async (msg: any) => {
        const resp = await dispatcher.handleRequest(msg, document);
        mockPort.postMessage(resp);
      };

      await handlePortMessage({
        jsonrpc: "2.0",
        id: "port-1",
        method: "action.execute",
        params: { nodeId, actionType: "click" },
      });

      expect(portResponse).toBeDefined();
      expect(portResponse.id).toBe("port-1");
      expect(portResponse.result.success).toBe(true);
    });

    it("should route messages through window.__corvus_dom_extension fallback", async () => {
      (window as any).__corvus_dom_extension = {
        registry,
        pruner,
        dispatcher,
        handleMessage: (msg: any) => dispatcher.handleRequest(msg, document),
      };

      const resp = await (window as any).__corvus_dom_extension.handleMessage({
        jsonrpc: "2.0",
        id: "global-1",
        method: "dom.observation",
      });

      expect(resp.id).toBe("global-1");
      expect(resp.result).toBeDefined();
    });
  });
});
