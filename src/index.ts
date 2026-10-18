import { DomPruner } from "./pruner.js";
import { ElementRegistry } from "./registry.js";
import {
  installReloadPrevention,
  ReloadPreventionController,
  isReloadKeyboardShortcut,
  isFormSubmitTrigger,
} from "./reload-prevention.js";
import { JsonRpcDispatcher } from "./rpc.js";

const registry = new ElementRegistry();
const pruner = new DomPruner(registry);
const dispatcher = new JsonRpcDispatcher(pruner, registry);

let reloadPreventionController: ReloadPreventionController | null = null;

// Determine browser WebExtension API (Firefox / GeckoView or Chrome)
const browserAPI =
  typeof (globalThis as any).browser !== "undefined"
    ? (globalThis as any).browser
    : typeof (globalThis as any).chrome !== "undefined"
    ? (globalThis as any).chrome
    : null;

if (typeof window !== "undefined" && typeof document !== "undefined") {
  // 1. Install accidental reload prevention on window & document
  reloadPreventionController = installReloadPrevention(window, document);

  // 2. Attach beforeunload / unload / pagehide lifecycle hooks to reset registry state
  const resetRegistryHandler = () => {
    registry.reset();
  };
  window.addEventListener("beforeunload", resetRegistryHandler);
  window.addEventListener("unload", resetRegistryHandler);
  window.addEventListener("pagehide", resetRegistryHandler);

  // 3. WebExtension Port and Message Listeners for GeckoView
  if (browserAPI?.runtime?.onMessage) {
    browserAPI.runtime.onMessage.addListener(
      (message: any, sender: any, sendResponse?: (response: any) => void) => {
        const responsePromise = dispatcher.handleRequest(message, document);
        if (typeof sendResponse === "function") {
          responsePromise.then(sendResponse);
          return true; // Keep message channel open for async response
        }
        return responsePromise;
      }
    );
  }

  if (browserAPI?.runtime?.onConnect) {
    browserAPI.runtime.onConnect.addListener((port: any) => {
      port.onMessage.addListener(async (msg: any) => {
        const response = await dispatcher.handleRequest(msg, document);
        port.postMessage(response);
      });
    });
  }

  // 4. Fallback bridge to window.__corvus_dom_extension
  (window as any).__corvus_dom_extension = {
    registry,
    pruner,
    dispatcher,
    handleMessage: (msg: any) => dispatcher.handleRequest(msg, document),
    reloadPrevention: reloadPreventionController,
    version: "0.1.0",
  };
}

export {
  DomPruner,
  ElementRegistry,
  JsonRpcDispatcher,
  installReloadPrevention,
  isReloadKeyboardShortcut,
  isFormSubmitTrigger,
};
