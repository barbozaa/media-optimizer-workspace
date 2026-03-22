import { NativeImageCodec } from './shared/image-codec';
import { ImageHelpers } from './shared/image-helpers';
import { Subject } from './shared/subject';
import {
  VALID_MIME_TYPES,
  ValidationError,
  AbortError,
  CompressionError,
} from './shared/types';
import type {
  ImageFormat,
  ImageFile,
  CompletedImageFile,
  ImageProcessingStatus,
  ConvertOptions,
  CompressOptions,
  BaseProcessOptions,
} from './shared/types';

// Re-export all public types so consumers import from one place
export type {
  ImageFormat,
  ImageFile,
  CompletedImageFile,
  ImageProcessingStatus,
  ConvertOptions,
  CompressOptions,
  BaseProcessOptions,
};
export { ValidationError, AbortError, CompressionError, MediaOptimizerError } from './shared/types';

// ── Internal helpers ────────────────────────────────────────────────────────────

/** Internal result of one image processing step. */
interface ProcessingResult {
  readonly imageFile: ImageFile;
  readonly compressedFile: File;
}

/**
 * Processes `items` through `handler` with at most `concurrency` concurrent
 * Promises.  Short-circuits on the first error (same semantics as
 * `mergeMap(fn, n) + catchError(throwError)` in RxJS).
 *
 * The `failed` flag prevents new items from being picked up after the first
 * failure, while already-running `handler` calls are allowed to complete
 * naturally (JS Promises cannot be cancelled).
 *
 * @internal
 */
async function runConcurrent<T>(
  items: readonly T[],
  concurrency: number,
  handler: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;

  const limit = Math.max(1, Math.min(concurrency, items.length));
  let cursor = 0;
  let failed = false;

  async function worker(): Promise<void> {
    while (cursor < items.length && !failed) {
      const index = cursor++;
      try {
        await handler(items[index]);
      } catch (err) {
        failed = true;
        throw err;
      }
    }
  }

  await Promise.all(Array.from({ length: limit }, worker));
}

// ── Service ─────────────────────────────────────────────────────────────────────

/**
 * Framework-agnostic service for image conversion and compression.
 *
 * Manages processing state internally and exposes it through a callback-based
 * subscription API compatible with React, Vue, Svelte, and any JavaScript
 * environment — no framework required.
 *
 * @example React
 * ```tsx
 * const svc = new ImageConverterService();
 * useEffect(() => svc.onImagesChange(setImages), []);
 * ```
 *
 * @example Vue
 * ```ts
 * const svc = new ImageConverterService();
 * onMounted(() => {
 *   const off = svc.onImagesChange(v => { images.value = v; });
 *   onUnmounted(off);
 * });
 * ```
 *
 * @example Vanilla JS
 * ```ts
 * const svc = new ImageConverterService();
 * svc.onImagesChange(images => renderGallery(images));
 * await svc.convertFormat(fileList, { outputFormat: 'webp', quality: 80 });
 * ```
 *
 * @public
 */
export class ImageConverterService {
  // ── Constants ──────────────────────────────────────────────────────────────
  private readonly MAX_FILE_SIZE_MB = 100;
  private readonly DEFAULT_QUALITY = 80;

  // ── Internal state ─────────────────────────────────────────────────────────
  private _abortController: AbortController | null = null;
  private _downloadTimeouts: ReturnType<typeof setTimeout>[] = [];

  /** O(1) lookup by ID. */
  private _imagesMap = new Map<string, ImageFile>();
  /** Insertion-ordered list of IDs for stable iteration. */
  private _imageOrder: string[] = [];

  /** Reactive subjects — subscribers are notified synchronously on every change. */
  private readonly _images = new Subject<ReadonlyArray<ImageFile>>([]);
  private readonly _isUploading = new Subject<boolean>(false);
  private readonly _uploadProgress = new Subject<number>(0);

  // ── Synchronous getters ────────────────────────────────────────────────────

  /** Current image list snapshot. Updated after every processing event. */
  get images(): ReadonlyArray<ImageFile> {
    return this._images.value;
  }

  /** `true` while a processing batch is running; `false` otherwise. */
  get isUploading(): boolean {
    return this._isUploading.value;
  }

