import { strictEqual as equal, deepStrictEqual as deepEqual } from 'assert';
import { parse, slice } from '../src';

describe('XML Slice', () => {
    it.only('slice', () => {
        const doc = parse('<div>aaa <a>foo <b>bar</b> baz</a> bbb</div>');

        // Simple cases: full tag overlap
        let s = slice(doc, 4, 15);
        equal(s.toString('ins'), '<ins><a>foo <b>bar</b> baz</a></ins>');
        deepEqual(s.range, [1, 4]);

        s = slice(doc, 6, 11);
        equal(s.toString('ins'), '<ins>o <b>bar</b></ins>');
        deepEqual(s.range, [2, 3]);

        // Overlap opened tag
        s = slice(doc, 2, 11);
        equal(s.toString('ins'), '<ins>a </ins><a><ins>foo <b>bar</b></ins>');
        deepEqual(s.range, [1, 3]);

        // Overlap two opened tag
        s = slice(doc, 2, 10);
        equal(s.toString('ins'), '<ins>a </ins><a><ins>foo </ins><b><ins>ba</ins>');
        deepEqual(s.range, [1, 2]);

        // Overlap closed tag
        s = slice(doc, 8, 15);
        equal(s.toString('ins'), '<ins><b>bar</b> baz</ins>');
        deepEqual(s.range, [2, 3]);

        // TODO check for edge cases when range end touches multiple closing tags
    });
});
