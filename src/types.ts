import { ElementType } from '@emmetio/html-matcher';

export interface ParsedModel {
    tokens: Token[];
    content: string;
}

export const enum ElementTypeAddon {
    Space = 100,
    Diff = 101,
    Custom = 200,
}

export type TokenType = ElementType | ElementTypeAddon;

export interface Token {
    type: TokenType;

    /** Token name */
    name: string;

    /** Token location in document */
    location: number;

    /** Token’s raw value */
    value: string;

    /** Plain text contents of current token, if any */
    text?: string;

    /** Optional location offset */
    offset?: number;

    /**
     * Custom field for token ordering/sorting
     * @deprecated
     */
    order?: number;
}
