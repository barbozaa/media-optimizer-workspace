import { Injectable, OnDestroy } from '@angular/core';
import { Observable, from, defer, EMPTY, throwError } from 'rxjs';
import { map, mergeMap, tap, catchError, finalize } from 'rxjs/operators';
import imageCompression from 'browser-image-compression';
import { ImageHelpers } from './shared/image-helpers';

/**
 * Image formats supported by the service
 * @public
 */
export type ImageFormat = 'webp' | 'jpeg' | 'png' | 'avif';

/**
 * Detailed image information
 * @interface ImageInfo
 * @public
 */
export interface ImageInfo {
  /** File name */
  name: string;
  /** File size in bytes */
  size: number;
  /** Formatted size string */
  formattedSize: string;
  /** Image format/type */
  format: ImageFormat;
  /** Image width in pixels */
  width: number;
  /** Image height in pixels */
  height: number;
  /** Aspect ratio (width/height) */
  aspectRatio: number;
  /** Aspect ratio as string (e.g., "16:9", "1:1") */
  aspectRatioString: string;
}

/**
 * Configuration options for format conversion
 * @interface ConvertOptions
 * @public
 */
export interface ConvertOptions {
  /** Desired output format */
  outputFormat: ImageFormat;
  /** Compression quality (0-100). Default: 80 */
  quality?: number;
  /** Maximum file size in MB. Default: 10 */
  maxSizeMB?: number;
  /** Maximum dimension (width or height) in pixels. Default: 1920 */
  maxWidthOrHeight?: number;
  /** Enable Web Worker processing. Default: false */
  useWebWorker?: boolean;
  /** 
   * Number of images to process simultaneously. 
   * Default: auto-detected based on device capabilities (4-8)
   */
  concurrency?: number;
}

/**
 * Configuration options for compression without format change
 * @interface CompressOptions
 * @public
 */
export interface CompressOptions {
  /** Compression quality (0-100). Default: 80 */
  quality?: number;
  /** Maximum file size in MB. Default: 10 */
  maxSizeMB?: number;
  /** Maximum dimension (width or height) in pixels. Default: 1920 */
  maxWidthOrHeight?: number;
  /** Enable Web Worker processing. Default: false */
  useWebWorker?: boolean;
  /** 
   * Number of images to process simultaneously. 
   * Default: auto-detected based on device capabilities (4-8)
   */
  concurrency?: number;
}

/**
 * Represents an image file in the system
 * @interface ImageFile
 * @public
 */
export interface ImageFile {
  /** Unique UUID v4 identifier */
  readonly id: string;
  /** File name (modified according to output format) */
  readonly name: string;
  /** Original size in bytes */
  readonly originalSize: number;
  /** Compressed size in bytes (0 if not yet processed) */
  readonly compressedSize: number;
  /** Blob URL of the original file */
  readonly originalUrl: string;
  /** Blob URL of the compressed file (empty until completed) */
  readonly compressedUrl: string;
  /** Current processing status */
  readonly status: ImageProcessingStatus;
  /** Applied quality level (0-100) */
  readonly quality: number;
}

/**
 * Possible states during the processing lifecycle
 * @type ImageProcessingStatus
 */
type ImageProcessingStatus = 'pending' | 'processing' | 'completed' | 'error';

/**
 * Internal result of image processing
 * @interface ProcessingResult
 * @private
 */
interface ProcessingResult {
  readonly imageFile: ImageFile;
  readonly compressedFile: File;
}

/**
 * Enterprise service for image conversion and compression.
 * 
 * Implements a reactive pattern using RxJS Observables for asynchronous
 * operations and Angular Signals for immutable state management.
 * 
 * **Key Features:**
 * - Parallel processing with concurrency control
 * - Reactive and immutable state management
 * - Robust error handling
 * - Automatic memory management (blob URL cleanup)
 * - Declarative and composable API
 * - 100% type-safe with strict TypeScript
 * 
 * **Architecture:**
 * - State: Angular Signals (immutable, reactive)
 * - Async Operations: RxJS Observables (declarative, composable)
 * - Side Effects: Tap operators (separation of concerns)
 * 
 * @example
 * ```typescript
 * @Component({...})
 * export class ImageUploaderComponent {
 *   private imageService = inject(ImageConverterService);
 *   
 *   images = this.imageService.images;
 *   
 *   onFilesSelected(files: FileList): void {
 *     this.imageService.convertFormat(files, {
 *       outputFormat: 'webp',
 *       quality: 80,
 *       maxSizeMB: 1
 *     }).subscribe({
 *       next: () => console.log('Conversion completed'),
 *       error: (err) => console.error('Conversion failed', err)
 *     });
 *   }
 * }
 * ```
 * 
 * @public
 * @injectable
 */
