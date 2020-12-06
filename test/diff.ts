import fs from 'fs';
import path from 'path';
import { strictEqual as equal } from 'assert';
import diff from '../src';

function read(filePath: string) {
    return fs.readFileSync(path.resolve(__dirname, filePath), 'utf8');
}

describe('Diff documents', () => {
    it('diff delete', () => {
        equal(
            diff(
                '111 222 <em>333</em> 555',
                '111 555'
            ),
            '111 <del>222 333 </del>555'
        );

        equal(
            diff(
                '111 222 <em>333</em> 555',
                '111 555'
            ),
            '111 <del>222 333 </del>555'
        );

        equal(
            diff(
                '111 222 <em>333 444</em> 555',
                '111 <em>444</em> 555'
            ),
            '111 <em><del>222 333 </del>444</em> 555'
        );

        equal(
            diff(
                '111 <em>222 333</em> 444 555',
                '111 <em>222</em> 555'
            ),
            '111 <em>222</em> <del>333 444 </del>555'
        );
    });

    it('diff delete at the beginning of tag', () => {
        equal(
            diff(
                '<a>111 </a><b>222 333</b><c> 444 555</c>',
                '<a>111 </a><b>333</b><c> 444 555</c>',
            ),
            '<a>111 </a><b><del>222 </del>333</b><c> 444 555</c>'
        );

        equal(
            diff(
                '<a>111 </a>222 <b>333</b><c> 444 555</c>',
                '<a>111 </a><b>333</b><c> 444 555</c>',
            ),
            '<a>111 </a><b><del>222 </del>333</b><c> 444 555</c>'
        );
    });

    it('diff insert', () => {
        equal(
            diff(
                '111 333',
                '111 222 333'
            ),
            '111 <ins>222 </ins>333'
        );

        equal(
            diff(
                '111 333',
                '111 <em>222</em> 333'
            ),
            '111 <ins><em>222</em> </ins>333'
        );

        equal(
            diff(
                '111 <em>222</em> 333',
                '111 444 <em>555 222</em> 333'
            ),
            '111 <ins>444 </ins><em><ins>555 </ins>222</em> 333'
        );

        equal(
            diff(
                '111 <em>222</em> 333',
                '111 <em>222 444</em> 555 333'
            ),
            '111 <em>222 <ins>444</ins></em><ins> 555 </ins>333'
        );

        equal(
            diff(
                '111 222',
                '111 333 <em>444</em> 555 222'
            ),
            '111 <ins>333 <em>444</em> 555 </ins>222'
        );

        equal(
            diff(
                '111 <em>222</em> <span>333</span> 444',
                '111 <em>222 555</em> 888 <span>777 333</span> 444'
            ),
            '111 <em>222 <ins>555</ins></em><ins> 888 </ins><span><ins>777 </ins>333</span> 444'
        );
    });

    it('diff both', () => {
        equal(
            diff(
                'CHAPTER 3—GOVERNMENT PRINTING OFFICE',
                'CHAPTER 3—GOVERNMENT PUBLISHING OFFICE'
            ),
            'CHAPTER 3—GOVERNMENT P<del>RINT</del><ins>UBLISH</ins>ING OFFICE'
        );

        equal(
            diff(
                'CHAPTER 3—GOVERNMENT PRINTING OFFICE',
                'CHAPTER 3—GOVERNMENT PUBLISHING OFFICE',
                { wordPatches: true }
            ),
            'CHAPTER 3—GOVERNMENT <del>PRINTING</del><ins>PUBLISHING</ins> OFFICE'
        );

        equal(
            diff(
                '§ 301. Public Printer: appointment',
                '§ 301. <em>Director of the Government</em> Publishing Office: appointment'
            ),
            '§ 301. <em><del>Public Printer</del><ins>Director of the Government</ins></em><ins> Publishing Office</ins>: appointment'
        );

        equal(
            diff(
                'The President of the United States shall nominate and, by and with the advice and consent of the Senate, appoint a suitable person, who must be a practical printer and versed in the art of bookbinding, to take charge of and manage the Government Printing Office. His title shall be Public Printer.',
                'The President of the United States shall nominate and, by and with the advice and consent of the Senate, appoint a suitable person to take charge of and manage the Government Publishing Office. The title shall be Director of the Government Publishing Office.'
            ),
            'The President of the United States shall nominate and, by and with the advice and consent of the Senate, appoint a suitable person<del>, who must be a practical printer and versed in the art of bookbinding,</del> to take charge of and manage the Government P<del>rint</del><ins>ublish</ins>ing Office. <del>His</del><ins>The</ins> title shall be <del>Public Printer</del><ins>Director of the Government Publishing Office</ins>.'
        );

        equal(
            diff(
                'The President of the United States shall nominate and, by and with the advice and consent of the Senate, appoint a suitable person, who must be a practical printer and versed in the art of bookbinding, to take charge of and manage the Government Printing Office. His title shall be Public Printer.',
                'The President of the United States shall nominate and, by and with the advice and consent of the Senate, appoint a suitable person to take charge of and manage the Government Publishing Office. The title shall be Director of the Government Publishing Office.',
                { wordPatches: true }
            ),
            'The President of the United States shall nominate and, by and with the advice and consent of the Senate, appoint a suitable person<del>, who must be a practical printer and versed in the art of bookbinding,</del> to take charge of and manage the Government <del>Printing</del><ins>Publishing</ins> Office. <del>His</del><ins>The</ins> title shall be <del>Public Printer</del><ins>Director of the Government Publishing Office</ins>.'
        );
    });

    it('diff with preserved elements', () => {
        equal(
            diff(
                '111 <span>222 <em>333</em></span> 555',
                '111 555',
                { preserveTags: ['em'] }
            ),
            '111 <del>222 <em>333</em> </del>555'
        );

        equal(
            diff(
                '111 <span>222 3<em>3</em>3</span> 555',
                '111 222 555',
                { preserveTags: ['span', 'em'] }
            ),
            '111 222 <del><span>3<em>3</em>3</span> </del>555'
        );

        equal(
            diff(
                '111 <span>222 3<em>3</em>3</span> 555',
                '888 111 222 555',
                { preserveTags: ['span', 'em'] }
            ),
            '<ins>888 </ins>111 222 <del><span>3<em>3</em>3</span> </del>555'
        );
    });

    it('diff on element edge', () => {
        equal(
            diff(
                '<p>111</p>',
                '<p>222 111</p>'
            ),
            '<p><ins>222 </ins>111</p>'
        );

        equal(
            diff(
                '<p>test 1</p>',
                '<p>hello test 2</p>'
            ),
            '<p><ins>hello </ins>test <del>1</del><ins>2</ins></p>'
        );

        equal(
            diff(
                '<content>Section <em>content</em> 1</content>',
                '<content>Section <em>word</em> 1</content>',
            ),
            '<content>Section <em><del>content</del><ins>word</ins></em> 1</content>'
        );

        equal(
            diff(
                '<doc><section>A fundamental objective of NASA</section></doc>',
                '<doc><section>One <a>of</a> the fundamental objectives of NASA</section></doc>',
                { compact: true }
            ),
            '<doc><section><del>A</del><ins>One <a>of</a> the</ins> fundamental objective<ins>s</ins> of NASA</section></doc>'
        );

        equal(
            diff(
                '<doc>\n\t<section>A fundamental objective of NASA</section>\n</doc>',
                '<doc>\n\t<section>One <a>of</a> the fundamental objectives of NASA</section>\n</doc>',
                { compact: true }
            ),
            '<doc>\n\t<section><del>A</del><ins>One <a>of</a> the</ins> fundamental objective<ins>s</ins> of NASA</section>\n</doc>'
        );
    });

    it('compact whitespace', () => {
        equal(
            diff(
                '<p>test1</p>',
                '<p>test 1</p>',
                { compact: true }
            ),
            '<p>test<ins> </ins>1</p>'
        );

        equal(
            diff(
                '<p>test1</p><p>test2</p>',
                '<p>test1</p>\n\n\t\t\t<p>test2</p>',
                { compact: true }
            ),
            '<p>test1</p>\n\n\t\t\t<p>test2</p>'
        );
    });

    it('suppress whitespace', () => {
        const from = read('samples/suppress-space-from.xml');
        const to = read('samples/suppress-space-to.xml');

        equal(
            diff(
                read('samples/suppress-space-from2.xml'),
                read('samples/suppress-space-to2.xml'),
                { wordPatches: true, preserveTags: ['line'], }
            ),
            read('fixtures/suppress-space2.xml')
        );

        equal(
            diff(from, to, { wordPatches: true }),
            read('samples/suppress-space-result.xml')
        );

        equal(
            diff(
                '<p>foo (\n\t\t\t<span>bar</span>) baz</p>',
                '<p>foo (bar) baz</p>',
                { compact: true }
            ),
            '<p>foo (<del>\n\t\t\t</del>bar) baz</p>'
        );
    });

    it('mark as replaced', () => {
        equal(diff('<p>foo1 baz</p>', '<p>bar1 baz</p>'), '<p><del>foo</del><ins>bar</ins>1 baz</p>');
        equal(diff('<p>foo1 baz</p>', '<p>bar1 baz</p>', { replaceThreshold: 0.4 }), '<p><del>foo1 baz</del><ins>bar1 baz</ins></p>');
    });

    it.skip('debug', () => {
        const from = read('samples/line-nums-before.xml');
        const to = read('samples/line-nums-after.xml');

        console.log(diff(from, to, { preserveTags: ['line'] }));

        // equal(
        //     diff(from, to, { wordPatches: true }),
        //     read('samples/suppress-space-result.xml')
        // );
    });
});
