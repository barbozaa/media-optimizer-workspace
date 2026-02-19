import { ImageFormat } from '../media-optimizer.service';

/**
 * Shared utility functions for image processing
 * @internal
 */
export class ImageHelpers {
  
  // Cache configuration constants
  private static readonly COLOR_QUANTIZATION_FACTOR = 32;
  private static readonly DOMINANT_COLOR_MAX_DIMENSION = 50;
  private static readonly TRANSPARENCY_CHECK_MAX_DIMENSION = 400;
  private static readonly ANIMATION_CHECK_MAX_BYTES = 64 * 1024;
  private static readonly PIXEL_SAMPLING_STEP = 10;
  
  /**
   * Formats bytes to human-readable format (KB, MB, GB)
   * @param bytes - Number of bytes
   * @param decimals - Number of decimal places. Default: 2
   * @returns Formatted string (e.g., "1.5 MB")
   */
  static formatBytes(bytes: number, decimals: number = 2): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
  }
  
  /**
   * Detects image format from MIME type
   * @param mimeType - MIME type string
   * @returns Image format
   */
  static detectImageFormat(mimeType: string): ImageFormat {
    if (mimeType.includes('avif')) return 'avif';
    if (mimeType.includes('webp')) return 'webp';
    if (mimeType.includes('png')) return 'png';
    return 'jpeg';
  }
  
  /**
   * Calculates Greatest Common Divisor using Euclidean algorithm
   * @param a - First number
   * @param b - Second number
   * @returns GCD of a and b
   */
  static calculateGCD(a: number, b: number): number {
    return b === 0 ? a : ImageHelpers.calculateGCD(b, a % b);
  }
  
  /**
   * Loads an image file into HTMLImageElement
   * @param file - Image file to load
   * @returns Promise with loaded image
   */
  static loadImage(file: File): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load image'));
      };
      
      img.src = url;
    });
  }
  
  /**
   * Creates a canvas (OffscreenCanvas if available, fallback to regular Canvas)
   * @param width - Canvas width
   * @param height - Canvas height
   * @returns Canvas element
   */
  static createCanvas(width: number, height: number): HTMLCanvasElement | OffscreenCanvas {
    // Check for browser environment
    if (typeof OffscreenCanvas !== 'undefined') {
      return new OffscreenCanvas(width, height);
    }
    
    // Fallback for environments without OffscreenCanvas
    if (typeof document === 'undefined') {
      throw new Error('Canvas not available in SSR context');
    }
    
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  
  /**
   * Gets optimal concurrency based on device capabilities
   * @returns Recommended concurrency level
   */
  static getOptimalConcurrency(): number {
    const cores = navigator.hardwareConcurrency || 4;
    const memory = (navigator as any).deviceMemory || 4; // GB
    
    if (memory >= 8 && cores >= 8) return 8;
    if (memory >= 4 && cores >= 4) return 6;
    return 4;
  }
  
  /**
   * Extracts image dimensions from file metadata (fast path)
   * @param file - Image file
   * @returns Dimensions or null if not extractable
   */
  static async extractDimensionsFromMetadata(file: File): Promise<{ width: number; height: number } | null> {
    try {
      const headerSize = 64 * 1024;
      const buffer = await file.slice(0, Math.min(headerSize, file.size)).arrayBuffer();
      const view = new DataView(buffer);
      
      // PNG header parsing (fast path)
      if (file.type === 'image/png' && buffer.byteLength >= 24) {
        const signature = view.getUint32(0, false);
        if (signature === 0x89504E47) { // PNG signature
          const width = view.getUint32(16, false);
          const height = view.getUint32(20, false);
          return { width, height };
        }
      }
      
      // JPEG EXIF parsing
      if (file.type === 'image/jpeg' && buffer.byteLength >= 10) {
        // Look for SOF (Start Of Frame) markers
        for (let i = 0; i < buffer.byteLength - 9; i++) {
          if (view.getUint8(i) === 0xFF) {
            const marker = view.getUint8(i + 1);
            // SOF0-SOF15 markers (except SOF4, SOF8, SOF12)
            if ((marker >= 0xC0 && marker <= 0xCF) && 
                marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
              const height = view.getUint16(i + 5, false);
              const width = view.getUint16(i + 7, false);
              if (width > 0 && height > 0) {
                return { width, height };
              }
            }
          }
        }
      }
      
      // WebP header parsing
      if (file.type === 'image/webp' && buffer.byteLength >= 30) {
        const riff = view.getUint32(0, false);
        const webp = view.getUint32(8, false);
        if (riff === 0x52494646 && webp === 0x57454250) {
          const chunkHeader = view.getUint32(12, false);
          // VP8 chunk
          if (chunkHeader === 0x56503820) {
            const width = view.getUint16(26, true) & 0x3fff;
            const height = view.getUint16(28, true) & 0x3fff;
            return { width, height };
          }
          // VP8L chunk
          if (chunkHeader === 0x5650384C) {
            const bits = view.getUint32(21, true);
            const width = ((bits & 0x3FFF) + 1);
            const height = (((bits >> 14) & 0x3FFF) + 1);
            return { width, height };
          }
        }
      }
      
      return null;
    } catch (error) {
      return null;
    }
  }
  
  /**
   * Median Cut algorithm for dominant color extraction
   * Industry standard for palette extraction
   * @param colors - Array of RGB colors
   * @param depth - Recursion depth
   * @returns Clustered colors
   */
  static medianCut(colors: [number, number, number][], depth: number): [number, number, number][] {
    if (depth === 0 || colors.length <= 1) return colors;
    
    // Find channel with largest range
    const ranges = [0, 1, 2].map(channel => {
      const values = colors.map(c => c[channel]);
      return Math.max(...values) - Math.min(...values);
    });
    const channel = ranges.indexOf(Math.max(...ranges));
    
    // Sort by channel and split
    colors.sort((a, b) => a[channel] - b[channel]);
    const mid = Math.floor(colors.length / 2);
    
    return [
      ...this.medianCut(colors.slice(0, mid), depth - 1),
      ...this.medianCut(colors.slice(mid), depth - 1)
    ];
  }
  
  /**
   * Gets the center color of a cluster
   * @param cluster - Array of colors
   * @returns Hex color string
   */
  static getClusterCenter(cluster: [number, number, number][]): string {
    if (cluster.length === 0) return '#000000';
    
    const sum = cluster.reduce(
      (acc, color) => [acc[0] + color[0], acc[1] + color[1], acc[2] + color[2]],
      [0, 0, 0]
    );
    
    const avg = sum.map(s => Math.round(s / cluster.length));
    return '#' + avg.map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase();
  }
  
  /**
   * Extract dominant color using Median Cut algorithm
   * Much faster and more accurate than simple quantization
   * @param data - Image pixel data
   * @returns Hex color string
   */
  static extractDominantColorMedianCut(data: Uint8ClampedArray): string {
    const colorSet = new Set<number>();
    
    // Collect unique colors (use integer packing for deduplication)
    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3];
      if (alpha < 128) continue; // Skip transparent
      
      const color = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
      colorSet.add(color);
    }
    
    // Convert to RGB tuples
    const pixels: [number, number, number][] = [];
    colorSet.forEach(color => {
      pixels.push([
        (color >> 16) & 0xFF,
        (color >> 8) & 0xFF,
        color & 0xFF
      ]);
    });
    
    if (pixels.length === 0) return '#000000';
    
    // Apply median cut to find dominant cluster
    const cluster = this.medianCut(pixels, 5); // 5 iterations
    return this.getClusterCenter(cluster);
  }
  
  /**
   * Checks if image is animated (improved detection)
   * @param file - Image file
   * @returns True if animated
   */
  static async isAnimatedImage(file: File): Promise<boolean> {
    if (file.type !== 'image/gif' && file.type !== 'image/webp') {
      return false;
    }
    
    try {
      const chunkSize = file.type === 'image/gif' ? 128 * 1024 : 4096;
      const buffer = await file.slice(0, Math.min(chunkSize, file.size)).arrayBuffer();
      const bytes = new Uint8Array(buffer);
      
      if (file.type === 'image/gif') {
        // Check for multiple image descriptors (0x2C)
        let imageDescriptorCount = 0;
        for (let i = 0; i < bytes.length - 1; i++) {
          if (bytes[i] === 0x2C) { // Image Separator
            imageDescriptorCount++;
            if (imageDescriptorCount > 1) return true;
          }
        }
        
        // Also check NETSCAPE extension
        const decoder = new TextDecoder('latin1');
        return decoder.decode(bytes).includes('NETSCAPE2.0');
      }
      
      if (file.type === 'image/webp') {
        const view = new DataView(buffer);
        if (buffer.byteLength < 16) return false;
        
        const riff = view.getUint32(0, false);
        if (riff !== 0x52494646) return false;
        
        const webp = view.getUint32(8, false);
        if (webp !== 0x57454250) return false;
        
        const chunk = view.getUint32(12, false);
        return chunk === 0x414E494D; // 'ANIM'
      }
      
      return false;
    } catch (error) {
      return false;
    }
  }
  
  /**
   * Sort files by size for batch optimization
   * Small files first for faster user feedback
   * @param files - Array of files
   * @returns Sorted array
   */
  static optimizeBatchOrder(files: File[]): File[] {
    return files.slice().sort((a, b) => a.size - b.size);
  }
  
  /**
   * Calculate image entropy for compression estimation
   * Higher entropy = more complex = less compressible
   * @param data - Image pixel data
   * @returns Entropy value (0-8)
   */
  static calculateImageEntropy(data: Uint8ClampedArray): number {
    const histogram = new Array(256).fill(0);
    const totalPixels = data.length / 4;
    
    // Build histogram of luminance values
    for (let i = 0; i < data.length; i += 4) {
      const luminance = Math.round(
        0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
      );
      histogram[luminance]++;
    }
    
    // Calculate entropy
    let entropy = 0;
    for (let i = 0; i < 256; i++) {
      if (histogram[i] > 0) {
        const probability = histogram[i] / totalPixels;
        entropy -= probability * Math.log2(probability);
      }
    }
    
    return entropy;
  }
  
  // Constants getters
  static get COLOR_QUANTIZATION() { return this.COLOR_QUANTIZATION_FACTOR; }
  static get DOMINANT_COLOR_SIZE() { return this.DOMINANT_COLOR_MAX_DIMENSION; }
  static get TRANSPARENCY_CHECK_SIZE() { return this.TRANSPARENCY_CHECK_MAX_DIMENSION; }
  static get ANIMATION_BUFFER_SIZE() { return this.ANIMATION_CHECK_MAX_BYTES; }
  static get PIXEL_SAMPLE_STEP() { return this.PIXEL_SAMPLING_STEP; }
}
