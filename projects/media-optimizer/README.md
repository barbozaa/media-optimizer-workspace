<div align="center">

# ngx-media-optimizer

**Framework-agnostic image optimization library. Works with Angular, React, Vue, and vanilla JS.**

[![NPM Version](https://img.shields.io/npm/v/ngx-media-optimizer?style=flat-square&color=blue)](https://www.npmjs.com/package/ngx-media-optimizer)
[![NPM Downloads](https://img.shields.io/npm/dm/ngx-media-optimizer?style=flat-square&color=green)](https://www.npmjs.com/package/ngx-media-optimizer)
[![Bundle Size](https://img.shields.io/bundlephobia/minzip/ngx-media-optimizer?style=flat-square)](https://bundlephobia.com/package/ngx-media-optimizer)
[![License](https://img.shields.io/npm/l/ngx-media-optimizer?style=flat-square&color=orange)](https://github.com/barbozaa/media-optimizer-workspace/blob/main/LICENSE)
[![Tests](https://img.shields.io/badge/tests-228%20passing-brightgreen?style=flat-square)](https://github.com/barbozaa/media-optimizer-workspace)

</div>

Compress and convert images entirely in the browser — no server, no dependencies. Built on the browser's native `OffscreenCanvas` and `createImageBitmap` APIs, with zero third-party packages.

- **Zero dependencies** — no `browser-image-compression`, no bundled C++ codecs, no surprises
- **Format conversion** — WebP, AVIF, JPEG, PNG
- **Parallel batch processing** — auto-detected concurrency, configurable
- **Binary-search quality** — hits a target file size budget automatically
- **Reactive state** — zero-dependency callback subscriptions, no RxJS, no framework required
- **228 tests passing**

---

## Installation

```bash
npm install ngx-media-optimizer
```

---

## Quick start

### Angular

```typescript
import { Component, inject, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { ImageConverterService, type ImageFile } from 'ngx-media-optimizer';

@Component({
  standalone: true,
  template: `
    <input type="file" multiple accept="image/*" (change)="onFiles($event)" />
    @for (img of images; track img.id) {
      @if (img.status === 'completed') {
        <img [src]="img.compressedUrl" />
        <span>{{ svc.formatBytes(img.originalSize) }} → {{ svc.formatBytes(img.compressedSize) }}</span>
      }
    }
  `
})
export class ImageUploaderComponent implements OnDestroy {
  protected readonly svc = new ImageConverterService();   // plain class — no DI needed
  protected images: ReadonlyArray<ImageFile> = [];
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly unsub = this.svc.onImagesChange(imgs => {
    this.images = imgs;
    this.cdr.markForCheck();
  });

  async onFiles(e: Event): Promise<void> {
    const files = (e.target as HTMLInputElement).files!;
    await this.svc.convertFormat(files, { outputFormat: 'webp', quality: 80 });
  }

  ngOnDestroy(): void {
    this.unsub();
    this.svc.destroy();
  }
}
```

### React

```tsx
import { useEffect, useState } from 'react';
import { ImageConverterService, type ImageFile } from 'ngx-media-optimizer';

// Create once outside the component (or use a context / singleton)
const svc = new ImageConverterService();

export function ImageUploader() {
  const [images, setImages] = useState<ReadonlyArray<ImageFile>>([]);

  useEffect(() => svc.onImagesChange(setImages), []);

  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) {
      await svc.convertFormat(e.target.files, { outputFormat: 'webp', quality: 80 });
    }
  }

  return (
    <>
      <input type="file" multiple accept="image/*" onChange={onFiles} />
      {images.map(img =>
        img.status === 'completed' && (
          <div key={img.id}>
            <img src={img.compressedUrl} />
            <span>{img.originalSize} → {img.compressedSize} bytes</span>
          </div>
        )
      )}
    </>
  );
}
```

### Vue

```vue
<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { ImageConverterService, type ImageFile } from 'ngx-media-optimizer';

const svc = new ImageConverterService();
const images = ref<ReadonlyArray<ImageFile>>([]);
let unsub: (() => void) | undefined;

onMounted(() => { unsub = svc.onImagesChange(imgs => { images.value = imgs; }); });
onUnmounted(() => unsub?.());

async function onFiles(e: Event) {
  const files = (e.target as HTMLInputElement).files!;
  await svc.convertFormat(files, { outputFormat: 'webp', quality: 80 });
}
</script>

<template>
  <input type="file" multiple accept="image/*" @change="onFiles" />
  <template v-for="img in images" :key="img.id">
    <img v-if="img.status === 'completed'" :src="img.compressedUrl" />
  </template>
</template>
```

---

## How it works

Processing pipeline for every image:

1. **`createImageBitmap(file)`** — decode the source image
2. **Stepwise halving** — if the image needs resizing, dimensions are halved iteratively (avoids quality loss from a single large-scale resize)
3. **`OffscreenCanvas.convertToBlob({ type, quality })`** — encode to the target format using the browser's native codec
4. **Binary-search quality** *(when `maxSizeMB` is set)* — up to 5 iterations to find the highest quality that still fits the budget, within ±2% accuracy

Everything runs on the calling thread — there is no worker involved. `useWebWorker` in options is a no-op kept for backward compatibility and will be removed in a future major version.

---

## API — ImageConverterService

The main service. Handles conversion, compression, state, and batch processing.

### `convertFormat(files, options): Promise<void>`

Converts images to a different format.

```typescript
import { ImageConverterService } from 'ngx-media-optimizer';

const svc = new ImageConverterService();

try {
  await svc.convertFormat(files, {
    outputFormat: 'webp',   // required
    quality: 80,            // 0–100, default 80
    maxSizeMB: 1,           // target file size budget
    maxWidthOrHeight: 1920, // default 1920
    concurrency: 4,         // default: auto-detected from navigator.hardwareConcurrency
    sortOrder: 'asc',       // 'asc' | 'desc' | 'none' — sort by size before processing
  });
} catch (err) {
  console.error(err);
}
```

### `compressImages(files, options): Promise<void>`

Same as `convertFormat` but keeps the original format.

```typescript
await svc.compressImages(files, {
  quality: 85,
  maxSizeMB: 0.5,
});
```

### `abortProcessing(): void`

Cancels any in-flight processing. Already-completed images are kept; pending ones become `'error'`.

```typescript
svc.abortProcessing();
```

### `removeAllImages(): void`

Clears the image list and revokes all object URLs.

### `destroy(): void`

Releases all resources held by the service instance. Revokes all blob URLs, clears all event listeners, and cancels pending download timers. Call this when the owning component is destroyed.

```typescript
// Angular
ngOnDestroy(): void { this.svc.destroy(); }

// React
useEffect(() => () => svc.destroy(), []);

// Vue
onUnmounted(() => svc.destroy());
```

### State subscriptions

All callbacks return an unsubscribe function. Call it in `ngOnDestroy` / `useEffect` cleanup / `onUnmounted`.

```typescript
const unsub = svc.onImagesChange(images => { /* ... */ });
const unsub2 = svc.onUploadingChange(isUploading => { /* ... */ });
const unsub3 = svc.onProgressChange(progress => { /* ... */ });

// cleanup
unsub();
```

### State getters

```typescript
svc.images              // ReadonlyArray<ImageFile>
svc.completedImages     // only status === 'completed'
svc.completedCount      // number

svc.totalOriginalSize   // bytes
svc.totalCompressedSize // bytes
svc.savingsPercentage   // 0–100

svc.isUploading         // boolean
svc.uploadProgress      // 0–100
```

### Utility methods

```typescript
svc.formatBytes(1536000)                        // "1.46 MB"
svc.getImageSize(file)                          // "2.38 MB"
svc.getSavingsPercentage(1000000, 600000)       // 40
```

---

## API — ImageUtilsService

Standalone utility service. Fully independent — use it without `ImageConverterService` if you only need analysis or validation.

### Validation

```typescript
import { ImageUtilsService } from 'ngx-media-optimizer';

const utils = new ImageUtilsService();

// Check if a file is a supported image
utils.isValidImage(file)  // boolean — checks MIME type and extension

// Check if a file exceeds a size threshold
utils.needsCompression(file, 1)  // boolean — true if file > 1 MB
```

### Image analysis

```typescript
// Dimensions (cached after first call)
const { width, height } = await utils.getImageDimensions(file);

// Full info object (cached)
const info = await utils.getImageInfo(file);
// { name, size, formattedSize, format, width, height, aspectRatio, aspectRatioString }

// Transparency (cached) — useful before converting to JPEG
const transparent = await utils.hasTransparency(file);

// Animated GIF/WebP detection (cached)
const animated = await utils.isAnimated(file);

// Dominant color as hex string
const color = await utils.getDominantColor(file);  // e.g. "#3a7bd5"
```

### Format capabilities

```typescript
// Which formats does this browser actually support?
const formats = await utils.getSupportedFormats();
// e.g. ['webp', 'avif', 'jpeg', 'png']
```

Uses `OffscreenCanvas.convertToBlob` to probe each format — results reflect what the browser can actually encode, not just what it can decode.

### Size estimation

```typescript
// Estimate compressed size without encoding (synchronous heuristic)
const bytes = utils.estimateCompressedSize(file, 80, 'webp');

// Find the highest quality level that fits a size budget (binary search, up to 5 iterations)
const quality = utils.getBestQuality(file, 0.5, 'webp');  // quality for ≤ 0.5 MB
```

`estimateCompressedSize` is a fast synchronous heuristic based on file size and quality. `getBestQuality` does the actual binary search — call it before processing if you need an accurate quality recommendation.

### Thumbnail

```typescript
const thumb = await utils.createThumbnail(file, 200);  // max 200px on longest side
```

### Batch validation

```typescript
const results = await utils.validateBatch(fileList, {
  maxSizeMB: 5,
  minSizeMB: 0,
  maxWidth: 4000,
  maxHeight: 4000,
});
// results: Array<{ file: File; valid: boolean; errors: string[] }>
```

### Cache

All async methods cache results in LRU caches (O(1) hit/eviction). Cache is per-service-instance.

```typescript
utils.clearCache();
utils.getCacheStats();
// { dimensions: number; info: number; transparency: number; dominantColor: number }
```

---

## Types

### `ImageFile` (discriminated union)

```typescript
type ImageFile =
  | { id: string; name: string; originalSize: number; originalUrl: string; quality: number; status: 'pending' | 'processing' | 'error' }
  | { id: string; name: string; originalSize: number; originalUrl: string; quality: number; status: 'completed'; compressedSize: number; compressedUrl: string };
```

`compressedUrl` and `compressedSize` are only accessible after narrowing on `status === 'completed'`. TypeScript enforces this.

```typescript
if (img.status === 'completed') {
  console.log(img.compressedUrl);  // safe
  console.log(img.compressedSize); // safe
}
```

`CompletedImageFile` is exported as a convenience alias:

```typescript
import type { CompletedImageFile } from 'ngx-media-optimizer';

function render(img: CompletedImageFile) {
  return `<img src="${img.compressedUrl}" />`;
}
```

### `ConvertOptions` / `CompressOptions`

```typescript
interface BaseProcessOptions {
  quality?: number;           // 0–100, default 80
  maxSizeMB?: number;         // default 10
  maxWidthOrHeight?: number;  // default 1920
  concurrency?: number;       // default: navigator.hardwareConcurrency / 2
  sortOrder?: 'asc' | 'desc' | 'none';  // default 'asc' (smallest first)
}

interface ConvertOptions extends BaseProcessOptions {
  outputFormat: 'webp' | 'jpeg' | 'png' | 'avif';  // required
}

interface CompressOptions extends BaseProcessOptions {}
```

### `ImageFormat`

```typescript
type ImageFormat = 'webp' | 'jpeg' | 'png' | 'avif';
```

### `ImageInfo`

```typescript
interface ImageInfo {
  name: string;
  size: number;
  formattedSize: string;
  format: string;       // e.g. "image/jpeg"
  width: number;
  height: number;
  aspectRatio: number;
  aspectRatioString: string;  // e.g. "16:9"
}
```

### Error classes

```typescript
import { ValidationError, AbortError, CompressionError } from 'ngx-media-optimizer';

try {
  await svc.convertFormat(files, opts);
} catch (err) {
  if (err instanceof ValidationError)  { /* invalid file */ }
  if (err instanceof AbortError)       { /* abortProcessing() was called */ }
  if (err instanceof CompressionError) { /* codec failure */ }
}
```

---

## Migration from v1 to v2

v2 has **one breaking change**: `browser-image-compression` has been removed as a dependency. The library now encodes natively via `OffscreenCanvas`. For most use cases this is transparent — results will be slightly different (native codec quality curves differ from libvips), but the API is unchanged.

**Removed in v2.0.1:**
- `useWebWorker` option — remove it from your options objects

**Renamed in v2:**
| v1 | v2 |
|---|---|
| `validateImage(file)` | `isValidImage(file)` |
| `shouldCompress(file, n)` | `needsCompression(file, n)` |

**New in v2:**
- `getSupportedFormats()` — probe actual codec support
- `estimateCompressedSize(file, quality, format?)` — fast size heuristic
- `getBestQuality(file, targetMB, format?)` — binary-search quality
- `hasTransparency(file)` — before converting to JPEG
- `isAnimated(file)` — detect animated GIF / WebP
- `sortOrder` option on all operations

---

## Contributing

```bash
git clone https://github.com/barbozaa/media-optimizer-workspace.git
cd media-optimizer-workspace
npm install

# run the 228 tests
npx vitest run

# build the library
npm run build:lib
```

---

## License

MIT © [Barboza](https://github.com/barbozaa)
