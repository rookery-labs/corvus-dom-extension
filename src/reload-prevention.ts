export interface ReloadPreventionOptions {
  enableKeyboard?: boolean;
  enableFormSubmit?: boolean;
  onPrevented?: (type: "keyboard" | "submit", detail: string) => void;
}

export interface ReloadPreventionController {
  enable: () => void;
  disable: () => void;
  isEnabled: () => boolean;
  cleanup: () => void;
}

/**
 * Checks if a keyboard event represents a page reload shortcut:
 * - F5 or Ctrl+F5
 * - Ctrl+R or Cmd+R (including Shift combinations for hard reload)
 * - BrowserRefresh multimedia key
 */
export function isReloadKeyboardShortcut(event: KeyboardEvent): boolean {
  const key = event.key;
  const code = event.code;

  // F5 or BrowserRefresh key
  if (key === "F5" || code === "F5" || key === "BrowserRefresh") {
    return true;
  }

  // Ctrl+R (Windows/Linux) or Cmd+R / Meta+R (macOS)
  const isR = key === "r" || key === "R" || code === "KeyR";
  if ((event.ctrlKey || event.metaKey) && isR) {
    return true;
  }

  return false;
}

/**
 * Checks if a DOM element is a form submit trigger:
 * - <button type="submit">
 * - <button> inside a form without an explicit type (defaults to submit)
 * - <input type="submit">
 * - <input type="image">
 */
export function isFormSubmitTrigger(element: Element): boolean {
  const tagName = element.tagName.toUpperCase();

  if (tagName === "BUTTON") {
    const type = element.getAttribute("type");
    // In HTML, button default type is "submit" unless specified otherwise
    return !type || type.toLowerCase() === "submit";
  }

  if (tagName === "INPUT") {
    const type = (element.getAttribute("type") || "").toLowerCase();
    return type === "submit" || type === "image";
  }

  return false;
}

/**
 * Installs reload prevention listeners on window and document.
 */
export function installReloadPrevention(
  targetWindow: Window,
  targetDoc: Document,
  options: ReloadPreventionOptions = {}
): ReloadPreventionController {
  let active = true;
  const enableKeyboard = options.enableKeyboard ?? true;
  const enableFormSubmit = options.enableFormSubmit ?? true;

  const keydownHandler = (event: KeyboardEvent) => {
    if (!active || !enableKeyboard) return;

    if (isReloadKeyboardShortcut(event)) {
      if (event.cancelable) {
        event.preventDefault();
      }
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      options.onPrevented?.(
        "keyboard",
        `${event.ctrlKey ? "Ctrl+" : ""}${event.metaKey ? "Cmd+" : ""}${event.key}`
      );
    }
  };

  const submitHandler = (event: Event) => {
    if (!active || !enableFormSubmit) return;

    // Prevent default browser HTTP navigation/reload on form submit
    if (event.cancelable) {
      event.preventDefault();
    }
    options.onPrevented?.("submit", (event.target as HTMLElement)?.tagName || "FORM");
  };

  // Attach in capture phase to intercept before page scripts or default browser handlers
  targetWindow.addEventListener("keydown", keydownHandler, { capture: true, passive: false });
  targetDoc.addEventListener("submit", submitHandler, { capture: true, passive: false });

  return {
    enable: () => {
      active = true;
    },
    disable: () => {
      active = false;
    },
    isEnabled: () => active,
    cleanup: () => {
      targetWindow.removeEventListener("keydown", keydownHandler, { capture: true });
      targetDoc.removeEventListener("submit", submitHandler, { capture: true });
    },
  };
}
