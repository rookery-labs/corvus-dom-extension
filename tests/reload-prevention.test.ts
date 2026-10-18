import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  installReloadPrevention,
  isReloadKeyboardShortcut,
  isFormSubmitTrigger,
} from "../src/reload-prevention.js";

describe("Accidental Reload Prevention (R3 & SPEC-SESSION-001)", () => {
  let controller: ReturnType<typeof installReloadPrevention>;

  beforeEach(() => {
    document.body.innerHTML = "";
    controller = installReloadPrevention(window, document);
  });

  afterEach(() => {
    controller.cleanup();
  });

  describe("Keyboard Reload Shortcut Interception", () => {
    it("should prevent default and stop propagation on F5 keydown", () => {
      const event = new KeyboardEvent("keydown", { key: "F5", code: "F5", cancelable: true });
      const stopSpy = vi.spyOn(event, "stopPropagation");

      window.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
      expect(stopSpy).toHaveBeenCalled();
    });

    it("should prevent default on Ctrl+R (Windows/Linux) and Cmd+R (macOS)", () => {
      const ctrlR = new KeyboardEvent("keydown", {
        key: "r",
        code: "KeyR",
        ctrlKey: true,
        cancelable: true,
      });
      window.dispatchEvent(ctrlR);
      expect(ctrlR.defaultPrevented).toBe(true);

      const cmdR = new KeyboardEvent("keydown", {
        key: "r",
        code: "KeyR",
        metaKey: true,
        cancelable: true,
      });
      window.dispatchEvent(cmdR);
      expect(cmdR.defaultPrevented).toBe(true);
    });

    it("should prevent default on hard reload shortcuts Ctrl+Shift+R and Cmd+Shift+R", () => {
      const ctrlShiftR = new KeyboardEvent("keydown", {
        key: "R",
        code: "KeyR",
        ctrlKey: true,
        shiftKey: true,
        cancelable: true,
      });
      window.dispatchEvent(ctrlShiftR);
      expect(ctrlShiftR.defaultPrevented).toBe(true);

      const cmdShiftR = new KeyboardEvent("keydown", {
        key: "R",
        code: "KeyR",
        metaKey: true,
        shiftKey: true,
        cancelable: true,
      });
      window.dispatchEvent(cmdShiftR);
      expect(cmdShiftR.defaultPrevented).toBe(true);
    });

    it("should prevent default on repeated keydown events (user holding F5)", () => {
      const repeatF5 = new KeyboardEvent("keydown", { key: "F5", repeat: true, cancelable: true });
      window.dispatchEvent(repeatF5);
      expect(repeatF5.defaultPrevented).toBe(true);
    });

    it("should prevent default on BrowserRefresh key", () => {
      const refreshKey = new KeyboardEvent("keydown", {
        key: "BrowserRefresh",
        cancelable: true,
      });
      window.dispatchEvent(refreshKey);
      expect(refreshKey.defaultPrevented).toBe(true);
    });

    it("should NOT prevent default for normal key typing without reload modifiers", () => {
      const keyA = new KeyboardEvent("keydown", { key: "a", code: "KeyA", cancelable: true });
      window.dispatchEvent(keyA);
      expect(keyA.defaultPrevented).toBe(false);

      const keyR = new KeyboardEvent("keydown", { key: "r", code: "KeyR", cancelable: true });
      window.dispatchEvent(keyR);
      expect(keyR.defaultPrevented).toBe(false);
    });

    it("should allow disabling and re-enabling reload prevention", () => {
      controller.disable();
      expect(controller.isEnabled()).toBe(false);

      const eventDisabled = new KeyboardEvent("keydown", { key: "F5", cancelable: true });
      window.dispatchEvent(eventDisabled);
      expect(eventDisabled.defaultPrevented).toBe(false);

      controller.enable();
      expect(controller.isEnabled()).toBe(true);

      const eventEnabled = new KeyboardEvent("keydown", { key: "F5", cancelable: true });
      window.dispatchEvent(eventEnabled);
      expect(eventEnabled.defaultPrevented).toBe(true);
    });
  });

  describe("Form Submit & Navigation Interception", () => {
    it("should prevent default browser reload on form submit", () => {
      const form = document.createElement("form");
      form.action = "https://example.com/checkout";
      document.body.appendChild(form);

      const submitEvent = new Event("submit", { bubbles: true, cancelable: true });
      form.dispatchEvent(submitEvent);

      expect(submitEvent.defaultPrevented).toBe(true);
    });

    it("should preserve client-side JavaScript submit listeners while preventing default", () => {
      const form = document.createElement("form");
      let customHandlerRan = false;
      let defaultPreventedInsideHandler = false;

      form.addEventListener("submit", (e) => {
        customHandlerRan = true;
        defaultPreventedInsideHandler = e.defaultPrevented;
      });
      document.body.appendChild(form);

      const btn = document.createElement("button");
      btn.type = "submit";
      form.appendChild(btn);

      btn.click();

      expect(customHandlerRan).toBe(true);
      expect(defaultPreventedInsideHandler).toBe(true);
    });

    it("should correctly identify form submit triggers", () => {
      const submitBtn = document.createElement("button");
      submitBtn.type = "submit";
      expect(isFormSubmitTrigger(submitBtn)).toBe(true);

      const defaultBtn = document.createElement("button");
      expect(isFormSubmitTrigger(defaultBtn)).toBe(true);

      const normalBtn = document.createElement("button");
      normalBtn.type = "button";
      expect(isFormSubmitTrigger(normalBtn)).toBe(false);

      const submitInput = document.createElement("input");
      submitInput.type = "submit";
      expect(isFormSubmitTrigger(submitInput)).toBe(true);

      const imgInput = document.createElement("input");
      imgInput.type = "image";
      expect(isFormSubmitTrigger(imgInput)).toBe(true);

      const textInput = document.createElement("input");
      textInput.type = "text";
      expect(isFormSubmitTrigger(textInput)).toBe(false);
    });
  });
});
