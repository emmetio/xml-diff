import { diff_match_patch, DIFF_DELETE, DIFF_INSERT, DIFF_EQUAL, Diff } from 'diff-match-patch';
import { ElementType } from '@emmetio/html-matcher';
import { ParsedModel, Token, ElementTypeAddon } from './types';
import createOptions, { Options } from './options';
import wordBounds from './word-bounds';
import { fragment, FragmentOptions, slice } from './slice';
import { closest, getElementStack, isTagToken, isType, isWhitespace, last } from './utils';

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

    /** Same as `push` but also increments element pointer */
    pushNext(token: Token): void;

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
    const diffs = getDiff(from, to, options);
    const state = createState(to.tokens);
    const fragmentOpt: FragmentOptions = {
        tags: options.preserveTags
    };
    let toOffset = 0;
    let fromOffset = 0;
    const del = options.invert ? 'ins' : 'del';
    const ins = options.invert ? 'del' : 'ins';
    const updateStats = {
        ins: 0,
        del: 0,
        eq: 0
    };

    diffs.forEach(d => {
        let value = d[1];
        if (d[0] === DIFF_DELETE && value) {
            // Removed fragment: just add deleted content to result
            // In case of suppressed space, we should use external variable
            // instead of `toOffset` to safely increment it.
            // Otherwise locations won’t match
            let pos = toOffset;
            if (suppressWhitespace(value, toOffset, state)) {
                fromOffset += 1;
                pos += 1;
                value = value.slice(1);
            }

            if (!shouldSkipDel(to.content, value, fromOffset, options)) {
                // Edge case: put delete patch right after open tag or non-suppressed
                // whitespace at the same location
                // TODO не оставлять открывающий элемент `<line>`, если он находится
                // в начальной позиции патча
                const fromStack = getElementStack(from.tokens, fromOffset);
                fragmentOpt.stackData = fromStack;

                moveTokensUntilPos(state, toOffset, fromStack.stack);

                if (options.preserveXml) {
                    fragmentOpt.receiverStack = getElementStack(to.tokens, toOffset).stack;
                }

                const chunk = fragment(from, fromOffset, fromOffset + value.length, fragmentOpt);
                state.push(chunk.toDiffToken(del, value, pos));

                updateStats.del += value.length;
            }
            fromOffset += value.length;
        } else if (d[0] === DIFF_INSERT) {
            // Inserted fragment: should insert open and close tags at proper
            // positions and maintain valid XML nesting
            if (suppressWhitespace(value, toOffset, state)) {
                toOffset += 1;
                value = value.slice(1);
            }

            if (!shouldSkipIns(value, toOffset, state, options)) {
                const tagName = options.skipSpace && isWhitespace(value) ? '' : ins;
                moveSlice(to, toOffset, toOffset + value.length, tagName, state);
                updateStats.ins += value.length;
            }

            toOffset += value.length;
        } else if (d[0] === DIFF_EQUAL) {
            // Unmodified content
            toOffset += value.length;
            fromOffset += value.length;
            updateStats.eq += value.length;

            // Move all tokens of destination document to output result
            while (state.hasNext()) {
                const first = state.current();
                // if (first.location > offset || (first.location === offset && first.type === ElementType.Open)) {
                //     break;
                // }
                if (first.location > toOffset) {
                    break;
                }

                if (first.location === toOffset && first.type === ElementType.Open) {
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
        content: to.content,
        similarity: updateStats.eq / (updateStats.ins + updateStats.del + updateStats.eq)
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

function moveTokensUntilPos(state: DiffState, textPos: number, stack: Token[]) {
    let closestIx = -1;

    while (state.hasNext()) {
        const t = state.current();
        if (t.location < textPos) {
            state.pushNext(t);
        } else if (t.location === textPos) {
            if (t.type === ElementType.Open) {
                // Handle edge case for unformatted XML: move open tags at the edge
                // of range only if it shares common structure with external document.
                // For example:
                // Doc A: `<doc><a>A foo</a></doc>`
                // Doc B: `<doc><b>B foo</b></doc>`
                // The diff is at location 0, which includes `<doc>` and `<a>` tags
                // of A document. In this case, we should move `<doc>` element to output
                // since B also contains this element, but leave out `<a>` element
                const ix = closest(stack, t.name);
                if (ix > closestIx) {
                    state.pushNext(t);
                    closestIx = ix;
                } else {
                    break;
                }
            } else if (t.type === ElementTypeAddon.Space && !t.offset) {
                state.pushNext(t);
            }
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
    const isSpaceDel = isWhitespace(value);
    if (options.skipSpace && isSpaceDel) {
        return true;
    }

    if (options.compact && isSpaceDel) {
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

function createState(input: Token[]): DiffState {
    return {
        ptr: 0,
        input,
        output: [],
        push(token) {
            this.output.push(token);
        },
        pushNext(token) {
            this.push(token);
            this.ptr++;
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
