import { diff_match_patch, DIFF_DELETE, DIFF_INSERT, DIFF_EQUAL } from 'diff-match-patch';
import { ElementType } from '@emmetio/html-matcher';
import { ParsedModel, Token, ElementTypeAddon } from './types';
import createOptions, { Options } from './options';
import wordBounds from './word-bounds';
import { fragment, FragmentOptions, slice } from './slice';
import { isTagToken, isType, isWhitespace, last } from './utils';

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

    const tokens: Token[] = [];
    let offset = 0;
    let fromOffset = 0;
    let tokenPos = 0;
    const fragmentOpt: FragmentOptions = {
        tags: options.preserveTags || []
    };

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

            if (!shouldSkipDel(to.content, value, fromOffset, to.tokens, tokenPos, options)) {
                const chunk = fragment(from, fromOffset, fromOffset + value.length, fragmentOpt);
                // Edge case: put delete patch right after open tag or non-suppressed
                // whitespace at the same location
                while (tokenPos < to.tokens.length) {
                    const t = to.tokens[tokenPos];
                    if (t.location === location && (isType(t, ElementType.Open) || (isType(t, ElementTypeAddon.Space) && !t.offset))) {
                        tokens.push(t);
                        tokenPos++;
                    } else {
                        break;
                    }
                }
                tokens.push(chunk.toDiffToken('del', value, location));
            }
            fromOffset += value.length;
        } else if (d[0] === DIFF_INSERT) {
            // Inserted fragment: should insert open and close tags at proper
            // positions and maintain valid XML nesting
            if (suppressWhitespace(value, offset, tokens)) {
                offset += 1;
                value = value.slice(1);
            }

            if (shouldSkipIns(value, offset, tokens, options)) {
                tokens.push({
                    name: '#whitespace',
                    type: ElementTypeAddon.Space,
                    value,
                    location: offset,
                });
            } else {
                tokenPos = moveSlice(to, offset, offset + value.length, tokenPos, tokens);
            }

            offset += value.length;
        } else if (d[0] === DIFF_EQUAL) {
            // Unmodified content
            offset += value.length;
            fromOffset += value.length;

            // Move all tokens of destination document to output result
            while (tokenPos < to.tokens.length) {
                const first = to.tokens[tokenPos]!;
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
                    // ...removing `bb ` results DELETE token with the same _text_
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

                tokens.push(first);
                tokenPos++;
            }
        }
    });

    return {
        tokens: tokens.concat(to.tokens.slice(tokenPos)),
        content: to.content
    };
}

/**
 * Moves sliced fragment from `model` document to `output`, starting at `tokenPos`
 * token location
 */
function moveSlice(model: ParsedModel, from: number, to: number, tokenPos: number, output: Token[]) {
    const chunk = slice(model, from, to, tokenPos);

    // Move tokens preceding sliced fragment to output
    while (tokenPos < chunk.range[0]) {
        output.push(model.tokens[tokenPos++]);
    }

    tokenPos = chunk.range[1];

    for (const t of chunk.toTokens('ins')) {
        output.push(t);
    }
    return tokenPos;
}

/**
 * Check if given INSERT patch should be omitted to reduce noise
 */
function shouldSkipIns(value: string, pos: number, output: Token[], options: Options): boolean {
    if (options.compact && isWhitespace(value)) {
        // Inserted whitespace.
        // It can be either significant (`ab` -> `a b`) or insignificant,
        // if this whitespace is empty or is right after non-inline element
        const prev = last(output);
        if (prev && isTagToken(prev) && prev.location === pos && !isInlineElement(prev, options)) {
            return true;
        }
    }

    return false;
}

/**
 * Check if given DELETE patch should be omitted
 */
function shouldSkipDel(content: string, value: string, pos: number, input: Token[], inputPos: number, options: Options): boolean {
    if (options.compact && isWhitespace(value)) {
        if (isWhitespace(content.charAt(pos - 1)) || isWhitespace(content.charAt(pos))) {
            // There’s whitespace before or after deleted whitespace token
            return true;
        }

        // if (!isInlineElement(input[inputPos - 1], options) && !isInlineElement(input[inputPos], options)) {
        //     // Whitespace between non-inline elements
        //     return true;
        // }
    }

    return false;
}

/**
 * Check if given token is an inline-level HTML element
 */
function isInlineElement(token: Token, options: Options): boolean {
    if (token) {
        return token.type === ElementTypeAddon.Diff
            || options.inlineElements.includes(token.name);
    }

    return false;
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
    const lastToken = last(output);
    return lastToken
        ? isType(lastToken, ElementTypeAddon.Space)
            && !!lastToken.offset
            && lastToken.location === pos
            && value[0] === ' '
        : false;
}
