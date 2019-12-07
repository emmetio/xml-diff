import { ElementType } from '@emmetio/html-matcher';

export const enum ElementTypeAddon {
    Space = 100,
    Insert = 101,
    Delete = 102,
}

export type TokenType = ElementType | ElementTypeAddon;

export interface Token {
    name: string;
    type: TokenType;

    /** Token location in original text */
    location: number;

    /** Token’s raw value */
    value: string;

    /** Optional location offset */
    offset?: number;
    /** Custom field for token ordering/sorting */
    order?: number;
}
