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
