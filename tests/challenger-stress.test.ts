import { describe, it, expect, beforeEach } from "vitest";
import { DomPruner } from "../src/pruner.js";
import { ElementRegistry } from "../src/registry.js";
import { JsonRpcDispatcher } from "../src/rpc.js";
import { SPEC_ERROR_CODES } from "../src/types.js";

describe("Empirical Challenger Stress Harness: Actions & Error Codes", () => {
  let registry: ElementRegistry;
  let pruner: DomPruner;
  let dispatcher: JsonRpcDispatcher;

  beforeEach(() => {
    registry = new ElementRegistry();
    pruner = new DomPruner(registry);
    dispatcher = new JsonRpcDispatcher(pruner, registry);
    document.body.innerHTML = "";
  });

  describe("Directive 1.1: Synthetic Action `hover` Stress Verification", () => {
    it("should dispatch mouseover (bubbling) and mouseenter (non-bubbling) in correct order", async () => {
      const parent = document.createElement("div");
      parent.id = "parent-container";
      const child = document.createElement("button");
      child.id = "target-child";
      child.textContent = "Hover Target";
      parent.appendChild(child);
      document.body.appendChild(parent);

      const eventLog: Array<{ target: string; type: string; bubbles: boolean; cancelable: boolean }> = [];

      parent.addEventListener("mouseover", (e) => {
        eventLog.push({ target: "parent", type: e.type, bubbles: e.bubbles, cancelable: e.cancelable });
      });
      parent.addEventListener("mouseenter", (e) => {
        eventLog.push({ target: "parent", type: e.type, bubbles: e.bubbles, cancelable: e.cancelable });
      });

      child.addEventListener("mouseover", (e) => {
        eventLog.push({ target: "child", type: e.type, bubbles: e.bubbles, cancelable: e.cancelable });
      });
      child.addEventListener("mouseenter", (e) => {
        eventLog.push({ target: "child", type: e.type, bubbles: e.bubbles, cancelable: e.cancelable });
      });

      const childId = registry.register(child);

      const response = await dispatcher.handleRequest(
        {
          jsonrpc: "2.0",
          id: "challenge-hover-1",
          method: "action.execute",
          params: {
            nodeId: childId,
            actionType: "hover",
          },
        },
        document
      );

      expect(response.error).toBeUndefined();
      expect(response.result).toBeDefined();
      expect(response.result.success).toBe(true);

      // Verify event order: mouseover first, then mouseenter
      const mouseoverEvents = eventLog.filter((e) => e.type === "mouseover");
      const mouseenterEvents = eventLog.filter((e) => e.type === "mouseenter");

      expect(mouseoverEvents.length).toBeGreaterThanOrEqual(1);
      expect(mouseenterEvents.length).toBeGreaterThanOrEqual(1);

      // Verify child mouseover flags: bubbles=true, cancelable=true
      const childMouseover = eventLog.find((e) => e.target === "child" && e.type === "mouseover");
      expect(childMouseover).toBeDefined();
      expect(childMouseover?.bubbles).toBe(true);
      expect(childMouseover?.cancelable).toBe(true);

      // Verify child mouseenter flags: bubbles=false, cancelable=false
      const childMouseenter = eventLog.find((e) => e.target === "child" && e.type === "mouseenter");
      expect(childMouseenter).toBeDefined();
      expect(childMouseenter?.bubbles).toBe(false);
      expect(childMouseenter?.cancelable).toBe(false);

      // Verify parent received mouseover via bubbling
      const parentMouseover = eventLog.find((e) => e.target === "parent" && e.type === "mouseover");
      expect(parentMouseover).toBeDefined();

      // Verify parent did NOT receive mouseenter via bubbling (mouseenter does not bubble)
      const parentMouseenter = eventLog.find((e) => e.target === "parent" && e.type === "mouseenter");
      expect(parentMouseenter).toBeUndefined();
    });

    it("should fail hover action with -32003 when target element is detached", async () => {
      const button = document.createElement("button");
      button.textContent = "Detached Button";
      document.body.appendChild(button);

      const nodeId = registry.register(button);
      document.body.removeChild(button);

      const response = await dispatcher.handleRequest(
        {
          jsonrpc: "2.0",
          id: "challenge-hover-detached",
          method: "action.execute",
          params: {
            nodeId,
            actionType: "hover",
          },
        },
        document
      );

      expect(response.result).toBeUndefined();
      expect(response.error).toBeDefined();
      expect(response.error?.code).toBe(SPEC_ERROR_CODES.NODE_DETACHED);
    });
  });

  describe("Directive 1.2: Synthetic Action `select` Stress Verification", () => {
    it("should select option matching by value in single select and fire input/change events", async () => {
      const select = document.createElement("select");
      select.innerHTML = `
        <option value="alpha">Alpha</option>
        <option value="beta" selected>Beta</option>
        <option value="gamma">Gamma</option>
      `;
      document.body.appendChild(select);

      const inputEvents: Event[] = [];
      const changeEvents: Event[] = [];
      select.addEventListener("input", (e) => inputEvents.push(e));
      select.addEventListener("change", (e) => changeEvents.push(e));

      const nodeId = registry.register(select);

      const response = await dispatcher.handleRequest(
        {
          jsonrpc: "2.0",
          id: "challenge-select-val",
          method: "action.execute",
          params: {
            nodeId,
            actionType: "select",
            value: "gamma",
          },
        },
        document
      );

      expect(response.error).toBeUndefined();
      expect(response.result.success).toBe(true);
      expect(select.value).toBe("gamma");

      // Verify single select deselected other options
      const options = Array.from(select.options);
      expect(options[0].selected).toBe(false);
      expect(options[1].selected).toBe(false);
      expect(options[2].selected).toBe(true);

      // Verify input and change event bubbling
      expect(inputEvents.length).toBe(1);
      expect(inputEvents[0].bubbles).toBe(true);
      expect(changeEvents.length).toBe(1);
      expect(changeEvents[0].bubbles).toBe(true);
    });

    it("should select option matching by text / label", async () => {
      const select = document.createElement("select");
      select.innerHTML = `
        <option value="opt-1">First Option</option>
        <option value="opt-2">Second Option Label</option>
        <option value="opt-3">Third Option</option>
      `;
      document.body.appendChild(select);

      const nodeId = registry.register(select);

      const response = await dispatcher.handleRequest(
        {
          jsonrpc: "2.0",
          id: "challenge-select-text",
          method: "action.execute",
          params: {
            nodeId,
            actionType: "select",
            text: "Second Option Label",
          },
        },
        document
      );

      expect(response.error).toBeUndefined();
      expect(response.result.success).toBe(true);
      expect(select.value).toBe("opt-2");
    });

    it("should select option matching text with surrounding whitespace (trimmed textContent)", async () => {
      const select = document.createElement("select");
      select.innerHTML = `
        <option value="v1">
          Padded Label
        </option>
      `;
      document.body.appendChild(select);

      const nodeId = registry.register(select);

      const response = await dispatcher.handleRequest(
        {
          jsonrpc: "2.0",
          id: "challenge-select-trimmed",
          method: "action.execute",
          params: {
            nodeId,
            actionType: "select",
            text: "Padded Label",
          },
        },
        document
      );

      expect(response.error).toBeUndefined();
      expect(response.result.success).toBe(true);
      expect(select.value).toBe("v1");
    });

    it("should support multiple select element: preserving prior selections", async () => {
      const select = document.createElement("select");
      select.multiple = true;
      select.innerHTML = `
        <option value="item1" selected>Item 1</option>
        <option value="item2">Item 2</option>
        <option value="item3">Item 3</option>
      `;
      document.body.appendChild(select);

      const nodeId = registry.register(select);

      // Select item 3 in multiple select
      const response = await dispatcher.handleRequest(
        {
          jsonrpc: "2.0",
          id: "challenge-select-multi",
          method: "action.execute",
          params: {
            nodeId,
            actionType: "select",
            value: "item3",
          },
        },
        document
      );

      expect(response.error).toBeUndefined();
      expect(response.result.success).toBe(true);

      const options = Array.from(select.options);
      // In multiple select, item1 should remain selected, and item3 should now be selected
      expect(options[0].selected).toBe(true);
      expect(options[1].selected).toBe(false);
      expect(options[2].selected).toBe(true);
    });

    it("should fail gracefully when matching non-existent option", async () => {
      const select = document.createElement("select");
      select.innerHTML = `
        <option value="apple">Apple</option>
        <option value="banana">Banana</option>
      `;
      document.body.appendChild(select);

      const nodeId = registry.register(select);

      const response = await dispatcher.handleRequest(
        {
          jsonrpc: "2.0",
          id: "challenge-select-missing",
          method: "action.execute",
          params: {
            nodeId,
            actionType: "select",
            value: "pineapple",
          },
        },
        document
      );

      expect(response.result).toBeUndefined();
      expect(response.error).toBeDefined();
      expect(response.error?.code).toBe(SPEC_ERROR_CODES.ACTION_FAILED);
      expect(response.error?.message).toContain("Option matching 'pineapple' not found in <select>");
    });

    it("should fail with INVALID_PARAMS (-32602) when neither value nor text is provided", async () => {
      const select = document.createElement("select");
      select.innerHTML = `<option value="apple">Apple</option>`;
      document.body.appendChild(select);

      const nodeId = registry.register(select);

      const response = await dispatcher.handleRequest(
        {
          jsonrpc: "2.0",
          id: "challenge-select-no-value",
          method: "action.execute",
          params: {
            nodeId,
            actionType: "select",
          } as any,
        },
        document
      );

      expect(response.result).toBeUndefined();
      expect(response.error).toBeDefined();
      expect(response.error?.code).toBe(-32602);
      expect(response.error?.message).toContain("Parameter 'value' or 'text' is required");
    });

    it("should fail with ACTION_FAILED (-32000) when target element is not a <select>", async () => {
      const input = document.createElement("input");
      input.type = "text";
      document.body.appendChild(input);

      const nodeId = registry.register(input);

      const response = await dispatcher.handleRequest(
        {
          jsonrpc: "2.0",
          id: "challenge-select-not-select",
          method: "action.execute",
          params: {
            nodeId,
            actionType: "select",
            value: "apple",
          },
        },
        document
      );

      expect(response.result).toBeUndefined();
      expect(response.error).toBeDefined();
      expect(response.error?.code).toBe(-32000);
      expect(response.error?.message).toContain("is not a <select> element");
    });
  });

  describe("Directive 1.3: Error Codes Stress Verification (-32001, -32002, -32003)", () => {
    it("stress test -32001 (NODE_NOT_FOUND): unallocated IDs, negative IDs, boundary IDs", async () => {
      const testCases = [
        99999,
        1000000,
        -1,
        -42,
        -999999,
        Number.MAX_SAFE_INTEGER,
      ];

      for (const testId of testCases) {
        // Direct registry resolution test
        const res = registry.resolve(testId);
        expect(res.success).toBe(false);
        if (!res.success) {
          expect(res.code).toBe(SPEC_ERROR_CODES.NODE_NOT_FOUND);
          expect(res.error).toBe("NODE_NOT_FOUND");
          expect(res.message).toContain(`Node [#${testId}] was never registered`);
        }

        // RPC dispatcher execution test
        const response = await dispatcher.handleRequest(
          {
            jsonrpc: "2.0",
            id: `challenge-notfound-${testId}`,
            method: "action.execute",
            params: {
              nodeId: testId,
              actionType: "click",
            },
          },
          document
        );

        expect(response.result).toBeUndefined();
        expect(response.error).toBeDefined();
        expect(response.error?.code).toBe(SPEC_ERROR_CODES.NODE_NOT_FOUND);
        expect(response.error?.message).toContain(`Node [#${testId}] was never registered`);
      }
    });

    it("stress test boundary ID 0: fails schema parameter check with -32602", async () => {
      const response = await dispatcher.handleRequest(
        {
          jsonrpc: "2.0",
          id: "challenge-boundary-zero",
          method: "action.execute",
          params: {
            nodeId: 0,
            actionType: "click",
          },
        },
        document
      );

      expect(response.result).toBeUndefined();
      expect(response.error).toBeDefined();
      expect(response.error?.code).toBe(-32602);
    });

    it("stress test -32002 (NODE_GARBAGE_COLLECTED): simulated GC'd nodes", async () => {
      const gcId = 12345;
      (registry as any).idToElement.set(gcId, { deref: () => undefined });

      // Registry resolution
      const res = registry.resolve(gcId);
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.code).toBe(SPEC_ERROR_CODES.NODE_GARBAGE_COLLECTED);
        expect(res.error).toBe("NODE_GARBAGE_COLLECTED");
        expect(res.message).toContain("garbage collected");
      }

      // Verify that calling get() or resolve() repeatedly does NOT prematurely delete the GC'd entry
      const getVal = registry.get(gcId);
      expect(getVal).toBeNull();

      const res2 = registry.resolve(gcId);
      expect(res2.success).toBe(false);
      if (!res2.success) {
        expect(res2.code).toBe(SPEC_ERROR_CODES.NODE_GARBAGE_COLLECTED);
      }

      // RPC execution
      const rpcResponse = await dispatcher.handleRequest(
        {
          jsonrpc: "2.0",
          id: "challenge-gc-1",
          method: "action.execute",
          params: {
            nodeId: gcId,
            actionType: "click",
          },
        },
        document
      );

      expect(rpcResponse.result).toBeUndefined();
      expect(rpcResponse.error).toBeDefined();
      expect(rpcResponse.error?.code).toBe(SPEC_ERROR_CODES.NODE_GARBAGE_COLLECTED);
    });

    it("stress test transition: -32002 transitions to -32001 ONLY after sweep()", () => {
      const gcId1 = 501;
      const gcId2 = 502;
      (registry as any).idToElement.set(gcId1, { deref: () => undefined });
      (registry as any).idToElement.set(gcId2, { deref: () => undefined });

      // Before sweep: both must return -32002
      const pre1 = registry.resolve(gcId1);
      const pre2 = registry.resolve(gcId2);
      expect(pre1.success).toBe(false);
      expect(pre2.success).toBe(false);
      if (!pre1.success) expect(pre1.code).toBe(SPEC_ERROR_CODES.NODE_GARBAGE_COLLECTED);
      if (!pre2.success) expect(pre2.code).toBe(SPEC_ERROR_CODES.NODE_GARBAGE_COLLECTED);

      // Verify multiple invocations do not mutate state
      for (let i = 0; i < 5; i++) {
        const intermediate = registry.resolve(gcId1);
        if (!intermediate.success) {
          expect(intermediate.code).toBe(SPEC_ERROR_CODES.NODE_GARBAGE_COLLECTED);
        }
      }

      // Execute sweep
      const sweptCount = registry.sweep();
      expect(sweptCount).toBe(2);

      // After sweep: both must now return -32001
      const post1 = registry.resolve(gcId1);
      const post2 = registry.resolve(gcId2);
      expect(post1.success).toBe(false);
      expect(post2.success).toBe(false);
      if (!post1.success) {
        expect(post1.code).toBe(SPEC_ERROR_CODES.NODE_NOT_FOUND);
        expect(post1.error).toBe("NODE_NOT_FOUND");
      }
      if (!post2.success) {
        expect(post2.code).toBe(SPEC_ERROR_CODES.NODE_NOT_FOUND);
        expect(post2.error).toBe("NODE_NOT_FOUND");
      }
    });

    it("stress test -32003 (NODE_DETACHED): detached nodes and re-attachment lifecycle", async () => {
      const parent = document.createElement("div");
      const button = document.createElement("button");
      button.textContent = "Test Button";
      parent.appendChild(button);
      document.body.appendChild(parent);

      const nodeId = registry.register(button);

      // While connected: resolve is successful
      const connectedRes = registry.resolve(nodeId);
      expect(connectedRes.success).toBe(true);

      // Detach button from parent
      parent.removeChild(button);
      expect(button.isConnected).toBe(false);

      // Resolution returns -32003
      const detachedRes = registry.resolve(nodeId);
      expect(detachedRes.success).toBe(false);
      if (!detachedRes.success) {
        expect(detachedRes.code).toBe(SPEC_ERROR_CODES.NODE_DETACHED);
        expect(detachedRes.error).toBe("NODE_DETACHED");
        expect(detachedRes.element).toBe(button);
      }

      // RPC call returns -32003
      const rpcDetached = await dispatcher.handleRequest(
        {
          jsonrpc: "2.0",
          id: "challenge-detached-action",
          method: "action.execute",
          params: {
            nodeId,
            actionType: "type",
            text: "test",
          },
        },
        document
      );
      expect(rpcDetached.result).toBeUndefined();
      expect(rpcDetached.error?.code).toBe(SPEC_ERROR_CODES.NODE_DETACHED);

      // Re-attach button back to DOM
      document.body.appendChild(button);
      expect(button.isConnected).toBe(true);

      // Now resolution succeeds again
      const reconnectedRes = registry.resolve(nodeId);
      expect(reconnectedRes.success).toBe(true);

      // RPC call succeeds again
      const rpcReconnected = await dispatcher.handleRequest(
        {
          jsonrpc: "2.0",
          id: "challenge-reconnected-action",
          method: "action.execute",
          params: {
            nodeId,
            actionType: "click",
          },
        },
        document
      );
      expect(rpcReconnected.error).toBeUndefined();
      expect(rpcReconnected.result.success).toBe(true);
    });

    it("stress test -32003 transition to -32001 after sweep() for detached nodes", () => {
      const span = document.createElement("span");
      document.body.appendChild(span);

      const nodeId = registry.register(span);
      document.body.removeChild(span);

      // Before sweep: returns -32003
      const preSweep = registry.resolve(nodeId);
      expect(preSweep.success).toBe(false);
      if (!preSweep.success) {
        expect(preSweep.code).toBe(SPEC_ERROR_CODES.NODE_DETACHED);
      }

      // Sweep cleans up disconnected elements
      const swept = registry.sweep();
      expect(swept).toBe(1);

      // After sweep: returns -32001
      const postSweep = registry.resolve(nodeId);
      expect(postSweep.success).toBe(false);
      if (!postSweep.success) {
        expect(postSweep.code).toBe(SPEC_ERROR_CODES.NODE_NOT_FOUND);
      }
    });
  });
});
