/**
 * Post-build script: prepares dist/media-optimizer/ for packaging.
 *
 * Runs AFTER `tsc` and `rollup` have already written their outputs to:
 *   - out-tsc/lib/    (TypeScript declarations + compiled JS)
 *   - dist/media-optimizer/index.mjs  (rollup bundle)
 *
 * This script:
 *   1. Copies all .d.ts/.d.ts.map files from out-tsc/lib → dist/media-optimizer/
 *   2. Copies README.md, CHANGELOG.md, LICENSE from the lib project
 *   3. Writes a clean dist/package.json with correct entry points
 */

import { statSync, copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join, relative, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT    = join(__dirname, '..');
const OUT_TSC = join(ROOT, 'out-tsc', 'lib');
const DIST    = join(ROOT, 'dist', 'media-optimizer');
const LIB_SRC = join(ROOT, 'projects', 'media-optimizer');

// ── 1. Copy .d.ts / .d.ts.map files preserving directory structure ────────────

function copyDeclarations(srcDir, destDir) {
  for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath  = join(srcDir,  entry.name);
    const destPath = join(destDir, entry.name);
    if (entry.isDirectory()) {
      mkdirSync(destPath, { recursive: true });
      copyDeclarations(srcPath, destPath);
    } else if (entry.name.endsWith('.d.ts') || entry.name.endsWith('.d.ts.map')) {
      copyFileSync(srcPath, destPath);
    }
  }
}

mkdirSync(DIST, { recursive: true });
copyDeclarations(OUT_TSC, DIST);
console.log('✓ declarations copied → dist/media-optimizer/');

// ── 2. Copy static assets ─────────────────────────────────────────────────────

for (const file of ['README.md', 'CHANGELOG.md', 'LICENSE']) {
  const from = join(LIB_SRC, file);
  if (existsSync(from)) {
    copyFileSync(from, join(DIST, file));
  }
}
console.log('✓ assets copied (README, CHANGELOG, LICENSE)');

// ── 3. Write dist/package.json with correct entry points ──────────────────────

const srcPkg = JSON.parse(readFileSync(join(LIB_SRC, 'package.json'), 'utf8'));

const distPkg = {
  name:        srcPkg.name,
  version:     srcPkg.version,
  description: srcPkg.description,
  keywords:    srcPkg.keywords,
  author:      srcPkg.author,
  license:     srcPkg.license,
  repository:  srcPkg.repository,
  bugs:        srcPkg.bugs,
  homepage:    srcPkg.homepage,

  // Entry points
  main:    'index.mjs',
  module:  'index.mjs',
  types:   'index.d.ts',
  exports: {
    '.': {
      types:   './index.d.ts',
      import:  './index.mjs',
      default: './index.mjs',
    },
    './package.json': './package.json',
  },

  sideEffects: false,
};

console.log('✓ dist/media-optimizer/package.json written');
