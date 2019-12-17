import diff from './diff';
import parse, { createConsumer, Consumer } from './consumer';
import createOptions, { Options } from './options';
import { ParsedModel } from './types';

export { diff, parse, createOptions, createConsumer, Options, ParsedModel, Consumer };
export { Token, TokenType, ElementTypeAddon } from './types';

/**
 * Calculates diff between two XML documents and returns `to` document content
 * with diff patches applied to it as `<ins>`/`<del>` tags
 */
export default function diffDocuments(from: string, to: string, options?: Partial<Options>): string {
    const opt = createOptions(options);
    const fromDoc = parse(from, opt);
    const toDoc = parse(to, opt);
    const diffDoc = diff(fromDoc, toDoc, opt);
    return stringify(diffDoc);
}

/**
 * Returns restored source from given parsed model
 */
export function stringify(model: ParsedModel): string {
    let offset = 0;
    return model.tokens.map(token => {
        const result = model.content.slice(offset, token.location) + token.value;
        offset = token.location + (token.offset || 0);
        return result;
    }).join('') + model.content.slice(offset);
}
