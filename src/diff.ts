import { diff_match_patch, DIFF_DELETE, DIFF_INSERT, DIFF_EQUAL, Diff } from 'diff-match-patch';
import { ElementType } from '@emmetio/html-matcher';
import { ParsedModel, Token, ElementTypeAddon } from './types';
import createOptions, { Options } from './options';
import wordBounds from './word-bounds';
import { fragment, FragmentOptions, slice } from './slice';
import { getElementStack, isTagToken, isType, isWhitespace, last } from './utils';

interface DiffState {
    /** Pointer to current `input` token  */
    ptr: number;

    /**
     * Input tokens: tokens of original document. Eventuality, all tokens from `input`
     * must be copied into `output`
     */
    input: Token[];

    /** Output tokens */
    output: Token[];

    /** Pushes given token into output */
    push(token: Token): void;

    /** Returns current input token */
    current(): Token;

    /** Check if input is readable, e.g. `ptr` points to valid `input` index */
    hasNext(): boolean;
}

/**
 * Calculates diff between given parsed document and produces new model with diff
 * tokens in it. This model can be restored into a final XML document
 */
export default function diff(from: ParsedModel, to: ParsedModel, options: Options = createOptions()): ParsedModel {
    return options.invert
        ? diffInverted(from, to, options)
        : diffNatural(from, to, options);
}

/**
 * Performs “natural” diff between given documents: compares `from` and `to` documents
 * and returns `to` document with patched XML
 */
function diffNatural(from: ParsedModel, to: ParsedModel, options: Options): ParsedModel {
    const diffs = getDiff(from, to, options);
    const state = createState(to.tokens);
    const fragmentOpt: FragmentOptions = {
        tags: options.preserveTags || []
    };
    let offset = 0;
    let fromOffset = 0;

    diffs.forEach(d => {
        let value = d[1];
        if (d[0] === DIFF_DELETE && value) {
            // Removed fragment: just add deleted content to result
            if (suppressWhitespace(value, offset, state)) {
                offset += 1;
                fromOffset += 1;
                value = value.slice(1);
            }

            if (!shouldSkipDel(to.content, value, fromOffset, options)) {
                // Edge case: put delete patch right after open tag or non-suppressed
                // whitespace at the same location
                moveTokensUntilPos(state, offset);
                const chunk = fragment(from, fromOffset, fromOffset + value.length, fragmentOpt);
                state.push(chunk.toDiffToken('del', value, offset));
            }
            fromOffset += value.length;
        } else if (d[0] === DIFF_INSERT) {
            // Inserted fragment: should insert open and close tags at proper
            // positions and maintain valid XML nesting
            if (suppressWhitespace(value, offset, state)) {
                offset += 1;
                value = value.slice(1);
            }

            if (shouldSkipIns(value, offset, state, options)) {
                state.push(whitespace(offset, value));
            } else {
                moveSlice(to, offset, offset + value.length, 'ins', state);
            }

            offset += value.length;
        } else if (d[0] === DIFF_EQUAL) {
            // Unmodified content
            offset += value.length;
            fromOffset += value.length;

            // Move all tokens of destination document to output result
            while (state.hasNext()) {
                const first = state.current();
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
                    const { stack } = getElementStack(from.tokens, fromOffset);
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

                state.push(first);
                state.ptr++;
            }
        }
    });

    return {
        tokens: state.output.concat(state.input.slice(state.ptr)),
        content: to.content
    };
}

/**
 * Performs “inverted” diff between given documents: compares `from` and `to` documents
 * and returns `from` document with patched XML
 */
