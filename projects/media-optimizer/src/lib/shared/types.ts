/**
 * Shared types, constants, and error classes for the media-optimizer library.
 * Single source of truth consumed by both ImageConverterService and ImageUtilsService.
 * @public
 */

// ── Primitive types ────────────────────────────────────────────────────────────

/** Image formats supported by the library */
export type ImageFormat = 'webp' | 'jpeg' | 'png' | 'avif';

/** Processing lifecycle states */
export type ImageProcessingStatus = 'pending' | 'processing' | 'completed' | 'error';

/**
 * Valid MIME types accepted by the library.
 * Single source of truth — consumed by both services; do not duplicate.
 */
export const VALID_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
] as const;

export type ValidMimeType = (typeof VALID_MIME_TYPES)[number];

/** Valid file extensions corresponding to VALID_MIME_TYPES. */
export const VALID_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif'] as const;

// ── Error hierarchy ────────────────────────────────────────────────────────────

/**
 * Base error class for all media-optimizer errors.
 *
 * Consumers can catch `MediaOptimizerError` to handle all library errors, or narrow
 * by `instanceof ValidationError`, `AbortError`, or `CompressionError`.
 * @public
 */
export class MediaOptimizerError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'MediaOptimizerError';
    if (cause !== undefined) (this as any).cause = cause;
    // Restore prototype chain so `instanceof` works when targeting ES5.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when input validation fails (quality out of range, invalid file type, etc.).
 * @public
 */
export class ValidationError extends MediaOptimizerError {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when processing is cancelled via `abortProcessing()`.
 * @public
 */
export class AbortError extends MediaOptimizerError {
  constructor(message = 'Processing was aborted') {
    super(message);
    this.name = 'AbortError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when browser-image-compression itself fails.
 * The original error is preserved in `.cause` for full stack traceability.
 * @public
 */
export class CompressionError extends MediaOptimizerError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = 'CompressionError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ── Image metadata ─────────────────────────────────────────────────────────────

/** Detailed image metadata returned by ImageUtilsService */
export interface ImageInfo {
  name: string;
  size: number;
  formattedSize: string;
  format: ImageFormat;
  width: number;
  height: number;
  aspectRatio: number;
  /** e.g. "16:9", "1:1" */
  aspectRatioString: string;
}

// ── Discriminated union for ImageFile ─────────────────────────────────────────

/** Fields present on every ImageFile, regardless of processing state. */
interface ImageFileBase {
  readonly id: string;
  readonly name: string;
  readonly originalSize: number;
  readonly originalUrl: string;
  readonly quality: number;
}

/**
 * Discriminated union representing an image file in the processing pipeline.
 *
 * - `compressedUrl` and `compressedSize` are only accessible after narrowing
 *   with `image.status === 'completed'` or using the `completedImages` getter.
 *
 * @example
 * ```typescript
 * if (image.status === 'completed') {
 *   console.log(image.compressedUrl); // TypeScript knows this is safe
 * }
 * ```
 */
export type ImageFile =
  | (ImageFileBase & { readonly status: 'pending' | 'processing' | 'error' })
  | (ImageFileBase & {
      readonly status: 'completed';
      readonly compressedSize: number;
      readonly compressedUrl: string;
    });

/** Narrowed type for completed images — `compressedUrl` and `compressedSize` guaranteed present. */
export type CompletedImageFile = Extract<ImageFile, { status: 'completed' }>;

// ── Processing options ─────────────────────────────────────────────────────────

/**
 * Options shared by both `convertFormat()` and `compressImages()`.
 * Extend this interface instead of duplicating fields.
 */
export interface BaseProcessOptions {
  /** Compression quality (0–100). Default: 80 */
  quality?: number;
  /** Maximum file size in MB. Default: 10 */
  maxSizeMB?: number;
  /** Maximum dimension (width or height) in pixels. Default: 1920 */
  maxWidthOrHeight?: number;
  /**
   * @deprecated No longer used. The NativeImageCodec pipeline encodes natively
   * on the calling thread. This option will be removed in a future major version.
   */
  useWebWorker?: boolean;
  /** Parallel processing limit. Default: auto-detected from hardware */
  concurrency?: number;
  /**
   * File sort order before batch processing.
   * - `'asc'`  (default): smallest files first — best perceived responsiveness
   * - `'desc'`: largest files first
   * - `'none'`: preserve original array order
   */
  sortOrder?: 'asc' | 'desc' | 'none';
}

/** Options for format conversion (e.g. PNG → WebP) */
export interface ConvertOptions extends BaseProcessOptions {
  outputFormat: ImageFormat;
}

/** Options for compression without format change */
export interface CompressOptions extends BaseProcessOptions {}
