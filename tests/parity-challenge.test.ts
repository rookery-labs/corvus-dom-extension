import { describe, it, expect, beforeEach } from "vitest";
import { DomPruner } from "../src/pruner.js";
import { ElementRegistry } from "../src/registry.js";

describe("Empirical Parity & Structural Stress Testing Harness (Milestone 1 Iteration 3)", () => {
  let registryObserve: ElementRegistry;
  let prunerObserve: DomPruner;
  let registryLegacy: ElementRegistry;
  let prunerLegacy: DomPruner;

  beforeEach(() => {
    registryObserve = new ElementRegistry();
    prunerObserve = new DomPruner(registryObserve);
    registryLegacy = new ElementRegistry();
    prunerLegacy = new DomPruner(registryLegacy);
    document.body.innerHTML = "";
  });

  function compareParity(html: string) {
    document.body.innerHTML = html;

    // Single-pass serializer (observe)
    const reg1 = new ElementRegistry();
    const pruner1 = new DomPruner(reg1);
    const obs = pruner1.observe(document);

    // Legacy pruneNode + formatTree
    const reg2 = new ElementRegistry();
    const pruner2 = new DomPruner(reg2);
    const rootEl = document.body || document.documentElement;
    const pruned = rootEl ? pruner2.pruneNode(rootEl) : null;
    const legacyFormatted = pruned ? pruner2.formatTree(pruned).trimEnd() : "";

    return {
      obsTree: obs.tree,
      legacyTree: legacyFormatted,
      obsNodeCount: obs.nodeCount,
      obsInteractiveCount: obs.interactiveCount,
      pruned,
    };
  }

  const stripIds = (tree: string) => tree.replace(/\[#\d+\] /g, "");

  describe("Directive 1.1: Deeply Nested Interactive Elements", () => {
    it("should produce 100% identical structural and ID parity for deeply nested hierarchy", () => {
      let html = `<div id="root-container" class="level-0">`;
      for (let i = 1; i <= 20; i++) {
        html += `<div class="level-${i}"><div role="region" aria-label="Region ${i}">`;
      }
      html += `<button id="deep-btn" type="submit" aria-haspopup="dialog">Click Me</button>`;
      html += `<a href="/dest" role="link">Deep Link</a>`;
      for (let i = 1; i <= 20; i++) {
        html += `</div></div>`;
      }
      html += `</div>`;

      const { obsTree, legacyTree } = compareParity(html);
      // When all containers are kept (since they have kept children and attributes), IDs and structure are identical
      expect(obsTree).toBe(legacyTree);
      expect(stripIds(obsTree)).toBe(stripIds(legacyTree));
    });
  });

  describe("Directive 1.2: Empty Containers with Zero Kept Children vs Kept Children", () => {
    it("should produce identical structural formatting (tags, text, indent) between observe and formatTree", () => {
      const html = `
        <div id="main">
          <div class="empty-child-1"></div>
          <div class="empty-child-2">
            <span></span>
          </div>
          <div class="kept-child">
            <button id="kept-btn">Visible Kept</button>
          </div>
        </div>
      `;

      const { obsTree, legacyTree } = compareParity(html);
      expect(stripIds(obsTree)).toBe(stripIds(legacyTree));
    });

    it("should produce identical ID assignment when empty leaf containers are present (pruneNode and serializeNode parity)", () => {
      const html = `
        <div id="main">
          <div class="empty-child-1"></div>
          <div class="kept-child">
            <button id="kept-btn">Visible Kept</button>
          </div>
        </div>
      `;
      const { obsTree, legacyTree } = compareParity(html);
      if (process.env.DEBUG) {
        console.log("ObsTree:\n" + obsTree);
        console.log("LegacyTree:\n" + legacyTree);
      }
      expect(obsTree).toBe(legacyTree);
      expect(obsTree).toContain("[#4] button");
      expect(legacyTree).toContain("[#4] button");
    });

    it("should collapse empty container hierarchies symmetrically", () => {
      const html = `
        <div id="empty-parent">
          <div>
            <div>
              <span></span>
            </div>
          </div>
        </div>
      `;

      const { obsTree, legacyTree } = compareParity(html);
      expect(obsTree).toBe("");
      expect(legacyTree).toBe("");
    });
  });

  describe("Directive 1.3: SVG and Canvas Elements With and Without Accessible Labels", () => {
    it("should produce identical formatting for SVGs and Canvases with and without labels", () => {
      const html = `
        <div id="graphics-box">
          <svg aria-label="Shopping Cart"><circle cx="5" cy="5" r="5"/></svg>
          <svg><circle cx="5" cy="5" r="5"/></svg>
          <canvas title="Sales Chart" width="200" height="100"></canvas>
          <canvas width="100" height="50"></canvas>
          <svg aria-label="   "><rect width="10" height="10"/></svg>
          <svg aria-label="Hidden SVG" aria-hidden="true"><circle r="10"/></svg>
          <svg aria-label="Interactive Cart" onclick="checkout()"><path d="M0 0"/></svg>
        </div>
      `;

      const { obsTree, legacyTree } = compareParity(html);
      expect(obsTree).toBe(legacyTree);
      expect(obsTree).toContain('graphic (role=img) [label="Shopping Cart"]');
      expect(obsTree).toContain('graphic (role=img) [label="Sales Chart"]');
      expect(obsTree).toContain('graphic (role=img) [label="Interactive Cart"]');
      expect(obsTree).not.toContain("circle");
      expect(obsTree).not.toContain("rect");
      expect(obsTree).not.toContain("Hidden SVG");
    });
  });

  describe("Directive 1.4: Multi-Select and Single-Select Elements", () => {
    it("should produce identical formatting and attribute streaming for single and multi select controls", () => {
      const html = `
        <form id="select-form">
          <select id="single-sel" name="choice">
            <option value="1">One</option>
            <option value="2" selected>Two</option>
          </select>
          <select id="multi-sel" name="multi-choice" multiple="true">
            <option value="a" selected>Alpha</option>
            <option value="b">Beta</option>
            <option value="c" selected>Gamma</option>
          </select>
        </form>
      `;

      const { obsTree, legacyTree } = compareParity(html);
      expect(obsTree).toBe(legacyTree);
      expect(obsTree).toContain('select [name="choice"]');
      expect(obsTree).toContain('select [name="multi-choice"]');
    });
  });

  describe("Directive 1.5: Detached Nodes and GC Sweep Lifecycle Scenarios", () => {
    it("should track detached nodes and handle GC deref correctly", () => {
      const reg = new ElementRegistry();
      const div = document.createElement("div");
      const btn = document.createElement("button");
      div.appendChild(btn);
      document.body.appendChild(div);

      const divId = reg.register(div);
      const btnId = reg.register(btn);

      expect(reg.resolve(divId).success).toBe(true);
      expect(reg.resolve(btnId).success).toBe(true);

      // Detach button
      div.removeChild(btn);
      const btnResolveDetached = reg.resolve(btnId);
      expect(btnResolveDetached.success).toBe(false);
      if (!btnResolveDetached.success) {
        expect(btnResolveDetached.code).toBe(-32003);
      }

      // Sweep does not remove connected div, but removes detached button
      const swept = reg.sweep();
      expect(swept).toBe(1);

      const btnResolveSwept = reg.resolve(btnId);
      expect(btnResolveSwept.success).toBe(false);
      if (!btnResolveSwept.success) {
        expect(btnResolveSwept.code).toBe(-32001);
      }
    });
  });
});
