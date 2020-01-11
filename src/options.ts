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
}

const defaultOptions: Partial<Options> = {
    compact: true,
    normalizeSpace: true,
    allTokens: true,
    baseStart: 0,
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
