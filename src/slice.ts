import { ElementType } from '@emmetio/html-matcher';
import { ElementTypeAddon, ParsedModel, Token } from './types';
import { closest, diffToken, getElementStack, last, StackData } from './utils';

export type SliceToken = string | Token | SliceMark;
export type SliceRange = [number, number];
type InnerStackItem = [Token, number];

export interface SliceMark {
    type: 'slice';
    /** Token location in original text */
    location: number;
    /** Either open or closing mark */
    close: boolean;
}

export interface FragmentOptions {
    /** List of allowed tags in extracted fragment, including parents (if enabled) */
    tags?: string[];
    /**
     * Receiving document’s element stack, e.g. XML structure where fragment will
     * be inserted. If specified, finds closest common ancestor of fragment’s stack
     * and output all nested elements of this ancestor.
     */
    receiverStack?: Token[];

    stackData?: StackData;
}

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

    /**
     * Returns string representation of current fragment.
     * @param opTag Tag name for wrap markers
     */
    toString(opTag?: string): string {
        return this.tokens.map(t => {
            if (typeof t === 'string') {
                return t;
            }

            if (isSliceMark(t)) {
                return opTag ? `<${t.close ? '/' : ''}${opTag}>` : '';
            }

            return t.value;
        }).join('');
    }

    /**
     * Returns list of tag tokens
     */
    toTokens(opTag: string, attributes?: string): Token[] {
        const result: Token[] = [];
        const attrs = attributes ? ` ${attributes}` : '';
        for (const t of this.tokens) {
            if (typeof t !== 'string') {
                if (isSliceMark(t)) {
                    if (opTag) {
                        // NB: allow empty name to skip operation tag
                        result.push({
                            type: ElementTypeAddon.Diff,
                            location: t.location,
                            name: opTag,
                            value: t.close ? `</${opTag}>` : `<${opTag}${attrs}>`
                        });
                    }
                } else {
                    result.push(t);
                }
            }
        }

        return result;
    }

    /**
     * Converts current slice result to diff token
     */
    toDiffToken(name: string, text: string, location: number) {
        return diffToken(name, this.toString(name), location, text);
    }
}

/**
 * Returns document fragment for given _text content_ range that can be used as
 * a _replacement_ for the same range of given document.
 * Inserts `SliceOp` operation markers in appropriate positions to maintain valid
 * XML state.
 * @param start Token location hint in parsed document where to start fragment lookup
 */
export function slice(doc: ParsedModel, from: number, to: number, start?: number): SliceResult {
    const stack: InnerStackItem[] = [];
    const tokens: SliceToken[] = [sliceMark(from)];
    const range = getSliceRange(doc, from, to, start);

    const pushText = (value: string) => value && tokens.push(value);

    let offset = from;
    doc.tokens.slice(range[0], range[1]).forEach(token => {
        pushText(doc.content.slice(offset, token.location));
        offset = token.location;
        if (token.offset) {
            offset += token.offset;
        }

        if (token.type === ElementType.Open) {
            stack.push([token, tokens.length]);
            tokens.push(token);
        } else if (token.type === ElementType.Close) {
            if (!stack.pop()) {
                // Closing element outside of stack
                tokens.push(sliceMark(offset, true), token, sliceMark(offset));
            } else {
                tokens.push(token);
            }
        } else {
            tokens.push(token);
        }
    });

    pushText(doc.content.slice(offset, to));

    if (isSliceMarkOpen(last(tokens))) {
        tokens.pop();
    } else {
        tokens.push(sliceMark(to, true));
    }

    while (stack.length) {
        // We have unclosed tags: we should add intermediate open/close markers
        const item = stack.pop()!;
        const pos = item[0].location;
        tokens.splice(item[1], 1, sliceMark(pos, true), item[0], sliceMark(pos));
    }

    return new SliceResult(optimize(tokens), range);
}

