import { ScannerOptions, createOptions as scannerOptions } from '@emmetio/html-matcher';

export interface DMPOptions {
    /**
     * Number of seconds to map a diff before giving up (0 for infinity).
     * @default 1
     */
    Diff_Timeout: number;

    /**
     * Cost of an empty edit operation in terms of edit characters.
     * @default 4
     */
    Diff_EditCost: number;

    /**
     * At what point is no match declared (0.0 = perfection, 1.0 = very loose).
     * @default 0.5
     */
    Match_Threshold: number;

    /**
     * How far to search for a match (0 = exact location, 1000+ = broad match).
     * A match this many characters away from the expected location will add
     * 1.0 to the score (0.0 is a perfect match).
     * @default 1000
     */
    Match_Distance: number;

    /**
     * When deleting a large block of text (over ~64 characters), how close do
     * the contents have to be to match the expected contents. (0.0 = perfection,
     * 1.0 = very loose).  Note that Match_Threshold controls how closely the
     * end points of a delete need to match.
     * @default 0.5
     */
    Patch_DeleteThreshold: number;

    /**
     * Chunk size for context length.
     * @default 4
     */
    Patch_Margin: number;

    /**
     * The number of bits in an int.
     * @default 32
     */
    Match_MaxBits: number;
}

export interface Options extends ScannerOptions {
    /** Normalize whitespace when extracting content from XML */
    normalizeSpace?: boolean;

    /** Reduce ”noise” by removing meaningless whitespace patches */
    compact: boolean;

    /** List of inline-level tag names. Used for better document patching */
    inlineElements: string[];

    /** Location in source code where content parsing starts */
    baseStart: number;

    /** Options for diff-match-patch module */
    dmp?: Partial<DMPOptions>;

    /**
     * Tag names of original document that should be preserved when inserting
     * removed fragments into destination document
     */
    preserveTags: string[];

    /**
     * Update diff patches so they include whole words instead of distinct parts
     * of words. For example, running diff on `Experimental` and `Established`
     * would produce the following patches by default:
     * `[[0, 'E'], [-1, 'xperimental'], [1, 'stablished'],]`
     * E.g. only updated part is considered, separating a single word into multiple
     * chunks.
     * With this option enable, the diff above will become
     * `[[-1, 'Experimental'], [1, 'Established'],]`
     * E.g. it will be updated to include full word chunks
     */
    wordPatches?: boolean;

    /**
     * Generate inverted diff: perform `from` → `to` document diff but apply patches
     * to `from` document
     */
    invert?: boolean;

    /**
     * A ratio of changed to unchanged text to consider texts as completely different
     * thus marked as fully replaced content. Instead of providing a set of
     * inserted/deleted fragments, it will mark text as replaced, e.g. previous
     * text completely removed and new text as inserted.
     * Values vary from 0 to 1, but actual threshold might be larger than 1
     */
    replaceThreshold?: number;
}

const defaultOptions: Partial<Options> = {
    compact: true,
    normalizeSpace: true,
    allTokens: true,
    baseStart: 0,
    replaceThreshold: 0,
    preserveTags: [],
    inlineElements: [
        'a', 'abbr', 'acronym', 'applet', 'b', 'basefont', 'bdo',
        'big', 'br', 'button', 'cite', 'code', 'del', 'dfn', 'em', 'font', 'i',
        'iframe', 'img', 'input', 'ins', 'kbd', 'label', 'map', 'object', 'q',
        's', 'samp', 'select', 'small', 'span', 'strike', 'strong', 'sub', 'sup',
        'textarea', 'tt', 'u', 'var'
    ]
};

export default function createOptions(opt?: Partial<Options>): Options {
    return scannerOptions({ ...defaultOptions,  ...opt }) as Options;
}
