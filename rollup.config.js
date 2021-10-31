import typescript from 'rollup-plugin-typescript2';
import nodeResolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

export default {
    input: './src/index.ts',
    external: ['@emmetio/scanner', '@emmetio/html-matcher', 'diff-match-patch'],
    plugins: [nodeResolve(), commonjs(), typescript({
        tsconfigOverride: {
            compilerOptions: { module: 'esnext' }
        }
    })],
    output: [{
        file: './dist/xml-diff.es.js',
        format: 'es',
        sourcemap: true
    }, {
        file: './dist/xml-diff.cjs.js',
        format: 'cjs',
        exports: 'named',
        sourcemap: true
    }]
};