  /** Current batch progress (0–100). Resets to `0` after the batch completes. */
  get uploadProgress(): number {
    return this._uploadProgress.value;
  }

  /**
   * Completed images only — `compressedUrl` and `compressedSize` are
   * guaranteed to be present on every element.
   */
  get completedImages(): ReadonlyArray<CompletedImageFile> {
    return this.images.filter((img): img is CompletedImageFile => img.status === 'completed');
  }

  get completedCount(): number {
    return this.completedImages.length;
  }

  get totalOriginalSize(): number {
    return this.completedImages.reduce((acc, img) => acc + img.originalSize, 0);
  }

  get totalCompressedSize(): number {
    return this.completedImages.reduce((acc, img) => acc + img.compressedSize, 0);
  }

  get savingsPercentage(): number {
    const original = this.totalOriginalSize;
    return original > 0
      ? Math.round(((original - this.totalCompressedSize) / original) * 100)
      : 0;
  }

  // ── Callback subscriptions ─────────────────────────────────────────────────

  /**
   * Subscribe to image list changes.
   *
   * The callback fires immediately with the current images array, then on
   * every subsequent change.
   *
   * @returns Unsubscribe function — call it in your component's cleanup hook.
   *
   * @example React  `useEffect(() => svc.onImagesChange(setImages), [])`
   * @example Vue    `onMounted(() => { const off = svc.onImagesChange(cb); onUnmounted(off); })`
   */
  onImagesChange(callback: (images: ReadonlyArray<ImageFile>) => void): () => void {
    return this._images.subscribe(callback);
  }

  /**
   * Subscribe to `isUploading` changes.
   * @returns Unsubscribe function.
   */
  onUploadingChange(callback: (isUploading: boolean) => void): () => void {
    return this._isUploading.subscribe(callback);
  }

