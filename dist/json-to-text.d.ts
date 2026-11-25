import type { JsonToTextOptions, ParsedExplain } from './types';
export declare function parsedToText(parsed: ParsedExplain, options?: JsonToTextOptions): string;
export declare function jsonToText(planJson: string | unknown, options?: JsonToTextOptions): string;
