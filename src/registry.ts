export class ElementRegistry {
  private readonly idToElement: Map<number, WeakRef<Element>> = new Map();
  private readonly elementToId: WeakMap<Element, number> = new WeakMap();
  private nextId: number = 1;

  public register(element: Element): number {
    const existingId = this.elementToId.get(element);
    if (existingId !== undefined) {
      return existingId;
    }

    const id = this.nextId++;
    this.elementToId.set(element, id);
    this.idToElement.set(id, new WeakRef(element));
    return id;
  }

  public get(id: number): Element | null {
    const ref = this.idToElement.get(id);
    if (!ref) {
      return null;
    }

    const element = ref.deref();
    if (!element) {
      this.idToElement.delete(id);
      return null;
    }

    return element;
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
    this.nextId = 1;
  }
}
