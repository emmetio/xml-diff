import { ParsedModel, Token, TokenType, ElementTypeAddon } from './types';
import { scan } from '@emmetio/html-matcher';
import createOptions, { Options } from './options';

export interface ConsumerState {
    /** Original source code to parse */
    text: string;
    /** Consumed tokens */
    tokens: Token[];

    /** Accumulated clean text content of XML document */
    content: string;
    hasContent: boolean;
    prev: number;
    offset: number;
    options: Options;
}

export interface Consumer {
    state: ConsumerState;
    /**
     * @param name Name of the token for identification
     * @param type Token type
     * @param start Location of token start in source code
     * @param end Location of token end in source code
     */
    consume(name: string, type: TokenType, start: number, end: number): void;
    finalize(end?: number): ParsedModel;
}

const reSpace = /[\s\r\n]+/g;

/**
 * Parses given XML source into internal model for diff
 */
export default function parse(text: string, options: Options = createOptions()) {
    const { consume, finalize } = createConsumer(text, options);
    scan(text, consume, options);
    return finalize(text.length);
}

/**
 * Creates XML markup consumer for given text. Returns object with `consume` function
 * that should receive markup tokens and `finalize` function to produce final
 * document model
 * @param text Original source code being parsed
 */
export function createConsumer(text: string, options: Options = createOptions()): Consumer {
    const state: ConsumerState = {
        text,
        tokens: [],
        options,
        content: '',
        hasContent: false,
        prev: options.baseStart || 0,
        offset: 0
    };

    return {
        state,
        consume(name: string, type: TokenType, start: number, end: number) {
            if (state.options.normalizeSpace) {
                normalizeWhitespace(state.prev, start, state);
            } else {
                state.content += text.slice(state.prev, start);
            }

            const token: Token = {
                name, type,
                value: text.substring(start, end),
                location: start - state.offset,
                order: start
            };

            state.tokens.push(token);
            state.prev = end;
            state.offset += token.value.length;
        },
        finalize(baseEnd = text.length) {
            if (state.options.normalizeSpace) {
                normalizeWhitespace(state.prev, baseEnd, state);
                fixTrailingSpace(state);
            } else {
                state.content += text.slice(state.prev, baseEnd);
            }

            return {
                tokens: state.tokens,
                content: state.content
            };
        }
    };
}

/**
 * Normalizes whitespace characters: replaces all whitespace occurrences
 * (including adjacent) with a single space and returns tokens with original space
 * characters
 */
function normalizeWhitespace(from: number, to: number, state: ConsumerState) {
    let m: RegExpExecArray | null;
    let prev = 0;
    let hasSpace = false;
    const fragment = state.text.substring(from, to);

    while (m = reSpace.exec(fragment)) {
        hasSpace = true;
        if (m[0] !== ' ' || (m.index === 0 && !state.hasContent)) {
            // Found formatted whitespace, collapse it to a single space or remove
            // if it’s preceded by another whitespace
            state.content += fragment.slice(prev, m.index);
            const token: Token = {
                name: '#whitespace',
                type: ElementTypeAddon.Space,
                value: m[0],
                location: from + m.index - state.offset,
                order: from + m.index
            };

            if (state.hasContent) {
                // Not a trailing (significant) whitespace, replace it with single space
                state.content += ' ';
                token.offset = 1;
                state.offset--;
            }

            prev = m.index + m[0].length;
            state.tokens.push(token);
            state.offset += token.value.length;
            state.hasContent = prev < fragment.length;
        } else {
            // Entered trailing space?
            state.hasContent = m.index + m[0].length < fragment.length;
        }
    }

    if (fragment && !hasSpace) {
        state.hasContent = true;
    }

    state.content += fragment.slice(prev);
}

/**
 * Fixes trailing space in accumulated content
 */
function fixTrailingSpace(state: ConsumerState) {
    const trailing = state.content[state.content.length - 1] === ' ';
    if (trailing) {
        // Offset trailing tokens with new space
        for (let i = state.tokens.length - 1; i >= 0; i--) {
            const token = state.tokens[i];
            if (token.type === ElementTypeAddon.Space) {
                token.offset = 0;
                break;
            } else {
                token.location--;
            }
        }
        state.content = state.content.slice(0, -1);
        state.hasContent = state.content.length > 0;
    }
}
