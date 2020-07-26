import { DIFF_DELETE, DIFF_INSERT, DIFF_EQUAL, Diff } from 'diff-match-patch';

const wordDelimiters = '.,…/\\!?:;()[]{}<>"\'«»“”‘’-–—\n\r\t \u00a0'.split('').map(ch => ch.charCodeAt(0));

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
                    const bound = findWordBound(peek[1]);
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
function isWordDelimiter(text: string, pos: number): boolean {
    return wordDelimiters.includes(text.charCodeAt(pos));
}

/**
 * Finds location of word bound in given string. Returns `-1` if word bound wasn’t
 * found
 */
function findWordBound(text: string): number {
    for (let i = 0; i < text.length; i++) {
        if (isWordDelimiter(text, i)) {
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
        if (isWordDelimiter(start[1], i)) {
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
