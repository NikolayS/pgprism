declare const BaseElement: typeof HTMLElement;
export declare class PgPlanElement extends BaseElement {
    static observedAttributes: string[];
    private _plan;
    private _handle;
    private _ready;
    get plan(): string | unknown;
    set plan(value: string | unknown);
    connectedCallback(): void;
    disconnectedCallback(): void;
    attributeChangedCallback(name: string, _oldVal: string | null, newVal: string | null): void;
    private readOptions;
    private sync;
}
export declare function registerElement(tagName?: string): void;
export {};
