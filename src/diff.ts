import { diff_match_patch, DIFF_DELETE, DIFF_INSERT, DIFF_EQUAL } from 'diff-match-patch';
import { ElementType } from '@emmetio/html-matcher';
import { ParsedModel, Token, ElementTypeAddon, TokenType } from './types';
import createOptions, { Options } from './options';
import wordBounds from './word-bounds';

/**
 * Calculates diff between given parsed document and produces new model with diff
 * tokens in it. This model can be restored into a final XML document
 */
export default function diff(from: ParsedModel, to: ParsedModel, options: Options = createOptions()): ParsedModel {
    const dmp = new diff_match_patch();
    if (options.dmp) {
        Object.assign(dmp, options.dmp);
    }
    let diffs = dmp.diff_main(from.content, to.content);
    dmp.diff_cleanupSemantic(diffs);
    if (options.wordPatches) {
        diffs = wordBounds(diffs);
    }

    const toTokens = to.tokens.slice();
    let tokens: Token[] = [];
    let offset = 0;
    let fromOffset = 0;

    diffs.forEach(d => {
        if (d[0] === DIFF_DELETE && d[1]) {
            // Removed fragment: just add deleted content to result
            tokens.push({
                name: d[1],
                type: ElementTypeAddon.Delete,
                location: offset,
                value: `<del>${reconstructDel(from, fromOffset, d[1], options.preserveTags)}</del>`
            });
            fromOffset += d[1].length;
        } else if (d[0] === DIFF_INSERT) {
            // Inserted fragment: should insert open and close tags at proper
            // positions and maintain valid XML nesting
            tokens = handleInsert(d[1], offset, toTokens, tokens);
            offset += d[1].length;
        } else if (d[0] === DIFF_EQUAL) {
            // Unmodified content
            offset += d[1].length;
            fromOffset += d[1].length;

            // Move all tokens of destination document to output result
            while (toTokens.length) {
                const first = toTokens[0]!;
                // if (first.location > offset || (first.location === offset && first.type === ElementType.Open)) {
                //     break;
                // }
                if (first.location > offset) {
                    break;
                }

                if (first.location === offset && first.type === ElementType.Open) {
                    // Handle edge case. In the following examples:
                    // – aa <div>bb cc</div>
                    // – aa bb <div>cc</div>
                    // ...removing `dd ` results DELETE token with the same _text_
                    // location, yet in first case it should be outside `<div>` and
                    // in second case – inside `<div>`.
                    // In case if token touches the edge of open tag, we should detect
                    // if this token is inside or outside the same tag in `from`
                    // document
                    const { stack } = getElementStack(from, fromOffset);
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

                tokens.push(toTokens.shift()!);
            }
        }
    });

    if (options.compact) {
        tokens = compactIns(tokens, options);
        tokens = compactDel(to.content, tokens, options);
    }

    return {
        tokens: tokens.concat(toTokens),
        content: to.content
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
    const lastToken = output[output.length - 1];
    if (lastToken && lastToken.type === ElementTypeAddon.Space && lastToken.offset && value[0] === ' ') {
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

    // Close the remaining elements
    while (stack.length) {
        const token = stack.pop()!;
        if (tags.includes(token.name)) {
            result += token.value;
        }
    }

    return result + value.slice(offset);
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
