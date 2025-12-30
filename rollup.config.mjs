import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';

export default {
  input: 'dist/media-optimizer/fesm2022/ngx-media-optimizer.mjs',
  output: {
    file: 'dist/media-optimizer/fesm2022/ngx-media-optimizer.mjs',
    format: 'es',
    sourcemap: true
  },
  external: [
    '@angular/core',
    '@angular/common',
    'rxjs',
    'rxjs/operators'
  ],
  plugins: [
    nodeResolve({
      browser: true,
      preferBuiltins: false
    }),
    commonjs(),
    terser({
      compress: {
        drop_console: false  // NO eliminar console.log
      }
    })
  ]
};
