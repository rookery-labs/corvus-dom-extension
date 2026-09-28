import { DomPruner } from "./pruner.js";
import { ElementRegistry } from "./registry.js";
import { JsonRpcDispatcher } from "./rpc.js";

const registry = new ElementRegistry();
const pruner = new DomPruner(registry);
const dispatcher = new JsonRpcDispatcher(pruner, registry);

// WebExtension background/content-script bridge for GeckoView
if (typeof window !== "undefined") {
  (window as any).__corvus_dom_extension = {
    registry,
    pruner,
    dispatcher,
    handleMessage: (msg: any) => dispatcher.handleRequest(msg, document),
  };
}

export { DomPruner, ElementRegistry, JsonRpcDispatcher };
