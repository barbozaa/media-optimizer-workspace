/**
 * ngx-media-optimizer — public entry point.
 *
 * Import everything from this single module:
 *
 * ```typescript
 * import {
 *   ImageConverterService,
 *   ImageUtilsService,
 * } from 'ngx-media-optimizer';
 * ```
 */

// ── Main service + all its public types ─────────────────────────────────────
export {
  ImageConverterService,
  ValidationError,
  AbortError,
  CompressionError,
  MediaOptimizerError,
} from './lib/media-optimizer.service';

export type {
  ImageFormat,
  ImageFile,
  CompletedImageFile,
  ImageProcessingStatus,
  ConvertOptions,
  CompressOptions,
  BaseProcessOptions,
} from './lib/media-optimizer.service';

// ── Utility service ──────────────────────────────────────────────────────────
export { ImageUtilsService } from './lib/image-utils.service';
export type { ImageInfo } from './lib/image-utils.service';
