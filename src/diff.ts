import { diff_match_patch, DIFF_DELETE, DIFF_INSERT, DIFF_EQUAL } from 'diff-match-patch';
import { ElementType } from '@emmetio/html-matcher';
import { ParsedModel, Token, ElementTypeAddon, TokenType, DiffResult } from './types';
import createOptions, { Options } from './options';
import wordBounds from './word-bounds';

/**
 * Calculates diff between given parsed document and produces new model with diff
 * tokens in it. This model can be restored into a final XML document
 */
export default function diff(from: ParsedModel, to: ParsedModel, options: Options = createOptions()): DiffResult {
    const dmp = new diff_match_patch();
    if (options.dmp) {
        Object.assign(dmp, options.dmp);
    }
    let diffs = dmp.diff_main(from.content, to.content);
    dmp.diff_cleanupSemantic(diffs);
    if (options.wordPatches) {
        diffs = wordBounds(diffs);
    }

    const toSrcTokens = to.tokens.slice();
    const fromSrcTokens = from.tokens.slice();
    let tokens: Token[] = [];
    let fromTokens: Token[] = [];
    let offset = 0;
    let fromOffset = 0;

    const getFromStack = () => getElementStack(from, fromOffset).stack;
    const getToStack = () => getElementStack(to, offset).stack;

    const delToken = (name: string, location: number) => ({
        name,
        type: ElementTypeAddon.Delete,
        location,
        value: `<del>${reconstructDel(from, fromOffset, name, options.preserveTags)}</del>`
    } as Token);

    diffs.forEach(d => {
        let value = d[1];
        if (d[0] === DIFF_DELETE && value) {
            // Removed fragment: just add deleted content to result
            let location = offset;
            if (suppressWhitespace(value, offset, tokens)) {
                location += 1;
                fromOffset += 1;
                value = value.slice(1);
            }

            // Removed fragment means it exists in `from` document and absent in
            // `to` document. So for `from` document we should treat removed fragment
            // as inserted
            // XXX продолжить тут
            fromTokens.push(delToken(value, location));

            tokens.push(delToken(value, location));
            fromOffset += value.length;
        } else if (d[0] === DIFF_INSERT) {
            // Inserted fragment: should insert open and close tags at proper
            // positions and maintain valid XML nesting

            // Inserted fragment means it exists in `to` document and is absent
            // in `from` document. So for `from` document we should treat inserted
            // fragment as removed
            fromTokens.push(insTokenFrom(toSrcTokens, offset, value));
            tokens = handleInsert(value, offset, toSrcTokens, tokens);
            // fromTokens = handleInsert(value, fromOffset, fromSrcTokens, fromTokens);
            offset += value.length;
        } else if (d[0] === DIFF_EQUAL) {
            // Unmodified content
            offset += value.length;
            fromOffset += value.length;

            moveTokens(toSrcTokens, tokens, offset, getFromStack);
            moveTokens(fromSrcTokens, fromTokens, fromOffset, getToStack);
        }
    });

    if (options.compact) {
        tokens = compactIns(tokens, options);
        tokens = compactDel(to.content, tokens, options);
    }

    return {
        tokens: tokens.concat(toSrcTokens),
        content: to.content,
        from: {
            tokens: fromTokens.concat(fromSrcTokens),
            content: from.content
        }
    };
}

/**
 * Applies INSERT patch operation
 * @param value Added content
 * @param pos Current output location
 * @param tokens Array of tag tokens *right* to given `pos` location.
 * Will be mutated: tokens will move into `output` array.
 * @param output Array of output tokens. Will be mutated with diff and tag tokens.
 * @return Returns `output` array
 */
function handleInsert(value: string, pos: number, tokens: Token[], output: Token[]) {
    const end = pos + value.length;
    let tag: Token;
    if (suppressWhitespace(value, pos, output)) {
        pos += 1;
        value = value.slice(1);
    }

    insOpen(output, pos);
    while (tokens.length && tokens[0].location < end) {
        tag = tokens.shift()!;

        if (isTagToken(tag)) {
            insClose(output, tag.location);
            output.push(tag);
            insOpen(output, tag.location);
        } else {
            output.push(tag);
        }
    }
    insClose(output, end);

    return output;
}

function insOpen(tokens: Token[], location: number) {
    tokens.push({ name: 'ins', type: ElementTypeAddon.InsertBefore, location, value: '<ins>' });
}

function insClose(tokens: Token[], location: number) {
    tokens.push({ name: 'ins', type: ElementTypeAddon.InsertAfter, location, value: '</ins>' });
}

/**
 * Optimizes given token list by removing meaningless insertion tags
 */
function compactIns(tokens: Token[], options: Options): Token[] {
    const result: Token[] = [];
    tokens = tokens.slice();

    while (tokens.length) {
        const token = tokens.shift()!;

        if (isType(token, ElementTypeAddon.InsertBefore)) {
            if (isType(tokens[0], ElementTypeAddon.InsertAfter) && token.location === tokens[0].location) {
                // Empty token
                tokens.shift();
                continue;
            }

            if (isType(tokens[0], ElementTypeAddon.Space) && isType(tokens[1], ElementTypeAddon.InsertAfter)) {
                // Inserted whitespace.
                // It can be either significant (`ab` -> `a b`) or insignificant,
                // if this whitespace is empty or is right after non-inline element
                const prev = result[result.length - 1];
                if (
                    token.location === tokens[1].location
                    || (
                        // Check that only whitespace was inserted
                        (tokens[1].location - token.location) === tokens[0].offset
                        && isTagToken(prev) && !isInlineElement(prev, options)
                    )
                ) {
                    result.push(tokens.shift()!);
                    tokens.shift();
                    continue;
                }
            }
        }
        result.push(token);
    }

    return result;
}

