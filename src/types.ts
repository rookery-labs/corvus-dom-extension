export interface ViewportInfo {
  width: number;
  height: number;
  scrollX: number;
  scrollY: number;
}

export interface PrunedNode {
  id: number;
  tag: string;
  role?: string;
  text?: string;
  attributes: Record<string, string>;
  isInteractive: boolean;
  children: PrunedNode[];
}

export interface DomObservationResult {
  url: string;
  title: string;
  viewport: ViewportInfo;
  tree: string;
  nodeCount: number;
  interactiveCount: number;
}

export type ActionType = "click" | "type" | "clear" | "scroll_into_view" | "hover" | "select";

export const SPEC_ERROR_CODES = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  ACTION_FAILED: -32000,
  NODE_NOT_FOUND: -32001,
  NODE_GARBAGE_COLLECTED: -32002,
  NODE_DETACHED: -32003,
} as const;

export type SpecErrorCode = (typeof SPEC_ERROR_CODES)[keyof typeof SPEC_ERROR_CODES];

export type NodeResolutionResult =
  | { success: true; element: Element }
  | { success: false; code: typeof SPEC_ERROR_CODES.NODE_NOT_FOUND; error: "NODE_NOT_FOUND"; message: string }
  | { success: false; code: typeof SPEC_ERROR_CODES.NODE_GARBAGE_COLLECTED; error: "NODE_GARBAGE_COLLECTED"; message: string }
  | { success: false; code: typeof SPEC_ERROR_CODES.NODE_DETACHED; error: "NODE_DETACHED"; message: string; element: Element };

export interface ActionExecuteParams {
  nodeId: number;
  actionType: ActionType;
  text?: string;
  key?: string;
  value?: string;
}

export interface ActionExecuteResult {
  success: boolean;
  nodeId: number;
  actionType: ActionType;
  executionTimeMs: number;
  errorMessage?: string;
  errorCode?: number;
}

export interface JsonRpcRequest<T = any> {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: T;
}

export interface JsonRpcResponse<T = any> {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}
