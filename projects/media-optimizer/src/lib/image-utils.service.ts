import { Injectable } from '@angular/core';
import imageCompression from 'browser-image-compression';

/**
 * Image formats supported by the utilities
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
    const validMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];
    const validExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif'];
    
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
  // PUBLIC API - VALIDATION
  // ============================================================================

  /**
   * Validates image dimensions against minimum and maximum constraints.
   * 
   * Checks if the image width and height fall within the specified bounds.
   * Useful for enforcing size requirements before processing.
   * 
   * @param file - Image file to validate
   * @param minWidth - Minimum allowed width in pixels
   * @param minHeight - Minimum allowed height in pixels
   * @param maxWidth - Maximum allowed width in pixels
   * @param maxHeight - Maximum allowed height in pixels
   * @returns Promise resolving to true if dimensions are valid, false otherwise
   * 
   * @example
   * ```typescript
   * const file = new File([blob], 'image.jpg');
   * const isValid = await imageUtils.validateDimensions(file, 100, 100, 4096, 4096);
   * if (!isValid) {
   *   console.error('Image dimensions out of range');
   * }
   * ```
   * 
   * @public
   */
  async validateDimensions(
    file: File,
    minWidth: number,
    minHeight: number,
    maxWidth: number,
    maxHeight: number
  ): Promise<boolean> {
    try {
      const { width, height } = await this.getImageDimensions(file);
      
      return width >= minWidth && 
             width <= maxWidth && 
             height >= minHeight && 
             height <= maxHeight;
    } catch (error) {
      console.error('[ImageUtils] Failed to validate dimensions:', error);
      return false;
    }
  }

  /**
   * Validates file size against minimum and maximum constraints.
   * 
   * Checks if the file size falls within the specified bounds in megabytes.
   * 
   * @param file - File to validate
   * @param maxSizeMB - Maximum allowed size in megabytes
   * @param minSizeMB - Optional minimum size in megabytes (default: 0)
   * @returns True if file size is valid, false otherwise
   * 
   * @example
   * ```typescript
   * const file = new File([blob], 'image.jpg');
   * if (!imageUtils.validateFileSize(file, 5)) {
   *   console.error('File exceeds 5MB limit');
   * }
   * if (!imageUtils.validateFileSize(file, 10, 0.1)) {
   *   console.error('File must be between 0.1MB and 10MB');
   * }
   * ```
   * 
   * @public
   */
  validateFileSize(file: File, maxSizeMB: number, minSizeMB: number = 0): boolean {
    const maxBytes = maxSizeMB * 1024 * 1024;
    const minBytes = minSizeMB * 1024 * 1024;
    
    return file.size >= minBytes && file.size <= maxBytes;
  }

  /**
   * Validates a batch of files against multiple criteria.
   * 
   * Performs comprehensive validation including file type, size, and dimensions.
   * Returns detailed results for each file with validation status and error messages.
   * 
   * @param files - Array of files to validate
   * @param options - Validation options
   * @returns Promise with array of validation results for each file
   * 
   * @example
   * ```typescript
   * const files = [file1, file2, file3];
   * const results = await imageUtils.validateBatch(files, {
   *   maxSizeMB: 5,
   *   minWidth: 100,
   *   maxWidth: 4096,
   *   minHeight: 100,
   *   maxHeight: 4096,
   *   allowedFormats: ['image/jpeg', 'image/png', 'image/webp']
   * });
   * 
   * results.forEach((result, index) => {
   *   if (!result.valid) {
   *     console.error(`File ${index}: ${result.errors.join(', ')}`);
   *   }
   * });
   * ```
   * 
   * @public
   */
  async validateBatch(
    files: File[],
    options: {
      maxSizeMB?: number;
      minSizeMB?: number;
      minWidth?: number;
      minHeight?: number;
      maxWidth?: number;
      maxHeight?: number;
      allowedFormats?: string[];
    }
  ): Promise<Array<{ file: File; valid: boolean; errors: string[] }>> {
    const results = await Promise.all(
      files.map(async (file) => {
        const errors: string[] = [];
        
        // Validate file type
        if (options.allowedFormats) {
          if (!options.allowedFormats.includes(file.type)) {
            errors.push(`Invalid format: ${file.type}. Allowed: ${options.allowedFormats.join(', ')}`);
          }
        } else if (!this.isValidImage(file)) {
          errors.push('Not a valid image file');
        }
        
        // Validate file size
        if (options.maxSizeMB !== undefined || options.minSizeMB !== undefined) {
          const maxMB = options.maxSizeMB ?? Number.POSITIVE_INFINITY;
          const minMB = options.minSizeMB ?? 0;
          
          if (!this.validateFileSize(file, maxMB, minMB)) {
            errors.push(`File size ${this.formatBytes(file.size)} is outside allowed range (${minMB}MB - ${maxMB}MB)`);
          }
        }
        
        // Validate dimensions
        if (
          options.minWidth !== undefined ||
          options.minHeight !== undefined ||
          options.maxWidth !== undefined ||
          options.maxHeight !== undefined
        ) {
          try {
            const minW = options.minWidth ?? 0;
            const minH = options.minHeight ?? 0;
            const maxW = options.maxWidth ?? Number.POSITIVE_INFINITY;
            const maxH = options.maxHeight ?? Number.POSITIVE_INFINITY;
            
            const dimensionsValid = await this.validateDimensions(file, minW, minH, maxW, maxH);
            
            if (!dimensionsValid) {
              const { width, height } = await this.getImageDimensions(file);
              errors.push(`Dimensions ${width}x${height} are outside allowed range (${minW}x${minH} - ${maxW}x${maxH})`);
            }
          } catch (error) {
            errors.push('Failed to read image dimensions');
          }
        }
        
        return {
          file,
          valid: errors.length === 0,
          errors
        };
      })
    );
    
    return results;
  }

  // ============================================================================
  // PUBLIC API - IMAGE ANALYSIS
  // ============================================================================

  /**
   * Checks if an image has transparency (alpha channel).
   * 
   * Analyzes the image pixel data to determine if any pixels have transparency.
   * Returns false for formats that don't support transparency (JPEG).
   * 
   * @param file - Image file to analyze
   * @returns Promise resolving to true if image has transparency, false otherwise
   * 
   * @example
   * ```typescript
   * const file = new File([blob], 'logo.png');
   * const hasAlpha = await imageUtils.hasTransparency(file);
   * if (hasAlpha) {
   *   console.log('Image has transparent pixels');
   * }
   * ```
   * 
   * @public
   */
  async hasTransparency(file: File): Promise<boolean> {
    // JPEG doesn't support transparency
    if (file.type === 'image/jpeg') {
      return false;
    }
    
    try {
      const { width, height } = await this.getImageDimensions(file);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      
      if (!ctx) {
        throw new Error('Failed to get canvas context');
      }
      
      const img = new Image();
      const url = URL.createObjectURL(file);
      
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = url;
      });
      
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      
      const imageData = ctx.getImageData(0, 0, width, height);
      const { data } = imageData;
      
      // Check alpha channel (every 4th byte starting from index 3)
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] < 255) {
          return true;
        }
      }
      
      return false;
    } catch (error) {
      console.error('[ImageUtils] Failed to check transparency:', error);
      return false;
    }
  }

  /**
   * Checks if an image file is animated (e.g., animated GIF or WebP).
   * 
   * Note: This is a heuristic check based on file type and size.
   * GIF and WebP formats can be animated, but detection requires
   * parsing the file structure.
   * 
   * @param file - Image file to check
   * @returns Promise resolving to true if image might be animated
   * 
   * @example
   * ```typescript
   * const file = new File([blob], 'animation.gif');
   * const isAnimated = await imageUtils.isAnimated(file);
   * if (isAnimated) {
   *   console.log('Animated image detected');
   * }
   * ```
   * 
   * @public
   */
  async isAnimated(file: File): Promise<boolean> {
    // Only GIF and WebP support animation
    if (file.type !== 'image/gif' && file.type !== 'image/webp') {
      return false;
    }
    
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      
      if (file.type === 'image/gif') {
        // Check for NETSCAPE2.0 extension (animation marker)
        const netscape = [0x21, 0xFF, 0x0B, 0x4E, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45];
        
        for (let i = 0; i < bytes.length - netscape.length; i++) {
          let match = true;
          for (let j = 0; j < netscape.length; j++) {
            if (bytes[i + j] !== netscape[j]) {
              match = false;
              break;
            }
          }
          if (match) {
            return true;
          }
        }
      } else if (file.type === 'image/webp') {
        // Check for ANIM chunk in WebP
        const riff = String.fromCharCode(...bytes.slice(0, 4));
        const webp = String.fromCharCode(...bytes.slice(8, 12));
        
        if (riff === 'RIFF' && webp === 'WEBP') {
          const anim = String.fromCharCode(...bytes.slice(12, 16));
          return anim === 'ANIM';
        }
      }
      
      return false;
    } catch (error) {
      console.error('[ImageUtils] Failed to check if animated:', error);
      return false;
    }
  }

  /**
   * Gets the dominant color of an image.
   * 
   * Analyzes the image pixels and returns the most common color as a hex string.
   * Uses a simple color quantization algorithm.
   * 
   * @param file - Image file to analyze
   * @returns Promise resolving to hex color string (e.g., "#FF5733")
   * 
   * @example
   * ```typescript
   * const file = new File([blob], 'photo.jpg');
   * const color = await imageUtils.getDominantColor(file);
   * console.log(`Dominant color: ${color}`); // "#FF5733"
   * ```
   * 
   * @public
   */
  async getDominantColor(file: File): Promise<string> {
    try {
      const { width, height } = await this.getImageDimensions(file);
      
      // Resize to small size for faster processing
      const maxDimension = 100;
      const scale = Math.min(maxDimension / width, maxDimension / height);
      const scaledWidth = Math.floor(width * scale);
      const scaledHeight = Math.floor(height * scale);
      
      const canvas = document.createElement('canvas');
      canvas.width = scaledWidth;
      canvas.height = scaledHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      
      if (!ctx) {
        throw new Error('Failed to get canvas context');
      }
      
      const img = new Image();
      const url = URL.createObjectURL(file);
      
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = url;
      });
      
      ctx.drawImage(img, 0, 0, scaledWidth, scaledHeight);
      URL.revokeObjectURL(url);
      
      const imageData = ctx.getImageData(0, 0, scaledWidth, scaledHeight);
      const { data } = imageData;
      
      // Color quantization: group similar colors
      const colorCounts = new Map<string, number>();
      const step = 4; // Sample every nth pixel for speed
      
      for (let i = 0; i < data.length; i += step * 4) {
        // Quantize to reduce color space (divide by 32 and multiply back)
        const r = Math.floor(data[i] / 32) * 32;
        const g = Math.floor(data[i + 1] / 32) * 32;
        const b = Math.floor(data[i + 2] / 32) * 32;
        const alpha = data[i + 3];
        
        // Skip transparent pixels
        if (alpha < 128) {
          continue;
        }
        
        const color = `${r},${g},${b}`;
        colorCounts.set(color, (colorCounts.get(color) || 0) + 1);
      }
      
      // Find most common color
      let maxCount = 0;
      let dominantColor = '0,0,0';
      
      for (const [color, count] of colorCounts.entries()) {
        if (count > maxCount) {
          maxCount = count;
          dominantColor = color;
        }
      }
      
      // Convert to hex
      const [r, g, b] = dominantColor.split(',').map(Number);
      const hex = '#' + [r, g, b]
        .map(x => x.toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase();
      
      return hex;
    } catch (error) {
      console.error('[ImageUtils] Failed to get dominant color:', error);
      return '#000000';
    }
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Detects image format from MIME type.
   * @private
   */
  private detectImageFormat(mimeType: string): ImageFormat {
    if (mimeType.includes('avif')) return 'avif';
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