@Injectable({
  providedIn: 'root'
})
export class ImageConverterService implements OnDestroy {
  
  // ============================================================================
  // CONSTANTS
  // ============================================================================
  
  private readonly MAX_FILE_SIZE_MB = 100;
  private readonly VALID_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];
  
  /**
   * AbortController for cancelling ongoing operations
   * @private
   */
  private abortController: AbortController | null = null;
  
  // ============================================================================
  // REACTIVE STATE (Immutable State Management)
  // Optimized with Map-based structure for O(1) updates
  // ============================================================================
  
  /**
   * Internal Map for O(1) lookups and updates
   * @internal
   */
  private _imagesMap = new Map<string, ImageFile>();
  
  /**
   * Maintains insertion order for array representation
   * @internal
   */
  private _imageOrder: string[] = [];
  
  /**
   * Private state for server upload
   * @private
   */
  private _isUploading: boolean = false;
  
  /**
   * Internal writable signal for upload progress.
   * @internal - Only for component use, not part of public API
   */
  public _uploadProgress: number = 0;

  /**
   * Listeners for state changes
   * @private
   */
  private _imagesListeners: Array<(images: ReadonlyArray<ImageFile>) => void> = [];
  private _uploadingListeners: Array<(isUploading: boolean) => void> = [];
  private _progressListeners: Array<(progress: number) => void> = [];
  
  /**
   * Read-only getter for all images.
   * Updates automatically when internal state changes.
   * @public
   * @readonly
   */
  get images(): ReadonlyArray<ImageFile> {
    return this._imageOrder
      .map(id => this._imagesMap.get(id))
      .filter((img): img is ImageFile => img !== undefined);
  }
  
  /**
   * Legacy property for backward compatibility
   * @internal
   */
  get _images(): ReadonlyArray<ImageFile> {
    return this.images;
  }
  
  set _images(value: ReadonlyArray<ImageFile>) {
    // Support for tests that directly set _images
    this._imagesMap.clear();
    this._imageOrder = [];
    value.forEach(img => {
      this._imagesMap.set(img.id, img);
      this._imageOrder.push(img.id);
    });
  }
  
  /**
   * Getter indicating if an upload is in progress
   * @public
   * @readonly
   */
  get isUploading(): boolean {
    return this._isUploading;
  }
  
  /**
   * Getter for upload progress (0-100)
   * @public
   * @readonly
   */
  get uploadProgress(): number {
    return this._uploadProgress;
  }
  
  /**
   * Computed property: successfully completed images
   * @public
   * @readonly
   */
  get completedImages(): ReadonlyArray<ImageFile> {
    return this.images.filter(img => img.status === 'completed');
  }
  
  /**
   * Computed property: number of completed images
   * @public
   * @readonly
   */
  get completedCount(): number {
    return this.completedImages.length;
  }
  
  /**
   * Computed property: total original size in bytes
   * @public
   * @readonly
   */
  get totalOriginalSize(): number {
    return this.completedImages.reduce((acc, img) => acc + img.originalSize, 0);
  }
  
  /**
   * Computed property: total compressed size in bytes
   * @public
   * @readonly
   */
  get totalCompressedSize(): number {
    return this.completedImages.reduce((acc, img) => acc + img.compressedSize, 0);
  }
  
  /**
   * Computed property: total savings percentage
   * @public
   * @readonly
   */
  get savingsPercentage(): number {
    const original = this.totalOriginalSize;
    const compressed = this.totalCompressedSize;
    return original > 0 
      ? Math.round(((original - compressed) / original) * 100)
      : 0;
  }

  /**
   * Subscribe to images state changes.
   * Returns unsubscribe function.
   * @public
   * @param callback Function to call when images change
   * @returns Function to unsubscribe
   */
  onImagesChange(callback: (images: ReadonlyArray<ImageFile>) => void): () => void {
    this._imagesListeners.push(callback);
    callback(this.images); // Emit initial value
    
    return () => {
      const index = this._imagesListeners.indexOf(callback);
      if (index > -1) {
        this._imagesListeners.splice(index, 1);
      }
    };
  }

  /**
   * Subscribe to upload status changes.
   * Returns unsubscribe function.
   * @public
   * @param callback Function to call when upload status changes
   * @returns Function to unsubscribe
   */
  onUploadingChange(callback: (isUploading: boolean) => void): () => void {
    this._uploadingListeners.push(callback);
    callback(this._isUploading); // Emit initial value
    
    return () => {
      const index = this._uploadingListeners.indexOf(callback);
      if (index > -1) {
        this._uploadingListeners.splice(index, 1);
      }
    };
  }

  /**
   * Subscribe to upload progress changes.
   * Returns unsubscribe function.
   * @public
   * @param callback Function to call when progress changes
   * @returns Function to unsubscribe
   */
  onProgressChange(callback: (progress: number) => void): () => void {
    this._progressListeners.push(callback);
    callback(this._uploadProgress); // Emit initial value
    
    return () => {
      const index = this._progressListeners.indexOf(callback);
      if (index > -1) {
        this._progressListeners.splice(index, 1);
      }
    };
  }

  /**
   * Notify all images listeners
   * @private
   */
  private notifyImagesChange(): void {
    const images = this.images;
    this._imagesListeners.forEach(listener => listener(images));
  }

  /**
   * Notify all uploading listeners
   * @private
   */
  private notifyUploadingChange(): void {
    this._uploadingListeners.forEach(listener => listener(this._isUploading));
  }

  /**
   * Notify all progress listeners
   * @private
   */
  private notifyProgressChange(): void {
    this._progressListeners.forEach(listener => listener(this._uploadProgress));
  }
  
  /**
   * Angular lifecycle hook - cleanup on service destruction
   */
  ngOnDestroy(): void {
    // Clean up all blob URLs to prevent memory leaks
    this.images.forEach(img => this.revokeImageUrls(img));
    
    // Clear all listeners
    this._imagesListeners = [];
    this._uploadingListeners = [];
    this._progressListeners = [];
    
    // Clear state
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
    const fileArray = Array.from(files);
    
    // Early validation
    if (fileArray.length === 0) {
      console.warn('[ImageConverter] No files provided');
      return EMPTY;
    }
    
    // Validate files
    const validationError = this.validateFiles(fileArray);
    if (validationError) {
      return throwError(() => new Error(validationError));
    }
    
    // Create new AbortController for this operation
    this.abortController = new AbortController();
    const signal = this.abortController.signal;
    
    // Check if already aborted
    if (signal.aborted) {
      return throwError(() => new Error('Operation aborted'));
    }
    
    // Optimize batch order: small files first for faster feedback
    const optimizedFiles = ImageHelpers.optimizeBatchOrder(fileArray);
    
    // Create initial state entries
    const imageFiles = this.createImageEntries(
      optimizedFiles,
      options.quality ?? 80,
      options.outputFormat
    );
    this.addImagesToState(imageFiles);
    
    // Use configured or auto-detected concurrency
    const concurrency = options.concurrency ?? ImageHelpers.getOptimalConcurrency();
    
    // Process in parallel with controlled concurrency
    return from(imageFiles).pipe(
      mergeMap((imageFile, index) => {
        // Check abort signal before processing each file
        if (signal.aborted) {
          return throwError(() => new Error('Operation aborted'));
        }
        return this.processImageConversion(imageFile, optimizedFiles[index], options);
      }, concurrency), // Configurable concurrency
      tap(result => {
        this.updateImageOnSuccess(result);
      }),
      map(() => void 0), // Convert result to void
      catchError(error => this.handleProcessingError(error)),
      finalize(() => {
        // Clear abort controller when operation completes
        this.abortController = null;
      })
    );
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
    const fileArray = Array.from(files);
    
    if (fileArray.length === 0) {
      console.warn('[ImageConverter] No files provided');
      return EMPTY;
    }
    
    // Validate files
    const validationError = this.validateFiles(fileArray);
    if (validationError) {
      return throwError(() => new Error(validationError));
    }
    
    // Create new AbortController for this operation
    this.abortController = new AbortController();
    const signal = this.abortController.signal;
    
    // Check if already aborted
    if (signal.aborted) {
      return throwError(() => new Error('Operation aborted'));
    }
    
    // Optimize batch order
    const optimizedFiles = ImageHelpers.optimizeBatchOrder(fileArray);
    
    const imageFiles = this.createImageEntries(
      optimizedFiles,
      options.quality ?? 80
    );
    this.addImagesToState(imageFiles);
    
    // Use configured or auto-detected concurrency
    const concurrency = options.concurrency ?? ImageHelpers.getOptimalConcurrency();
    
    return from(imageFiles).pipe(
      mergeMap((imageFile, index) => {
        // Check abort signal before processing each file
        if (signal.aborted) {
          return throwError(() => new Error('Operation aborted'));
        }
        return this.processImageCompression(imageFile, optimizedFiles[index], options);
      }, concurrency // Configurable concurrency
      ),
      tap(result => this.updateImageOnSuccess(result)),
      map(() => void 0), // Convert result to void
      catchError(error => this.handleProcessingError(error)),
      finalize(() => {
        // Clear abort controller when operation completes
        this.abortController = null;
      })
    );
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
      this.notifyImagesChange();
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
    this.notifyImagesChange();
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
    this.images.forEach(img => {
      if (img.status === 'completed') {
        this.revokeImageUrls(img);
        this._imagesMap.delete(img.id);
      }
    });
    this._imageOrder = this._imageOrder.filter(id => {
      const img = this._imagesMap.get(id);
      return img && img.status !== 'completed';
    });
    this.notifyImagesChange();
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
   * Iterates through all completed images and triggers individual downloads.
   * Note: Some browsers may block multiple simultaneous downloads.
   * 
   * Note: Not available in SSR context (requires browser document API).
   * 
   * @example
   * ```typescript
   * // Download all completed images
   * service.downloadAllImages();
   * ```
   * 
   * @public
   */
  downloadAllImages(): void {
    // Check if running in browser environment
    if (typeof document === 'undefined' || typeof window === 'undefined') {
      console.warn('[ImageConverter] Download not available in SSR context');
      return;
    }
    
    const completedImages = this.completedImages;
    
    if (completedImages.length === 0) {
      console.warn('[ImageConverter] No completed images to download');
      return;
    }
    
    completedImages.forEach((image, index) => {
      // Stagger downloads to avoid browser blocking
      setTimeout(() => {
        this.downloadImage(image.id);
      }, index * 100);
    });
  }

  // ============================================================================
  // PRIVATE METHODS - PROCESSING
  // ============================================================================
  
  /**
   * Processes an individual image (conversion or compression).
   * @private
   */
  private processImage(
    imageFile: ImageFile,
    originalFile: File,
    outputFormat: ImageFormat,
    options: { quality?: number; maxSizeMB?: number; maxWidthOrHeight?: number; useWebWorker?: boolean }
  ): Observable<ProcessingResult> {
    this.updateImageStatus(imageFile.id, 'processing');
    
    return defer(() => {
      return from(this.compressImage(originalFile, {
        outputFormat,
        quality: options.quality ?? 80,
        maxSizeMB: options.maxSizeMB ?? 10,
        maxWidthOrHeight: options.maxWidthOrHeight ?? 1920,
        useWebWorker: options.useWebWorker ?? false
      }));
    }).pipe(
      map(compressedFile => {
        return { imageFile, compressedFile };
      }),
      catchError(error => {
        this.updateImageStatus(imageFile.id, 'error');
        console.error(`[ImageConverter] Failed to process ${imageFile.name}:`, error);
        return throwError(() => error);
      })
    );
  }
  
  /**
   * Processes the conversion of an individual image.
   * @private
   */
  private processImageConversion(
    imageFile: ImageFile,
    originalFile: File,
    options: ConvertOptions
  ): Observable<ProcessingResult> {
    return this.processImage(imageFile, originalFile, options.outputFormat, options);
  }
  
  /**
   * Processes image compression without format change.
   * @private
   */
  private processImageCompression(
    imageFile: ImageFile,
    originalFile: File,
    options: CompressOptions
  ): Observable<ProcessingResult> {
    const format = this.detectImageFormat(originalFile.type);
    return this.processImage(imageFile, originalFile, format, options);
  }
  
  /**
   * Executes the actual compression using browser-image-compression.
   * @private
   */
  private async compressImage(
    file: File,
    options: Required<Omit<ConvertOptions, 'outputFormat' | 'concurrency'>> & { outputFormat: ImageFormat }
  ): Promise<File> {
    const compressionOptions = {
      maxSizeMB: options.maxSizeMB,
      maxWidthOrHeight: options.maxWidthOrHeight,
      useWebWorker: options.useWebWorker,
      fileType: `image/${options.outputFormat}`,
      initialQuality: options.quality / 100
    };
    
    return await imageCompression(file, compressionOptions);
  }
  
  // ============================================================================
  // PRIVATE METHODS - STATE MANAGEMENT
  // ============================================================================
  
  /**
   * Creates ImageFile entries for processing.
   * @private
   * @param files - Files to create entries for
   * @param quality - Compression quality
   * @param outputFormat - Optional output format (if undefined, keeps original format)
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
      compressedSize: 0,
      originalUrl: URL.createObjectURL(file),
      compressedUrl: '',
      status: 'pending' as const,
      quality
    }));
  }
  
  /**
   * Adds new images to state immutably.
   * Optimized with Map structure for O(1) insertion
   * @private
   */
  private addImagesToState(images: ImageFile[]): void {
    images.forEach(img => {
      this._imagesMap.set(img.id, img);
      this._imageOrder.push(img.id);
    });
    this.notifyImagesChange();
  }
  
  /**
   * Updates image state after successful processing.
   * Optimized with Map structure for O(1) update
   * @private
   */
  private updateImageOnSuccess(result: ProcessingResult): void {
    const existing = this._imagesMap.get(result.imageFile.id);
    if (existing) {
      this._imagesMap.set(result.imageFile.id, {
        ...existing,
        compressedSize: result.compressedFile.size,
        compressedUrl: URL.createObjectURL(result.compressedFile),
        status: 'completed' as const
      });
      this.notifyImagesChange();
    }
  }
  
  /**
   * Updates only the status of an image.
   * Optimized with Map structure for O(1) update
   * @private
   */
  private updateImageStatus(id: string, status: ImageProcessingStatus): void {
    const existing = this._imagesMap.get(id);
    if (existing) {
      this._imagesMap.set(id, { ...existing, status });
      this.notifyImagesChange();
    }
  }
  
  /**
   * Revokes an image's blob URLs to free memory.
   * @internal - Only for component use, not part of public API
   */
  public revokeImageUrls(image: ImageFile): void {
    if (image.originalUrl) URL.revokeObjectURL(image.originalUrl);
    if (image.compressedUrl) URL.revokeObjectURL(image.compressedUrl);
  }
  
  // ============================================================================
  // PRIVATE METHODS - UTILITIES
  // ============================================================================
  
  /**
   * Validates array of files for processing.
   * Checks MIME types and file sizes.
   * @private
   * @returns Error message if validation fails, null if all valid
   */
  private validateFiles(files: File[]): string | null {
    for (const file of files) {
      // Validate MIME type
      if (!this.VALID_MIME_TYPES.includes(file.type)) {
        return `Invalid file type: ${file.type}. File: ${file.name}`;
      }
      
      // Validate file size
      const maxBytes = this.MAX_FILE_SIZE_MB * 1024 * 1024;
      if (file.size > maxBytes) {
        return `File too large: ${file.name} (${ImageHelpers.formatBytes(file.size)}). Maximum: ${this.MAX_FILE_SIZE_MB}MB`;
      }
      
      // Validate file has content
      if (file.size === 0) {
        return `File is empty: ${file.name}`;
      }
    }
    return null;
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
  
  /**
   * Handles errors during processing.
   * @private
   */
  private handleProcessingError(error: Error): Observable<never> {
    console.error('[ImageConverter] Processing error:', error);
    return throwError(() => error);
  }
  
}
