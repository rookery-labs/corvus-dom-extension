import { ElementRegistry } from "./registry.js";
import { DomObservationResult, PrunedNode, ViewportInfo } from "./types.js";

const BLACKLISTED_TAGS = new Set([
  "SCRIPT",
  "script",
  "NOSCRIPT",
  "noscript",
  "STYLE",
  "style",
  "TEMPLATE",
  "template",
  "IFRAME",
  "iframe",
  "EMBED",
  "embed",
  "OBJECT",
  "object",
  "META",
  "meta",
  "LINK",
  "link",
  "HEAD",
  "head",
]);

const INTERACTIVE_TAGS = new Set([
  "BUTTON",
  "button",
  "INPUT",
  "input",
  "SELECT",
  "select",
  "TEXTAREA",
  "textarea",
  "SUMMARY",
  "summary",
  "DETAILS",
  "details",
]);

const INTERACTIVE_ROLES = new Set([
  "button",
  "BUTTON",
  "link",
  "LINK",
  "checkbox",
  "CHECKBOX",
  "radio",
  "RADIO",
  "combobox",
  "COMBOBOX",
  "menuitem",
  "MENUITEM",
  "tab",
  "TAB",
  "switch",
  "SWITCH",
  "textbox",
  "TEXTBOX",
  "searchbox",
  "SEARCHBOX",
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
  "aria-haspopup",
  "title",
  "alt",
];

const WHITELISTED_ATTRS_SET = new Set(WHITELISTED_ATTRS);

// Pre-allocated indentation cache for depths 0..63
const INDENT_CACHE: string[] = Array.from({ length: 64 }, (_, i) => "  ".repeat(i));

const HIDING_CLASS_OR_ID_PATTERN =
  /(?:^|[\s\-_])(hidden|hide|invisible|d-none|display-none|collapsed?|sr-only|visually-hidden|zero-opacity|transparent)(?:[\s\-_]|$)/i;

const CSS_HIDING_RULE_PATTERN =
  /(?:display\s*:\s*none|visibility\s*:\s*(?:hidden|collapse)|opacity\s*:\s*0)/i;

const DOC_HIDING_STYLES_CACHE = new WeakMap<Document, boolean>();

const LOWERCASE_TAG_CACHE: Record<string, string> = {
  DIV: "div",
  SPAN: "span",
  P: "p",
  A: "a",
  BUTTON: "button",
  ARTICLE: "article",
  HEADER: "header",
  FOOTER: "footer",
  SECTION: "section",
  MAIN: "main",
  H1: "h1",
  H2: "h2",
  H3: "h3",
  H4: "h4",
  H5: "h5",
  H6: "h6",
  UL: "ul",
  OL: "ol",
  LI: "li",
  INPUT: "input",
  SELECT: "select",
  TEXTAREA: "textarea",
  OPTION: "option",
  FORM: "form",
  LABEL: "label",
  NAV: "nav",
  SVG: "svg",
  PATH: "path",
  CANVAS: "canvas",
  IMG: "img",
  TABLE: "table",
  TR: "tr",
  TD: "td",
  TH: "th",
  TBODY: "tbody",
};

function mayHaveHidingKeyword(str: string): boolean {
  const s = str.toLowerCase();
  return (
    s.indexOf("hid") !== -1 ||
    s.indexOf("none") !== -1 ||
    s.indexOf("invis") !== -1 ||
    s.indexOf("col") !== -1 ||
    s.indexOf("sr-") !== -1 ||
    s.indexOf("visual") !== -1 ||
    s.indexOf("zero") !== -1 ||
    s.indexOf("trans") !== -1
  );
}

function hasCursorPointer(styleAttr: string | null): boolean {
  if (!styleAttr || styleAttr.indexOf("pointer") === -1) return false;
  return /(?:^|;|\s)cursor\s*:\s*pointer(?:;|\s|$)/i.test(styleAttr);
}

function isInteractiveTabIndex(tabIndex: string | null): boolean {
  if (tabIndex === null) return false;
  if (tabIndex === "0") return true;
  if (tabIndex.charCodeAt(0) === 45) return false;
  const n = parseInt(tabIndex, 10);
  return !isNaN(n) && n >= 0;
}

export class DomPruner {
  private readonly classVisibilityCache = new Map<string, boolean>();
  private currentDocHidingStyles?: boolean;
  private totalNodes: number = 0;
  private interactiveCount: number = 0;

  constructor(private readonly registry: ElementRegistry) {}

  private hasDocumentHidingStyles(doc?: Document | null): boolean {
    if (!doc) return true;
    const cached = DOC_HIDING_STYLES_CACHE.get(doc);
    if (cached !== undefined) return cached;

    // Check all <style> textContent with fast substring filters
    const styleTags = doc.getElementsByTagName("style");
    for (let i = 0; i < styleTags.length; i++) {
      const text = styleTags[i].textContent;
      if (
        text &&
        (text.indexOf("display") !== -1 ||
          text.indexOf("visibility") !== -1 ||
          text.indexOf("opacity") !== -1) &&
        CSS_HIDING_RULE_PATTERN.test(text)
      ) {
        DOC_HIDING_STYLES_CACHE.set(doc, true);
        return true;
      }
    }

    const linkHost = doc.head || doc;
    const linkTags = linkHost.getElementsByTagName("link");
    let hasExternalSheet = false;
    for (let i = 0; i < linkTags.length; i++) {
      if (linkTags[i].getAttribute("rel") === "stylesheet") {
        hasExternalSheet = true;
        break;
      }
    }

    if (hasExternalSheet) {
      try {
        const sheets = doc.styleSheets;
        if (sheets) {
          for (let i = 0; i < sheets.length; i++) {
            const rules = sheets[i].cssRules;
            if (rules) {
              for (let j = 0; j < rules.length; j++) {
                const ruleText = rules[j].cssText;
                if (
                  ruleText &&
                  (ruleText.indexOf("display") !== -1 ||
                    ruleText.indexOf("visibility") !== -1 ||
                    ruleText.indexOf("opacity") !== -1) &&
                  CSS_HIDING_RULE_PATTERN.test(ruleText)
                ) {
                  DOC_HIDING_STYLES_CACHE.set(doc, true);
                  return true;
                }
              }
            }
          }
        }
      } catch {
        // Cross-origin stylesheet access restriction
      }
    }

    DOC_HIDING_STYLES_CACHE.set(doc, false);
    return false;
  }

  public isInteractive(
    element: Element,
    tagName?: string,
    attributes?: Record<string, string>,
    hasOnclickAttr?: boolean,
    tabIndexVal?: string | null,
    hasCursorPtr?: boolean
  ): boolean {
    const tag = tagName || element.tagName;
    if (INTERACTIVE_TAGS.has(tag)) {
      return true;
    }

    if (tag === "A" || tag === "a") {
      if (attributes ? attributes.href !== undefined : element.hasAttribute("href")) {
        return true;
      }
    }

    const role = attributes?.role ?? element.getAttribute("role");
    if (role && (INTERACTIVE_ROLES.has(role) || INTERACTIVE_ROLES.has(role.toLowerCase()))) {
      return true;
    }

    const tabIndex = tabIndexVal !== undefined ? tabIndexVal : element.getAttribute("tabindex");
    if (tabIndex !== null && isInteractiveTabIndex(tabIndex)) {
      return true;
    }

    const hasOnclick = hasOnclickAttr !== undefined ? hasOnclickAttr : element.hasAttribute("onclick");
    if (hasOnclick || typeof (element as any).onclick === "function") {
      return true;
    }

    if (hasCursorPtr !== undefined) {
      if (hasCursorPtr) return true;
    } else {
      const styleAttr = attributes ? attributes.style : element.getAttribute("style");
      if (styleAttr && hasCursorPointer(styleAttr)) {
        return true;
      }
    }

    return false;
  }

  public isVisible(element: Element, win?: Window | null): boolean {
    const hasAttrs = element.hasAttributes();
    const doc = element.ownerDocument;
    const hasDocHidingRules =
      this.currentDocHidingStyles !== undefined
        ? this.currentDocHidingStyles
        : this.hasDocumentHidingStyles(doc);

    // Fast path: element with no attributes and no document hiding rules cannot be hidden
    if (!hasAttrs && !hasDocHidingRules) {
      return true;
    }

    if (hasAttrs) {
      if (element.getAttribute("aria-hidden") === "true") {
        return false;
      }
      if (element.hasAttribute("hidden")) {
        return false;
      }
      if (element.tagName === "INPUT" && (element as HTMLInputElement).type === "hidden") {
        return false;
      }

      const styleAttr = element.getAttribute("style");
      if (styleAttr) {
        if (
          styleAttr.indexOf("none") !== -1 ||
          styleAttr.indexOf("hidden") !== -1 ||
          styleAttr.indexOf("collapse") !== -1 ||
          styleAttr.indexOf("0") !== -1
        ) {
          if (CSS_HIDING_RULE_PATTERN.test(styleAttr)) {
            const inlineStyle = (element as HTMLElement).style;
            if (inlineStyle) {
              const d = inlineStyle.display;
              const v = inlineStyle.visibility;
              const o = inlineStyle.opacity;
              if (d === "none" || v === "hidden" || v === "collapse" || o === "0") {
                return false;
              }
            }
          }
        }
      }
    }

    // If the document contains zero hiding rules in stylesheets, author CSS cannot hide any element
    if (!hasDocHidingRules) {
      return true;
    }

    const className = element.className;
    const id = element.id;
    const hasClass = typeof className === "string" && className.length > 0;
    const hasId = typeof id === "string" && id.length > 0;

    if (!hasClass && !hasId) {
      return true;
    }

    const hasHidingKeyword =
      (hasClass && mayHaveHidingKeyword(className) && HIDING_CLASS_OR_ID_PATTERN.test(className)) ||
      (hasId && mayHaveHidingKeyword(id) && HIDING_CLASS_OR_ID_PATTERN.test(id));

    if (!hasHidingKeyword) {
      return true;
    }

    if (hasClass && this.classVisibilityCache.has(className)) {
      return this.classVisibilityCache.get(className)!;
    }

    const targetWin = win !== undefined ? win : doc?.defaultView;
    if (targetWin && typeof targetWin.getComputedStyle === "function") {
      try {
        const style = targetWin.getComputedStyle(element);
        if (
          style.display === "none" ||
          style.visibility === "hidden" ||
          style.visibility === "collapse" ||
          style.opacity === "0"
        ) {
          if (hasClass) {
            this.classVisibilityCache.set(className, false);
          }
          return false;
        }
        if (hasClass) {
          this.classVisibilityCache.set(className, true);
        }
      } catch {
        // Fallback if computed style fails in headless/mock context
      }
    }

    return true;
  }

  /**
   * Single-pass streaming tree serializer: walks the DOM tree and emits formatted
   * lines directly into the string buffer without creating intermediate PrunedNode AST objects.
   */
  private serializeNode(
    element: Element,
    maxDepth: number,
    depth: number,
    win: Window | null | undefined,
    hasDocHidingRules: boolean,
    lines: string[]
  ): boolean {
    if (depth > maxDepth) return false;

    const rawTag = element.tagName;
    const firstChar = rawTag.charCodeAt(0);
    const tagName = firstChar >= 97 && firstChar <= 122 ? rawTag.toUpperCase() : rawTag;

    // Accessible graphic fallback for SVG and Canvas
    if (tagName === "SVG" || tagName === "CANVAS") {
      if (!element.hasAttributes()) return false;
      let ariaLabel = "";
      let titleAttr = "";
      let roleAttr: string | null = null;
      let tabIndexAttr: string | null = null;
      let hasOnclick = false;
      let hasCursor = false;
      for (const attr of element.attributes) {
        const name = attr.name;
        const val = attr.value;
        if (name === "aria-label") ariaLabel = val;
        else if (name === "title") titleAttr = val;
        else if (name === "aria-hidden" && val === "true") return false;
        else if (name === "hidden") return false;
        else if (name === "role") roleAttr = val;
        else if (name === "tabindex") tabIndexAttr = val;
        else if (name === "onclick") hasOnclick = true;
        else if (name === "style" && val) {
          if (
            (val.indexOf("none") !== -1 ||
              val.indexOf("hidden") !== -1 ||
              val.indexOf("collapse") !== -1 ||
              val.indexOf("0") !== -1) &&
            CSS_HIDING_RULE_PATTERN.test(val)
          ) {
            const inlineStyle = (element as HTMLElement).style;
            if (inlineStyle) {
              const d = inlineStyle.display;
              const v = inlineStyle.visibility;
              const o = inlineStyle.opacity;
              if (d === "none" || v === "hidden" || v === "collapse" || o === "0") {
                return false;
              }
            }
          }
          if (hasCursorPointer(val)) hasCursor = true;
        }
      }
      const label = ariaLabel.trim() || titleAttr.trim();
      if (!label) return false;
      if (hasDocHidingRules && !this.isVisible(element, win)) return false;

      const id = this.registry.register(element);
      const isInteractive =
        (roleAttr !== null && (INTERACTIVE_ROLES.has(roleAttr) || INTERACTIVE_ROLES.has(roleAttr.toLowerCase()))) ||
        (tabIndexAttr !== null && isInteractiveTabIndex(tabIndexAttr)) ||
        hasOnclick ||
        typeof (element as any).onclick === "function" ||
        hasCursor;
      const spacing = INDENT_CACHE[depth] ?? "  ".repeat(depth);
      lines.push(spacing + "[#" + id + '] graphic (role=img) [label="' + label + '"]\n');
      this.totalNodes++;
      if (isInteractive) this.interactiveCount++;
      return true;
    }

    if (BLACKLISTED_TAGS.has(tagName)) return false;

    let role: string | null = null;
    let attrsStr = "";
    let attrCount = 0;
    let hasOnclickAttr = false;
    let tabIndexVal: string | null = null;
    let hrefVal: string | null = null;
    let hasCursorPtr = false;
    let isHidden = false;

    if (element.hasAttributes()) {
      for (const attr of element.attributes) {
        const name = attr.name;
        const val = attr.value;
        if (name === "aria-hidden") {
          if (val === "true") {
            isHidden = true;
            break;
          }
        } else if (name === "hidden") {
          isHidden = true;
          break;
        } else if (name === "style") {
          if (val) {
            if (
              (val.indexOf("none") !== -1 ||
                val.indexOf("hidden") !== -1 ||
                val.indexOf("collapse") !== -1 ||
                val.indexOf("0") !== -1) &&
              CSS_HIDING_RULE_PATTERN.test(val)
            ) {
              const inlineStyle = (element as HTMLElement).style;
              if (inlineStyle) {
                const d = inlineStyle.display;
                const v = inlineStyle.visibility;
                const o = inlineStyle.opacity;
                if (d === "none" || v === "hidden" || v === "collapse" || o === "0") {
                  isHidden = true;
                  break;
                }
              }
            }
            if (hasCursorPointer(val)) {
              hasCursorPtr = true;
            }
          }
        } else if (WHITELISTED_ATTRS_SET.has(name)) {
          if (val !== null) {
            if (name === "type" && val === "hidden" && tagName === "INPUT") {
              isHidden = true;
              break;
            }
            attrCount++;
            if (name === "role") {
              role = val;
            } else {
              attrsStr += " " + name + '="' + val + '"';
            }
            if (name === "href") {
              hrefVal = val;
            }
          }
        } else if (name === "onclick") {
          hasOnclickAttr = true;
        } else if (name === "tabindex") {
          tabIndexVal = val;
        }
      }
    }

    if (isHidden) return false;

    if (hasDocHidingRules) {
      const className = element.className;
      const id = element.id;
      const hasClass = typeof className === "string" && className.length > 0;
      const hasId = typeof id === "string" && id.length > 0;

      if (hasClass || hasId) {
        const hasHidingKeyword =
          (hasClass && mayHaveHidingKeyword(className) && HIDING_CLASS_OR_ID_PATTERN.test(className)) ||
          (hasId && mayHaveHidingKeyword(id) && HIDING_CLASS_OR_ID_PATTERN.test(id));

        if (hasHidingKeyword) {
          if (hasClass && this.classVisibilityCache.has(className)) {
            if (!this.classVisibilityCache.get(className)!) return false;
          } else {
            const targetWin2 = win !== undefined ? win : element.ownerDocument?.defaultView;
            if (targetWin2 && typeof targetWin2.getComputedStyle === "function") {
              try {
                const style = targetWin2.getComputedStyle(element);
                if (
                  style.display === "none" ||
                  style.visibility === "hidden" ||
                  style.visibility === "collapse" ||
                  style.opacity === "0"
                ) {
                  if (hasClass) this.classVisibilityCache.set(className, false);
                  return false;
                }
                if (hasClass) this.classVisibilityCache.set(className, true);
              } catch {
                // Fallback
              }
            }
          }
        }
      }
    }

    const interactive =
      INTERACTIVE_TAGS.has(tagName) ||
      ((tagName === "A" || tagName === "a") && hrefVal !== null) ||
      (role !== null && (INTERACTIVE_ROLES.has(role) || INTERACTIVE_ROLES.has(role.toLowerCase()))) ||
      (tabIndexVal !== null && isInteractiveTabIndex(tabIndexVal)) ||
      hasOnclickAttr ||
      typeof (element as any).onclick === "function" ||
      hasCursorPtr;

    let immediateText = "";
    const childElemCount = element.childElementCount;
    const hasElementChildren = childElemCount > 0;
    const firstChild = element.firstChild;
    let cNodes: NodeListOf<ChildNode> | null = null;
    let allChildrenAreElements = false;

    if (firstChild !== null) {
      if (!hasElementChildren) {
        if (firstChild === element.lastChild) {
          if (firstChild.nodeType === 3) {
            immediateText = firstChild.nodeValue || "";
          }
        } else {
          immediateText = element.textContent || "";
        }
      } else if (childElemCount === 1 && firstChild === element.lastChild) {
        allChildrenAreElements = true;
      } else {
        cNodes = element.childNodes;
        if (cNodes.length === childElemCount) {
          allChildrenAreElements = true;
        } else {
          for (const child of cNodes) {
            if (child.nodeType === 3) {
              immediateText += child.nodeValue || "";
            }
          }
        }
      }
    }

    if (immediateText.length > 0) {
      const first = immediateText.charCodeAt(0);
      const last = immediateText.charCodeAt(immediateText.length - 1);
      if (first <= 32 || last <= 32) {
        immediateText = immediateText.trim();
      }
      if (
        immediateText.indexOf("  ") !== -1 ||
        immediateText.indexOf("\n") !== -1 ||
        immediateText.indexOf("\t") !== -1
      ) {
        immediateText = immediateText.replace(/\s+/g, " ");
      }
    }

    const isBareContainer = !interactive && !immediateText && attrCount === 0;
    if (isBareContainer && !hasElementChildren) {
      return false;
    }

    const lowerTag = LOWERCASE_TAG_CACHE[tagName] || tagName.toLowerCase();
    const id = this.registry.register(element);

    if (!isBareContainer) {
      const spacing = INDENT_CACHE[depth] ?? "  ".repeat(depth);
      let line = spacing + "[#" + id + "] " + lowerTag;
      if (role) line += " (role=" + role + ")";
      if (immediateText) line += ' "' + immediateText + '"';
      if (attrsStr) line += " [" + attrsStr.slice(1) + "]";
      line += "\n";

      lines.push(line);
      this.totalNodes++;
      if (interactive) this.interactiveCount++;

      if (hasElementChildren) {
        if (childElemCount === 1 && allChildrenAreElements) {
          this.serializeNode(firstChild as Element, maxDepth, depth + 1, win, hasDocHidingRules, lines);
        } else {
          const list = cNodes || element.childNodes;
          if (allChildrenAreElements) {
            for (const cur of list) {
              this.serializeNode(cur as Element, maxDepth, depth + 1, win, hasDocHidingRules, lines);
            }
          } else {
            for (const cur of list) {
              if (cur.nodeType === 1) {
                this.serializeNode(cur as Element, maxDepth, depth + 1, win, hasDocHidingRules, lines);
              }
            }
          }
        }
      }
      return true;
    } else {
      const lineIndex = lines.length;
      lines.push(""); // Placeholder slot
      let keptChildren = 0;

      if (childElemCount === 1 && allChildrenAreElements) {
        if (this.serializeNode(firstChild as Element, maxDepth, depth + 1, win, hasDocHidingRules, lines)) {
          keptChildren = 1;
        }
      } else {
        const list = cNodes || element.childNodes;
        if (allChildrenAreElements) {
          for (const cur of list) {
            if (this.serializeNode(cur as Element, maxDepth, depth + 1, win, hasDocHidingRules, lines)) {
              keptChildren++;
            }
          }
        } else {
          for (const cur of list) {
            if (cur.nodeType === 1) {
              if (this.serializeNode(cur as Element, maxDepth, depth + 1, win, hasDocHidingRules, lines)) {
                keptChildren++;
              }
            }
          }
        }
      }

      if (keptChildren === 0) {
        lines.pop();
        return false;
      } else {
        const spacing = INDENT_CACHE[depth] ?? "  ".repeat(depth);
        lines[lineIndex] = spacing + "[#" + id + "] " + lowerTag + "\n";
        this.totalNodes++;
        return true;
      }
    }
  }

  /**
   * Public backward-compatible AST prune method (retained for external unit tests).
   * Fully harmonized with serializeNode() to eliminate attribute array allocations
   * and ensure 100% identical monotonic nodeId allocation sequences.
   */
  public pruneNode(
    element: Element,
    maxDepth: number = 32,
    currentDepth: number = 0,
    win?: Window | null
  ): PrunedNode | null {
    if (currentDepth > maxDepth) return null;

    const rawTag = element.tagName;
    const firstChar = rawTag.charCodeAt(0);
    const tagName = firstChar >= 97 && firstChar <= 122 ? rawTag.toUpperCase() : rawTag;
    const targetWin = win !== undefined ? win : element.ownerDocument?.defaultView;

    // Accessible graphic fallback for SVG and Canvas
    if (tagName === "SVG" || tagName === "CANVAS") {
      const ariaLabel = element.getAttribute("aria-label");
      let label = ariaLabel ? ariaLabel.trim() : "";
      if (!label) {
        const title = element.getAttribute("title");
        label = title ? title.trim() : "";
      }
      if (!label) return null;
      if (!this.isVisible(element, targetWin)) return null;

      const id = this.registry.register(element);
      return {
        id,
        tag: "graphic",
        role: "img",
        attributes: { label },
        isInteractive: this.isInteractive(element, tagName),
        children: [],
      };
    }

    if (BLACKLISTED_TAGS.has(tagName)) return null;
    if (!this.isVisible(element, targetWin)) return null;

    const attributes: Record<string, string> = {};
    let attrCount = 0;
    let hasOnclickAttr = false;
    let tabIndexVal: string | null = null;
    let hasCursorPtr = false;

    if (element.hasAttributes()) {
      for (const attr of element.attributes) {
        const name = attr.name;
        const val = attr.value;
        if (WHITELISTED_ATTRS_SET.has(name)) {
          if (val !== null) {
            attributes[name] = val;
            attrCount++;
          }
        } else if (name === "onclick") {
          hasOnclickAttr = true;
        } else if (name === "tabindex") {
          tabIndexVal = val;
        } else if (name === "style") {
          if (val && hasCursorPointer(val)) {
            hasCursorPtr = true;
          }
        }
      }
    }

    const interactive = this.isInteractive(element, tagName, attributes, hasOnclickAttr, tabIndexVal, hasCursorPtr);

    let immediateText = "";
    const hasElementChildren = element.childElementCount > 0;
    const hasChildren = element.hasChildNodes();
    let childNodes: NodeList | null = null;
    let childLen = 0;

    if (hasChildren) {
      if (!hasElementChildren) {
        immediateText = element.textContent || "";
      } else {
        childNodes = element.childNodes;
        childLen = childNodes.length;
        if (childLen !== element.childElementCount) {
          for (let i = 0; i < childLen; i++) {
            const child = childNodes[i];
            if (child.nodeType === 3) {
              immediateText += child.nodeValue || "";
            }
          }
        }
      }
    }

    if (immediateText.length > 0) {
      const first = immediateText.charCodeAt(0);
      const last = immediateText.charCodeAt(immediateText.length - 1);
      if (first <= 32 || last <= 32) {
        immediateText = immediateText.trim();
      }
      if (
        immediateText.indexOf("  ") !== -1 ||
        immediateText.indexOf("\n") !== -1 ||
        immediateText.indexOf("\t") !== -1
      ) {
        immediateText = immediateText.replace(/\s+/g, " ");
      }
    }

    // Harmonized ID allocation: skip bare leaf containers BEFORE consuming monotonic nodeId
    const isBareContainer = !interactive && !immediateText && attrCount === 0;
    if (isBareContainer && !hasElementChildren) {
      return null;
    }

    const id = this.registry.register(element);

    const children: PrunedNode[] = [];
    if (hasElementChildren) {
      if (!childNodes) {
        childNodes = element.childNodes;
        childLen = childNodes.length;
      }
      for (let i = 0; i < childLen; i++) {
        const child = childNodes[i];
        if (child.nodeType === 1) {
          const childPruned = this.pruneNode(child as Element, maxDepth, currentDepth + 1, targetWin);
          if (childPruned !== null) {
            children.push(childPruned);
          }
        }
      }
    }

    if (isBareContainer && children.length === 0) {
      return null;
    }

    const lowerTag = LOWERCASE_TAG_CACHE[tagName] || tagName.toLowerCase();

    return {
      id,
      tag: lowerTag,
      role: attributes.role || undefined,
      text: immediateText || undefined,
      attributes,
      isInteractive: interactive,
      children,
    };
  }

  /**
   * Public backward-compatible AST formatting method (retained for external unit tests).
   */
  public formatTree(node: PrunedNode, indent: number = 0): string {
    const lines: string[] = [];
    const appendNode = (n: PrunedNode, d: number) => {
      const spacing = INDENT_CACHE[d] ?? "  ".repeat(d);
      const idPrefix = "[#" + n.id + "]";
      let line = spacing + idPrefix + " " + n.tag;
      if (n.role) line += " (role=" + n.role + ")";
      if (n.text) line += ' "' + n.text + '"';

      let attrsStr = "";
      for (const k in n.attributes) {
        if (k !== "role") {
          attrsStr += " " + k + '="' + n.attributes[k] + '"';
        }
      }
      if (attrsStr) {
        line += " [" + attrsStr.slice(1) + "]";
      }
      line += "\n";
      lines.push(line);

      const children = n.children;
      const childLen = children.length;
      for (let i = 0; i < childLen; i++) {
        appendNode(children[i], d + 1);
      }
    };
    appendNode(node, indent);
    return lines.join("");
  }

  /**
   * Observes and prunes the document using the single-pass streaming tree serializer.
   */
  public observe(doc: Document, maxDepth: number = 32): DomObservationResult {
    this.classVisibilityCache.clear();
    const hasDocHidingRules = this.hasDocumentHidingStyles(doc);
    this.currentDocHidingStyles = hasDocHidingRules;

    const win = doc.defaultView;
    const rootEl = doc.body || doc.documentElement;
    const lines: string[] = [];
    this.totalNodes = 0;
    this.interactiveCount = 0;

    try {
      if (rootEl) {
        this.serializeNode(rootEl, maxDepth, 0, win, hasDocHidingRules, lines);
      }
    } finally {
      this.currentDocHidingStyles = undefined;
    }

    if (lines.length > 0) {
      const lastIdx = lines.length - 1;
      const lastLine = lines[lastIdx];
      if (lastLine.charCodeAt(lastLine.length - 1) === 10) {
        lines[lastIdx] = lastLine.slice(0, -1);
      }
    }

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
      tree: lines.join(""),
      nodeCount: this.totalNodes,
      interactiveCount: this.interactiveCount,
    };
  }
}
