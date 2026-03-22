import { nodeResolve } from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';

export default {
  input: 'out-tsc/lib/index.js',
  output: {
    file: 'dist/media-optimizer/index.mjs',
    format: 'es',
    sourcemap: true
  },
  plugins: [
    nodeResolve({
      browser: true,
      preferBuiltins: false
    }),
    terser({
      compress: {
        drop_console: false  // keep console.warn/error for user-facing diagnostics
      }
    })
  ]
};
