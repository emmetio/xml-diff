import { ElementType } from '@emmetio/html-matcher';
import { ElementTypeAddon, Token, TokenType } from './types';

/**
 * Check if given string is whitespace-only
 */
export function isWhitespace(str: string): boolean {
    return str ? /^[\s\n\r]+$/.test(str) : false;
}

/**
 * Check if given token has specified `type`
 */
export function isType(token: Token | undefined, type: TokenType): boolean {
    return token ? token.type === type : false;
}

/**
 * Check if given token contains tag
 */
export function isTagToken(token: Token): boolean {
    return token.type === ElementType.Open
        || token.type === ElementType.Close
        || token.type === ElementType.SelfClose;
}

/**
 * Collects element stack for given text location
 */
export function getElementStack(tokens: Token[], pos: number): { stack: Token[], start: number } {
    const stack: Token[] = [];
    let start = 0;

    while (start < tokens.length) {
        const token = tokens[start];
        if (token.location > pos) {
            break;
        }

        if (token.location === pos && token.type === ElementTypeAddon.Space && token.offset) {
            break;
        }

        if (token.type === ElementType.Open) {
            stack.push(token);
        } else if (token.type === ElementType.Close) {
            stack.pop();
        }

        start++;
    }

    return { stack, start };
}

/**
 * Returns last item in given array
 */
export function last<T>(arr: T[]): T | undefined {
    return arr.length ? arr[arr.length - 1] : void 0;
}

/**
 * Diff token factory
 */
export function diffToken(name: string, value: string, location: number, text = ''): Token {
    return { type: ElementTypeAddon.Diff, name, value, location, text };
}

export function isDiffToken(token: Token): boolean {
    return token.type === ElementTypeAddon.Diff;
}
