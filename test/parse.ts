import { strictEqual as equal, deepStrictEqual as deepEqual } from 'assert';
import { parse, ParsedModel, ElementTypeAddon } from '../src';

function tokens(model: ParsedModel): string[] {
    return model.tokens.map(t => t.value);
}

describe('Content parser', () => {
    it('should extract XML tags', () => {
        const m = parse('<div>Lorem <span class="text"><em>ipsum</em>, dolor sit</span> amet.</div>');

        equal(m.content, 'Lorem ipsum, dolor sit amet.');
        deepEqual(tokens(m), ['<div>', '<span class="text">', '<em>', '</em>', '</span>', '</div>']);
    });

    it('should extract content with normalized whitespace', () => {
        const spaces = (model: ParsedModel) => model.tokens.filter(token => token.type === ElementTypeAddon.Space);
        let m: ParsedModel;

        m = parse('<a><b> \t foo\n bar</b></a>');
        equal(m.content, 'foo bar');
        deepEqual(tokens(m), ['<a>', '<b>', ' \t ', '\n ', '</b>', '</a>']);
        deepEqual(spaces(m).map(t => t.offset), [0, 1]);

        m = parse('<a>\t\t<b>foo</b>\n\nbar</a>');
        equal(m.content, 'foo bar');
        deepEqual(tokens(m), ['<a>', '\t\t', '<b>', '</b>', '\n\n', '</a>']);
        deepEqual(spaces(m).map(t => t.offset), [0, 1]);

        m = parse('<a>  <b>  foo </b>bar  </a>');
        equal(m.content, 'foo bar');
        deepEqual(tokens(m), ['<a>', '  ', '<b>', '  ', '</b>', '  ', '</a>']);
        deepEqual(spaces(m).map(t => t.offset), [0, 0, 0]);

        m = parse('<a>  <b>  foo </b> bar  </a>');
        equal(m.content, 'foo bar');
        deepEqual(tokens(m), ['<a>', '  ', '<b>', '  ', '</b>', ' ', '  ', '</a>']);
        deepEqual(spaces(m).map(t => t.offset), [0, 0, 0, 0]);
    });
});