export function fragment(doc: ParsedModel, from: number, to: number, options: FragmentOptions = {}) {
    const stackData = options.stackData || getElementStack(doc.tokens, from);
    const stack = [...stackData.stack];
    const start = stackData.start;

    let tagCount = 0;
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

    if (options.receiverStack) {
        const ci = findCommonAncestor(stack, options.receiverStack);
        if (ci !== -1) {
            // Common ancestor found: output all elements below it
            stack.splice(0, ci + 1);
        } else {
            // No common ancestor: at least remove root node
            stack.unshift();
        }
    }

    stack.forEach(push);

    // Walk up to the end of text fragment and check inner structure
    while (i < doc.tokens.length) {
        const token = doc.tokens[i];
        if (token.location > to) {
            break;
        }

        if (token.type === ElementType.Open) {
            tagCount++;
        } else if (token.type === ElementType.Close) {
            if (tagCount === 0 && token.location === to) {
                // We’ve reached the end of nearest enclosing tag for fragment
                break;
            } else if (tagCount > 0) {
                tagCount--;
            }
        }

        end = i++;

        // Insert plain text before given token
        push(doc.content.slice(offset, token.location));
        offset = token.location + (token.offset || 0);

        if (shouldOutput(stack, token, to)) {
            push(token);
        }
    }

    push(doc.content.slice(offset, to));

    // Close the remaining elements
    while (stack.length) {
        const token = stack.pop()!;
        if (isAllowedToken(token, options)) {
            push(`</${token.name}>`);
        }
    }

    return new SliceResult([sliceMark(from), result, sliceMark(to, true)], [start, end]);
}

/**
 * A slice mark factory
 */
export function sliceMark(location: number, close = false): SliceMark {
    return {
        type: 'slice',
        location,
        close
    };
}

export function isSliceMark(value: any): value is SliceMark {
    return value && value.type === 'slice';
}

export function isSliceMarkOpen(value: any): value is SliceMark {
    return isSliceMark(value) && !value.close;
}

export function isSliceMarkClose(value: any): value is SliceMark {
    return isSliceMark(value) && value.close;
}

/**
 * Returns optimized token list without redundant tokens
 */
function optimize(tokens: SliceToken[]): SliceToken[] {
    const result: SliceToken[] = [];

    for (let i = 0; i < tokens.length; i++) {
        if (isSliceMarkOpen(tokens[i]) && isSliceMarkClose(tokens[i + 1])) {
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

function findTokenStart(model: ParsedModel, pos: number): number {
    let i = 0;
    const il = model.tokens.length;
    while (i < il) {
        const token = model.tokens[i];

        if (token.location > pos) {
            break;
        }

        // Edge case: skip closing tags from lookup precisely at given location
        if (token.location === pos && token.type !== ElementType.SelfClose && token.type !== ElementType.Close) {
            break;
        }

        i++;
    }

    return i;
}

/**
 * Returns optimal range of tokens for slicing
 */
function getSliceRange(model: ParsedModel, from: number, to: number, start = findTokenStart(model, from)): SliceRange {
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
        if (token.location === to && (token.type === ElementType.SelfClose || token.type === ElementTypeAddon.Space)) {
            tokens.pop();
        } else {
            break;
        }
    }

    return [start, start + tokens.length];
}

/**
 * Returns index in `curStack` of closest common ancestor for two element stacks.
 * Returns `-1` if there’s no common ancestor
 */
function findCommonAncestor(curStack: Token[], receiverStack: Token[]): number {
    let i = curStack.length - 1;
    while (i >= 0) {
        if (closest(receiverStack, curStack[i].name) !== -1) {
            return i;
        }
        i--;
    }

    return i;
}

/**
 * Check if given token can be outputted. Specifically, checks if closing element
 * token has valid open element token in stack (required if element open element
 * was omitted by common ancestor).
 */
function shouldOutput(stack: Token[], token: Token, endPos: number): boolean {
    if (isIgnoreToken(token)) {
        // NB: hardcode from xml-diff consumer: do not output comment with `#ignore`
        // name: it’s a special case for tokens that should be ignored during reconstruction
        return false;
    }

    if (token.type === ElementType.Close && (!stack.length || last(stack)!.name !== token.name)) {
        return false;
    }

    if (token.type === ElementType.Open && token.location === endPos) {
        // Do not output open elements at the end of fragment range
        return false;
    }

    if (token.type === ElementType.Open) {
        stack.push(token);
    } else if (token.type === ElementType.Close) {
        stack.pop();
    }

    return true;
}

function isIgnoreToken(token: Token): boolean {
    // NB: hardcode from xml-diff consumer: do not output comment with `#ignore`
    // name: it’s a special case for tokens that should be ignored during reconstruction
    return token.type === ElementType.Comment && token.name === '#ignore';
}
