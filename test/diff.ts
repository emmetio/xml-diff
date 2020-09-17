import fs from 'fs';
import path from 'path';
import { strictEqual as equal } from 'assert';
import diff from '../src';

function read(filePath: string) {
    return fs.readFileSync(path.resolve(__dirname, filePath), 'utf8');
}

function write(filePath: string, content: string) {
    return fs.writeFileSync(path.resolve(__dirname, filePath), content);
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
            '111 <del>222 333 </del><em>444</em> 555'
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
            '<a>111 </a><del>222 </del><b>333</b><c> 444 555</c>'
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
            '111 <em><ins>222</ins></em><ins> </ins>333'
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
            '111 <ins>333 </ins><em><ins>444</ins></em><ins> 555 </ins>222'
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
            '§ 301. <del>Public Printer</del><em><ins>Director of the Government</ins></em><ins> Publishing Office</ins>: appointment'
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

    it('suppress whitespace', () => {
        const from = read('samples/suppress-space-from.xml');
        const to = read('samples/suppress-space-to.xml');

        equal(
            diff(from, to, { wordPatches: true }),
            read('samples/suppress-space-result.xml')
        );
    });

    it.only('invert diff', () => {
        const from = read('samples/doc-from.xml');
        const to = read('samples/doc-to.xml');

        write('fixtures/from-to.xml', diff(from, to, { wordPatches: true }));
        write('fixtures/to-from.xml', diff(from, to, { wordPatches: true, invert: true }));
    });
});
