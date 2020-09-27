import { ElementType } from '@emmetio/html-matcher';
import { ElementTypeAddon, ParsedModel, Token } from './types';

export const enum SliceOp {
    Open = 1,
    Close = -1
}

export type SliceToken = string | SliceOp;
export type SliceRange = [number, number];
type InnerStackItem = [Token, number];

export interface FragmentOptions {
    /** List of allowed tags in extracted fragment, including parents (if enabled) */
    tags?: string[];
}

export class SliceResult {
    /**
     * Extracted document content with `SliceOp` indicators for inserting open
     * and close wrapper tag, if required
     */
    tokens: SliceToken[];

    /** Range of original document tokens included inside `token` fragment */
    range?: SliceRange;

    constructor(tokens: SliceToken[], range?: SliceRange) {
        this.tokens = tokens;
        this.range = range;
    }

    /**
     * Returns string representation of current fragment.
     * @param opTag Tag name for wrap markers
     */
    toString(opTag?: string): string {
        return this.tokens.map(t => {
            if (t === SliceOp.Open) {
                return opTag ? `<${opTag}>` : '';
            }

            if (t === SliceOp.Close) {
                return opTag ? `</${opTag}>` : '';
            }

            return t;
        }).join('');
    }
}

/**
 * Returns document fragment for given _text content_ range that can be used as
 * a _replacement_ for the same range of given document.
 * Inserts `SliceOp` operation markers in appropriate positions to maintain valid
 * XML state.
 */
export function slice(doc: ParsedModel, from: number, to: number): SliceResult {
    const stack: InnerStackItem[] = [];
    const tokens: SliceToken[] = [SliceOp.Open];
    const range = getSliceRange(doc, from, to);

    const pushText = (value: string) => value && tokens.push(value);

    let offset = from;
    if (range) {
        doc.tokens.slice(range[0], range[1] + 1).forEach(token => {
            pushText(doc.content.slice(offset, token.location));
            offset = token.location;

            if (token.type === ElementType.Open) {
                stack.push([token, tokens.length]);
                tokens.push(token.value);
            } else if (token.type === ElementType.Close) {
                if (!stack.pop()) {
                    // Closing element outside of stack
                    tokens.push(SliceOp.Close, token.value, SliceOp.Open);
                } else {
                    tokens.push(token.value);
                }
            } else {
                tokens.push(token.value);
            }
        });
    }

    pushText(doc.content.slice(offset, to));

    if (last(tokens) === SliceOp.Open) {
        tokens.pop();
    } else {
        tokens.push(SliceOp.Close);
    }

    while (stack.length) {
        // We have unclosed tags: we should add intermediate open/close markers
        const item = stack.pop()!;
        tokens.splice(item[1], 1, SliceOp.Close, item[0].value, SliceOp.Open);
    }

    return new SliceResult(optimize(tokens), range);
}

export function fragment(doc: ParsedModel, from: number, to: number, options: FragmentOptions = {}) {
    const { stack, start } = getElementStack(doc, from);

    let offset = from;
    let i = start;
    let end = start;
    let result = '';

    const push = (chunk: string | Token) => {
        if (chunk) {
            if (typeof chunk === 'string') {
                result += chunk;
            } else if (isAllowedToken(chunk, options)) {
                result += chunk.value;
            }
        }
    };

    stack.forEach(push);

    // Walk up to the end of text fragment and check inner structure
    while (i < doc.tokens.length) {
        const token = doc.tokens[i];
        if (token.location > to) {
            break;
        }

        end = i++;

        push(doc.content.slice(offset, token.location));
        offset = token.location;

        if (token.type === ElementType.Open) {
            stack.push(token);
        } else if (token.type === ElementType.Close) {
            stack.pop();
        }

        push(token);
    }

    push(doc.content.slice(offset, to));

    // Close the remaining elements
    while (stack.length) {
        const token = stack.pop()!;
        if (isAllowedToken(token, options)) {
            push(`</${token.name}>`);
        }
    }

    return new SliceResult([SliceOp.Open, result, SliceOp.Close], [start, end]);
}

/**
 * Returns optimized token list without redundant tokens
 */
function optimize(tokens: SliceToken[]): SliceToken[] {
    const result: SliceToken[] = [];

    for (let i = 0; i < tokens.length; i++) {
        if (tokens[i] === SliceOp.Open && tokens[i + 1] === SliceOp.Close) {
            i++;
        } else {
            result.push(tokens[i]);
        }
    }

    return result;
}

/**
 * Check if given token is allowed in extracted fragment according to
 * options specified
 */
function isAllowedToken(token: Token, options: FragmentOptions): boolean {
    if (token.type === ElementType.Open || token.type === ElementType.Close || token.type === ElementType.SelfClose) {
        return options.tags ? options.tags.includes(token.name) : true;
    }

    return true;
}

/**
 * Collects element stack for given text location
 */
function getElementStack(model: ParsedModel, pos: number): { stack: Token[], start: number } {
    const stack: Token[] = [];
    let start = 0;

    while (start < model.tokens.length) {
        const token = model.tokens[start];
        if (token.location >= pos) {
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

function findTokenStart(model: ParsedModel, pos: number): number {
    let i = 0;
    const il = model.tokens.length;
    while (i < il) {
        const token = model.tokens[i];
        // Edge case: skip closing tags from lookup precisely at given location
        if (token.location === pos && (token.type === ElementType.SelfClose || token.type === ElementType.Close)) {
            i++;
            continue;
        }

        if (token.location >= pos) {
            break;
        }

        i++;
    }

    return i;
}

/**
 * Returns optimal range of tokens for slicing
 */
function getSliceRange(model: ParsedModel, from: number, to: number): SliceRange | undefined {
    const tokens: Token[] = [];
    const stack: string[] = [];
    let start = findTokenStart(model, from);
    let i = start;

    while (i < model.tokens.length) {
        const token = model.tokens[i++];

        if (token.location > to) {
            break;
        }

        if (token.location === to) {
            // Do not include open tag on the edge of range
            if (token.type === ElementType.Open) {
                break;
            }

            // Do not include not opened closing tag on the edge of range
            if (token.type === ElementType.Close && last(stack) !== token.name) {
                break;
            }
        }

        tokens.push(token);
        if (token.type === ElementType.Open) {
            stack.push(token.name);
        } else if (token.type === ElementType.Close) {
            stack.pop();
        }
    }

    // Remove trailing tokens
    while (tokens.length) {
        const token = tokens[0]!;
        // Remove unclosed tags from the beginning of range
        if (token.location === from && token.type === ElementType.Open && stack[0] === token.name) {
            stack.shift();
            tokens.shift();
            start++;
        } else {
            break;
        }
    }

    while (tokens.length) {
        const token = last(tokens)!;
        if (token.location && (token.type === ElementType.SelfClose || token.type === ElementTypeAddon.Space)) {
            tokens.pop();
        } else {
            break;
        }
    }

    if (tokens.length) {
        return [start, start + tokens.length - 1];
    }
}

function last<T>(arr: T[]): T | undefined {
    return arr.length ? arr[arr.length - 1] : void 0;
}
