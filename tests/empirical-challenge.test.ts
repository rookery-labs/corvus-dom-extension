import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { DomPruner } from "../src/pruner.js";
import { ElementRegistry } from "../src/registry.js";
import {
  installReloadPrevention,
  isReloadKeyboardShortcut,
  isFormSubmitTrigger,
} from "../src/reload-prevention.js";
import { JsonRpcDispatcher } from "../src/rpc.js";

describe("Empirical Challenge: Milestone 1 Stress Verification", () => {
  let registry: ElementRegistry;
  let pruner: DomPruner;

  beforeEach(() => {
    registry = new ElementRegistry();
    pruner = new DomPruner(registry);
    document.body.innerHTML = "";
  });

  // =========================================================================
  // Challenge Directive 1.1: Reload Prevention Stress Testing
  // =========================================================================
  describe("1. Reload Prevention Stress Testing", () => {
    let controller: ReturnType<typeof installReloadPrevention>;
    let preventedEvents: Array<{ type: string; detail: string }>;

    beforeEach(() => {
      preventedEvents = [];
      controller = installReloadPrevention(window, document, {
        onPrevented: (type, detail) => {
          preventedEvents.push({ type, detail });
        },
      });
    });

    afterEach(() => {
      controller.cleanup();
    });

    it("should intercept rapid burst of 100 F5 keydowns without dropping any", () => {
      for (let i = 0; i < 100; i++) {
        const f5Event = new KeyboardEvent("keydown", {
          key: "F5",
          code: "F5",
          bubbles: true,
          cancelable: true,
        });
        const stopSpy = vi.spyOn(f5Event, "stopPropagation");
        window.dispatchEvent(f5Event);

        expect(f5Event.defaultPrevented).toBe(true);
        expect(stopSpy).toHaveBeenCalled();
      }
      expect(preventedEvents.length).toBe(100);
      expect(preventedEvents.every((e) => e.type === "keyboard" && e.detail.includes("F5"))).toBe(true);
    });

    it("should intercept interleaved reload shortcuts across platforms and modifiers", () => {
      const reloadKeyCombinations = [
        { key: "F5", code: "F5", ctrlKey: false, metaKey: false, shiftKey: false },
        { key: "F5", code: "F5", ctrlKey: true, metaKey: false, shiftKey: false },
        { key: "r", code: "KeyR", ctrlKey: true, metaKey: false, shiftKey: false },
        { key: "R", code: "KeyR", ctrlKey: true, metaKey: false, shiftKey: true },
        { key: "r", code: "KeyR", ctrlKey: false, metaKey: true, shiftKey: false },
        { key: "R", code: "KeyR", ctrlKey: false, metaKey: true, shiftKey: true },
        { key: "BrowserRefresh", code: "", ctrlKey: false, metaKey: false, shiftKey: false },
        // User holding down key (repeat = true)
        { key: "F5", code: "F5", ctrlKey: false, metaKey: false, shiftKey: false, repeat: true },
        { key: "r", code: "KeyR", ctrlKey: true, metaKey: false, shiftKey: false, repeat: true },
      ];

      for (const combo of reloadKeyCombinations) {
        const event = new KeyboardEvent("keydown", {
          ...combo,
          bubbles: true,
          cancelable: true,
        });
        window.dispatchEvent(event);
        expect(event.defaultPrevented, `Failed to prevent: ${JSON.stringify(combo)}`).toBe(true);
      }
    });

    it("should STRICTLY NOT intercept normal user typing in inputs and textareas", () => {
      const form = document.createElement("form");
      const input = document.createElement("input");
      input.type = "text";
      const textarea = document.createElement("textarea");
      form.appendChild(input);
      form.appendChild(textarea);
      document.body.appendChild(form);

      // Normal keystrokes, letters, numbers, punctuation, navigation, edit keys
      const normalKeystrokes = [
        { key: "a", code: "KeyA" },
        { key: "r", code: "KeyR" }, // 'r' without Ctrl or Cmd
        { key: "R", code: "KeyR", shiftKey: true }, // Capital 'R' with shift
        { key: "5", code: "Digit5" },
        { key: "Enter", code: "Enter" },
        { key: "Backspace", code: "Backspace" },
        { key: "Tab", code: "Tab" },
        { key: "ArrowLeft", code: "ArrowLeft" },
        { key: "ArrowRight", code: "ArrowRight" },
        { key: " ", code: "Space" },
        // Standard clipboard / edit shortcuts (Ctrl+C, Ctrl+V, Ctrl+A, Ctrl+Z, Ctrl+X)
        { key: "c", code: "KeyC", ctrlKey: true },
        { key: "v", code: "KeyV", ctrlKey: true },
        { key: "a", code: "KeyA", ctrlKey: true },
        { key: "z", code: "KeyZ", ctrlKey: true },
        { key: "x", code: "KeyX", ctrlKey: true },
        // Shift edit combinations (Ctrl+Shift+Z)
        { key: "Z", code: "KeyZ", ctrlKey: true, shiftKey: true },
      ];

      for (const stroke of normalKeystrokes) {
        const inputEvent = new KeyboardEvent("keydown", {
          ...stroke,
          bubbles: true,
          cancelable: true,
        });
        input.dispatchEvent(inputEvent);
        expect(inputEvent.defaultPrevented, `Normal typing blocked for input: ${stroke.key}`).toBe(false);

        const textareaEvent = new KeyboardEvent("keydown", {
          ...stroke,
          bubbles: true,
          cancelable: true,
        });
        textarea.dispatchEvent(textareaEvent);
        expect(textareaEvent.defaultPrevented, `Normal typing blocked for textarea: ${stroke.key}`).toBe(false);
      }

      // Ensure no reload prevention triggers were logged for normal typing
      expect(preventedEvents.length).toBe(0);
    });

    it("should intercept multiple types of form submissions to prevent HTTP page reloads", () => {
      const form = document.createElement("form");
      form.action = "https://example.com/api/submit";
      form.method = "POST";

      const submitButton = document.createElement("button");
      submitButton.type = "submit";

      const defaultButton = document.createElement("button"); // button with default type

      const submitInput = document.createElement("input");
      submitInput.type = "submit";

      const imageInput = document.createElement("input");
      imageInput.type = "image";

      form.appendChild(submitButton);
      form.appendChild(defaultButton);
      form.appendChild(submitInput);
      form.appendChild(imageInput);
      document.body.appendChild(form);

      // Verify trigger detection helper
      expect(isFormSubmitTrigger(submitButton)).toBe(true);
      expect(isFormSubmitTrigger(defaultButton)).toBe(true);
      expect(isFormSubmitTrigger(submitInput)).toBe(true);
      expect(isFormSubmitTrigger(imageInput)).toBe(true);

      // Dispatch submit events
      const submitEvent = new Event("submit", { bubbles: true, cancelable: true });
      form.dispatchEvent(submitEvent);
      expect(submitEvent.defaultPrevented).toBe(true);
      expect(preventedEvents.some((e) => e.type === "submit")).toBe(true);
    });

    it("should allow SPA submit listeners to fire while preventing default page reload", () => {
      const form = document.createElement("form");
      let spaListenerFired = false;
      let preventedInsideSpa = false;

      form.addEventListener("submit", (e) => {
        spaListenerFired = true;
        preventedInsideSpa = e.defaultPrevented;
      });
      document.body.appendChild(form);

      const evt = new Event("submit", { bubbles: true, cancelable: true });
      form.dispatchEvent(evt);

      expect(spaListenerFired).toBe(true);
      expect(preventedInsideSpa).toBe(true);
    });
  });

  // =========================================================================
  // Challenge Directive 1.2: DOM Pruning Latency Benchmark Stress Testing
  // =========================================================================
  describe("2. DOM Pruning Latency Benchmark Stress (< 15ms Latency Budget)", () => {
    function buildHeavyDomTree(itemCount: number = 260): number {
      const main = document.createElement("main");
      main.id = "stress-root";

      for (let i = 0; i < itemCount; i++) {
        const section = document.createElement("section");
        section.className = `feed-item-${i} col-12 my-2`;

        const h3 = document.createElement("h3");
        h3.textContent = `Stress Item Heading ${i} with extra text payload`;
        section.appendChild(h3);

        const p = document.createElement("p");
        p.textContent = `Paragraph description content for node #${i} verifying single-pass text aggregation.`;
        section.appendChild(p);

        const btn = document.createElement("button");
        btn.setAttribute("type", "button");
        btn.setAttribute("aria-haspopup", i % 2 === 0 ? "dialog" : "menu");
        btn.setAttribute("onclick", `handleClick(${i})`);
        btn.textContent = `Action ${i}`;
        section.appendChild(btn);

        const a = document.createElement("a");
        a.href = `https://corvus.internal/items/${i}`;
        a.textContent = `Link ${i}`;
        section.appendChild(a);

        // Labeled SVG (retained as graphic)
        const svg = document.createElement("svg");
        svg.setAttribute("aria-label", `Icon for item ${i}`);
        const path = document.createElement("path");
        path.setAttribute("d", "M1 1 L10 10");
        svg.appendChild(path);
        section.appendChild(svg);

        // Unlabeled SVG (must be stripped)
        const deadSvg = document.createElement("svg");
        const circle = document.createElement("circle");
        deadSvg.appendChild(circle);
        section.appendChild(deadSvg);

        // Hidden element
        const hiddenDiv = document.createElement("div");
        hiddenDiv.setAttribute("aria-hidden", "true");
        hiddenDiv.textContent = `Hidden text ${i}`;
        section.appendChild(hiddenDiv);

        // Blacklisted script & style
        const script = document.createElement("script");
        script.textContent = process.env.DEBUG
          ? `console.log(${i});`
          : `window.__stress_telemetry_${i} = true;`;
        section.appendChild(script);

        const style = document.createElement("style");
        style.textContent = `.cls-${i} { color: red; }`;
        section.appendChild(style);

        main.appendChild(section);
      }

      document.body.appendChild(main);
      return document.querySelectorAll("*").length;
    }

    it("should measure observe() latency over 2,500+ nodes and profile performance", async () => {
      const nodeCount = buildHeavyDomTree(260); // 260 * 10 + 2 = 2,602 elements
      expect(nodeCount).toBeGreaterThanOrEqual(2500);

      // Perform 3 warmups with persistent registry
      const testRegistry = new ElementRegistry();
      const testPruner = new DomPruner(testRegistry);
      for (let w = 0; w < 3; w++) {
        testPruner.observe(document);
      }

      // Run 10 consecutive timed iterations to measure distribution
      const iterations = 10;
      const latencies: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        const obs = testPruner.observe(document);
        const elapsed = performance.now() - start;

        latencies.push(elapsed);
        expect(obs.nodeCount).toBeGreaterThan(0);
      }

      const sorted = [...latencies].sort((a, b) => a - b);
      const min = sorted[0];
      const max = sorted[sorted.length - 1];
      const median = sorted[Math.floor(sorted.length / 2)];
      const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;

      console.log(
        `[STRESS HARNESS] 2,600+ node DOM Pruning Profile (${iterations} runs):\n` +
          `  Min: ${min.toFixed(2)}ms | Max: ${max.toFixed(2)}ms | Median: ${median.toFixed(2)}ms | Avg: ${avg.toFixed(2)}ms\n` +
          `  All runs: ${latencies.map((l) => l.toFixed(2)).join(", ")} ms`
      );

      // Verify that median latency adheres to the < 15ms budget
      expect(median).toBeLessThan(15.0);
    });
  });

  // =========================================================================
  // Challenge Directive 1.3: SVG Accessible Fallback & Edge Cases
  // =========================================================================
  describe("3. SVG and Graphic Accessible Fallback Verification", () => {
    it("should retain SVGs with aria-label as <graphic role='img' label='...'> and strip children", () => {
      document.body.innerHTML = `
        <svg aria-label="Shopping Cart">
          <circle cx="10" cy="10" r="5" />
          <path d="M0 0 L10 10" />
        </svg>
      `;

      const obs = pruner.observe(document);
      expect(obs.tree).toContain('graphic (role=img) [label="Shopping Cart"]');
      // Must NOT contain internal SVG markup
      expect(obs.tree).not.toContain("circle");
      expect(obs.tree).not.toContain("path");
    });

    it("should retain SVGs with title as <graphic role='img' label='...'>", () => {
      document.body.innerHTML = `
        <svg title="Settings Gear">
          <polygon points="0,0 10,10 0,10" />
        </svg>
      `;

      const obs = pruner.observe(document);
      expect(obs.tree).toContain('graphic (role=img) [label="Settings Gear"]');
      expect(obs.tree).not.toContain("polygon");
    });

    it("should DISCARD unlabeled SVGs completely", () => {
      document.body.innerHTML = `
        <div>
          <p>Visible Content</p>
          <svg>
            <circle cx="5" cy="5" r="5" />
          </svg>
          <svg class="decorative-icon" width="24" height="24">
            <path d="M0 0" />
          </svg>
        </div>
      `;

      const obs = pruner.observe(document);
      expect(obs.tree).toContain("Visible Content");
      expect(obs.tree).not.toContain("graphic");
      expect(obs.tree).not.toContain("circle");
      expect(obs.tree).not.toContain("path");
      expect(obs.tree).not.toContain("svg");
    });

    it("should DISCARD SVGs with whitespace-only aria-label or title", () => {
      document.body.innerHTML = `
        <div>
          <svg aria-label="   ">
            <circle cx="1" cy="1" r="1" />
          </svg>
          <svg title="  \t  ">
            <rect width="10" height="10" />
          </svg>
        </div>
      `;

      const obs = pruner.observe(document);
      expect(obs.tree).not.toContain("graphic");
      expect(obs.tree).not.toContain("circle");
      expect(obs.tree).not.toContain("rect");
    });

    it("should DISCARD SVGs that are hidden via aria-hidden or styles despite having labels", () => {
      document.body.innerHTML = `
        <div>
          <svg aria-label="Hidden SVG 1" aria-hidden="true">
            <path d="M0 0" />
          </svg>
          <svg aria-label="Hidden SVG 2" style="display: none;">
            <path d="M0 0" />
          </svg>
          <svg aria-label="Hidden SVG 3" style="visibility: hidden;">
            <path d="M0 0" />
          </svg>
          <svg aria-label="Hidden SVG 4" style="opacity: 0;">
            <path d="M0 0" />
          </svg>
        </div>
      `;

      const obs = pruner.observe(document);
      expect(obs.tree).not.toContain("Hidden SVG 1");
      expect(obs.tree).not.toContain("Hidden SVG 2");
      expect(obs.tree).not.toContain("Hidden SVG 3");
      expect(obs.tree).not.toContain("Hidden SVG 4");
      expect(obs.tree).not.toContain("graphic");
    });

    it("should mark interactive SVGs appropriately", () => {
      document.body.innerHTML = `
        <svg aria-label="Interactive Logo" onclick="navigateHome()">
          <path d="M0 0" />
        </svg>
      `;

      const obs = pruner.observe(document);
      expect(obs.tree).toContain('graphic (role=img) [label="Interactive Logo"]');
      expect(obs.interactiveCount).toBe(1);
    });

    it("should handle canvas elements symmetrically with accessible labels", () => {
      document.body.innerHTML = `
        <canvas aria-label="Monthly Sales Line Chart" width="400" height="200"></canvas>
        <canvas width="100" height="100"></canvas>
      `;

      const obs = pruner.observe(document);
      expect(obs.tree).toContain('graphic (role=img) [label="Monthly Sales Line Chart"]');
      expect(obs.tree).not.toContain("canvas");
    });
  });
});
