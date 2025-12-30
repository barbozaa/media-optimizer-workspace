import { Injectable } from '@angular/core';
import imageCompression from 'browser-image-compression';

/**
 * Image formats supported by the utilities
 * @public
 */
export type ImageFormat = 'webp' | 'jpeg' | 'png';

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
 * Pure utilities for image analysis, validation, and manipulation.
 * 
 * This service provides stateless helper functions for working with images.
 * All methods are pure functions without side effects or state management.
 * 
 * **Use cases:**
 * - Validate image files before processing
 * - Analyze image metadata (dimensions, format, size)
 * - Estimate compression results
 * - Create thumbnails
 * - Convert images to different formats
 * 
 * @example
 * ```typescript
 * @Component({...})
 * export class ImageValidatorComponent {
 *   private imageUtils = inject(ImageUtilsService);
 *   
 *   async validateImage(file: File) {
 *     if (!this.imageUtils.isValidImage(file)) {
 *       console.error('Invalid image format');
 *       return;
 *     }
 *     
 *     const info = await this.imageUtils.getImageInfo(file);
 *     console.log(`Image: ${info.width}x${info.height}, ${info.formattedSize}`);
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
export class ImageUtilsService {

  /**
   * Validates if a file is a valid image.
   * 
   * Checks both MIME type and file extension to ensure the file
   * is actually an image and not just renamed.
   * 
   * @param file - File to validate
   * @returns True if file is a valid image (JPEG, PNG, WebP, or GIF)
   * 
   * @example
   * ```typescript
   * const file = new File([blob], 'image.jpg', { type: 'image/jpeg' });
   * if (imageUtils.isValidImage(file)) {
   *   console.log('Valid image');
   * }
   * ```
   * 
   * @public
   */
  isValidImage(file: File): boolean {
    const validMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    const validExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
    
    const hasValidMime = validMimeTypes.includes(file.type);
    const hasValidExtension = validExtensions.some(ext => 
      file.name.toLowerCase().endsWith(ext)
    );
    
    return hasValidMime && hasValidExtension;
  }

  /**
   * Gets image dimensions (width and height).
   * 
   * Loads the image in memory to read its actual dimensions.
   * 
   * @param file - Image file to analyze
   * @returns Promise with width and height in pixels
   * 
   * @example
   * ```typescript
   * const file = new File([blob], 'image.jpg');
   * const dims = await imageUtils.getImageDimensions(file);
   * console.log(`${dims.width}x${dims.height}`); // "1920x1080"
   * ```
   * 
   * @public
   */
  async getImageDimensions(file: File): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve({ width: img.width, height: img.height });
      };
      
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load image dimensions'));
      };
      
      img.src = url;
    });
  }

  /**
   * Checks if an image needs compression based on size threshold.
   * 
   * @param file - Image file to check
   * @param maxSizeMB - Maximum size threshold in megabytes
   * @returns True if file size exceeds the threshold
   * 
   * @example
   * ```typescript
   * const file = new File([blob], 'image.jpg');
   * if (imageUtils.needsCompression(file, 1)) {
   *   console.log('Image is larger than 1MB, compression recommended');
   * }
   * ```
   * 
   * @public
   */
  needsCompression(file: File, maxSizeMB: number): boolean {
    const maxBytes = maxSizeMB * 1024 * 1024;
    return file.size > maxBytes;
  }

  /**
   * Converts an image file to base64 string.
   * 
   * Useful for previews, storing in localStorage, or sending in JSON.
   * 
   * @param file - Image file to convert
   * @returns Promise with base64 string (includes data URL prefix)
   * 
   * @example
   * ```typescript
   * const file = new File([blob], 'image.jpg');
   * const base64 = await imageUtils.toBase64(file);
   * console.log(base64); // "data:image/jpeg;base64,/9j/4AAQ..."
   * ```
   * 
   * @public
   */
  async toBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
        } else {
          reject(new Error('Failed to convert to base64'));
        }
      };
      
      reader.onerror = () => reject(new Error('Failed to convert file to base64'));
      reader.readAsDataURL(file);
    });
  }

  /**
   * Gets complete information about an image.
   * 
   * Returns comprehensive metadata including dimensions, size, format,
   * and calculated aspect ratio.
   * 
   * @param file - Image file to analyze
   * @returns Promise with complete image information
   * 
   * @example
   * ```typescript
   * const file = new File([blob], 'photo.jpg');
   * const info = await imageUtils.getImageInfo(file);
   * console.log(info.aspectRatioString); // "16:9"
   * console.log(info.formattedSize);     // "2.5 MB"
   * ```
   * 
   * @public
   */
  async getImageInfo(file: File): Promise<ImageInfo> {
    const dimensions = await this.getImageDimensions(file);
    const aspectRatio = dimensions.width / dimensions.height;
    const gcd = this.calculateGCD(dimensions.width, dimensions.height);
    const aspectWidth = dimensions.width / gcd;
    const aspectHeight = dimensions.height / gcd;
    
    return {
      name: file.name,
      size: file.size,
      formattedSize: this.formatBytes(file.size),
      format: this.detectImageFormat(file.type),
      width: dimensions.width,
      height: dimensions.height,
      aspectRatio: aspectRatio,
      aspectRatioString: `${aspectWidth}:${aspectHeight}`
    };
  }

  /**
   * Creates a thumbnail from an image.
   * 
   * Generates a compressed, smaller version of the image suitable for previews.
   * 
   * @param file - Image file to create thumbnail from
   * @param maxSize - Maximum dimension (width or height) in pixels. Default: 200
   * @returns Promise with thumbnail File
   * 
   * @example
   * ```typescript
   * const file = new File([blob], 'image.jpg');
   * const thumb = await imageUtils.createThumbnail(file, 200);
   * console.log(thumb.size); // Much smaller than original
   * ```
   * 
   * @public
   */
  async createThumbnail(file: File, maxSize: number = 200): Promise<File> {
    try {
      const format = this.detectImageFormat(file.type);
      
      const options = {
        maxSizeMB: 0.1,
        maxWidthOrHeight: maxSize,
        useWebWorker: false,
        fileType: `image/${format}`,
        initialQuality: 0.8
      };
      
      return await imageCompression(file, options);
    } catch (error) {
      throw new Error('Failed to create thumbnail');
    }
  }

  /**
   * Validates if an image matches a specific aspect ratio.
   * 
   * Compares the image's aspect ratio against a target ratio with tolerance.
   * 
   * @param file - Image file to validate
   * @param ratio - Target aspect ratio (e.g., "16:9", "1:1", "4:3")
   * @param tolerance - Allowed deviation. Default: 0.01 (1%)
   * @returns Promise with true if aspect ratio matches within tolerance
   * 
   * @example
   * ```typescript
   * const file = new File([blob], 'image.jpg');
   * const isSquare = await imageUtils.validateAspectRatio(file, '1:1');
   * const isWidescreen = await imageUtils.validateAspectRatio(file, '16:9', 0.05);
   * ```
   * 
   * @public
   */
  async validateAspectRatio(
    file: File, 
    ratio: string, 
    tolerance: number = 0.01
  ): Promise<boolean> {
    const [width, height] = ratio.split(':').map(Number);
    
    if (!width || !height) {
      throw new Error('Invalid aspect ratio format. Use "width:height" (e.g., "16:9")');
    }
    
    const dimensions = await this.getImageDimensions(file);
    const targetRatio = width / height;
    const actualRatio = dimensions.width / dimensions.height;
    
    return Math.abs(targetRatio - actualRatio) <= tolerance;
  }

  /**
   * Estimates compressed file size based on quality setting.
   * 
   * Uses format-specific compression factors to estimate the final size.
   * This is a heuristic estimation and actual results may vary.
   * 
   * @param file - Image file to estimate
   * @param quality - Compression quality (0-100)
   * @returns Estimated size in bytes
   * 
   * @example
   * ```typescript
   * const file = new File([blob], 'image.jpg');
   * const estimated = imageUtils.estimateCompressedSize(file, 80);
   * console.log(imageUtils.formatBytes(estimated)); // "500 KB"
   * ```
   * 
   * @public
   */
  estimateCompressedSize(file: File, quality: number): number {
    const format = this.detectImageFormat(file.type);
    
    // Format-specific compression factors
    let compressionFactor: number;
    if (format === 'webp') {
      compressionFactor = 0.65;
    } else if (format === 'png') {
      compressionFactor = 0.75;
    } else {
      compressionFactor = 0.85; // jpeg
    }
    
    // Estimate: size * (quality/100) * compressionFactor
    return Math.round(file.size * (quality / 100) * compressionFactor);
  }

  /**
   * Calculates the best quality setting to achieve a target file size.
   * 
   * Uses format-specific compression factors to recommend an optimal quality.
   * 
   * @param file - Image file to analyze
   * @param targetSizeMB - Target size in megabytes
   * @returns Recommended quality setting (10-100)
   * 
   * @example
   * ```typescript
   * const file = new File([blob], 'image.jpg'); // 5MB file
   * const quality = imageUtils.getBestQuality(file, 1); // Target: 1MB
   * console.log(quality); // ~40
   * ```
   * 
   * @public
   */
  getBestQuality(file: File, targetSizeMB: number): number {
    const targetBytes = targetSizeMB * 1024 * 1024;
    const format = this.detectImageFormat(file.type);
    
    // Format-specific compression factors
    let compressionFactor: number;
    if (format === 'webp') {
      compressionFactor = 0.65;
    } else if (format === 'png') {
      compressionFactor = 0.75;
    } else {
      compressionFactor = 0.85; // jpeg
    }
    
    // Calculate quality: targetBytes = fileSize * quality * compressionFactor
    // So: quality = targetBytes / (fileSize * compressionFactor)
    const qualityRatio = targetBytes / (file.size * compressionFactor);
    
    if (qualityRatio >= 1) return 100; // Already smaller than target
    
    // Convert to 0-100 scale
    const quality = Math.round(qualityRatio * 100);
    return Math.max(10, Math.min(100, quality));
  }

  /**
   * Formats bytes to human-readable format (KB, MB, GB).
   * 
   * @param bytes - Number of bytes
   * @param decimals - Number of decimal places. Default: 2
   * @returns Formatted string (e.g., "1.5 MB")
   * 
   * @example
   * ```typescript
   * imageUtils.formatBytes(1536000); // "1.46 MB"
   * imageUtils.formatBytes(2048, 0);  // "2 KB"
   * ```
   * 
   * @public
   */
  formatBytes(bytes: number, decimals: number = 2): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Detects image format from MIME type.
   * @private
   */
  private detectImageFormat(mimeType: string): ImageFormat {
    if (mimeType.includes('webp')) return 'webp';
    if (mimeType.includes('png')) return 'png';
    return 'jpeg';
  }

  /**
   * Calculates Greatest Common Divisor for aspect ratio calculation.
   * Uses Euclidean algorithm.
   * @private
   */
  private calculateGCD(a: number, b: number): number {
    return b === 0 ? a : this.calculateGCD(b, a % b);
  }
}
