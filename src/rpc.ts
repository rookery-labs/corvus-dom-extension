import { DomPruner } from "./pruner.js";
import { ElementRegistry } from "./registry.js";
import {
  ActionExecuteParams,
  ActionExecuteResult,
  JsonRpcRequest,
  JsonRpcResponse,
} from "./types.js";

export class JsonRpcDispatcher {
  constructor(
    private readonly pruner: DomPruner,
    private readonly registry: ElementRegistry
  ) {}

  public async handleRequest(
    request: JsonRpcRequest,
    doc: Document
  ): Promise<JsonRpcResponse> {
    if (request.jsonrpc !== "2.0") {
      return {
        jsonrpc: "2.0",
        id: request.id ?? null,
        error: { code: -32600, message: "Invalid Request: jsonrpc must be '2.0'" },
      };
    }

    try {
      switch (request.method) {
        case "dom.observation": {
          const maxDepth = request.params?.maxDepth ?? 32;
          const result = this.pruner.observe(doc, maxDepth);
          return {
            jsonrpc: "2.0",
            id: request.id,
            result,
          };
        }

        case "action.execute": {
          const params = request.params as ActionExecuteParams;
          if (!params || !params.nodeId || !params.actionType) {
            return {
              jsonrpc: "2.0",
              id: request.id,
              error: {
                code: -32602,
                message: "Invalid params: 'nodeId' and 'actionType' are required",
              },
            };
          }

          const execResult = await this.executeAction(params);
          if (!execResult.success) {
            return {
              jsonrpc: "2.0",
              id: request.id,
              error: {
                code: -32000,
                message: execResult.errorMessage || "Action execution failed",
                data: execResult,
              },
            };
          }

          return {
            jsonrpc: "2.0",
            id: request.id,
            result: execResult,
          };
        }

        case "agent.status_update": {
          return {
            jsonrpc: "2.0",
            id: request.id,
            result: { acknowledged: true },
          };
        }

        default:
          return {
            jsonrpc: "2.0",
            id: request.id,
            error: {
              code: -32601,
              message: `Method not found: ${request.method}`,
            },
          };
      }
    } catch (err: any) {
      return {
        jsonrpc: "2.0",
        id: request.id,
        error: {
          code: -32603,
          message: err?.message || "Internal RPC error",
        },
      };
    }
  }

  public async executeAction(params: ActionExecuteParams): Promise<ActionExecuteResult> {
    const startTime = performance.now();
    const element = this.registry.get(params.nodeId);

    if (!element) {
      return {
        success: false,
        nodeId: params.nodeId,
        actionType: params.actionType,
        executionTimeMs: performance.now() - startTime,
        errorMessage: `Node [#${params.nodeId}] not found in registry or garbage-collected`,
      };
    }

    if (!element.isConnected) {
      return {
        success: false,
        nodeId: params.nodeId,
        actionType: params.actionType,
        executionTimeMs: performance.now() - startTime,
        errorMessage: `Node [#${params.nodeId}] is detached from DOM`,
      };
    }

    try {
      switch (params.actionType) {
        case "click": {
          if (typeof (element as HTMLElement).click === "function") {
            (element as HTMLElement).click();
          } else {
            element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
          }
          break;
        }

        case "type": {
          const inputEl = element as HTMLInputElement | HTMLTextAreaElement;
          const textToType = params.text || "";
          inputEl.focus?.();
          inputEl.value = (inputEl.value || "") + textToType;
          element.dispatchEvent(new Event("input", { bubbles: true }));
          element.dispatchEvent(new Event("change", { bubbles: true }));
          break;
        }

        case "clear": {
          const inputEl = element as HTMLInputElement | HTMLTextAreaElement;
          inputEl.value = "";
          element.dispatchEvent(new Event("input", { bubbles: true }));
          element.dispatchEvent(new Event("change", { bubbles: true }));
          break;
        }

        case "scroll_into_view": {
          if (typeof element.scrollIntoView === "function") {
            element.scrollIntoView({ behavior: "smooth", block: "center" });
          }
          break;
        }

        default:
          return {
            success: false,
            nodeId: params.nodeId,
            actionType: params.actionType,
            executionTimeMs: performance.now() - startTime,
            errorMessage: `Unsupported action type: ${params.actionType}`,
          };
      }

      return {
        success: true,
        nodeId: params.nodeId,
        actionType: params.actionType,
        executionTimeMs: performance.now() - startTime,
      };
    } catch (error: any) {
      return {
        success: false,
        nodeId: params.nodeId,
        actionType: params.actionType,
        executionTimeMs: performance.now() - startTime,
        errorMessage: error?.message || "Execution exception",
      };
    }
  }
}
