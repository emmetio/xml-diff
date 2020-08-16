import { strictEqual as equal, deepStrictEqual as deepEqual } from 'assert';
import { parse, stringify, ParsedModel, createOptions } from '../src';

function tokens(model: ParsedModel): string[] {
    return model.tokens.map(t => t.value);
}

describe('XML consumer', () => {
    it('should parse XML', () => {
        const xml = '<div>Lorem <span class="text"><em>ipsum</em>, dolor sit</span> amet.</div>';
        const m = parse(xml);
        equal(m.content, 'Lorem ipsum, dolor sit amet.');
        equal(stringify(m), xml);
    });

    it('should normalize whitespace', () => {
        let xml = '<a><b> \t foo\n bar</b></a>';
        let m = parse(xml);
        equal(m.content, 'foo bar');
        equal(stringify(m), xml);

        xml = '<a>\t\t<b>foo</b>\n\nbar</a>';
        m = parse('<a>\t\t<b>foo</b>\n\nbar</a>');
        equal(m.content, 'foo bar');
        deepEqual(tokens(m), ['<a>', '\t\t', '<b>', '</b>', '\n\n', '</a>']);
        equal(stringify(m), xml);

        xml = '<a>  <b>  foo </b>bar  </a>';
        m = parse(xml);
        equal(m.content, 'foo bar');
        deepEqual(tokens(m), ['<a>', '  ', '<b>', '  ', '</b>', '  ', '</a>']);
        equal(stringify(m), xml);

        xml = '<a>  <b>  foo </b> bar  </a>';
        m = parse(xml);
        equal(m.content, 'foo bar');
        deepEqual(tokens(m), ['<a>', '  ', '<b>', '  ', '</b>', ' ', '  ', '</a>']);
        equal(stringify(m), xml);

        xml = '<div>foo</div><div>bar </div>';
        m = parse(xml, createOptions({ wordPatches: true }));
        equal(m.content, 'foo bar');
        deepEqual(tokens(m), ['<div>', '</div>', '', '<div>', ' ', '</div>']);
        equal(stringify(m), xml);
    });

    it('add whitespace between sections', () => {
        let xml = '<div>aaa</div><div>bbb</div>';
        let m = parse(xml, createOptions({ wordPatches: true }));

        equal(m.content, 'aaa bbb');
        equal(stringify(m), xml);

        xml = '<div>aaa</div> <div>bbb</div>';
        m = parse(xml, createOptions({ wordPatches: true }));

        equal(m.content, 'aaa bbb');
        equal(stringify(m), xml);

        xml = '<div>aaa </div> <div> bbb</div>';
        m = parse(xml, createOptions({ wordPatches: true }));

        equal(m.content, 'aaa bbb');
        equal(stringify(m), xml);
    });
});
