import type { ImageFormat } from './types';

/**
 * Shared utility functions for image processing
 * @internal
 */
export class ImageHelpers {
  
  // Cache configuration constants
  private static readonly DOMINANT_COLOR_MAX_DIMENSION = 50;
  private static readonly ANIMATION_CHECK_MAX_BYTES = 64 * 1024;
  
  /**
   * Formats bytes to human-readable format (KB, MB, GB)
   * @param bytes - Number of bytes
   * @param decimals - Number of decimal places. Default: 2
   * @returns Formatted string (e.g., "1.5 MB")
   */
  static formatBytes(bytes: number, decimals: number = 2): string {
    if (!Number.isFinite(bytes) || bytes < 0) return 'N/A';
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
    
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
    // GIF is not a valid *output* format in this library. Map to WebP because:
    //   • WebP preserves transparency (GIF palette transparency → alpha channel)
    //   • WebP supports animation (ANIM chunks match GIF frame sequences)
    //   • WebP compresses better than GIF in all cases
    // Without this branch, the fallback 'jpeg' would silently destroy both
    // animation and transparency when compressImages() is called on a GIF.
    if (mimeType.includes('gif')) return 'webp';
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
  
  /** Timeout applied to every `loadImage` call (ms). Mirrors the timeout in `ImageUtilsService.getImageDimensions`. */
  private static readonly LOAD_IMAGE_TIMEOUT_MS = 10_000;

  /**
   * Loads an image file into an `HTMLImageElement`.
   *
   * Applies a 10-second timeout and cleans up event handlers and the object
   * URL in all code paths to prevent memory leaks and hanging promises.
   *
   * @param file - Image file to load
   * @returns Promise resolving to the loaded `HTMLImageElement`
   * @throws When the image fails to load or the timeout is reached
   */
  static loadImage(file: File): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);

      const cleanup = () => {
        img.onload = null;
        img.onerror = null;
        URL.revokeObjectURL(url);
      };

      const timeout = setTimeout(() => {
        cleanup();
        img.src = '';
        reject(new Error('Image load timeout'));
      }, ImageHelpers.LOAD_IMAGE_TIMEOUT_MS);

      img.onload = () => {
        clearTimeout(timeout);
        cleanup();
        resolve(img);
      };

      img.onerror = () => {
        clearTimeout(timeout);
        cleanup();
        img.src = '';
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
    if (typeof navigator === 'undefined') return 4; // SSR guard
    const cores = navigator.hardwareConcurrency || 4;
    const memory = (navigator as any).deviceMemory || 4; // GB

    if (memory >= 8 && cores >= 8) return 8;
    if (memory >= 4 && cores >= 4) return 6;
    return 4;
  }
  
