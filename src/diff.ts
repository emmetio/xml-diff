import { diff_match_patch, DIFF_DELETE, DIFF_INSERT, DIFF_EQUAL } from 'diff-match-patch';
import { ElementType } from '@emmetio/html-matcher';
import { ParsedModel, Token, ElementTypeAddon } from './types';
import createOptions, { Options } from './options';
import wordBounds from './word-bounds';
import { fragment, FragmentOptions, slice, SliceOp, SliceResult } from './slice';
import { isTagToken, isType, isWhitespace } from './utils';

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

    // const toTokens = to.tokens.slice();
    let tokens: Token[] = [];
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
            const chunk = fragment(from, fromOffset, fromOffset + value.length, fragmentOpt);
            tokens.push(delToken(value, location, chunk));
            fromOffset += value.length;
        } else if (d[0] === DIFF_INSERT) {
            // Inserted fragment: should insert open and close tags at proper
            // positions and maintain valid XML nesting
            if (suppressWhitespace(value, offset, tokens)) {
                offset += 1;
                value = value.slice(1);
            }

            const chunk = slice(to, offset, offset + value.length, tokenPos);

            // Move tokens preceding sliced fragment to output
            while (tokenPos < chunk.range[0]) {
                tokens.push(to.tokens[tokenPos++]);
            }

            tokenPos = chunk.range[1];
            tokens.push(insToken(value, offset, chunk));
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

    if (options.compact) {
        tokens = compactIns(tokens, options);
        tokens = compactDel(to.content, tokens, options);
    }

    return {
        tokens: tokens.concat(to.tokens.slice(tokenPos)),
        content: to.content
    };
}

/**
 * Optimizes given token list by removing meaningless insertion tags
 */
function compactIns(tokens: Token[], options: Options): Token[] {
    const result: Token[] = [];
    tokens = tokens.slice();

    while (tokens.length) {
        const token = tokens.shift()!;

        if (isType(token, ElementTypeAddon.Insert) && isWhitespace(token.name)) {
            // Inserted whitespace.
            // It can be either significant (`ab` -> `a b`) or insignificant,
            // if this whitespace is empty or is right after non-inline element
            const prev = result[result.length - 1];
            if (isTagToken(prev) && prev.location === token.location && !isInlineElement(prev, options)) {
                result.push({
                    name: '#whitespace',
                    type: ElementTypeAddon.Space,
                    value: token.name,
                    location: token.location,
                });
                continue;
            }
        }
        result.push(token);
    }

    return result;
}
// function compactIns(tokens: Token[], options: Options): Token[] {
//     const result: Token[] = [];
//     tokens = tokens.slice();

//     while (tokens.length) {
//         const token = tokens.shift()!;

//         if (isType(token, ElementTypeAddon.InsertBefore)) {
//             if (isType(tokens[0], ElementTypeAddon.InsertAfter) && token.location === tokens[0].location) {
//                 // Empty token
//                 tokens.shift();
//                 continue;
//             }

//             if (isType(tokens[0], ElementTypeAddon.Space) && isType(tokens[1], ElementTypeAddon.InsertAfter)) {
//                 // Inserted whitespace.
//                 // It can be either significant (`ab` -> `a b`) or insignificant,
//                 // if this whitespace is empty or is right after non-inline element
//                 const prev = result[result.length - 1];
//                 if (
//                     token.location === tokens[1].location
//                     || (
//                         // Check that only whitespace was inserted
//                         (tokens[1].location - token.location) === tokens[0].offset
//                         && isTagToken(prev) && !isInlineElement(prev, options)
//                     )
//                 ) {
//                     result.push(tokens.shift()!);
//                     tokens.shift();
//                     continue;
//                 }
//             }
//         }
//         result.push(token);
//     }

//     return result;
// }

/**
 * Optimizes given token list by removing meaningless delete tokens
 */
function compactDel(content: string, tokens: Token[], options: Options): Token[] {
    return tokens.filter((token, i) => {
        if (isType(token, ElementTypeAddon.Delete) && isWhitespace(token.name)) {
            if (isWhitespace(content.charAt(token.location - 1)) || isWhitespace(content.charAt(token.location))) {
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
 * Check if given token is an inline-level HTML element
 */
function isInlineElement(token: Token, options: Options): boolean {
    if (token) {
        let { name } = token;
        if (token.type === ElementTypeAddon.Insert) {
            name = 'ins';
        } else if (token.type === ElementTypeAddon.Delete) {
            name = 'del';
        }
        return options.inlineElements.includes(name);
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
    const lastToken = output[output.length - 1];
    return lastToken
        ? lastToken.type === ElementTypeAddon.Space
            && !!lastToken.offset
            && lastToken.location === pos
            && value[0] === ' '
        : false;
}

function delToken(name: string, location: number, value: SliceResult): Token {
    return {
        name,
        type: ElementTypeAddon.Delete,
        location,
        value: value.toString('del')
    };
}

function insToken(name: string, location: number, value: SliceResult): Token {
    let fullName = '';
    for (const token of value.tokens) {
        if (token !== SliceOp.Open && token !== SliceOp.Close) {
            fullName += token;
        }
    }

    return {
        name: fullName,
        type: ElementTypeAddon.Insert,
        location,
        offset: name.length,
        value: value.toString('ins')
    };
}
