import { describe, it, expect, beforeEach } from "vitest";
import { DomPruner } from "../src/pruner.js";
import { ElementRegistry } from "../src/registry.js";

describe("DomPruner (SDD Specification SPEC-DOM-001)", () => {
  let registry: ElementRegistry;
  let pruner: DomPruner;

  beforeEach(() => {
    registry = new ElementRegistry();
    pruner = new DomPruner(registry);
    document.body.innerHTML = "";
  });

  it("should discard blacklisted tags: script, style, svg, iframe", () => {
    document.body.innerHTML = `
      <div>
        <h1>Visible Header</h1>
        <script>console.log("secret tracker");</script>
        <style>.hidden { display: none; }</style>
        <svg><circle cx="50" cy="50" r="40" /></svg>
        <iframe src="about:blank"></iframe>
        <button id="btn1">Submit</button>
      </div>
    `;

    const observation = pruner.observe(document);
    expect(observation.tree).toContain("Visible Header");
    expect(observation.tree).toContain("button");
    expect(observation.tree).toContain("Submit");

    expect(observation.tree).not.toContain("secret tracker");
    expect(observation.tree).not.toContain("script");
    expect(observation.tree).not.toContain("style");
    expect(observation.tree).not.toContain("circle");
    expect(observation.tree).not.toContain("iframe");
  });

  it("should prune invisible elements with aria-hidden='true'", () => {
    document.body.innerHTML = `
      <div>
        <div aria-hidden="true">
          <span>This must be pruned</span>
          <button>Hidden action</button>
        </div>
        <p>Visible paragraph</p>
      </div>
    `;

    const observation = pruner.observe(document);
    expect(observation.tree).toContain("Visible paragraph");
    expect(observation.tree).not.toContain("This must be pruned");
    expect(observation.tree).not.toContain("Hidden action");
  });

  it("should correctly identify interactive elements and preserve whitelisted attributes", () => {
    document.body.innerHTML = `
      <form action="/login">
        <label for="usr">Username</label>
        <input id="usr" type="text" name="username" placeholder="Enter username" value="testuser" />
        <a href="https://corvus.dev" role="link">Documentation</a>
        <a>Unlinked anchor without href</a>
        <button type="submit" disabled="true">Log in</button>
      </form>
    `;

    const observation = pruner.observe(document);
    expect(observation.interactiveCount).toBeGreaterThanOrEqual(3);
    expect(observation.tree).toContain('placeholder="Enter username"');
    expect(observation.tree).toContain('href="https://corvus.dev"');
    expect(observation.tree).toContain('disabled="true"');
    expect(observation.tree).toContain("button");
  });

  it("should achieve high compression on complex nested mock DOM", () => {
    let complexHtml = '<div class="wrapper container d-flex flex-column">';
    for (let i = 0; i < 50; i++) {
      complexHtml += `
        <div class="card item-${i} p-3 m-2 shadow-sm border rounded" data-tracking="analytics-${i}" style="margin: 10px; padding: 20px;">
          <div class="card-header bg-primary text-white" data-testid="hdr-${i}">Title ${i}</div>
          <div class="card-body" data-bs-toggle="collapse">
            <p class="text-muted" style="color: gray; font-size: 14px;">Description for item ${i} with long verbose style classes</p>
            <script>var x = ${i}; console.log("tracking inline script payload ${i}");</script>
            <svg viewBox="0 0 100 100"><path d="M10 10 H 90 V 90 H 10 L 10 10"/><text>Icon</text></svg>
            <button class="btn btn-primary btn-lg custom-theme-btn" data-action="click-${i}" onclick="alert(${i})">Action ${i}</button>
          </div>
        </div>
      `;
    }
    complexHtml += "</div>";
    document.body.innerHTML = complexHtml;

    const rawLength = complexHtml.length;
    const observation = pruner.observe(document);
    const prunedLength = observation.tree.length;

    const reductionRatio = (rawLength - prunedLength) / rawLength;
    expect(reductionRatio).toBeGreaterThan(0.70);
    expect(observation.interactiveCount).toBe(50);
  });
});
