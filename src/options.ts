import { ScannerOptions, createOptions as scannerOptions } from '@emmetio/html-matcher';

export interface Options extends ScannerOptions {
    /** Normalize whitespace when extracting content from XML */
    normalizeSpace?: boolean;

    /** Reduce ”noise” by removing meaningless whitespace patches */
    compact: boolean;

    /** List of inline-level tag names. Used for better document patching */
    inlineElements: string[];

    /** Location in source code where content parsing starts */
    baseStart: number;
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
