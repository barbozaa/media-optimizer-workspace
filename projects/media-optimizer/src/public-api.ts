/*
 * Public API Surface of media-optimizer
 */

export {
  ImageConverterService,
  ValidationError,
  AbortError,
  CompressionError,
  MediaOptimizerError,
  type ImageFile,
  type CompletedImageFile,
  type ImageFormat,
  type ImageProcessingStatus,
  type ConvertOptions,
  type CompressOptions,
  type BaseProcessOptions,
} from './lib/media-optimizer.service';

export {
  ImageUtilsService,
  type ImageInfo
} from './lib/image-utils.service';
