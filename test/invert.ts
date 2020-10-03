import fs from 'fs';
import path from 'path';
import { strictEqual as equal } from 'assert';
import diff from '../src';

function read(filePath: string) {
    return fs.readFileSync(path.resolve(__dirname, filePath), 'utf8');
}

describe('Inverted diff', () => {
    it('debug', () => {
        const from = read('samples/doc-from.xml');
        const to = read('samples/doc-to.xml');

        const result = diff(from, to, { wordPatches: true });
        const invert = diff(from, to, { wordPatches: true, invert: true });

        // fs.writeFileSync(path.resolve(__dirname, 'fixtures/from-to.xml'), result);
        // fs.writeFileSync(path.resolve(__dirname, 'fixtures/to-from.xml'), invert);

        equal(result, read('fixtures/from-to.xml'));
        equal(invert, read('fixtures/to-from.xml'));
    });
});
