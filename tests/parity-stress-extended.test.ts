import { describe, it, expect } from "vitest";
import { DomPruner } from "../src/pruner.js";
import { ElementRegistry } from "../src/registry.js";

describe("Challenger Parity & ID Consumption Stress Suite", () => {
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
      reg1,
      reg2,
      obsNodeCount: obs.nodeCount,
      obsInteractiveCount: obs.interactiveCount,
      pruned,
    };
  }

  describe("Directive 1: 100% ID and Structural Parity Across Topologies", () => {
    it("should produce 100% identical tree string and ID assignment on complex mixed tree", () => {
      const html = `
        <header role="banner" aria-label="Site Header">
          <nav role="navigation">
            <a href="/home" aria-label="Home">Home</a>
            <a href="/about">About</a>
            <div class="empty-leaf"></div>
          </nav>
        </header>
        <main role="main">
          <section aria-labelledby="sec-head">
            <h1 id="sec-head">Title</h1>
            <div class="card">
              <p>Description text</p>
              <button type="submit" disabled="true">Submit</button>
              <svg aria-label="Save"><path d="M0 0"/></svg>
            </div>
            <div class="empty-wrapper">
              <div class="empty-inner">
                <!-- empty -->
              </div>
            </div>
          </section>
        </main>
      `;

      const { obsTree, legacyTree } = compareParity(html);
      expect(obsTree).toBe(legacyTree);
      expect(obsTree.length).toBeGreaterThan(0);
    });

    it("should maintain 100% parity with hidden elements and blacklisted tags", () => {
      const html = `
        <div id="container">
          <div aria-hidden="true">
            <button>Invisible 1</button>
          </div>
          <div style="display: none">
            <button>Invisible 2</button>
          </div>
          <script>console.log("script");</script>
          <style>.test { color: red; }</style>
          <button id="visible-btn">Visible Button</button>
        </div>
      `;

      const { obsTree, legacyTree } = compareParity(html);
      expect(obsTree).toBe(legacyTree);
      expect(obsTree).toContain("Visible Button");
      expect(obsTree).not.toContain("Invisible");
      expect(obsTree).not.toContain("script");
    });
  });

  describe("Directive 2: Empty Bare Container Monotonic ID Consumption", () => {
    it("verify bare leaf container (0 element children) does NOT consume an ID in either path", () => {
      const html = `
        <div id="wrapper">
          <div class="bare-leaf-1"></div>
          <div class="bare-leaf-2"></div>
          <button id="target-btn">Click</button>
        </div>
      `;

      const { obsTree, legacyTree, reg1, reg2 } = compareParity(html);
      expect(obsTree).toBe(legacyTree);

      // In this topology:
      // document.body -> ID 1
      // div#wrapper -> ID 2 (has element children, not bare leaf)
      // bare-leaf-1 -> 0 element children, bare -> SKIPPED (0 IDs consumed)
      // bare-leaf-2 -> 0 element children, bare -> SKIPPED (0 IDs consumed)
      // target-btn -> ID 3
      expect(obsTree).toContain("[#3] button");
      expect(legacyTree).toContain("[#3] button");

      // Verify registry resolution: only IDs 1, 2, 3 exist
      expect(reg1.resolve(1).success).toBe(true);
      expect(reg1.resolve(2).success).toBe(true);
      expect(reg1.resolve(3).success).toBe(true);
      expect(reg1.resolve(4).success).toBe(false); // ID 4 was never allocated

      expect(reg2.resolve(1).success).toBe(true);
      expect(reg2.resolve(2).success).toBe(true);
      expect(reg2.resolve(3).success).toBe(true);
      expect(reg2.resolve(4).success).toBe(false); // ID 4 was never allocated
    });

    it("verify bare container with only whitespace text does NOT consume an ID in either path", () => {
      const html = `
        <div id="wrapper">
          <div class="whitespace-leaf">   \n\t   </div>
          <button id="target-btn">Click</button>
        </div>
      `;

      const { obsTree, legacyTree, reg1, reg2 } = compareParity(html);
      expect(obsTree).toBe(legacyTree);

      // whitespace is trimmed to empty, childElementCount is 0 -> bare leaf -> skipped
      expect(obsTree).toContain("[#3] button");
      expect(legacyTree).toContain("[#3] button");

      expect(reg1.resolve(4).success).toBe(false);
      expect(reg2.resolve(4).success).toBe(false);
    });

    it("empirical finding: bare container with nested empty bare container DOES consume monotonic ID before collapse, symmetrically", () => {
      const html = `
        <div id="wrapper">
          <div class="nested-bare-outer">
            <div class="nested-bare-inner"></div>
          </div>
          <button id="target-btn">Click</button>
        </div>
      `;

      const { obsTree, legacyTree, reg1, reg2 } = compareParity(html);
      // Symmetrical ID and structural parity is 100% maintained
      expect(obsTree).toBe(legacyTree);

      // In this topology:
      // document.body -> ID 1
      // div#wrapper -> ID 2
      // nested-bare-outer: hasElementChildren is true (childElementCount=1).
      //   -> Eagerly registers ID 3!
      // nested-bare-inner: hasElementChildren is false.
      //   -> Skipped (no ID).
      // nested-bare-outer: keptChildren == 0 -> collapsed/popped from formatted tree!
      // target-btn -> receives ID 4!
      expect(obsTree).toContain("[#4] button");
      expect(legacyTree).toContain("[#4] button");
      expect(obsTree).not.toContain("nested-bare");
      expect(legacyTree).not.toContain("nested-bare");

      // ID 3 was consumed in both registries even though it does not appear in the pruned tree
      expect(reg1.resolve(3).success).toBe(true);
      expect(reg2.resolve(3).success).toBe(true);
    });

    it("empirical finding: bare container containing only blacklisted <script> consumes monotonic ID symmetrically", () => {
      const html = `
        <div id="wrapper">
          <div class="bare-with-script">
            <script>var x = 1;</script>
          </div>
          <button id="target-btn">Click</button>
        </div>
      `;

      const { obsTree, legacyTree, reg1, reg2 } = compareParity(html);
      expect(obsTree).toBe(legacyTree);

      // bare-with-script has childElementCount = 1 (<script> is an Element), so it allocates ID 3,
      // then script is rejected by BLACKLISTED_TAGS, keptChildren = 0, node is dropped from tree.
      // target-btn gets ID 4 in both.
      expect(obsTree).toContain("[#4] button");
      expect(legacyTree).toContain("[#4] button");

      expect(reg1.resolve(3).success).toBe(true);
      expect(reg2.resolve(3).success).toBe(true);
    });
  });
});