/**
 * Optimizes given token list by removing meaningless delete tokens
 */
function compactDel(content: string, tokens: Token[], options: Options): Token[] {
    return tokens.filter((token, i) => {
        if (isType(token, ElementTypeAddon.Delete) && isWhitespace(token.name)) {
            if (isWhitespace(content.charAt(token.location - 1)) || isWhitespace(content.charAt(token.location + 1))) {
                // There’s whitespace before or after deleted whitespace token
                return false;
            }

            if (!isInlineElement(tokens[i - 1], options) && !isInlineElement(tokens[i + 1], options)) {
                // Whitespace between non-inline elements
                return false;
            }
        }

        return true;
    });
}

/**
 * Check if given string is whitespace-only
 */
function isWhitespace(str: string): boolean {
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
function isTagToken(token: Token): boolean {
    return token.type === ElementType.Open
        || token.type === ElementType.Close
        || token.type === ElementType.SelfClose;
}

/**
 * Check if given token is an inline-level HTML element
 */
function isInlineElement(token: Token, options: Options): boolean {
    return token && options.inlineElements.includes(token.name);
}

/**
 * Reconstructs deleted fragment of original documents with tag structure
 * of host document
 */
function reconstructDel(model: ParsedModel, pos: number, value: string, tags: string[]): string {
    if (tags.length === 0) {
        return value;
    }

    // tslint:disable-next-line: prefer-const
    let { stack, i } = getElementStack(model, pos);
    const endPos = pos + value.length;
    let result = '';

    // Check which elements should be kept in deleted fragment
    for (const token of stack) {
        if (tags.includes(token.name)) {
            result += token.value;
        }
    }

    // Walk up to the end of text fragment and check inner structure
    let offset = 0;
    while (i < model.tokens.length) {
        const token = model.tokens[i++];
        if (token.location > endPos) {
            break;
        }

        result += value.slice(offset, token.location - pos);
        offset = token.location - pos;

        if (token.type === ElementType.SelfClose && tags.includes(token.name)) {
            result += token.value;
        } else if (token.type === ElementType.Open) {
            stack.push(token);
            if (tags.includes(token.name)) {
                result += token.value;
            }
        } else if (token.type === ElementType.Close) {
            stack.pop();
            if (tags.includes(token.name)) {
                result += token.value;
            }
        }
    }

    result += value.slice(offset);

    // Close the remaining elements
    while (stack.length) {
        const token = stack.pop()!;
        if (tags.includes(token.name)) {
            result += `</${token.name}>`;
        }
    }

    return result;
}

/**
 * Collects element stack for given text location
 */
function getElementStack(model: ParsedModel, pos: number): { stack: Token[], i: number } {
    const stack: Token[] = [];
    let i = 0;

    while (i < model.tokens.length) {
        const token = model.tokens[i];
        if (token.location > pos) {
            break;
        }

        if (token.type === ElementType.Open) {
            stack.push(token);
        } else if (token.type === ElementType.Close) {
            stack.pop();
        }

        i++;
    }

    return { stack, i };
}

/**
 * Handle edge case when patch intersects with suppressed formatting whitespace,
 * used as word delimiter for adjacent blocks.
 * For example, `<div>a</div><div>b</div>` is represented as `a b` in plain text,
 * space between `a` and `b` is a suppressed whitespace and must be removed from
 * patch
 */
function suppressWhitespace(value: string, pos: number, output: Token[]): boolean {
    const lastToken = output[output.length - 1];
    return lastToken
        ? lastToken.type === ElementTypeAddon.Space
            && !!lastToken.offset
            && lastToken.location === pos
            && value[0] === ' '
        : false;
}

/**
 * Moves document tokens from `source` to `dest` token list up until `pos` document
 * location.
 */
function moveTokens(source: Token[], dest: Token[], pos: number, getStack: () => Token[]) {
    // Move all tokens of destination document to output result
    while (source.length) {
        const first = source[0]!;
        // if (first.location > offset || (first.location === offset && first.type === ElementType.Open)) {
        //     break;
        // }
        if (first.location > pos) {
            break;
        }

        if (first.location === pos && first.type === ElementType.Open) {
            // Handle edge case. In the following examples:
            // – aa <div>bb cc</div>
            // – aa bb <div>cc</div>
            // ...removing `dd ` results DELETE token with the same _text_
            // location, yet in first case it should be outside `<div>` and
            // in second case – inside `<div>`.
            // In case if token touches the edge of open tag, we should detect
            // if this token is inside or outside the same tag in `from`
            // document
            const stack = getStack();
            let found = false;
            while (stack.length) {
                if (stack.pop()!.name === first.name) {
                    found = true;
                    break;
                }
            }

            if (!found) {
                break;
            }
        }

        dest.push(source.shift()!);
    }
}

/**
 * Generates <ins> token for `from` document
 */
function insTokenFrom(tokens: Token[], pos: number, value: string): Token {
    const stack: string[] = [];
    const end = pos + value.length;
    let offset = 0;
    let result = '';

    for (const token of tokens) {
        if (token.location > end) {
            break;
        }

        if (token.type === ElementType.Open) {
            stack.push(token.name);
        } else if (token.type === ElementType.Close) {
            if (stack[stack.length - 1] !== token.name) {
                continue;
            }
            stack.pop();
        }

        result += value.slice(offset, token.location - pos) + token.value;
        offset = token.location - pos;
    }

    return {
        name: value,
        type: ElementTypeAddon.FromInsert,
        location: pos,
        value: `<ins>${result + value.slice(offset)}</ins>`,
    };
}
