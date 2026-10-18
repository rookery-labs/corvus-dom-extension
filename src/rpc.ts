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
                code: execResult.errorCode ?? -32000,
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
    const resolution = this.registry.resolve(params.nodeId);

    if (!resolution.success) {
      return {
        success: false,
        nodeId: params.nodeId,
        actionType: params.actionType,
        executionTimeMs: performance.now() - startTime,
        errorMessage: resolution.message,
        errorCode: resolution.code,
      };
    }

    const element = resolution.element;

    try {
      switch (params.actionType) {
        case "click": {
          const form = (element as any).form as HTMLFormElement | undefined;
          let submitGuard: ((e: Event) => void) | null = null;

          if (form) {
            submitGuard = (e: Event) => {
              e.preventDefault();
            };
            form.addEventListener("submit", submitGuard, { capture: true, once: true });
          }

          try {
            if (typeof (element as HTMLElement).click === "function") {
              (element as HTMLElement).click();
            } else {
              element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
            }
          } finally {
            if (form && submitGuard) {
              form.removeEventListener("submit", submitGuard, { capture: true });
            }
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

        case "hover": {
          element.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, cancelable: true }));
          element.dispatchEvent(new MouseEvent("mouseenter", { bubbles: false, cancelable: false }));
          break;
        }

        case "select": {
          if (element.tagName.toLowerCase() !== "select") {
            return {
              success: false,
              nodeId: params.nodeId,
              actionType: params.actionType,
              executionTimeMs: performance.now() - startTime,
              errorMessage: `Target node [#${params.nodeId}] is not a <select> element (tag: <${element.tagName.toLowerCase()}>)`,
              errorCode: -32000,
            };
          }

          const selectEl = element as HTMLSelectElement;
          const targetValue = params.value !== undefined ? params.value : params.text;

          if (targetValue === undefined) {
            return {
              success: false,
              nodeId: params.nodeId,
              actionType: params.actionType,
              executionTimeMs: performance.now() - startTime,
              errorMessage: "Parameter 'value' or 'text' is required for select action",
              errorCode: -32602,
            };
          }

          const options = Array.from(selectEl.options || selectEl.querySelectorAll("option"));
          let matchedOption = options.find((opt) => opt.value === targetValue);
          if (!matchedOption) {
            matchedOption = options.find(
              (opt) => opt.text === targetValue || opt.textContent?.trim() === targetValue
            );
          }

          if (!matchedOption) {
            return {
              success: false,
              nodeId: params.nodeId,
              actionType: params.actionType,
              executionTimeMs: performance.now() - startTime,
              errorMessage: `Option matching '${targetValue}' not found in <select>`,
              errorCode: -32000,
            };
          }

          if (!selectEl.multiple) {
            for (const opt of options) {
              opt.selected = false;
            }
            matchedOption.selected = true;
            selectEl.value = matchedOption.value;
          } else {
            matchedOption.selected = true;
          }

          element.dispatchEvent(new Event("input", { bubbles: true }));
          element.dispatchEvent(new Event("change", { bubbles: true }));
          break;
        }

        default:
          return {
            success: false,
            nodeId: params.nodeId,
            actionType: params.actionType,
            executionTimeMs: performance.now() - startTime,
            errorMessage: `Unsupported action type: ${params.actionType}`,
            errorCode: -32602,
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
        errorCode: -32000,
      };
    }
  }
}
