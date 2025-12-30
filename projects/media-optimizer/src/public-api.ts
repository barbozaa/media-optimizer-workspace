/*
 * Public API Surface of media-optimizer
 */

export { 
  ImageConverterService,
  type ImageFile,
  type ImageFormat,
  type ConvertOptions,
  type CompressOptions
} from './lib/media-optimizer.service';

export {
  ImageUtilsService,
  type ImageInfo
} from './lib/image-utils.service';
