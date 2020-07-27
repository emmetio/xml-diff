import { DIFF_DELETE, DIFF_INSERT, DIFF_EQUAL, Diff } from 'diff-match-patch';
import { isNumber } from '@emmetio/scanner';

const wordDelimiters = '.,…/\\!?:;()[]{}<>"\'«»“”‘’-–—\n\r\t \u00a0'.split('').map(ch => ch.charCodeAt(0));
const numberPunct = '.,'.split('').map(ch => ch.charCodeAt(0));

/**
 * Returns updated list of diff ops so that adjacent delete and insert ops include
 * word bounds
 */
export default function updateWordBounds(diffs: Diff[]): Diff[] {
    diffs = [...diffs];
    const result: Diff[] = [];
    let i = 0;
    let start: Diff | null = null;

    while (i < diffs.length) {
        const cur = diffs[i];
        const next = diffs[i + 1];
        if (cur[0] === DIFF_DELETE && next && next[0] === DIFF_INSERT) {
            const del = [...cur] as Diff;
            const ins = [...next] as Diff;

            if (start) {
                // Move start word bound, if required
                const nextStart = updateStartBound(start, del, ins);
                if (nextStart !== start) {
                    result.pop();
                    if (nextStart[1] !== '') {
                        // Edge case: bound update resulted in empty prefix,
                        // do not add it
                        result.push(nextStart);
                    }
                }
            }

            // Advance next until we find non-updated chunk with valid word bound
            i += 2;
            while (i < diffs.length) {
                const peek = diffs[i];
                if (peek[0] === DIFF_INSERT) {
                    ins[1] += peek[1];
                } else if (peek[0] === DIFF_DELETE) {
                    del[1] += peek[1];
                } else {
                    const bound = findRightWordBound(peek, del, ins);
                    if (bound === -1) {
                        del[1] += peek[1];
                        ins[1] += peek[1];
                    } else {
                        del[1] += peek[1].slice(0, bound);
                        ins[1] += peek[1].slice(0, bound);
                        diffs[i] = [peek[0], peek[1].slice(bound)];
                        break;
                    }
                }
                i++;
            }

            result.push(del, ins);
            start = null;
        } else {
            start = cur[0] === DIFF_EQUAL ? cur : null;
            result.push(cur);
            i++;
        }
    }

    return result;
}

/**
 * Check if character at given location in string is a word delimiter
 */
function isWordDelimiter(ch: number): boolean {
    return wordDelimiters.includes(ch);
}

/**
 * Finds location of word bound in given string. Returns `-1` if word bound wasn’t
 * found
 */
function findRightWordBound(eq: Diff, del: Diff, ins: Diff): number {
    const text = eq[1];
    for (let i = 0; i < text.length; i++) {
        const ch = text.charCodeAt(i);
        if (numberPunct.includes(ch)) {
            // Possibly a decimal delimiter or number formatter
            if (isNumber(text.charCodeAt(i + 1)) || isNumber(text.charCodeAt(i - 1))) {
                continue;
            }

            if (i === 0 && ( isNumber(lastCharCode(del[1])) || isNumber(lastCharCode(ins[1])) )) {
                continue;
            }
        }

        if (isWordDelimiter(text.charCodeAt(i))) {
            return i;
        }
    }

    return -1;
}

/**
 * Updates given diffs so they point at the beginning of the word bound
 */
function updateStartBound(start: Diff, del: Diff, ins: Diff): Diff {
    const end = start[1].length - 1;
    let i = end;

    while (i >= 0) {
        const ch = start[1].charCodeAt(i);
        if (numberPunct.includes(ch) && isNumber(start[1].charCodeAt(i - 1))) {
            // A decimal delimiter or formatter character of number
            i -= 2;
            continue;
        }
        if (isWordDelimiter(ch)) {
            break;
        }
        i--;
    }

    if (i !== end) {
        const offset = end - i;
        del[1] = start[1].slice(-offset) + del[1];
        ins[1] = start[1].slice(-offset) + ins[1];
        return [start[0], start[1].slice(0, -offset)];
    }

    return start;
}

function lastCharCode(text: string): number {
    return text.charCodeAt(text.length - 1);
}