  /**
   * Subscribe to `uploadProgress` changes (0–100).
   * @returns Unsubscribe function.
   */
  onProgressChange(callback: (progress: number) => void): () => void {
    return this._uploadProgress.subscribe(callback);
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  /**
   * Releases all resources held by this instance.
   *
   * - Cancels any pending stagger-download timers.
   * - Revokes all blob URLs to prevent memory leaks.
   * - Removes all reactive subscribers.
   *
   * Call this when the owning component is destroyed.
   *
   * @example Angular  `ngOnDestroy() { this.svc.destroy(); }`
   * @example React    `useEffect(() => () => svc.destroy(), []);`
   * @example Vue      `onUnmounted(() => svc.destroy())`
   */
  destroy(): void {
    this._downloadTimeouts.forEach(id => clearTimeout(id));
    this._downloadTimeouts = [];
    this.images.forEach(img => this._revokeImageUrls(img));
    this._images.complete();
    this._isUploading.complete();
    this._uploadProgress.complete();
    this._imagesMap.clear();
    this._imageOrder = [];
  }

  // ── Public API — conversion & compression ─────────────────────────────────

  /**
   * Converts images to a different format.
   *
   * Validates all files upfront, then processes them in parallel with
   * configurable concurrency. Each processed image is reflected in the
   * reactive state immediately as it completes.
   *
   * @param files   - `FileList` or `File[]` to convert.
   * @param options - Conversion configuration.
   * @returns `Promise<void>` that resolves when all images finish.
   *          Rejects with `ValidationError`, `AbortError`, or `CompressionError`.
   *
   * @example
   * ```typescript
   * await svc.convertFormat(files, { outputFormat: 'webp', quality: 80 });
   * ```
   */
  async convertFormat(
    files: FileList | File[],
    options: ConvertOptions,
  ): Promise<void> {
    const quality = options.quality ?? this.DEFAULT_QUALITY;
    if (quality < 0 || quality > 100) {
      throw new ValidationError(`quality must be 0–100, got ${quality}`);
    }
    return this._processFiles(files, options, options.outputFormat);
  }

  /**
   * Compresses images while preserving their original format.
   *
   * @param files   - `FileList` or `File[]` to compress.
   * @param options - Compression configuration.
   * @returns `Promise<void>` that resolves when all images finish.
   */
  async compressImages(
    files: FileList | File[],
    options: CompressOptions = {},
  ): Promise<void> {
    const quality = options.quality ?? this.DEFAULT_QUALITY;
    if (quality < 0 || quality > 100) {
      throw new ValidationError(`quality must be 0–100, got ${quality}`);
    }
    return this._processFiles(files, options, undefined);
  }

  // ── Public utility methods ─────────────────────────────────────────────────

  /** Converts bytes to a human-readable string (e.g. `"1.46 MB"`). */
  formatBytes(bytes: number, decimals = 2): string {
    return ImageHelpers.formatBytes(bytes, decimals);
  }

  /** Percentage of size saved between `originalSize` and `compressedSize`. */
  getSavingsPercentage(originalSize: number, compressedSize: number): number {
    if (originalSize === 0) return 0;
    return Math.round(((originalSize - compressedSize) / originalSize) * 100);
  }

  /** Formatted file size of a `File` object (e.g. `"2.5 MB"`). */
  getImageSize(file: File): string {
    return this.formatBytes(file.size);
  }

  /**
   * Cancels any in-flight processing batch.
   *
   * Already-completed images are kept; queued images are marked `'error'`.
   * The `AbortSignal` is forwarded to `NativeImageCodec.compress` so
   * in-flight encode operations are genuinely cancelled.
   */
  abortProcessing(): void {
    if (this._abortController) {
      this._abortController.abort();
      this._abortController = null;
    }
  }

  // ── Public API — state management ─────────────────────────────────────────

  /** Removes a specific image by ID and revokes its blob URLs. */
  removeImage(id: string): void {
    const img = this._imagesMap.get(id);
    if (img) {
      this._revokeImageUrls(img);
      this._imagesMap.delete(id);
      this._imageOrder = this._imageOrder.filter(i => i !== id);
      this._images.next(this._buildImagesArray());
    }
  }

  /** Removes all images and revokes all blob URLs. */
  removeAllImages(): void {
    this.images.forEach(img => this._revokeImageUrls(img));
    this._imagesMap.clear();
    this._imageOrder = [];
    this._images.next([]);
  }

  /**
   * Removes only completed images; `pending`, `processing`, and `error`
   * entries are kept.
   */
  clearCompleted(): void {
    const completedIds = new Set<string>();
    this._imageOrder.forEach(id => {
      if (this._imagesMap.get(id)?.status === 'completed') completedIds.add(id);
    });
    completedIds.forEach(id => {
      const img = this._imagesMap.get(id);
      if (img) {
        this._revokeImageUrls(img);
        this._imagesMap.delete(id);
      }
    });
    this._imageOrder = this._imageOrder.filter(id => !completedIds.has(id));
    this._images.next(this._buildImagesArray());
  }

  // ── Public API — download ──────────────────────────────────────────────────

  /**
   * Triggers a browser download for a single completed image by ID.
   * No-op in SSR contexts (no `document`).
   */
  downloadImage(id: string): void {
    if (typeof document === 'undefined') {
      console.warn('[ImageConverter] Download not available in SSR context');
      return;
    }
    const image = this._imagesMap.get(id);
    if (!image) {
      console.warn(`[ImageConverter] Image with id ${id} not found`);
      return;
    }
    if (image.status !== 'completed') {
      console.warn(`[ImageConverter] Image ${image.name} is not yet completed`);
      return;
    }
    if (!image.compressedUrl) {
      console.warn(`[ImageConverter] No compressed image available for ${image.name}`);
      return;
    }
    const link = document.createElement('a');
    link.href = image.compressedUrl;
    link.download = image.name;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  /**
   * Triggers staggered browser downloads for all completed images (100 ms gap).
   *
   * Best-effort — browser policies on bulk downloads vary: Chromium allows
   * several; Firefox / Safari may block all but the first.  For reliable
   * bulk downloads consider the File System Access API or server-side zipping.
   */
  downloadAllImages(): void {
    if (typeof document === 'undefined') {
      console.warn('[ImageConverter] Download not available in SSR context');
      return;
    }
    // Cancel any in-flight stagger chain from a previous call so that
    // double-clicking "Download All" does not schedule 2N downloads.
    this._downloadTimeouts.forEach(id => clearTimeout(id));
    this._downloadTimeouts = [];

    const completed = this.completedImages;
    if (completed.length === 0) {
      console.warn('[ImageConverter] No completed images to download');
      return;
    }
    completed.forEach((img, i) => {
      const timeoutId = setTimeout(() => {
        this.downloadImage(img.id);
        this._downloadTimeouts = this._downloadTimeouts.filter(t => t !== timeoutId);
      }, i * 100);
      this._downloadTimeouts.push(timeoutId);
    });
  }

  // ── Test helper ────────────────────────────────────────────────────────────

  /**
   * Seeds the images state from an external array.
   *
   * **Not for production use.** Intended exclusively for test setup and
   * server-side hydration scenarios where state is provided externally.
   * Throws if called while a processing batch is active.
   *
   * @internal
   */
  _seedImages(value: ReadonlyArray<ImageFile>): void {
    if (this._abortController !== null) {
      throw new Error(
        '[ImageConverter] _seedImages: cannot replace state while a batch is active.' +
        ' Call abortProcessing() first.',
      );
    }
    this._imagesMap.clear();
    this._imageOrder = [];
    value.forEach(img => {
      this._imagesMap.set(img.id, img);
      this._imageOrder.push(img.id);
    });
    this._images.next(this._buildImagesArray());
  }

  // ── Private — processing pipeline ─────────────────────────────────────────

  /**
   * Unified pipeline for `convertFormat()` and `compressImages()`.
   *
   * `outputFormat` is `undefined` when compressing without format change (the
   * codec will detect the source format from the file MIME type).
   *
   * Key invariants:
   * - Files and `ImageFile` entries are zipped into typed pairs before
   *   `runConcurrent`, eliminating index-based parallel-array correlation.
   * - Entries are created with `status: 'processing'` directly, skipping the
   *   `'pending'` transient state to reduce the number of subscriber emissions.
   */
  private async _processFiles(
    files: FileList | File[],
    options: CompressOptions,
    outputFormat: ImageFormat | undefined,
  ): Promise<void> {
    const fileArray = Array.from(files);

    if (fileArray.length === 0) {
      console.warn('[ImageConverter] No files provided');
      return;
    }

    const errors = this._validateFiles(fileArray);
    if (errors.length > 0) {
      throw new ValidationError(errors.join('\n'));
    }

    this._abortController = new AbortController();
    const { signal } = this._abortController;

    const sortOrder = (options as BaseProcessOptions).sortOrder ?? 'asc';
    const quality = options.quality ?? this.DEFAULT_QUALITY;
    const concurrency = options.concurrency ?? ImageHelpers.getOptimalConcurrency();

    const sortedFiles = ImageHelpers.optimizeBatchOrder(fileArray, sortOrder);

    // Zip files and their ImageFile entries into typed pairs so that the
    // handler closure has a stable, index-free reference to both.
    const pairs = this._createImageEntries(sortedFiles, quality, outputFormat)
      .map((imageFile, i) => ({ imageFile, file: sortedFiles[i] }));

    this._addImagesToState(pairs.map(p => p.imageFile));
    this._isUploading.next(true);
    this._uploadProgress.next(0);

    let completedCount = 0;
    const totalCount = pairs.length;

    try {
      await runConcurrent(
        pairs,
        concurrency,
        async ({ imageFile, file }) => {
          if (signal.aborted) {
            this._updateImageStatus(imageFile.id, 'error');
            this._revokeImageUrls(imageFile);
            throw new AbortError();
          }

          const format = outputFormat ?? this._detectImageFormat(file.type);
          let compressedFile: File;

          try {
            compressedFile = await NativeImageCodec.compress(file, {
              outputFormat: format,
              quality: options.quality ?? this.DEFAULT_QUALITY,
              maxSizeMB: options.maxSizeMB ?? 10,
              maxWidthOrHeight: options.maxWidthOrHeight ?? 1920,
              signal,
            });
          } catch (error) {
            this._updateImageStatus(imageFile.id, 'error');
            const wrapped = new CompressionError(
              `Failed to compress "${imageFile.name}"`,
              error,
            );
            console.error(`[ImageConverter] Failed to process ${imageFile.name}:`, wrapped);
            throw wrapped;
          }

          this._updateImageOnSuccess({ imageFile, compressedFile });
          this._uploadProgress.next(Math.round((++completedCount / totalCount) * 100));
        },
      );
    } finally {
      this._abortController = null;
      this._isUploading.next(false);
      this._uploadProgress.next(0);
    }
  }

  // ── Private — state helpers ────────────────────────────────────────────────

  /**
   * Creates `ImageFile` entries with `status: 'processing'` directly,
   * skipping the `'pending'` transient state to reduce Subject emissions.
   */
  private _createImageEntries(
    files: File[],
    quality: number,
    outputFormat?: ImageFormat,
  ): ImageFile[] {
    return files.map(file => ({
      id: crypto.randomUUID(),
      name: outputFormat ? this._changeFileExtension(file.name, outputFormat) : file.name,
      originalSize: file.size,
      originalUrl: URL.createObjectURL(file),
      status: 'processing' as const,
      quality,
    }));
  }

  /** Builds an ordered snapshot array from the internal Map. */
  private _buildImagesArray(): ReadonlyArray<ImageFile> {
    return this._imageOrder
      .map(id => this._imagesMap.get(id))
      .filter((img): img is ImageFile => img !== undefined);
  }

  private _addImagesToState(images: ImageFile[]): void {
    images.forEach(img => {
      this._imagesMap.set(img.id, img);
      this._imageOrder.push(img.id);
    });
    this._images.next(this._buildImagesArray());
  }

  private _updateImageOnSuccess(result: ProcessingResult): void {
    const existing = this._imagesMap.get(result.imageFile.id);
    if (!existing) return;
    // Explicit field assignment avoids spreading a discriminated union
    // (TypeScript cannot narrow a spread + discriminant override).
    const completed: CompletedImageFile = {
      id: existing.id,
      name: existing.name,
      originalSize: existing.originalSize,
      originalUrl: existing.originalUrl,
      quality: existing.quality,
      status: 'completed',
      compressedSize: result.compressedFile.size,
      compressedUrl: URL.createObjectURL(result.compressedFile),
    };
    this._imagesMap.set(result.imageFile.id, completed);
    this._images.next(this._buildImagesArray());
  }

  /**
   * Updates an image to a non-completed status.
   * Explicitly reconstructs the non-completed variant so TypeScript verifies
   * the discriminated union invariant.
   */
  private _updateImageStatus(
    id: string,
    status: Exclude<ImageProcessingStatus, 'completed'>,
  ): void {
    const existing = this._imagesMap.get(id);
    if (!existing) return;
    const updated: ImageFile = {
      id: existing.id,
      name: existing.name,
      originalSize: existing.originalSize,
      originalUrl: existing.originalUrl,
      quality: existing.quality,
      status,
    };
    this._imagesMap.set(id, updated);
    this._images.next(this._buildImagesArray());
  }

  /** Revokes blob URLs for an image to free browser memory. */
  private _revokeImageUrls(image: ImageFile): void {
    if (image.originalUrl) URL.revokeObjectURL(image.originalUrl);
    if (image.status === 'completed' && image.compressedUrl) {
      URL.revokeObjectURL(image.compressedUrl);
    }
  }

  // ── Private — utilities ────────────────────────────────────────────────────

  /** Validates all files and returns ALL errors (not just the first). */
  private _validateFiles(files: File[]): string[] {
    const errors: string[] = [];
    const maxBytes = this.MAX_FILE_SIZE_MB * 1024 * 1024;
    for (const file of files) {
      if (!(VALID_MIME_TYPES as readonly string[]).includes(file.type)) {
        errors.push(`Invalid file type: ${file.type}. File: ${file.name}`);
      } else if (file.size === 0) {
        errors.push(`File is empty: ${file.name}`);
      } else if (file.size > maxBytes) {
        errors.push(
          `File too large: ${file.name} (${ImageHelpers.formatBytes(file.size)}). ` +
          `Maximum: ${this.MAX_FILE_SIZE_MB}MB`,
        );
      }
    }
    return errors;
  }

  private _detectImageFormat(mimeType: string): ImageFormat {
    return ImageHelpers.detectImageFormat(mimeType);
  }

  private _changeFileExtension(filename: string, format: ImageFormat): string {
    const dot = filename.lastIndexOf('.');
    const base = dot > 0 ? filename.slice(0, dot) : filename;
    return `${base}.${format}`;
  }
}
