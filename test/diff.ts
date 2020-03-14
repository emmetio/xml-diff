import { strictEqual as equal } from 'assert';
import diff from '../src';

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
    });
});