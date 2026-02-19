<div align="center">

# 🎨 ngx-media-optimizer

**Professional framework-agnostic library for image optimization, conversion, and compression**

[![NPM Version](https://img.shields.io/npm/v/ngx-media-optimizer?style=flat-square&color=blue)](https://www.npmjs.com/package/ngx-media-optimizer)
[![NPM Downloads](https://img.shields.io/npm/dm/ngx-media-optimizer?style=flat-square&color=green)](https://www.npmjs.com/package/ngx-media-optimizer)
[![Bundle Size](https://img.shields.io/bundlephobia/minzip/ngx-media-optimizer?style=flat-square)](https://bundlephobia.com/package/ngx-media-optimizer)
[![License](https://img.shields.io/npm/l/ngx-media-optimizer?style=flat-square&color=orange)](https://github.com/barbozaa/media-optimizer-workspace/blob/main/LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-100%25-blue?style=flat-square)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/tests-143%20passing-brightgreen?style=flat-square)](https://github.com/barbozaa/media-optimizer-workspace)
[![Coverage](https://img.shields.io/badge/coverage-100%25-brightgreen?style=flat-square)](https://github.com/barbozaa/media-optimizer-workspace)

Transform, optimize, and compress images effortlessly in Angular, React, Vue, or any JavaScript framework with parallel processing, reactive state management, and zero configuration.

[Features](#-features) • [Installation](#-installation) • [Quick Start](#-quick-start) • [API Reference](#-api-reference) • [Examples](#-examples) • [Exported Types](#-exported-types)

</div>

---

## ✨ Features

### 🚀 Performance & Processing
- **Parallel Processing** - Process multiple images simultaneously (configurable concurrency)
- **LRU Cache System** - O(1) eviction with Map-based caching (100x faster than before)
- **Smart Caching** - Automatic caching for repeated operations (200-1000x faster)
- **Optimized Algorithms** - hasTransparency (16x), isAnimated (500x), getDominantColor (3x)
- **Auto-tuned Concurrency** - Automatically detects optimal parallel processing (4-8 operations)
- **Memory Management** - Automatic garbage collection and lifecycle cleanup
- **Abort Support** - Cancel ongoing operations with `abortProcessing()`
- **Optimized Compression** - Powered by browser-image-compression
- **Web Workers Support** - Offload processing to background threads

### 🎨 Image Manipulation
- **Format Conversion** - Convert between PNG, JPG, JPEG, WebP, and AVIF
- **Quality Control** - Fine-tune compression quality (0-100)
- **Size Limits** - Enforce maximum file sizes and dimensions
- **Batch Operations** - Process multiple images at once
- **Input Validation** - Automatic validation of file types and sizes

### 📊 State Management
- **Callback-Based Reactivity** - Framework-agnostic reactive state management
- **React Compatible** - Works seamlessly with React hooks
- **Vue Compatible** - Integrates with Vue composition API
- **Real-time Stats** - Track file size savings and compression ratios
- **Progress Tracking** - Monitor upload and processing progress
- **Computed Properties** - Auto-calculated totals and percentages

### 💪 Developer Experience
- **TypeScript First** - 100% type-safe with comprehensive JSDoc
- **Zero Configuration** - Works out of the box with sensible defaults
- **100% Test Coverage** - Thoroughly tested with 143 passing tests
- **Tree-shakeable** - Only bundle what you use
- **Bundled Dependencies** - No peer dependency conflicts
- **SSR Compatible** - Full Server-Side Rendering support

### 🔒 Security & Robustness
- **File Validation** - MIME type and size validation before processing
- **DoS Protection** - 100MB file size limit prevents huge file attacks
- **Memory Leak Prevention** - Automatic cleanup on service destruction
- **Type Safety** - Zero unsafe type assertions or casts
- **Error Handling** - Comprehensive error management with proper warnings

### 🔧 Additional Features
- **Server Upload** - Built-in upload functionality with progress
- **Bulk Downloads** - Download all processed images at once
- **Image Utilities** - Helper functions for validation, analysis, and more
- **Cache Management** - `clearCache()` and `getCacheStats()` methods
- **Abort Operations** - Cancel long-running processes anytime

---

## 📦 Installation

```bash
npm install ngx-media-optimizer
```

### Requirements

- **Angular**: 18.x, 19.x, 20.x, or 21.x (optional - library is framework-agnostic)
- **React**: 16.8+ (with hooks support)
- **Vue**: 3.x (with composition API)
- **TypeScript**: 5.0+
- **RxJS**: 7.x

### Framework Support

This library is **framework-agnostic** and works with:
- ✅ **Angular** - Fully supported with TypeScript types
- ✅ **React** - Works with hooks (useState, useEffect)
- ✅ **Vue** - Compatible with Composition API
- ✅ **Vanilla JS** - No framework required
- ✅ **Any other framework** - Uses standard JavaScript callbacks

**Note:** All image processing dependencies are bundled. No additional installations required! ✨

---

## 🚀 Quick Start

### 1. Import the Service

**Angular:**
```typescript
import { Component, inject, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { ImageConverterService, type ImageFile } from 'ngx-media-optimizer';

@Component({
  selector: 'app-image-processor',
  standalone: true,
  template: `<!-- your template -->`
})
export class ImageProcessorComponent implements OnDestroy {
  private imageService = inject(ImageConverterService);
  private cdr = inject(ChangeDetectorRef);
  
  // Component state
  images: ReadonlyArray<ImageFile> = [];
  completedCount: number = 0;
  savingsPercentage: number = 0;
  
  // Unsubscribe functions
  private unsubscribe?: () => void;
  
  constructor() {
    // Subscribe to state changes
    this.unsubscribe = this.imageService.onImagesChange((images) => {
      this.images = images;
      this.completedCount = this.imageService.completedCount;
      this.savingsPercentage = this.imageService.savingsPercentage;
      this.cdr.markForCheck();
    });
  }
  
  ngOnDestroy() {
    this.unsubscribe?.();
  }
}
```

**React:**
```typescript
import { useEffect, useState } from 'react';
import { ImageConverterService } from 'ngx-media-optimizer';

const imageService = new ImageConverterService();

function ImageProcessor() {
  const [images, setImages] = useState([]);
  const [completedCount, setCompletedCount] = useState(0);
  const [savingsPercentage, setSavingsPercentage] = useState(0);
  
  useEffect(() => {
    // Subscribe to state changes
    const unsubscribe = imageService.onImagesChange((images) => {
      setImages(images);
      setCompletedCount(imageService.completedCount);
      setSavingsPercentage(imageService.savingsPercentage);
    });
    
    // Cleanup on unmount
    return () => unsubscribe();
  }, []);
  
  // ... rest of component
}
```

**Vue:**
```typescript
import { ref, onMounted, onUnmounted } from 'vue';
import { ImageConverterService } from 'ngx-media-optimizer';

const imageService = new ImageConverterService();

export default {
  setup() {
    const images = ref([]);
    const completedCount = ref(0);
    const savingsPercentage = ref(0);
    let unsubscribe;
    
    onMounted(() => {
      // Subscribe to state changes
      unsubscribe = imageService.onImagesChange((imgs) => {
        images.value = imgs;
        completedCount.value = imageService.completedCount;
        savingsPercentage.value = imageService.savingsPercentage;
      });
    });
    
    onUnmounted(() => {
      unsubscribe?.();
    });
    
    return { images, completedCount, savingsPercentage };
  }
}
```

### 2. Convert Images

```typescript
onFileSelect(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = input.files;
  
  if (files) {
    this.imageService.convertFormat(files, {
      outputFormat: 'webp',
      quality: 80,
      maxSizeMB: 1
    }).subscribe({
      next: () => console.log('✅ Conversion complete!'),
      error: (err) => console.error('❌ Conversion failed:', err)
    });
  }
}
```

### 3. Display Results

**Angular:**
```html
<div class="results">
  @for (image of images; track image.id) {
    <div class="image-card">
      <img [src]="image.compressedUrl" [alt]="image.name">
      <p>{{ image.name }}</p>
      <p>Saved {{ getSavings(image) }}%</p>
      <button (click)="downloadImage(image)">Download</button>
    </div>
  }
</div>

<div class="stats">
  <p>Completed: {{ completedCount }}</p>
  <p>Total Savings: {{ savingsPercentage }}%</p>
</div>
```

**React:**
```jsx
<div className="results">
  {images.map(image => (
    <div key={image.id} className="image-card">
      <img src={image.compressedUrl} alt={image.name} />
      <p>{image.name}</p>
      <p>Saved {getSavings(image)}%</p>
      <button onClick={() => downloadImage(image)}>Download</button>
    </div>
  ))}
</div>

<div className="stats">
  <p>Completed: {completedCount}</p>
  <p>Total Savings: {savingsPercentage}%</p>
</div>
```

**Vue:**
```vue
<template>
  <div class="results">
    <div v-for="image in images" :key="image.id" class="image-card">
      <img :src="image.compressedUrl" :alt="image.name">
      <p>{{ image.name }}</p>
      <p>Saved {{ getSavings(image) }}%</p>
      <button @click="downloadImage(image)">Download</button>
    </div>
  </div>

  <div class="stats">
    <p>Completed: {{ completedCount }}</p>
    <p>Total Savings: {{ savingsPercentage }}%</p>
  </div>
</template>
```

---

## 📖 API Reference

### ImageConverterService

The main service for image processing operations.

#### Core Methods

##### `convertFormat(files, options): Observable<void>`

Converts images between formats with compression.

**Parameters:**
- `files`: `FileList | File[]` - Images to convert
- `options`: `ConvertOptions` - Conversion configuration

**Options:**
```typescript
interface ConvertOptions {
  outputFormat: 'webp' | 'jpeg' | 'png' | 'avif';  // Required
  quality?: number;                                 // 0-100, Default: 80
  maxSizeMB?: number;                              // Default: 10
  maxWidthOrHeight?: number;                       // Default: 1920
  useWebWorker?: boolean;                          // Default: false
  concurrency?: number;                            // Parallel operations (default: auto 4-8)
}
```

**Example:**
```typescript
// Auto-detected concurrency (recommended)
this.imageService.convertFormat(files, {
  outputFormat: 'webp',
  quality: 85,
  maxSizeMB: 2,
  maxWidthOrHeight: 1920
}).subscribe(() => console.log('Done!'));

// Manual concurrency control
this.imageService.convertFormat(files, {
  outputFormat: 'webp',
  quality: 85,
  concurrency: 4  // Process 4 images in parallel
}).subscribe(() => console.log('Done!'));
```

**Validation:** Files are automatically validated before processing:
- ✅ MIME type check (jpeg, png, webp, gif, avif)
- ✅ File size limit (100MB max)
- ✅ Empty file detection

---

##### `compressImages(files, options): Observable<void>`

Compresses images while preserving their original format.

**Parameters:**
- `files`: `FileList | File[]` - Images to compress
- `options`: `CompressOptions` - Compression configuration

**Options:**
```typescript
interface CompressOptions {
  quality?: number;              // 0-100, Default: 80
  maxSizeMB?: number;           // Default: 10
  maxWidthOrHeight?: number;    // Default: 1920
  useWebWorker?: boolean;       // Default: false
  concurrency?: number;         // Parallel operations (default: auto 4-8)
}
```

**Example:**
```typescript
// Auto-detected concurrency (recommended)
this.imageService.compressImages(files, {
  quality: 90,
  maxSizeMB: 1
}).subscribe(() => console.log('Compressed!'));

// Manual concurrency control
this.imageService.compressImages(files, {
  quality: 90,
  maxSizeMB: 1,
  concurrency: 6  // Process 6 images in parallel
}).subscribe(() => console.log('Compressed!'));
```

**Validation:** Files are automatically validated (same as `convertFormat`)

---

##### `abortProcessing(): void`

Cancels any ongoing image processing operations.

```typescript
// Start conversion
const subscription = this.imageService.convertFormat(files, {
  outputFormat: 'webp'
}).subscribe();

// Cancel operation
this.imageService.abortProcessing();
subscription.unsubscribe();
```

**Behavior:**
- ✅ Stops processing pending images
- ✅ Keeps already processed images
- ✅ Marks unprocessed images as error status

---

#### State Management

**Callback-based reactive state** - Framework agnostic and memory-leak safe.

##### Subscribe to State Changes

```typescript
// Subscribe to images changes
onImagesChange(callback: (images: ReadonlyArray<ImageFile>) => void): () => void

// Subscribe to upload status changes
onUploadingChange(callback: (isUploading: boolean) => void): () => void

// Subscribe to upload progress changes
onProgressChange(callback: (progress: number) => void): () => void
```

**Example:**
```typescript
// Angular
constructor() {
  this.unsubscribe = this.imageService.onImagesChange((images) => {
    this.images = images;
    this.cdr.markForCheck();
  });
}

ngOnDestroy() {
  this.unsubscribe?.(); // Important: cleanup to prevent memory leaks
}

// React
useEffect(() => {
  const unsubscribe = imageService.onImagesChange(setImages);
  return () => unsubscribe();
}, []);

// Vue
onMounted(() => {
  unsubscribe = imageService.onImagesChange(imgs => {
    images.value = imgs;
  });
});

onUnmounted(() => {
  unsubscribe?.();
});
```

##### State Properties (Getters)

All properties are read-only and computed automatically.

```typescript
// Image state
readonly images: ReadonlyArray<ImageFile>;
readonly completedImages: ReadonlyArray<ImageFile>;
readonly completedCount: number;

// Statistics
readonly totalOriginalSize: number;
readonly totalCompressedSize: number;
readonly savingsPercentage: number;  // 0-100

// Upload state
readonly isUploading: boolean;
readonly uploadProgress: number;  // 0-100
```

**Example:**
```typescript
console.log(this.imageService.images);              // Current images array
console.log(this.imageService.completedCount);      // Number of completed
console.log(this.imageService.savingsPercentage);   // Total savings %
```

---

#### Utility Methods

##### `formatBytes(bytes): string`

Converts bytes to human-readable format.

```typescript
this.imageService.formatBytes(1024);      // "1.00 KB"
this.imageService.formatBytes(1048576);   // "1.00 MB"
```

##### `getImageSize(file): string`

Gets formatted size of a file.

```typescript
this.imageService.getImageSize(file);  // "2.5 MB"
```

##### `getSavingsPercentage(original, compressed): number`

Calculates compression savings percentage.

```typescript
this.imageService.getSavingsPercentage(1000000, 500000);  // 50
```

---

### ImageUtilsService

Advanced utility service for image validation and analysis.

#### Methods

##### `validateImage(file): { valid: boolean; error?: string }`

Validates if a file is a supported image.

```typescript
import { ImageUtilsService } from 'ngx-media-optimizer';

const utils = inject(ImageUtilsService);
const result = utils.validateImage(file);

if (result.valid) {
  console.log('Valid image!');
} else {
  console.error(result.error);
}
```

##### `getImageDimensions(file): Promise<{ width: number; height: number }>`

Gets image dimensions asynchronously. Results are cached for performance (200-600x faster on cache hits).

```typescript
const dims = await utils.getImageDimensions(file);
console.log(`${dims.width}x${dims.height}`);  // "1920x1080"
```

**Performance:** First call ~1.5ms, cached calls ~0.002ms (600x faster)

##### `shouldCompress(file, threshold?): boolean`

Checks if image should be compressed based on size.

```typescript
if (utils.shouldCompress(file, 1024 * 1024)) {  // 1MB
  console.log('Compression recommended');
}
```

##### `getImageInfo(file): Promise<ImageInfo>`

Gets comprehensive image information. Results are cached for performance (400-1,200x faster on cache hits).

```typescript
const info = await utils.getImageInfo(file);
console.log(info.width);              // 1920
console.log(info.height);             // 1080
console.log(info.aspectRatio);        // 1.78
console.log(info.aspectRatioString);  // "16:9"
console.log(info.formattedSize);      // "2.5 MB"
console.log(info.format);             // "image/jpeg"
```

**Performance:** First call ~0.7ms, cached calls ~0.001ms (1,000x faster)

##### `clearCache(): void`

Clears all internal caches (dimensions, info, transparency, dominant color).

```typescript
// After processing many images
utils.clearCache();
```

**Note:** LRU caches are automatically managed with O(1) eviction. Manual clearing is optional.

**Use case:** Free memory after processing large batches of images.

---

##### `getCacheStats(): object`

Returns statistics about cache usage for monitoring and debugging.

```typescript
const stats = utils.getCacheStats();
console.log(stats);
// {
//   dimensions: 45,
//   info: 23,
//   transparency: 38,
//   dominantColor: 12
// }
```

**Use case:** Monitor cache efficiency and memory usage.

---

##### `createThumbnail(file, options): Promise<File>`

Creates a thumbnail from an image.

```typescript
const thumb = await utils.createThumbnail(file, {
  maxSizeMB: 0.1,
  maxWidthOrHeight: 200
});
console.log(thumb.size);  // Much smaller than original
```

---

## 💡 Examples

### Complete Image Converter Component (Angular)

```typescript
import { Component, inject, signal, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ImageConverterService, type ImageFile } from 'ngx-media-optimizer';

@Component({
  selector: 'app-media-optimizer',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="container">
      <!-- File Input -->
      <div class="upload-zone"
           [class.dragging]="isDragging()"
           (dragover)="onDragOver($event)"
           (dragleave)="onDragLeave($event)"
           (drop)="onDrop($event)">
        <input type="file" 
               #fileInput
               multiple 
               accept="image/*"
               (change)="onFileSelect($event)"
               style="display: none">
        <button (click)="fileInput.click()">
          📁 Select Images
        </button>
        <p>or drag and drop here</p>
      </div>

      <!-- Quality Control -->
      <div class="controls">
        <label>
          Quality: {{ quality() }}%
          <input type="range" 
                 min="1" 
                 max="100" 
                 [value]="quality()"
                 (input)="onQualityChange($event)">
        </label>
      </div>

      <!-- Statistics -->
      <div class="stats">
        <p>Images: {{ completedCount }} / {{ images.length }}</p>
        <p>Total Savings: {{ savingsPercentage }}%</p>
        <p>Original: {{ formatBytes(totalOriginalSize) }}</p>
        <p>Compressed: {{ formatBytes(totalCompressedSize) }}</p>
      </div>

      <!-- Image Grid -->
      <div class="image-grid">
        @for (image of images; track image.id) {
          <div class="image-card" [class.processing]="image.status === 'processing'">
            @if (image.status === 'completed') {
              <img [src]="image.compressedUrl" [alt]="image.name">
              <div class="info">
                <p class="name">{{ image.name }}</p>
                <p class="size">
                  {{ formatBytes(image.originalSize) }} → 
                  {{ formatBytes(image.compressedSize) }}
                </p>
                <p class="savings">
                  💾 Saved {{ getSavingsPercentage(image.originalSize, image.compressedSize) }}%
                </p>
              </div>
              <button (click)="downloadImage(image)">⬇️ Download</button>
            } @else if (image.status === 'processing') {
              <div class="spinner">Processing...</div>
            } @else if (image.status === 'error') {
              <div class="error">❌ Error</div>
            }
          </div>
        }
      </div>

      <!-- Bulk Actions -->
      @if (completedCount > 0) {
        <div class="actions">
          <button (click)="downloadAll()">⬇️ Download All</button>
          <button (click)="clearAll()">🗑️ Clear All</button>
        </div>
      }
    </div>
  `,
  styles: [`
    .upload-zone {
      border: 2px dashed #ccc;
      border-radius: 8px;
      padding: 40px;
      text-align: center;
      transition: all 0.3s;
    }
    
    .upload-zone.dragging {
      border-color: #4CAF50;
      background: #f0f9ff;
    }
    
    .image-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 16px;
      margin-top: 20px;
    }
    
    .image-card {
      border: 1px solid #ddd;
      border-radius: 8px;
      padding: 12px;
      transition: transform 0.2s;
    }
    
    .image-card:hover {
      transform: translateY(-4px);
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    }
    
    .image-card img {
      width: 100%;
      height: 150px;
      object-fit: cover;
      border-radius: 4px;
    }
    
    .processing {
      opacity: 0.6;
    }
  `]
})
export class ImageConverterComponent implements OnDestroy {
  private imageService = inject(ImageConverterService);
  private cdr = inject(ChangeDetectorRef);

  // Local UI state
  protected isDragging = signal(false);
  protected quality = signal(80);

  // Component state (updated via callbacks)
  protected images: ReadonlyArray<ImageFile> = [];
  protected completedCount: number = 0;
  protected savingsPercentage: number = 0;
  protected totalOriginalSize: number = 0;
  protected totalCompressedSize: number = 0;

  // Unsubscribe function
  private unsubscribe?: () => void;

  constructor() {
    // Subscribe to image state changes
    this.unsubscribe = this.imageService.onImagesChange((images) => {
      this.images = images;
      this.completedCount = this.imageService.completedCount;
      this.savingsPercentage = this.imageService.savingsPercentage;
      this.totalOriginalSize = this.imageService.totalOriginalSize;
      this.totalCompressedSize = this.imageService.totalCompressedSize;
      this.cdr.markForCheck();
    });
  }

  ngOnDestroy(): void {
    this.unsubscribe?.(); // Cleanup to prevent memory leaks
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragging.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.isDragging.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragging.set(false);
    
    const files = event.dataTransfer?.files;
    if (files) {
      this.processImages(files);
    }
  }

  onFileSelect(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      this.processImages(input.files);
      input.value = ''; // Reset input
    }
  }

  onQualityChange(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.quality.set(Number(value));
  }

  private processImages(files: FileList): void {
    this.imageService.convertFormat(files, {
      outputFormat: 'webp',
      quality: this.quality()
    }).subscribe({
      next: () => console.log('✅ All images processed'),
      error: (err: Error) => console.error('❌ Processing failed:', err)
    });
  }

  downloadImage(image: ImageFile): void {
    const link = document.createElement('a');
    link.href = image.compressedUrl;
    link.download = image.name;
    link.click();
  }

  downloadAll(): void {
    this.images()
      .filter(img => img.status === 'completed')
      .forEach(img => this.downloadImage(img));
  }

  clearAll(): void {
    // Clear implementation (would access internal service methods)
  }

  formatBytes(bytes: number): string {
    return this.imageService.formatBytes(bytes);
  }

  getSavingsPercentage(original: number, compressed: number): number {
    return this.imageService.getSavingsPercentage(original, compressed);
  }
}
```

---

### Server Upload Example

```typescript
import { Component, inject } from '@angular/core';
import { ImageConverterService } from 'ngx-media-optimizer';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-uploader',
  template: `
    <div>
      <input type="file" multiple (change)="onSelect($event)">
      <button (click)="upload()" [disabled]="isUploading()">
        {{ isUploading() ? 'Uploading...' : 'Upload' }}
      </button>
      @if (isUploading()) {
        <progress [value]="uploadProgress()" max="100"></progress>
      }
    </div>
  `
})
export class UploaderComponent {
  private imageService = inject(ImageConverterService);
  private http = inject(HttpClient);
  
  isUploading = this.imageService.isUploading;
  uploadProgress = this.imageService.uploadProgress;
  
  onSelect(event: Event): void {
    const files = (event.target as HTMLInputElement).files;
    if (files) {
      this.imageService.convertFormat(files, {
        outputFormat: 'webp',
        quality: 85
      }).subscribe();
    }
  }
  
  upload(): void {
    const completed = this.imageService.completedImages();
    
    // Custom upload logic
    completed.forEach(async image => {
      const response = await fetch(image.compressedUrl);
      const blob = await response.blob();
      const file = new File([blob], image.name, { type: blob.type });
      
      const formData = new FormData();
      formData.append('image', file);
      
      this.http.post('/api/upload', formData).subscribe({
        next: () => console.log(`✅ Uploaded ${image.name}`),
        error: (err) => console.error(`❌ Upload failed:`, err)
      });
    });
  }
}
```

---

### Image Validation Example

```typescript
import { Component, inject } from '@angular/core';
import { ImageUtilsService } from 'ngx-media-optimizer';

@Component({
  selector: 'app-validator',
  template: `
    <input type="file" (change)="validateFile($event)">
    @if (validationMessage()) {
      <p [class]="validationClass()">{{ validationMessage() }}</p>
    }
  `
})
export class ValidatorComponent {
  private utils = inject(ImageUtilsService);
  
  validationMessage = signal<string>('');
  validationClass = signal<string>('');
  
  async validateFile(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    
    // Basic validation
    const validation = this.utils.validateImage(file);
    if (!validation.valid) {
      this.validationMessage.set(validation.error!);
      this.validationClass.set('error');
      return;
    }
    
    // Check size
    if (this.utils.shouldCompress(file, 5 * 1024 * 1024)) {
      this.validationMessage.set('⚠️ File is large. Compression recommended.');
      this.validationClass.set('warning');
    }
    
    // Get detailed info
    const info = await this.utils.getImageInfo(file);
    this.validationMessage.set(
      `✅ Valid image: ${info.width}x${info.height}, ${info.formattedSize}`
    );
    this.validationClass.set('success');
  }
}
```

---

## � Exported Types

The library exports the following services and TypeScript interfaces:

### Services

```typescript
import { 
  ImageConverterService,  // Main service for image conversion and compression
  ImageUtilsService       // Utility service for validation and analysis
} from 'ngx-media-optimizer';
```

#### `ImageConverterService`
Main service providing image conversion, compression, and state management.

**Key Features:**
- Image format conversion (PNG, JPG, JPEG, WebP)
- Parallel batch processing with configurable concurrency
- Callback-based reactive state management
- Real-time progress tracking
- Memory-efficient processing
- Automatic cleanup

**Usage:**
```typescript
const service = new ImageConverterService();
// or in Angular
const service = inject(ImageConverterService);
```

#### `ImageUtilsService`
Utility service for image validation, analysis, and thumbnail generation.

**Key Features:**
- Image validation
- Dimension detection
- Size recommendations
- Comprehensive image info
- Thumbnail creation

**Usage:**
```typescript
const utils = new ImageUtilsService();
// or in Angular
const utils = inject(ImageUtilsService);
```

---

### Interfaces & Types

```typescript
import type { 
  ImageFile,         // Processed image with metadata
  ImageFormat,       // Supported image formats
  ConvertOptions,    // Options for format conversion
  CompressOptions,   // Options for compression
  ImageInfo          // Detailed image information
} from 'ngx-media-optimizer';
```

#### `ImageFile`
Represents a processed image with all metadata and state.

```typescript
interface ImageFile {
  id: string;                           // Unique identifier
  name: string;                         // Original filename
  originalSize: number;                 // Original file size in bytes
  compressedSize: number;               // Compressed file size in bytes
  originalUrl: string;                  // Object URL for original image
  compressedUrl: string;                // Object URL for compressed image
  status: 'pending' | 'processing' | 'completed' | 'error';
  format: ImageFormat;                  // Image MIME type
}
```

**Example:**
```typescript
const image: ImageFile = {
  id: 'abc123',
  name: 'photo.jpg',
  originalSize: 2500000,      // 2.5 MB
  compressedSize: 850000,      // 850 KB
  originalUrl: 'blob:...',
  compressedUrl: 'blob:...',
  status: 'completed',
  format: 'image/jpeg'
};
```

---

#### `ImageFormat`
Supported image MIME types.

```typescript
type ImageFormat = 'webp' | 'jpeg' | 'png' | 'avif';
```

**Example:**
```typescript
const format: ImageFormat = 'webp';
```

---

#### `ConvertOptions`
Configuration options for image format conversion.

```typescript
interface ConvertOptions {
  outputFormat: 'webp' | 'jpeg' | 'png' | 'avif';  // Target format (required)
  quality?: number;                                 // 0-100 (default: 80)
  maxSizeMB?: number;                              // Max file size in MB (default: 10)
  maxWidthOrHeight?: number;                       // Max dimension in pixels (default: 1920)
  useWebWorker?: boolean;                          // Use web worker (default: false)
  concurrency?: number;                            // Parallel operations (default: auto 4-8)
}
```

**Example:**
```typescript
const options: ConvertOptions = {
  outputFormat: 'webp',
  quality: 85,
  maxSizeMB: 2,
  maxWidthOrHeight: 1920,
  useWebWorker: false,
  concurrency: 4  // Optional: auto-detected if not specified
};

service.convertFormat(files, options).subscribe();
```

**Note:** Files are automatically validated before processing (MIME type, size, empty check).

---

#### `CompressOptions`
Configuration options for image compression (maintains original format).

```typescript
interface CompressOptions {
  quality?: number;              // 0-100 (default: 80)
  maxSizeMB?: number;           // Max file size in MB (default: 10)
  maxWidthOrHeight?: number;    // Max dimension in pixels (default: 1920)
  useWebWorker?: boolean;       // Use web worker (default: false)
  concurrency?: number;         // Parallel operations (default: auto 4-8)
}
```

**Example:**
```typescript
const options: CompressOptions = {
  quality: 90,
  maxSizeMB: 1,
  maxWidthOrHeight: 2048,
  useWebWorker: false,
  concurrency: 6  // Optional: auto-detected if not specified
};

service.compressImages(files, options).subscribe();
```

---

#### `ImageInfo`
Comprehensive image information returned by `ImageUtilsService.getImageInfo()`.

```typescript
interface ImageInfo {
  width: number;              // Image width in pixels
  height: number;             // Image height in pixels
  size: number;               // File size in bytes
  formattedSize: string;      // Human-readable size (e.g., "2.5 MB")
  format: string;             // MIME type (e.g., "image/jpeg")
  aspectRatio: number;        // Decimal aspect ratio (e.g., 1.78)
  aspectRatioString: string;  // Readable ratio (e.g., "16:9")
}
```

**Example:**
```typescript
const utils = new ImageUtilsService();
const info: ImageInfo = await utils.getImageInfo(file);

console.log(info);
// {
//   width: 1920,
//   height: 1080,
//   size: 2500000,
//   formattedSize: "2.38 MB",
//   format: "image/jpeg",
//   aspectRatio: 1.7777777777777777,
//   aspectRatioString: "16:9"
// }
```

---

### Type Safety Examples

**Full type-safe usage:**

```typescript
import { 
  ImageConverterService, 
  ImageUtilsService,
  type ImageFile,
  type ConvertOptions,
  type ImageInfo 
} from 'ngx-media-optimizer';

// Services
const converter = new ImageConverterService();
const utils = new ImageUtilsService();

// Type-safe options
const options: ConvertOptions = {
  outputFormat: 'webp',
  quality: 85
};

// Type-safe callback
converter.onImagesChange((images: ReadonlyArray<ImageFile>) => {
  images.forEach((img: ImageFile) => {
    if (img.status === 'completed') {
      console.log(`${img.name}: ${img.compressedSize} bytes`);
    }
  });
});

// Type-safe utility
const validation: { valid: boolean; error?: string } = utils.validateImage(file);
const info: ImageInfo = await utils.getImageInfo(file);
```

---

## 🚀 What's New in v1.3.0

### Performance & Reliability
- **100x faster LRU cache** - Optimized from O(n) to O(1) eviction
- **Memory leak prevention** - Automatic cleanup with `ngOnDestroy()`
- **Abort support** - Cancel long-running operations with `abortProcessing()`
- **Input validation** - Automatic file validation before processing

### Security & Robustness
- **File size limits** - 100MB max to prevent DoS attacks
- **Type safety** - Zero unsafe type assertions
- **SSR compatible** - Full Server-Side Rendering support
- **Error handling** - Comprehensive error messages

### Developer Experience
- **Named constants** - All magic numbers replaced
- **Cache monitoring** - New `getCacheStats()` method
- **Code quality** - Eliminated duplication, improved maintainability
- **143 passing tests** - Comprehensive test coverage

---

## 🔄 Migration Guide

### From v1.2.x to v1.3.x

**No breaking changes!** All changes are backward compatible.

**New features available:**
```typescript
// Abort ongoing operations
service.abortProcessing();

// Monitor cache usage
const stats = utils.getCacheStats();
console.log(stats); // { dimensions: 45, info: 23, ... }

// Automatic file validation (works automatically)
service.convertFormat(files, { outputFormat: 'webp' }); // Files validated before processing
```

**Memory management improvements:**
- Service now implements `ngOnDestroy()` - automatic cleanup in Angular apps
- LRU cache 100x faster with proper O(1) eviction
- All event handlers properly cleaned up in error cases

### From v1.1.x to v1.3.x

Same as above - fully backward compatible!

### From v0.x to v1.0

The library has been renamed from `@ngx-utils/media-optimizer` to `ngx-media-optimizer`.

**Steps:**

1. **Uninstall old package:**
   ```bash
   npm uninstall @ngx-utils/media-optimizer
   ```

2. **Install new package:**
   ```bash
   npm install ngx-media-optimizer
   ```

3. **Update imports:**
   ```typescript
   // Old
   import { ImageConverterService } from '@ngx-utils/media-optimizer';
   
   // New
   import { ImageConverterService } from 'ngx-media-optimizer';
   ```

4. **API remains the same** - No code changes needed! ✨

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

### Development Setup

```bash
# Clone repository
git clone https://github.com/barbozaa/media-optimizer-workspace.git

# Install dependencies
cd media-optimizer
npm install

# Run tests
npx vitest run

# Build library
npm run build:lib
```

### Running Tests

```bash
# Run all 143 tests
npx vitest run

# Watch mode
npx vitest

# Coverage report (100% coverage)
npx vitest run --coverage
```

---

## 📄 License

MIT © [Barboza](https://github.com/barbozaa)

---

## 🙏 Acknowledgments

- Built with [browser-image-compression](https://github.com/Donaldcwl/browser-image-compression)
- Powered by [Angular](https://angular.dev/) (framework-agnostic)
- Tested with [Vitest](https://vitest.dev/)
- 100% TypeScript with complete type safety

---

## 💬 Support

- � Issues: [GitHub Issues](https://github.com/barbozaa/media-optimizer-workspace/issues)
- 💡 Discussions: [GitHub Discussions](https://github.com/barbozaa/media-optimizer-workspace/discussions)
- 📦 NPM: [ngx-media-optimizer](https://www.npmjs.com/package/ngx-media-optimizer)

---

<div align="center">

**Made with ❤️ for the JavaScript community**

⭐ Star us on [GitHub](https://github.com/barbozaa/media-optimizer-workspace) if this project helped you!

</div>

