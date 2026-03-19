import { Injectable, OnDestroy } from '@angular/core';
import { Observable, BehaviorSubject, from, defer, EMPTY, throwError } from 'rxjs';
import { map, mergeMap, tap, catchError, finalize } from 'rxjs/operators';
import imageCompression from 'browser-image-compression';
import { ImageHelpers } from './shared/image-helpers';
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
export { ValidationError, AbortError, CompressionError } from './shared/types';
export { MediaOptimizerError } from './shared/types';

/** Internal result of image processing */
interface ProcessingResult {
  readonly imageFile: ImageFile;
  readonly compressedFile: File;
}

/**
 * Framework-agnostic service for image conversion and compression.
 *
 * State is managed via RxJS `BehaviorSubject`s, making the service compatible
 * with Angular, React, and Vue without modification:
 * - **Angular**  — `async` pipe on `images$`, `isUploading$`, `uploadProgress$`.
 * - **React**    — `useEffect(() => service.onImagesChange(setImages), [])` pattern.
 * - **Vue**      — `onMounted` + `onUnmounted` with the callback API.
 *
 * **Key Features:**
 * - Parallel processing with auto-detected concurrency control
 * - Reactive state via `BehaviorSubject` (observable + synchronous getter)
 * - Real `AbortController` cancellation — signal is threaded into `imageCompression`
 * - Automatic blob URL cleanup (memory leak prevention)
 * - All validation errors reported at once — no one-error-at-a-time UX
 * - 100% type-safe with strict TypeScript; all public types re-exported
 *
 * **Architecture:**
 * - State:       `BehaviorSubject<ReadonlyArray<ImageFile>>` + dual Map/array structure for O(1) ops
 * - Async ops:   RxJS `Observable` pipeline via `mergeMap` with configurable concurrency
 * - Cancellation: `AbortController.signal` forwarded to `browser-image-compression`
 * - Side effects: `tap` operators keep update logic out of the hot path
 *
 * @example Angular
 * ```typescript
 * @Component({ template: '<img *ngFor="let img of images$ | async" [src]="img.compressedUrl">' })
 * export class ImageUploaderComponent {
 *   private svc = inject(ImageConverterService);
 *   images$ = this.svc.images$;
 *
 *   onFiles(files: FileList) {
 *     this.svc.convertFormat(files, { outputFormat: 'webp', quality: 80 })
 *       .subscribe();
 *   }
 * }
 * ```
 *
 * @example React
 * ```tsx
 * function ImageUploader() {
 *   const [images, setImages] = useState<ReadonlyArray<ImageFile>>([]);
 *   useEffect(() => svc.onImagesChange(setImages), []);
 *   return <>{images.map(img => <img key={img.id} src={img.compressedUrl} />)}</>;
 * }
 * ```
 *
 * @example Vue
 * ```ts
 * const images = ref<ReadonlyArray<ImageFile>>([]);
 * onMounted(() => { const off = svc.onImagesChange(v => images.value = v); onUnmounted(off); });
 * ```
 *
 * @public
 * @injectable
 */
@Injectable({
  providedIn: 'root'
})
export class ImageConverterService implements OnDestroy {
  
  // ── Constants ────────────────────────────────────────────────────────────────
  private readonly MAX_FILE_SIZE_MB = 100;
  private readonly DEFAULT_QUALITY = 80;
  // VALID_MIME_TYPES is imported from shared/types — single source of truth (DESIGN-03)

  private abortController: AbortController | null = null;
  /** Pending stagger-download timer IDs — tracked so they can be cancelled (QUALITY-03). */
  private _downloadTimeouts: ReturnType<typeof setTimeout>[] = [];

  // ── Dual-structure state: Map for O(1) ops, array for ordered iteration ───────
  private _imagesMap = new Map<string, ImageFile>();
  private _imageOrder: string[] = [];

