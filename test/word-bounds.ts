import { strictEqual as equal, deepStrictEqual as deepEqual } from 'assert';
import { diff_match_patch, Diff, DIFF_INSERT, DIFF_DELETE, DIFF_EQUAL } from 'diff-match-patch';
import diffDocuments from '../src/index';
import wordBounds from '../src/word-bounds';

function diff(from: string, to: string) {
    const dmp = new diff_match_patch();
    const diffs = dmp.diff_main(from, to);
    dmp.diff_cleanupSemantic(diffs);
    return diffs;
}

function diffFrom(patches: Diff[]) {
    return patches.filter(p => p[0] === DIFF_EQUAL || p[0] === DIFF_DELETE)
        .map(p => p[1])
        .join('');
}

function diffTo(patches: Diff[]) {
    return patches.filter(p => p[0] === DIFF_EQUAL || p[0] === DIFF_INSERT)
        .map(p => p[1])
        .join('');
}

describe('Word bounds', () => {
    it('update start prefix bound in diff', () => {
        let from = 'Experimental design';
        let to = 'Established design';
        let patches = diff(from, to);
        let wordPatches = wordBounds(patches);
        deepEqual(patches, [
            [0, 'E'],
            [-1, 'xperimental'],
            [1, 'stablished'],
            [0, ' design']
        ]);
        deepEqual(wordPatches, [
            [-1, 'Experimental'],
            [1, 'Established'],
            [0, ' design']
        ]);
        equal(diffFrom(wordPatches), from);
        equal(diffTo(wordPatches), to);

        from = 'Experimental';
        to = 'Established';
        patches = diff(from, to);
        wordPatches = wordBounds(patches);
        deepEqual(patches, [
            [0, 'E'],
            [-1, 'xperimental'],
            [1, 'stablished'],
        ]);
        deepEqual(wordPatches, [
            [-1, 'Experimental'],
            [1, 'Established'],
        ]);
        equal(diffFrom(wordPatches), from);
        equal(diffTo(wordPatches), to);
    });

    it('update adjacent patches bounds', () => {
        const from = 'the Committee on Commerce, Science, and Transportation of the Senate';
        const to = 'the Committee on Science, Space, and Technology of the House of Representatives';
        const patches = diff(from, to);
        const wordPatches = wordBounds(patches);

        deepEqual(patches, [
            [0, 'the Committee on '],
            [-1, 'Commer'],
            [1, 'Scien'],
            [0, 'ce, S'],
            [-1, 'cien'],
            [1, 'pa'],
            [0, 'ce, and T'],
            [-1, 'ransportation of the S'],
            [1, 'echnology of the House of Repres'],
            [0, 'en'],
            [1, 't'],
            [0, 'at'],
            [-1, 'e'],
            [1, 'ives']
        ]);
        deepEqual(wordPatches, [
            [0, 'the Committee on '],
            [-1, 'Commerce'],
            [1, 'Science'],
            [0, ', '],
            [-1, 'Science'],
            [1, 'Space'],
            [0, ', and '],
            [-1, 'Transportation of the Senate'],
            [1, 'Technology of the House of Representatives']
        ]);
        equal(diffFrom(wordPatches), from);
        equal(diffTo(wordPatches), to);
    });

    it('numbers', () => {
        const from = 'Price is 1,249,292.0';
        const to = 'Price is 1,259,298.0';
        const patches = diff(from, to);
        const wordPatches = wordBounds(patches);

        deepEqual(patches, [
            [0, 'Price is 1,2'],
            [-1, '4'],
            [1, '5'],
            [0, '9,29'],
            [-1, '2'],
            [1, '8'],
            [0, '.0']
        ]);
        deepEqual(wordPatches, [
            [0, 'Price is '],
            [-1, '1,249,292.0'],
            [1, '1,259,298.0']
        ]);
    });

    it('preserve tag bounds', () => {
        let from = '<header>Objective</header><text>A fundamental objective of NASA aeronautics research</text>';
        let to = '<header>Objective</header><text>One of the fundamental objectives of NASA aeronautics research</text>';
        equal(
            diffDocuments(from, to, { wordPatches: true }),
            '<header>Objective</header><text><del>A</del><ins>One of the</ins> fundamental <del>objective</del><ins>objectives</ins> of NASA aeronautics research</text>');

        from = '<header>Objective</header><text>A fundamental objectives of NASA aeronautics research</text>';
        to = '<header>Objective</header><text>One of the fundamental objective of NASA aeronautics research</text>';
        equal(
            diffDocuments(from, to, { wordPatches: true }),
            '<header>Objective</header><text><del>A</del><ins>One of the</ins> fundamental <del>objectives</del><ins>objective</ins> of NASA aeronautics research</text>');
    });
});
