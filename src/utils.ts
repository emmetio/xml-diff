import { ElementType } from '@emmetio/html-matcher';
import { ParsedModel, Token, TokenType } from './types';

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
export function getElementStack(model: ParsedModel, pos: number): { stack: Token[], start: number } {
    const stack: Token[] = [];
    let start = 0;

    while (start < model.tokens.length) {
        const token = model.tokens[start];
        if (token.location > pos) {
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
