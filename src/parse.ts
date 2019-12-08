import { scan, createOptions, ScannerOptions } from '@emmetio/html-matcher';
import Scanner, { isSpace } from '@emmetio/scanner';
import { Token, ElementTypeAddon } from './types';

export interface ParsedModel {
    tokens: Token[];
    content: string;
}

/**
 * Extracts markup tokens and raw content (e.g. content between tags) from given
 * XML source. The extracted content contains normalized whitespace: all space
 * characters like tabs, newlines etc. are replaced with single space character
 */
export default function parse(text: string, options?: Partial<ScannerOptions>): ParsedModel {
    const markupTokens = markup(text, options);
    const wsTokens = whitespace(text, markupTokens);
    const tokens = markupTokens
        .concat(wsTokens)
        .sort(tokenSorter);
    return {
        tokens,
        content: rawContent(text, tokens)
    };
}

/**
 * Collects XML markup tokens (tags, comments, cdata etc.) from given source code
 */
export function markup(text: string, options?: Partial<ScannerOptions>): Token[] {
    const tokens: Token[] = [];
    let offset = 0;
    scan(text, (name, type, start, end) => {
        tokens.push({
            name, type,
            value: text.substring(start, end),
            location: start - offset,
            order: start
        });
        offset += end - start;
    }, createOptions({ allTokens: true, ...options }));

    return tokens;
}

/**
 * Collects all whitespace tokens from given string, skipping ones inside `skip`
 * tokens. All locations of whitespace tokens are calculated relative to `offset`
 * index
 * @param text Text where whitespace tokens should be collected
 * @param offset Base offset for storing token locations
 * @param skip List of tokens where whitespace should be ignored
 */
export function whitespace(text: string, skip?: Token[], offset = 0): Token[] {
    const tokens: Token[] = [];
    const len = text.length;
    let i = 0;
    let lastContentPos = -1;
    let hasContent = false;
    let skipPos = 0;
    const skipLen = skip ? skip.length : 0;

    while (i < len) {
        const skipToken: Token | null = skipPos < skipLen ? skip![skipPos++] : null;
        const stream = new Scanner(text, i, skipToken ? skipToken.location - offset : len);

        while (!stream.eof()) {
            stream.start = stream.pos;

            if (stream.eatWhile(isSpace)) {
                const value = stream.current();
                if (value !== ' ' || !hasContent) {
                    tokens.push({
                        name: '#whitespace',
                        type: ElementTypeAddon.Space,
                        location: stream.start + offset,
                        value,
                        offset: hasContent ? 1 : 0
                    });
                }

                hasContent = false;
            } else if (stream.next()) {
                // Keep track of significant whitespace characters
                lastContentPos = stream.pos + offset;
                hasContent = true;
            }
        }

        i = skipToken ? skipToken.location + skipToken.value.length - offset : len;
    }

    // Mark trailing whitespace (tokens after last known content location) as insignificant
    for (i = tokens.length - 1; i >= 0 && tokens[i].location >= lastContentPos; i--) {
        tokens[i].offset = 0;
    }

    return tokens;
}

/**
 * Returns raw content between given tokens
 */
export function rawContent(text: string, tokens: Token[], baseOffset = 0): string {
    // let offset = baseOffset;
    let spaceOffset = 0;
    let prev = 0;
    let accum = 0;

    return tokens.map(token => {
        let result = text.slice(prev + accum, token.location + accum);
        accum += token.value.length;
        prev = token.location;
        token.location += spaceOffset;

        if (token.type === ElementTypeAddon.Space && token.offset) {
            result += ' ';
            spaceOffset += token.offset;
        }

        return result;
    }).join('') + text.slice(prev + accum);
}

/**
 * Default token sorter
 */
export function tokenSorter(a: Token, b: Token): number {
    return a.location - b.location
        || ((a.order || 0) - (b.order || 0));
}