  // ── Reactive state via BehaviorSubjects ────────────────────────────────────────
  // Angular:  use images$ with the async pipe.
  // React:    subscribe in useEffect, return the unsubscribe fn as cleanup.
  // Vue:      subscribe in onMounted, call unsubscribe in onUnmounted.
  private readonly _images$ = new BehaviorSubject<ReadonlyArray<ImageFile>>([]);
  private readonly _isUploading$ = new BehaviorSubject<boolean>(false);
  private readonly _uploadProgress$ = new BehaviorSubject<number>(0);

  /** Observable stream of all images */
  readonly images$ = this._images$.asObservable();
  readonly isUploading$ = this._isUploading$.asObservable();
  readonly uploadProgress$ = this._uploadProgress$.asObservable();

  // ── Synchronous getters ────────────────────────────────────────────────────────
  get images(): ReadonlyArray<ImageFile> {
    return this._images$.value;
  }

  /**
   * Seeds the images state from an external array.
   *
   * **Not for production use.** Intended exclusively for test setup and
   * server-side hydration. In production, state flows through
   * `convertFormat()` / `compressImages()`.
   *
   * @testing
   */
  _seedImages(value: ReadonlyArray<ImageFile>): void {
    if (this.abortController !== null) {
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
    this._images$.next(this._buildImagesArray());
  }

  get isUploading(): boolean { return this._isUploading$.value; }
  get uploadProgress(): number { return this._uploadProgress$.value; }

  /** Completed images — `compressedUrl` and `compressedSize` are safe to access on every element. */
  get completedImages(): ReadonlyArray<CompletedImageFile> {
    return this.images.filter((img): img is CompletedImageFile => img.status === 'completed');
  }
  get completedCount(): number { return this.completedImages.length; }
  get totalOriginalSize(): number {
    return this.completedImages.reduce((acc, img) => acc + img.originalSize, 0);
  }
  get totalCompressedSize(): number {
    // completedImages is ReadonlyArray<CompletedImageFile> — compressedSize is guaranteed present
    return this.completedImages.reduce((acc, img) => acc + img.compressedSize, 0);
  }
  get savingsPercentage(): number {
    const original = this.totalOriginalSize;
    return original > 0
      ? Math.round(((original - this.totalCompressedSize) / original) * 100)
      : 0;
  }

  // ── Callback API — framework-agnostic (React/Vue pattern) ─────────────────────

  /**
   * Subscribe to images changes. Returns an unsubscribe function.
   * @example React: `useEffect(() => service.onImagesChange(setImages), [])`
   * @example Vue:   `onMounted(() => { const off = service.onImagesChange(cb); onUnmounted(off); })`
   */
  onImagesChange(callback: (images: ReadonlyArray<ImageFile>) => void): () => void {
    const sub = this._images$.subscribe(callback);
    return () => sub.unsubscribe();
  }

  /** Subscribe to upload status changes. Returns an unsubscribe function. */
  onUploadingChange(callback: (isUploading: boolean) => void): () => void {
    const sub = this._isUploading$.subscribe(callback);
    return () => sub.unsubscribe();
  }

  /** Subscribe to upload progress changes. Returns an unsubscribe function. */
  onProgressChange(callback: (progress: number) => void): () => void {
    const sub = this._uploadProgress$.subscribe(callback);
    return () => sub.unsubscribe();
  }

  ngOnDestroy(): void {
    // Cancel any pending stagger-download timers to avoid post-destroy DOM mutations
    this._downloadTimeouts.forEach(id => clearTimeout(id));
    this._downloadTimeouts = [];
    this.images.forEach(img => this.revokeImageUrls(img));
    this._images$.complete();
    this._isUploading$.complete();
    this._uploadProgress$.complete();
    this._imagesMap.clear();
    this._imageOrder = [];
  }
  
  // ============================================================================
  // PUBLIC API - CONVERSION AND COMPRESSION
  // ============================================================================
  
  /**
   * Converts images between formats with configurable compression.
   * 
   * Main operation for transforming images from one format to another
   * (e.g., PNG → WebP, JPEG → PNG). Processes multiple files in parallel
   * with concurrency control to optimize performance.
   * 
   * **Execution flow:**
   * 1. File validation
   * 2. State entries creation
   * 3. Parallel processing (configurable concurrency, default auto-detected)
   * 4. State update for each image
   * 5. Automatic cleanup on error
   * 
   * @param files - FileList or array of files to convert
   * @param options - Conversion configuration
   * @returns Observable that emits when all conversions complete
   * 
   * @example
   * ```typescript
   * // Basic conversion to WebP
   * service.convertFormat(files, { outputFormat: 'webp' })
   *   .subscribe(() => console.log('Done'));
   * 
   * // With advanced configuration
   * service.convertFormat(files, {
   *   outputFormat: 'jpeg',
   *   quality: 85,
   *   maxSizeMB: 0.5,
   *   maxWidthOrHeight: 1024,
   *   concurrency: 4  // Custom concurrency
   * }).subscribe({
   *   next: () => console.log('Conversion successful'),
   *   error: (err) => console.error('Failed:', err)
   * });
   * ```
   * 
   * @public
   */
  convertFormat(
    files: FileList | File[],
    options: ConvertOptions
  ): Observable<void> {
    const quality = options.quality ?? this.DEFAULT_QUALITY;
    if (quality < 0 || quality > 100) {
      return throwError(() => new ValidationError(`quality must be 0–100, got ${quality}`));
    }
    return this._processFiles(files, options, options.outputFormat);
  }
  
  /**
   * Compresses images while preserving their original format.
   * 
   * Unlike convertFormat(), this method maintains the original format
   * (PNG → PNG, JPEG → JPEG) and only applies compression.
   * Ideal for reducing size without changing the file type.
   * 
   * **Use cases:**
   * - Web optimization while maintaining format
   * - Size reduction before upload
   * - Batch processing of mixed files
   * 
   * @param files - FileList or array of files to compress
   * @param options - Compression configuration
   * @returns Observable that emits when all compressions complete
   * 
   * @example
   * ```typescript
   * // Simple compression
   * service.compressImages(files, { quality: 75 })
   *   .subscribe();
   * 
   * // With strict limits and custom concurrency
   * service.compressImages(files, {
   *   quality: 60,
   *   maxSizeMB: 0.3,
   *   maxWidthOrHeight: 800,
   *   concurrency: 8
   * }).subscribe();
   * ```
   * 
   * @public
   */
  compressImages(
    files: FileList | File[],
    options: CompressOptions = {}
  ): Observable<void> {
    const quality = options.quality ?? this.DEFAULT_QUALITY;
    if (quality < 0 || quality > 100) {
      return throwError(() => new ValidationError(`quality must be 0–100, got ${quality}`));
    }
    return this._processFiles(files, options, undefined);
  }
  
  // ============================================================================
  // PUBLIC UTILITY METHODS
  // ============================================================================
  
  /**
   * Formats bytes to human-readable format (KB, MB, GB).
   * 
   * @param bytes - Number of bytes
   * @param decimals - Number of decimals (default: 2)
   * @returns Formatted string (e.g., "1.5 MB")
   * 
   * @example
   * ```typescript
   * service.formatBytes(1536000); // "1.46 MB"
   * service.formatBytes(2048, 0);  // "2 KB"
   * ```
   * 
   * @public
   */
  formatBytes(bytes: number, decimals: number = 2): string {
    return ImageHelpers.formatBytes(bytes, decimals);
  }
  
  /**
   * Calculates the savings percentage between two sizes.
   * 
   * @param originalSize - Original size in bytes
   * @param compressedSize - Compressed size in bytes
   * @returns Savings percentage (0-100)
   * 
   * @example
   * ```typescript
   * service.getSavingsPercentage(1000000, 250000); // 75
   * ```
   * 
   * @public
   */
  getSavingsPercentage(originalSize: number, compressedSize: number): number {
    if (originalSize === 0) return 0;
    return Math.round(((originalSize - compressedSize) / originalSize) * 100);
  }

  /**
   * Gets the formatted size of an image file.
   * 
   * @param file - Image file to get size from
   * @returns Formatted size string (e.g., "2.5 MB", "500 KB")
   * 
   * @example
   * ```typescript
   * const file = new File([blob], 'image.jpg');
   * console.log(service.getImageSize(file)); // "2.5 MB"
   * ```
   * 
   * @public
   */
  getImageSize(file: File): string {
    return this.formatBytes(file.size);
  }

  /**
   * Aborts any ongoing image processing operations.
   * 
   * Cancels pending convertFormat() or compressImages() operations.
   * Images already processed will be kept, but unprocessed images
   * will be marked with error status.
   * 
   * @example
   * ```typescript
   * // Start conversion
   * const subscription = service.convertFormat(files, { outputFormat: 'webp' })
   *   .subscribe();
   * 
   * // Cancel operation
   * service.abortProcessing();
   * subscription.unsubscribe();
   * ```
   * 
   * @public
   */
  abortProcessing(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }
  
  // ============================================================================
  // PUBLIC API - STATE MANAGEMENT
  // ============================================================================

  /**
   * Removes a specific image from the state by its ID.
   * 
   * Automatically revokes blob URLs to prevent memory leaks and notifies
   * all listeners of the state change.
   * 
   * @param id - Unique identifier of the image to remove
   * 
   * @example
   * ```typescript
   * // Remove a specific image
   * service.removeImage('abc-123-def');
   * 
   * // The image is removed and URLs are cleaned up
   * console.log(service.images); // Image no longer in array
   * ```
   * 
   * @public
   */
  removeImage(id: string): void {
    const imageToRemove = this._imagesMap.get(id);
    
    if (imageToRemove) {
      this.revokeImageUrls(imageToRemove);
      this._imagesMap.delete(id);
      this._imageOrder = this._imageOrder.filter(imgId => imgId !== id);
      this._images$.next(this._buildImagesArray());
    }
  }

  /**
   * Removes all images from the state.
   * 
   * Cleans up all blob URLs to prevent memory leaks and resets the state
   * to its initial empty state.
   * 
   * @example
   * ```typescript
   * // Clear all images
   * service.removeAllImages();
   * 
   * console.log(service.images.length); // 0
   * console.log(service.completedCount); // 0
   * ```
   * 
   * @public
   */
  removeAllImages(): void {
    this.images.forEach(img => this.revokeImageUrls(img));
    this._imagesMap.clear();
    this._imageOrder = [];
    this._images$.next([]);
  }

  /**
   * Removes only successfully completed images from the state.
   * 
   * Keeps pending, processing, and error images in the state. Useful for
   * clearing processed images while retaining failed ones for retry.
   * 
   * @example
   * ```typescript
   * // Remove only completed images
   * service.clearCompleted();
   * 
   * // Only pending/processing/error images remain
   * const remaining = service.images.filter(img => img.status !== 'completed');
   * ```
   * 
   * @public
   */
  clearCompleted(): void {
    // Phase 1: Identify completed IDs without touching the Map.
    const completedIds = new Set<string>();
    this._imageOrder.forEach(id => {
      if (this._imagesMap.get(id)?.status === 'completed') {
        completedIds.add(id);
      }
    });

    // Phase 2: Revoke blob URLs and remove from Map.
    completedIds.forEach(id => {
      const img = this._imagesMap.get(id);
      if (img) {
        this.revokeImageUrls(img);
        this._imagesMap.delete(id);
      }
    });

    // Phase 3: Update the order array in one pass.
    this._imageOrder = this._imageOrder.filter(id => !completedIds.has(id));
    this._images$.next(this._buildImagesArray());
  }

  // ============================================================================
  // PUBLIC API - DOWNLOAD
  // ============================================================================

  /**
   * Downloads a specific compressed image by its ID.
   * 
   * Creates a temporary download link and triggers the download. Only works
   * for images with status 'completed'.
   * 
   * Note: Not available in SSR context (requires browser document API).
   * 
   * @param id - Unique identifier of the image to download
   * 
   * @example
   * ```typescript
   * // Download a specific image
   * service.downloadImage('abc-123-def');
   * ```
   * 
   * @public
   */
  downloadImage(id: string): void {
    // Check if running in browser environment
    if (typeof document === 'undefined' || typeof window === 'undefined') {
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
   * Downloads all successfully compressed images.
   *
   * Triggers individual anchor-click downloads staggered by 100 ms per file.
   * This is a best-effort heuristic — browser behaviour for programmatic
   * multi-file downloads varies: Chromium allows several, Firefox/Safari may
   * block all but the first. For reliable bulk downloads consider zipping
   * on the server or using the File System Access API.
   *
   * Not available in SSR context (requires `document` / `window`).
   *
   * @public
   */
  downloadAllImages(): void {
    // Check if running in browser environment
    if (typeof document === 'undefined' || typeof window === 'undefined') {
      console.warn('[ImageConverter] Download not available in SSR context');
      return;
    }

    // Cancel any in-flight stagger chain from a previous call (QUALITY-03):
    // without this, double-clicking "Download All" would schedule N×2 downloads.
    this._downloadTimeouts.forEach(id => clearTimeout(id));
    this._downloadTimeouts = [];

    const completedImages = this.completedImages;

    if (completedImages.length === 0) {
      console.warn('[ImageConverter] No completed images to download');
      return;
    }

    completedImages.forEach((image, index) => {
      // Stagger downloads to avoid browser blocking
      const id = setTimeout(() => {
        this.downloadImage(image.id);
        this._downloadTimeouts = this._downloadTimeouts.filter(t => t !== id);
      }, index * 100);
      this._downloadTimeouts.push(id);
    });
  }

  // ============================================================================
  // PRIVATE METHODS - PROCESSING
  // ============================================================================

  /**
   * Unified pipeline shared by convertFormat() and compressImages().
   *
   * Key invariants:
   * - BUG-01 fix: files and ImageFile entries are zipped into a paired array before
   *   entering `mergeMap`, eliminating the fragile `index`-based parallel-array correlation.
   * - DESIGN-04 fix: `createImageEntries` produces entries with `status: 'processing'`
   *   directly, collapsing 'pending' + N×'processing' BehaviorSubject emissions into one.
   *
   * @param outputFormat - Defined for conversion; undefined preserves the original format.
   * @private
   */
  private _processFiles(
    files: FileList | File[],
    options: CompressOptions,
    outputFormat: ImageFormat | undefined
  ): Observable<void> {
    const fileArray = Array.from(files);

    if (fileArray.length === 0) {
      console.warn('[ImageConverter] No files provided');
      return EMPTY;
    }

    const errors = this.validateFiles(fileArray);
    if (errors.length > 0) {
      return throwError(() => new ValidationError(errors.join('\n')));
    }

    this.abortController = new AbortController();
    const { signal } = this.abortController;

    const sortOrder = (options as BaseProcessOptions).sortOrder ?? 'asc';
    const optimizedFiles = ImageHelpers.optimizeBatchOrder(fileArray, sortOrder);
    const quality = options.quality ?? this.DEFAULT_QUALITY;

    // BUG-01 fix: zip files + ImageFile entries into typed pairs before mergeMap.
    // Relying on `mergeMap`'s `index` parameter creates a silent data hazard —
    // any upstream filter or transformation would misalign the two arrays.
    const pairs = this.createImageEntries(optimizedFiles, quality, outputFormat)
      .map((imageFile, i) => ({ imageFile, file: optimizedFiles[i] }));

    this.addImagesToState(pairs.map(p => p.imageFile));

    const concurrency = options.concurrency ?? ImageHelpers.getOptimalConcurrency();

    // BUG-01: signal uploading state before work starts; reset unconditionally in finalize.
    this._isUploading$.next(true);
    this._uploadProgress$.next(0);
    let completedCount = 0;
    const totalCount = pairs.length;

    return from(pairs).pipe(
      mergeMap(({ imageFile, file }) => {
        if (signal.aborted) {
          // BUG-02 fix: clean up the queued image so it doesn't stay 'processing' forever.
          this.updateImageStatus(imageFile.id, 'error');
          this.revokeImageUrls(imageFile);
          return throwError(() => new AbortError());
        }
        const format = outputFormat ?? this.detectImageFormat(file.type);
        return this.processImage(imageFile, file, format, options, signal);
      }, concurrency),
      tap(result => {
        this.updateImageOnSuccess(result);
        this._uploadProgress$.next(Math.round((++completedCount / totalCount) * 100));
      }),
      map(() => void 0),
      catchError(error => throwError(() => error)),
      finalize(() => {
        this.abortController = null;
        this._isUploading$.next(false);
        this._uploadProgress$.next(0);
      })
    );
  }

  /**
   * Processes an individual image (conversion or compression).
   * Receives the `AbortSignal` from the active `AbortController` so that
   * `abortProcessing()` also cancels in-flight `imageCompression` calls.
   *
   * DESIGN-04: `_processFiles` already sets all entries to `'processing'` when
   * creating them, so we do NOT call `updateImageStatus` here (avoids N extra
   * BehaviorSubject.next() calls).
   * @private
   */
  private processImage(
    imageFile: ImageFile,
    originalFile: File,
    outputFormat: ImageFormat,
    options: { quality?: number; maxSizeMB?: number; maxWidthOrHeight?: number; useWebWorker?: boolean },
    signal?: AbortSignal
  ): Observable<ProcessingResult> {
    return defer(() => {
      return from(this.compressImage(originalFile, {
        outputFormat,
        quality: options.quality ?? 80,
        maxSizeMB: options.maxSizeMB ?? 10,
        maxWidthOrHeight: options.maxWidthOrHeight ?? 1920,
        useWebWorker: options.useWebWorker ?? false
      }, signal));
    }).pipe(
      map(compressedFile => ({ imageFile, compressedFile })),
      catchError(error => {
        this.updateImageStatus(imageFile.id, 'error');
        const wrapped = new CompressionError(`Failed to compress "${imageFile.name}"`, error);
        console.error(`[ImageConverter] Failed to process ${imageFile.name}:`, wrapped);
        return throwError(() => wrapped);
      })
    );
  }
  
  /**
   * Executes the actual compression using browser-image-compression.
   * The `signal` is forwarded so that `abortProcessing()` genuinely cancels
   * in-flight compression, not just queued files.
   * @private
   */
  private async compressImage(
    file: File,
    options: Required<Omit<ConvertOptions, 'outputFormat' | 'concurrency' | 'sortOrder'>> & { outputFormat: ImageFormat },
    signal?: AbortSignal
  ): Promise<File> {
    const compressionOptions: Parameters<typeof imageCompression>[1] = {
      maxSizeMB: options.maxSizeMB,
      maxWidthOrHeight: options.maxWidthOrHeight,
      useWebWorker: options.useWebWorker,
      fileType: `image/${options.outputFormat}`,
      initialQuality: options.quality / 100,
      signal,
    };

    return await imageCompression(file, compressionOptions);
  }
  
  // ============================================================================
  // PRIVATE METHODS - STATE MANAGEMENT
  // ============================================================================
  
  /**
   * Creates ImageFile entries for processing.
   *
   * DESIGN-04: Entries are created with `status: 'processing'` directly, skipping
   * the 'pending' transient state. This collapses N BehaviorSubject.next() calls
   * (one per `updateImageStatus(id, 'processing')`) into zero extra calls.
   * @private
   */
  private createImageEntries(
    files: File[],
    quality: number,
    outputFormat?: ImageFormat
  ): ImageFile[] {
    return files.map(file => ({
      id: crypto.randomUUID(),
      name: outputFormat ? this.changeFileExtension(file.name, outputFormat) : file.name,
      originalSize: file.size,
      originalUrl: URL.createObjectURL(file),
      status: 'processing' as const,
      quality
    }));
  }

  /** Builds an ordered array snapshot from the internal Map. */
  private _buildImagesArray(): ReadonlyArray<ImageFile> {
    return this._imageOrder
      .map(id => this._imagesMap.get(id))
      .filter((img): img is ImageFile => img !== undefined);
  }
  
  private addImagesToState(images: ImageFile[]): void {
    images.forEach(img => {
      this._imagesMap.set(img.id, img);
      this._imageOrder.push(img.id);
    });
    this._images$.next(this._buildImagesArray());
  }

  private updateImageOnSuccess(result: ProcessingResult): void {
    const existing = this._imagesMap.get(result.imageFile.id);
    if (existing) {
      // Explicit field assignment avoids spreading a discriminated union
      // (TypeScript cannot easily narrow a spread + discriminant override).
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
      this._images$.next(this._buildImagesArray());
    }
  }

  /**
   * Updates the status of an image to a non-completed state.
   * Explicitly reconstructs the non-completed `ImageFile` variant so TypeScript
   * can verify the discriminated union invariant (no spread over unknown variant).
   */
  private updateImageStatus(id: string, status: Exclude<ImageProcessingStatus, 'completed'>): void {
    const existing = this._imagesMap.get(id);
    if (existing) {
      const updated: ImageFile = {
        id: existing.id,
        name: existing.name,
        originalSize: existing.originalSize,
        originalUrl: existing.originalUrl,
        quality: existing.quality,
        status,
      };
      this._imagesMap.set(id, updated);
      this._images$.next(this._buildImagesArray());
    }
  }
  
  /** Revokes blob URLs for a single image to free memory. */
  private revokeImageUrls(image: ImageFile): void {
    if (image.originalUrl) URL.revokeObjectURL(image.originalUrl);
    // compressedUrl only exists on the 'completed' variant of the discriminated union
    if (image.status === 'completed' && image.compressedUrl) {
      URL.revokeObjectURL(image.compressedUrl);
    }
  }
  
  // ============================================================================
  // PRIVATE METHODS - UTILITIES
  // ============================================================================
  
  /**
   * Validates all files and returns ALL errors (not just the first).
   * @private
   */
  private validateFiles(files: File[]): string[] {
    const errors: string[] = [];
    const maxBytes = this.MAX_FILE_SIZE_MB * 1024 * 1024;
    for (const file of files) {
      if (!(VALID_MIME_TYPES as readonly string[]).includes(file.type)) {
        errors.push(`Invalid file type: ${file.type}. File: ${file.name}`);
      } else if (file.size === 0) {
        errors.push(`File is empty: ${file.name}`);
      } else if (file.size > maxBytes) {
        errors.push(`File too large: ${file.name} (${ImageHelpers.formatBytes(file.size)}). Maximum: ${this.MAX_FILE_SIZE_MB}MB`);
      }
    }
    return errors;
  }
  
  /**
   * Detects image format from MIME type.
   * @private
   */
  private detectImageFormat(mimeType: string): ImageFormat {
    return ImageHelpers.detectImageFormat(mimeType);
  }
  
  /**
   * Changes a file's extension according to format.
   * @private
   */
  private changeFileExtension(filename: string, format: ImageFormat): string {
    const lastDotIndex = filename.lastIndexOf('.');
    const nameWithoutExt = lastDotIndex > 0 
      ? filename.substring(0, lastDotIndex)
      : filename;
    return `${nameWithoutExt}.${format}`;
  }
  
}
