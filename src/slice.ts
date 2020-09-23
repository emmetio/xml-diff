import { ElementType } from '@emmetio/html-matcher';
import { ElementTypeAddon, ParsedModel, Token } from './types';

export const enum SliceOp {
    Open = 1,
    Close = -1
}

export type SliceToken = string | SliceOp;
export type SliceRange = [number, number];
type InnerStackItem = [Token, number];
// type ListItem = string | SliceOp | Token;

export interface SliceOptions {
    /** Preserves full parent structure up until fragment start */
    preserveParents?: boolean;
    /** List of allowed tags in extracted fragment, including parents (if enabled) */
    tags?: string[];
}

/**
 * Generic function for returning document fragment to be wrapped with some
 * tag, while maintaining proper tag structure.
 */
// export function slicetest(doc: ParsedModel, from: number, to: number, options: SliceOptions = {}): SliceResult {
//     let { stack, i } = getElementStack(doc, from);
//     let offset = from;
//     let stackOffset = 0;
//     const tokens: SliceToken[] = [];
//     const range: SliceRange = [i, i];
//     const innerStack: InnerStackItem[] = [];

//     const list: ListItem[] = [SliceOp.Open];

//     const push = (chunk: string | Token) => {
//         if (chunk) {
//             list.push(chunk);
//         }
//     };

//     if (options.preserveParents) {
//         for (const token of stack) {
//             if (isAllowedToken(token, options)) {
//                 push(token);
//             }
//         }
//     }

//     // Walk up to the end of text fragment and check inner structure
//     while (i < doc.tokens.length) {
//         const token = doc.tokens[i++];
//         if (token.location > to) {
//             break;
//         }

//         range[1] = i;

//         push(doc.content.slice(offset, token.location));
//         offset = token.location;

//         if (token.type === ElementType.Open) {
//             innerStack.push([token, tokens.length]);
//         } else if (token.type === ElementType.Close) {
//             if (!innerStack.pop() && options.preserveParents && isAllowedToken(token, options)) {
//                 // Tag is opened outside of current stack, we should pull it out
//                 // from
//             }
//         }

//         push(token);
//     }

//     push(doc.content.slice(offset, to));

//     // Close the remaining elements
//     if (options.preserveParents) {
//         // TODO properly implement
//         // Check which elements should be kept in parent structure
//         stack.forEach(push);
//         while (stack.length) {
//             push(stack.pop()!);
//         }
//     }

//     return new SliceResult(tokens, range);
// }

export class SliceResult {
    /**
     * Extracted document content with `SliceOp` indicators for inserting open
     * and close wrapper tag, if required
     */
    tokens: SliceToken[];

    /** Range of original document tokens included inside `token` fragment */
    range: SliceRange;

    constructor(tokens: SliceToken[], range: SliceRange) {
        this.tokens = tokens;
        this.range = range;
    }

    toString(opName = ''): string {
        return this.tokens.map(t => {
            if (t === SliceOp.Open) {
                return `<${opName}>`;
            }

            if (t === SliceOp.Close) {
                return `</${opName}>`;
            }

            return t;
        }).join('');
    }
}

export function slice(doc: ParsedModel, from: number, to: number): SliceResult {
    const stack: InnerStackItem[] = [];
    const tokens: SliceToken[] = [SliceOp.Open];
    const range = getSliceRange(doc, from, to);

    const pushText = (value: string) => value && tokens.push(value);

    let offset = from;
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

    return new SliceResult(tokens, range);
}

/**
 * Returns optimized token list without redundant tokens
 */
// function optimize(tokens: SliceToken[]): SliceToken[] {
//     const result: SliceToken[] = [];

//     for (let i = 0; i < tokens.length; i++) {
//         if (tokens[i] === SliceOp.Open && tokens[i + 1] === SliceOp.Close) {
//             i++;
//         } else {
//             result.push(tokens[i]);
//         }
//     }

//     return result;
// }

/**
 * Check if given token is allowed in extracted fragment according to
 * options specified
 */
// function isAllowedToken(token: Token, options: SliceOptions): boolean {
//     if (token.type === ElementType.Open || token.type === ElementType.Close || token.type === ElementType.SelfClose) {
//         return options.tags ? options.tags.includes(token.name) : true;
//     }

//     return true;
// }

/**
 * Collects element stack for given text location
 */
// function getElementStack(model: ParsedModel, pos: number): { stack: Token[], i: number } {
//     const stack: Token[] = [];
//     let i = 0;

//     while (i < model.tokens.length) {
//         const token = model.tokens[i];
//         if (token.location > pos) {
//             break;
//         }

//         if (token.type === ElementType.Open) {
//             stack.push(token);
//         } else if (token.type === ElementType.Close) {
//             stack.pop();
//         }

//         i++;
//     }

//     return { stack, i };
// }

function findTokenStart(model: ParsedModel, pos: number): number {
    let i = 0;
    const il = model.tokens.length;
    while (i < il) {
        const token = model.tokens[i];
        // Edge case: skip self-closing tags from lookup precisely at given location
        if (token.type === ElementType.SelfClose && token.location === pos) {
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
function getSliceRange(model: ParsedModel, from: number, to: number): SliceRange {
    const start = findTokenStart(model, from);
    const tokens: Token[] = [];
    const stack: string[] = [];

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
        const token = last(tokens)!;
        if (token.location && (token.type === ElementType.SelfClose || token.type === ElementTypeAddon.Space)) {
            tokens.pop();
        } else {
            break;
        }
    }

    return tokens.length
        ? [start, start + tokens.length - 1]
        : [start, start];
}

function last<T>(arr: T[]): T | undefined {
    return arr.length ? arr[arr.length - 1] : void 0;
}