function diffInverted(from: ParsedModel, to: ParsedModel, options: Options): ParsedModel {
    const diffs = getDiff(from, to, options);
    const state = createState(from.tokens);
    const fragmentOpt: FragmentOptions = {
        tags: options.preserveTags || []
    };
    let toOffset = 0;
    let fromOffset = 0;

    diffs.forEach(d => {
        let value = d[1];
        if (d[0] === DIFF_DELETE && value) {
            if (suppressWhitespace(value, toOffset, state)) {
                toOffset += 1;
                fromOffset += 1;
                value = value.slice(1);
            }

            // if (!shouldSkipDel(to.content, value, fromOffset, options)) {
            //     // Unlike in “natural” diff, in ”inverted” deleted fragment if a part
            //     // of destination document
            // }
            moveSlice(from, fromOffset, fromOffset + value.length, 'del', state);
            fromOffset += value.length;
        } else if (d[0] === DIFF_INSERT) {
            // Inserted fragment: should insert open and close tags at proper
            // positions and maintain valid XML nesting
            if (suppressWhitespace(value, toOffset, state)) {
                toOffset += 1;
                value = value.slice(1);
            }

            // if (shouldSkipIns(value, toOffset, state, options)) {
            //     state.push(whitespace(toOffset, value));
            // } else {
            // }
            moveTokensUntilPos(state, fromOffset);
            const chunk = fragment(to, toOffset, toOffset + value.length, fragmentOpt);
            state.push(chunk.toDiffToken('ins', value, fromOffset));

            toOffset += value.length;
        } else if (d[0] === DIFF_EQUAL) {
            // Unmodified content
            toOffset += value.length;
            fromOffset += value.length;

            // Move all tokens of destination document to output result
            while (state.hasNext()) {
                const first = state.current();
                // if (first.location > offset || (first.location === offset && first.type === ElementType.Open)) {
                //     break;
                // }
                if (first.location > fromOffset) {
                    break;
                }

                if (first.location === fromOffset && first.type === ElementType.Open) {
                    // Handle edge case. In the following examples:
                    // – aa <div>bb cc</div>
                    // – aa bb <div>cc</div>
                    // ...removing `bb ` results DELETE token with the same _text_
                    // location, yet in first case it should be outside `<div>` and
                    // in second case – inside `<div>`.
                    // In case if token touches the edge of open tag, we should detect
                    // if this token is inside or outside the same tag in `from`
                    // document
                    const { stack } = getElementStack(to.tokens, toOffset);
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

                state.push(first);
                state.ptr++;
            }
        }
    });

    return {
        tokens: state.output.concat(state.input.slice(state.ptr)),
        content: from.content
    };
}

/**
 * Moves sliced fragment from `model` document to `output`, starting at `tokenPos`
 * token location
 */
function moveSlice(model: ParsedModel, from: number, to: number, tagName: string, state: DiffState) {
    const chunk = slice(model, from, to, state.ptr);

    // Move tokens preceding sliced fragment to output
    while (state.ptr < chunk.range[0]) {
        state.push(model.tokens[state.ptr++]);
    }

    state.ptr = chunk.range[1];

    for (const t of chunk.toTokens(tagName)) {
        state.push(t);
    }
}

function moveTokensUntilPos(state: DiffState, textPos: number) {
    while (state.hasNext()) {
        const t = state.current();
        if (t.location === textPos && (isType(t, ElementType.Open) || (isType(t, ElementTypeAddon.Space) && !t.offset))) {
            state.push(t);
            state.ptr++;
        } else {
            break;
        }
    }
}

/**
 * Check if given INSERT patch should be omitted to reduce noise
 */
function shouldSkipIns(value: string, pos: number, state: DiffState, options: Options): boolean {
    if (options.compact && isWhitespace(value)) {
        // Inserted whitespace.
        // It can be either significant (`ab` -> `a b`) or insignificant,
        // if this whitespace is empty or is right after non-inline element
        const prev = last(state.output);
        if (prev && isTagToken(prev) && prev.location === pos && !isInlineElement(prev, options)) {
            return true;
        }
    }

    return false;
}

/**
 * Check if given DELETE patch should be omitted
 */
function shouldSkipDel(content: string, value: string, pos: number, options: Options): boolean {
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
 * Handle edge case when patch intersects with suppressed formatting whitespace,
 * used as word delimiter for adjacent blocks.
 * For example, `<div>a</div><div>b</div>` is represented as `a b` in plain text,
 * space between `a` and `b` is a suppressed whitespace and must be removed from
 * patch
 */
function suppressWhitespace(value: string, pos: number, state: DiffState): boolean {
    const lastToken = last(state.output);
    return lastToken
        ? isType(lastToken, ElementTypeAddon.Space)
        && !!lastToken.offset
        && lastToken.location === pos
        && value[0] === ' '
        : false;
}

function getDiff(from: ParsedModel, to: ParsedModel, options: Options): Diff[] {
    const dmp = new diff_match_patch();
    if (options.dmp) {
        Object.assign(dmp, options.dmp);
    }
    let diffs = dmp.diff_main(from.content, to.content);
    dmp.diff_cleanupSemantic(diffs);

    if (options.replaceThreshold && getChangeThreshold(diffs) > options.replaceThreshold) {
        // Text is too different, mark it as replaced
        return [
            [DIFF_DELETE, from.content],
            [DIFF_INSERT, to.content],
        ];
    }

    if (options.wordPatches) {
        diffs = wordBounds(diffs);
    }

    return diffs;
}

function whitespace(location: number, value: string): Token {
    return {
        name: '#whitespace',
        type: ElementTypeAddon.Space,
        value,
        location,
    };
}

function createState(input: Token[]): DiffState {
    return {
        ptr: 0,
        input,
        output: [],
        push(token) {
            this.output.push(token);
        },
        current() {
            return input[this.ptr];
        },
        hasNext() {
            return this.ptr < input.length;
        }
    };
}

function getChangeThreshold(diffs: Diff[]): number {
    let i = 0;
    let changed = 0;
    let unchanged = 0;
    while (i < diffs.length) {
        const chunk = diffs[i++];
        let len = chunk[1].length;
        if (chunk[0] === DIFF_EQUAL) {
            unchanged += len;
        } else {
            const next = diffs[i];
            if (chunk[0] === DIFF_DELETE && next && next[0] === DIFF_INSERT) {
                // Mark consecutive updates as single edit
                len = (len + next[1].length) / 2;
                i++;
            }
            changed += len;
        }
    }

    return changed / unchanged;
}