  /**
   * Extracts image dimensions from file metadata (fast path).
   *
   * Supports PNG, GIF87a/89a, WebP (VP8/VP8L), and JPEG (via proper length-delimited
   * marker navigation — not a byte scanner). Falls back to `loadImage` for unsupported
   * formats or malformed headers.
   *
   * @param file - Image file
   * @returns Dimensions or null if not extractable from metadata
   */
  static async extractDimensionsFromMetadata(file: File): Promise<{ width: number; height: number } | null> {
    try {
      const headerSize = 64 * 1024;
      const buffer = await file.slice(0, Math.min(headerSize, file.size)).arrayBuffer();
      const view = new DataView(buffer);

      // ── PNG ──────────────────────────────────────────────────────────────────
      // Signature: 8 bytes. IHDR chunk starts at offset 8; width/height at 16/20.
      if (file.type === 'image/png' && buffer.byteLength >= 24) {
        if (view.getUint32(0, false) === 0x89504E47) {
          const width = view.getUint32(16, false);
          const height = view.getUint32(20, false);
          if (width > 0 && height > 0) return { width, height };
        }
      }

      // ── GIF ──────────────────────────────────────────────────────────────────
      // Logical screen descriptor: width at offset 6, height at offset 8 (little-endian).
      if (file.type === 'image/gif' && buffer.byteLength >= 10) {
        // GIF87a = 0x47494638 37 61, GIF89a = 0x47494638 39 61
        if (view.getUint32(0, false) === 0x47494638) {
          const width = view.getUint16(6, true);
          const height = view.getUint16(8, true);
          if (width > 0 && height > 0) return { width, height };
        }
      }

      // ── JPEG ─────────────────────────────────────────────────────────────────
      // Navigate the marker chain using the length field of each segment.
      // A byte-scanner that ignores lengths returns wrong dimensions on files
      // whose APP0/APP1 payloads happen to contain SOF-pattern bytes.
      if (file.type === 'image/jpeg' && buffer.byteLength >= 4) {
        if (view.getUint16(0, false) !== 0xFFD8) return null; // Not a JPEG
        let offset = 2;
        while (offset < buffer.byteLength) {
          if (view.getUint8(offset) !== 0xFF) break;

          // Per JPEG spec §B.1.1.3, any number of 0xFF fill bytes may precede
          // a marker. Advance markerPos past all consecutive 0xFF bytes so that
          // markerPos lands on the actual (non-0xFF) marker code byte.
          let markerPos = offset + 1;
          while (markerPos < buffer.byteLength && view.getUint8(markerPos) === 0xFF) {
            markerPos++;
          }
          if (markerPos >= buffer.byteLength) break;

          // Rebase offset to (markerPos - 1) so the rest of the parsing logic
          // continues to use the same relative offsets:
          //   offset+1 = marker type,  offset+2..3 = length,  offset+5..8 = SOF dims.
          offset = markerPos - 1;

          const marker = view.getUint8(offset + 1);

          // End-of-image
          if (marker === 0xD9) break;

          // Standalone markers (SOI, RST0–RST7) — no length field
          if (marker === 0xD8 || (marker >= 0xD0 && marker <= 0xD7)) {
            offset += 2;
            continue;
          }

          if (offset + 4 > buffer.byteLength) break;
          const segmentLength = view.getUint16(offset + 2, false);
          if (segmentLength < 2) break; // malformed segment, bail out

          // SOF markers carry frame dimensions at fixed offsets within the segment.
          // SOF0–SOF15 but not SOF4 (0xC4=DHT), SOF8 (0xC8=JPG), SOF12 (0xCC=DAC).
          if (
            marker >= 0xC0 && marker <= 0xCF &&
            marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC
          ) {
            if (offset + 9 <= buffer.byteLength) {
              const height = view.getUint16(offset + 5, false);
              const width  = view.getUint16(offset + 7, false);
              if (width > 0 && height > 0) return { width, height };
            }
          }

          // Advance past this segment (marker 2 bytes + length field + payload)
          offset += 2 + segmentLength;
        }
        return null;
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
          // VP8X chunk — extended WebP (animated, alpha, ICC profile, etc.)
          // Canvas dimensions are stored as (value − 1) in 24-bit LE fields:
          //   offset 24–26: canvas width  − 1
          //   offset 27–29: canvas height − 1
          if (chunkHeader === 0x56503858 && buffer.byteLength >= 30) {
            const width  = (view.getUint8(24) | (view.getUint8(25) << 8) | (view.getUint8(26) << 16)) + 1;
            const height = (view.getUint8(27) | (view.getUint8(28) << 8) | (view.getUint8(29) << 16)) + 1;
            if (width > 0 && height > 0) return { width, height };
          }
        }
      }
      
      return null;
    } catch (error) {
      return null;
    }
  }
  
  /**
   * Median Cut algorithm for dominant color extraction.
   *
   * Returns an **array of clusters** (each cluster is an array of RGB tuples).
   * The caller selects the largest cluster and computes its centroid.
   *
   * @param colors - Array of RGB colors (NOT mutated)
   * @param depth  - Recursion depth; produces up to 2^depth clusters
   */
  static medianCut(
    colors: [number, number, number][],
    depth: number,
  ): [number, number, number][][] {
    if (depth === 0 || colors.length <= 1) return [colors];

    // Find the channel (R/G/B) with the largest value range.
    // Explicit loop avoids Math.max/min spread — safer for large arrays in all
    // JS environments and avoids the potential argument-stack limit.
    let maxRange = -1;
    let channel = 0;
    for (let ch = 0; ch < 3; ch++) {
      let min = colors[0][ch];
      let max = colors[0][ch];
      for (const c of colors) {
        if (c[ch] < min) min = c[ch];
        if (c[ch] > max) max = c[ch];
      }
      const range = max - min;
      if (range > maxRange) { maxRange = range; channel = ch; }
    }

    // Sort a COPY to avoid mutating the caller's array.
    const sorted = colors.slice().sort((a, b) => a[channel] - b[channel]);
    const mid = Math.floor(sorted.length / 2);

    return [
      ...this.medianCut(sorted.slice(0, mid), depth - 1),
      ...this.medianCut(sorted.slice(mid),    depth - 1),
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
   * Extract dominant color using Median Cut algorithm.
   *
   * **Input-size contract:** `data` must be the pixel data of a pre-scaled image
   * (≤ 50×50 = 2 500 px, i.e. `data.length ≤ 10 000` bytes). Passing raw full-resolution
   * image data is unsupported and will be rejected to prevent unbounded memory usage.
   *
   * `ImageUtilsService.getDominantColor` always scales down to 50×50 before calling
   * this method. If you call it directly, scale first.
   *
   * @param data - Pixel data of a small (≤50×50) image
   * @returns Hex color string
   */
  static extractDominantColorMedianCut(data: Uint8ClampedArray): string {
    // Guard: reject suspiciously large inputs (> 100×100 px) to prevent O(N) memory spikes.
    const MAX_PIXELS = 100 * 100;
    if (data.length / 4 > MAX_PIXELS) {
      throw new Error(
        `extractDominantColorMedianCut: input is ${data.length / 4} pixels — ` +
        `maximum is ${MAX_PIXELS}. Scale the image down before calling this method.`
      );
    }

    // Collect ALL non-transparent pixels (with repetition).
    // Keeping duplicates is essential: cluster sizes then reflect actual pixel
    // frequency, so the "largest cluster" == the truly dominant color group.
    // (Using a Set to deduplicate unique colors first would cause solid-color
    // regions with few unique hues to lose against noisy regions with many
    // slightly different shades.)
    const pixels: [number, number, number][] = [];
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue; // skip transparent pixels
      pixels.push([data[i], data[i + 1], data[i + 2]]);
    }

    if (pixels.length === 0) return '#000000';

    // Produce up to 2^4 = 16 clusters, then pick the largest one.
    // The largest cluster contains the most pixels — that is the dominant color.
    const clusters = this.medianCut(pixels, 4);
    const dominant = clusters.reduce((a, b) => (a.length >= b.length ? a : b));
    return this.getClusterCenter(dominant);
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
        // Walk the GIF block structure to count Image Descriptors (Image Separator = 0x2C).
        // A raw byte scan is unreliable: LZW-compressed image sub-block payloads are
        // binary data and can contain 0x2C as a data byte, producing false positives.
        // NETSCAPE2.0 alone is also a false positive: a single-frame looping GIF has
        // the extension but is not animated.
        //
        // Need at least header(6) + LSD(7) bytes to navigate the Global Color Table.
        if (bytes.length < 13) return false;

        // Logical Screen Descriptor packed field → Global Color Table size.
        const lsdPacked = bytes[10];
        const gctFlag   = (lsdPacked >> 7) & 1;
        const gctSize   = gctFlag ? 3 * (2 ** ((lsdPacked & 0x07) + 1)) : 0;
        let pos = 13 + gctSize; // skip header + LSD + optional GCT

        /** Skip a GIF sub-block sequence: each chunk is (length byte + data); ends on length = 0. */
        const skipSubBlocks = (): void => {
          while (pos < bytes.length) {
            const n = bytes[pos++];
            if (n === 0) break; // block terminator
            pos += n;
          }
        };

        let frameCount = 0;
        blockLoop: while (pos < bytes.length) {
          const sentinel = bytes[pos++];
          switch (sentinel) {
            case 0x3B: // GIF Trailer
              break blockLoop;

            case 0x2C: { // Image Descriptor (Image Separator)
              if (++frameCount > 1) return true; // multiple frames → animated
              if (pos + 8 >= bytes.length) break blockLoop; // truncated
              const localPacked = bytes[pos + 8];
              pos += 9; // skip left, top, w, h, packed fields
              const hasLCT  = (localPacked >> 7) & 1;
              const lctSize = hasLCT ? 3 * (2 ** ((localPacked & 0x07) + 1)) : 0;
              pos += lctSize; // skip optional Local Color Table
              pos += 1;       // skip LZW minimum code size byte
              skipSubBlocks(); // skip LZW-compressed image data
              break;
            }

            case 0x21: { // Extension Introducer — skip label + sub-blocks
              if (pos >= bytes.length) break blockLoop;
              pos += 1; // skip extension label (e.g. 0xF9 GCE, 0xFF Application)
              skipSubBlocks();
              break;
            }

            default: // Unknown block — malformed or truncated file
              break blockLoop;
          }
        }

        return false; // 0 or 1 frame found → not animated
      }
      
      if (file.type === 'image/webp') {
        const view = new DataView(buffer);
        if (buffer.byteLength < 16) return false;
        
        const riff = view.getUint32(0, false);
        if (riff !== 0x52494646) return false;
        
        const webp = view.getUint32(8, false);
        if (webp !== 0x57454250) return false;
        
        // Per the WebP container spec, only VP8X (extended format) files can
        // contain animation. The four-byte chunk FourCC at offset 12 will be
        // 'VP8X' (0x56503858) for any extended WebP, including animated ones.
        // The animation flag is bit 1 of the 4-byte VP8X flags field that
        // begins at absolute offset 20 (VP8X payload starts right after the
        // 8-byte chunk header: 4 FourCC + 4 size).
        // Simple VP8 / VP8L WebP files have 'VP8 ' or 'VP8L' at offset 12 —
        // those formats never carry animation, so we return false for them.
        if (buffer.byteLength < 21) return false;
        if (view.getUint32(12, false) !== 0x56503858) return false; // must be 'VP8X'
        return (view.getUint8(20) & 0x02) !== 0; // animation flag
      }
      
      return false;
    } catch (error) {
      return false;
    }
  }
  
  /**
   * Returns a sorted copy of the file array for batch processing.
   *
   * @param files     - Source array (not mutated)
   * @param sortOrder - `'asc'` (default) puts small files first for fastest perceived
   *                    responsiveness; `'desc'` largest-first; `'none'` preserves order.
   */
  static optimizeBatchOrder(files: File[], sortOrder: 'asc' | 'desc' | 'none' = 'asc'): File[] {
    if (sortOrder === 'none') return files.slice();
    const sign = sortOrder === 'asc' ? 1 : -1;
    return files.slice().sort((a, b) => sign * (a.size - b.size));
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
  static get DOMINANT_COLOR_SIZE() { return this.DOMINANT_COLOR_MAX_DIMENSION; }
  static get ANIMATION_BUFFER_SIZE() { return this.ANIMATION_CHECK_MAX_BYTES; }
}
