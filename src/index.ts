import { ParsedModel } from './types';

export { default as parse, createConsumer } from './consumer';
export { ParsedModel, Token, TokenType, ElementTypeAddon } from './types';
export { default as createOptions, Options } from './options';

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
