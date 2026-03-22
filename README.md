<div align="center">

# ngx-media-optimizer

**Framework-agnostic image optimization library. Compress and convert images in the browser — no server, no dependencies.**

[![NPM Version](https://img.shields.io/npm/v/ngx-media-optimizer?style=flat-square&color=blue)](https://www.npmjs.com/package/ngx-media-optimizer)
[![NPM Downloads](https://img.shields.io/npm/dm/ngx-media-optimizer?style=flat-square&color=green)](https://www.npmjs.com/package/ngx-media-optimizer)
[![Bundle Size](https://img.shields.io/bundlephobia/minzip/ngx-media-optimizer?style=flat-square)](https://bundlephobia.com/package/ngx-media-optimizer)
[![License](https://img.shields.io/npm/l/ngx-media-optimizer?style=flat-square&color=orange)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-228%20passing-brightgreen?style=flat-square)](#testing)

</div>

---

## What this is

`ngx-media-optimizer` is a TypeScript library that converts and compresses images entirely on the client side, using the browser's native `OffscreenCanvas` and `createImageBitmap` APIs. No server round-trips, no C++ WASM blobs, no third-party image libraries.

Formats supported: **WebP · AVIF · JPEG · PNG**

Works with Angular, React, Vue, and plain JavaScript. **Zero runtime dependencies.**

---

## Install

```bash
npm install ngx-media-optimizer
```

For the full API reference and framework-specific quick starts see the **[package README](projects/media-optimizer/README.md)**.

---

## Highlights

- **Zero extra dependencies** — native `OffscreenCanvas` replaces `browser-image-compression`
- **Parallel batch processing** — auto-detected concurrency, configurable via `concurrency` option
- **Binary-search quality** — finds the highest quality that fits a `maxSizeMB` budget (5 iterations, ±2%)
- **Stepwise halving resize** — avoids quality loss from a single large downscale
- **Discriminated union state** — `compressedUrl` / `compressedSize` only accessible after `status === 'completed'`
- **Reactive callbacks** — framework-agnostic `onImagesChange` / `onUploadingChange` pattern
- **ImageUtilsService** — standalone utility for validation, analysis, thumbnails, and format probing
- **228 tests**

---

## Quick example

```typescript
import { ImageConverterService } from 'ngx-media-optimizer';

const svc = new ImageConverterService();

svc.onImagesChange(images => console.log(images));

await svc.convertFormat(fileList, {
  outputFormat: 'webp',
  quality: 80,
  maxSizeMB: 1,
});
```

---

## What''s new in v2

| | v1 | v2 |
|---|---|---|
| Encoding engine | `browser-image-compression` (libvips) | Native `OffscreenCanvas` |
| Dependencies | 1 | 0 |
| `getSupportedFormats()` | — | Probes actual browser codec support |
| `estimateCompressedSize()` | — | Fast synchronous heuristic |
| `getBestQuality()` | — | Binary-search quality for a target size |
| `hasTransparency()` | — | Useful before converting PNG → JPEG |
| `isAnimated()` | — | Detects animated GIF / WebP |
| `sortOrder` option | — | Sort batch by file size before processing |
| `useWebWorker` | Feature | Removed in v2.0.1 |

**Breaking change:** Encoding results will differ slightly from v1 because native codec quality curves differ from libvips. The API is otherwise unchanged, apart from method renames:

| v1 | v2 |
|---|---|
| `validateImage(file)` | `isValidImage(file)` |
| `shouldCompress(file, n)` | `needsCompression(file, n)` |

---

## Repository structure

```
media-optimizer-workspace/
├── projects/
│   └── media-optimizer/        # The npm library
│       ├── src/lib/
│       │   ├── media-optimizer.service.ts   # ImageConverterService
│       │   ├── image-utils.service.ts       # ImageUtilsService
│       │   └── shared/
│       │       ├── image-codec.ts           # NativeImageCodec (OffscreenCanvas pipeline)
│       │       ├── image-helpers.ts
│       │       ├── lru-cache.ts
│       │       ├── subject.ts               # Zero-dep reactive primitive
│       │       └── types.ts
│       └── README.md                        # API docs published to npm
├── angular.json
├── rollup.config.mjs
└── CHANGELOG.md
```

---

## Development

### Setup

```bash
git clone https://github.com/barbozaa/media-optimizer-workspace.git
cd media-optimizer-workspace
npm install
```

### Commands

| Command | What it does |
|---|---|
| `npm run build:lib` | Build + rollup the library into `dist/media-optimizer/` |
| `npm run pack:lib` | Build + pack a local `.tgz` for testing |
| `npx vitest run` | Run the 228 tests |
| `npx vitest --watch` | Run tests in watch mode |

### Testing

```bash
npx vitest run
```

228 tests across `image-utils.service.spec.ts` and `media-optimizer.service.spec.ts`.

### Publishing

```bash
npm run build:lib
cd dist/media-optimizer
npm publish
```

---

## Contributing

Issues and pull requests are welcome. Please open an issue first if you are planning a large change.

---

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

---

## License

MIT © [Barboza](https://github.com/barbozaa)
