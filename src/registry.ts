import { NodeResolutionResult, SPEC_ERROR_CODES } from "./types.js";

export class ElementRegistry {
  private readonly idToElement: Map<number, WeakRef<Element>> = new Map();
  private elementToId: WeakMap<Element, number> = new WeakMap();
  private nextId: number = 1;

  public register(element: Element): number {
    const existingId = this.elementToId.get(element);
    if (existingId !== undefined) {
      if (!this.idToElement.has(existingId)) {
        this.idToElement.set(existingId, new WeakRef(element));
      }
      return existingId;
    }

    const id = this.nextId++;
    this.elementToId.set(element, id);
    this.idToElement.set(id, new WeakRef(element));
    return id;
  }

  public resolve(id: number): NodeResolutionResult {
    const ref = this.idToElement.get(id);
    if (!ref) {
      return {
        success: false,
        code: SPEC_ERROR_CODES.NODE_NOT_FOUND,
        error: "NODE_NOT_FOUND",
        message: `Node [#${id}] was never registered in registry (not found)`,
      };
    }

    const element = ref.deref();
    if (!element) {
      return {
        success: false,
        code: SPEC_ERROR_CODES.NODE_GARBAGE_COLLECTED,
        error: "NODE_GARBAGE_COLLECTED",
        message: `Node [#${id}] was registered but has been garbage collected`,
      };
    }

    if (!element.isConnected) {
      return {
        success: false,
        code: SPEC_ERROR_CODES.NODE_DETACHED,
        error: "NODE_DETACHED",
        message: `Node [#${id}] is detached from DOM`,
        element,
      };
    }

    return {
      success: true,
      element,
    };
  }

  public get(id: number): Element | null {
    const ref = this.idToElement.get(id);
    if (!ref) {
      return null;
    }

    const element = ref.deref();
    if (!element) {
      return null;
    }

    return element;
  }

  public has(id: number): boolean {
    return this.idToElement.has(id);
  }

  public isNodeConnected(id: number): boolean {
    const element = this.get(id);
    return element !== null && element.isConnected;
  }

  public size(): number {
    return this.idToElement.size;
  }

  public sweep(): number {
    let swept = 0;
    for (const [id, ref] of this.idToElement.entries()) {
      const el = ref.deref();
      if (!el || !el.isConnected) {
        this.idToElement.delete(id);
        swept++;
      }
    }
    return swept;
  }

  public reset(): void {
    this.idToElement.clear();
    this.elementToId = new WeakMap();
    this.nextId = 1;
  }
}
