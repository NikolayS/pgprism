export type StyleMap = Record<string, string | undefined>;
export interface DomProps {
    className?: string;
    style?: StyleMap;
    [key: string]: string | number | boolean | StyleMap | undefined;
}
export declare function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: DomProps | null, ...children: Array<Node | string | number | false | null | undefined>): HTMLElementTagNameMap[K];
export declare function clearNode(el: Node): void;
