import { ElementRegistry } from "./registry.js";
import { DomObservationResult, PrunedNode, ViewportInfo } from "./types.js";

const BLACKLISTED_TAGS = new Set([
  "SCRIPT",
  "NOSCRIPT",
  "STYLE",
  "TEMPLATE",
  "IFRAME",
  "EMBED",
  "OBJECT",
  "SVG",
  "CANVAS",
  "META",
  "LINK",
  "HEAD",
]);

const INTERACTIVE_TAGS = new Set([
  "BUTTON",
  "INPUT",
  "SELECT",
  "TEXTAREA",
  "SUMMARY",
  "DETAILS",
]);

const INTERACTIVE_ROLES = new Set([
  "button",
  "link",
  "checkbox",
  "radio",
  "combobox",
  "menuitem",
  "tab",
  "switch",
  "textbox",
  "searchbox",
]);

const WHITELISTED_ATTRS = [
  "type",
  "name",
  "value",
  "placeholder",
  "checked",
  "disabled",
  "readonly",
  "selected",
  "href",
  "role",
  "aria-label",
  "aria-labelledby",
  "aria-describedby",
  "aria-expanded",
  "aria-checked",
  "aria-disabled",
  "title",
  "alt",
];

export class DomPruner {
  constructor(private readonly registry: ElementRegistry) {}

  public isInteractive(element: Element): boolean {
    const tagName = element.tagName.toUpperCase();
    if (INTERACTIVE_TAGS.has(tagName)) {
      return true;
    }

    if (tagName === "A" && element.hasAttribute("href")) {
      return true;
    }

    const role = element.getAttribute("role");
    if (role && INTERACTIVE_ROLES.has(role.toLowerCase())) {
      return true;
    }

    const tabIndex = element.getAttribute("tabindex");
    if (tabIndex !== null && parseInt(tabIndex, 10) >= 0) {
      return true;
    }

    return false;
  }

  public isVisible(element: Element): boolean {
    if (element.getAttribute("aria-hidden") === "true") {
      return false;
    }

    const win = element.ownerDocument?.defaultView;
    if (win && typeof win.getComputedStyle === "function") {
      try {
        const style = win.getComputedStyle(element);
        if (
          style.display === "none" ||
          style.visibility === "hidden" ||
          style.visibility === "collapse" ||
          style.opacity === "0"
        ) {
          return false;
        }
      } catch {
        // Fallback if computed style fails in headless/mock context
      }
    }

    return true;
  }

  public pruneNode(element: Element, maxDepth: number = 32, currentDepth: number = 0): PrunedNode | null {
    const tagName = element.tagName.toUpperCase();

    if (BLACKLISTED_TAGS.has(tagName)) {
      return null;
    }

    if (!this.isVisible(element)) {
      return null;
    }

    if (currentDepth > maxDepth) {
      return null;
    }

    const interactive = this.isInteractive(element);
    const id = this.registry.register(element);

    const attributes: Record<string, string> = {};
    for (const attr of WHITELISTED_ATTRS) {
      if (element.hasAttribute(attr)) {
        attributes[attr] = element.getAttribute(attr)!;
      }
    }

    // Extract immediate text
    let immediateText = "";
    for (let i = 0; i < element.childNodes.length; i++) {
      const child = element.childNodes[i];
      if (child.nodeType === 3) {
        // Text node
        immediateText += child.textContent || "";
      }
    }
    immediateText = immediateText.trim().replace(/\s+/g, " ");

    const children: PrunedNode[] = [];
    for (let i = 0; i < element.children.length; i++) {
      const childPruned = this.pruneNode(element.children[i], maxDepth, currentDepth + 1);
      if (childPruned !== null) {
        children.push(childPruned);
      }
    }

    // Skip empty non-interactive container nodes with no text and no children
    if (!interactive && !immediateText && children.length === 0 && Object.keys(attributes).length === 0) {
      return null;
    }

    return {
      id,
      tag: tagName.toLowerCase(),
      role: attributes.role || undefined,
      text: immediateText || undefined,
      attributes,
      isInteractive: interactive,
      children,
    };
  }

  public formatTree(node: PrunedNode, indent: number = 0): string {
    const spacing = "  ".repeat(indent);
    const idPrefix = `[#${node.id}]`;
    const tag = node.tag;
    const rolePart = node.role ? ` (role=${node.role})` : "";
    const textPart = node.text ? ` "${node.text}"` : "";

    const attrParts: string[] = [];
    for (const [k, v] of Object.entries(node.attributes)) {
      if (k !== "role") {
        attrParts.push(`${k}="${v}"`);
      }
    }
    const attrsStr = attrParts.length > 0 ? ` [${attrParts.join(" ")}]` : "";

    let result = `${spacing}${idPrefix} ${tag}${rolePart}${textPart}${attrsStr}\n`;
    for (const child of node.children) {
      result += this.formatTree(child, indent + 1);
    }
    return result;
  }

  public observe(doc: Document, maxDepth: number = 32): DomObservationResult {
    const rootEl = doc.body || doc.documentElement;
    const rootPruned = rootEl ? this.pruneNode(rootEl, maxDepth) : null;

    let totalNodes = 0;
    let interactiveCount = 0;

    const countNodes = (n: PrunedNode) => {
      totalNodes++;
      if (n.isInteractive) interactiveCount++;
      for (const c of n.children) countNodes(c);
    };

    let treeStr = "";
    if (rootPruned) {
      countNodes(rootPruned);
      treeStr = this.formatTree(rootPruned);
    }

    const win = doc.defaultView;
    const viewport: ViewportInfo = {
      width: win?.innerWidth || 1080,
      height: win?.innerHeight || 1920,
      scrollX: win?.scrollX || 0,
      scrollY: win?.scrollY || 0,
    };

    return {
      url: doc.location?.href || "about:blank",
      title: doc.title || "",
      viewport,
      tree: treeStr.trimEnd(),
      nodeCount: totalNodes,
      interactiveCount,
    };
  }
}
