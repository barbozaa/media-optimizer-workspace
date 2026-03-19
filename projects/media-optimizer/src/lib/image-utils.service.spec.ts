import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ImageUtilsService } from './image-utils.service';
import * as browserImageCompression from 'browser-image-compression';

// Mock browser-image-compression
vi.mock('browser-image-compression', () => ({
  default: vi.fn()
}));

// Mock ProgressEvent for FileReader tests
class MockProgressEvent {
  constructor(public type: string, public target?: any) {}
}
global.ProgressEvent = MockProgressEvent as any;

describe('ImageUtilsService', () => {
  let service: ImageUtilsService;
  let mockFile: File;
  let mockBlob: Blob;

  beforeEach(() => {
    service = new ImageUtilsService();

    // Create mock file
    mockBlob = new Blob(['test content'], { type: 'image/jpeg' });
    mockFile = new File([mockBlob], 'test.jpg', { type: 'image/jpeg' });

    // Mock URL.createObjectURL and revokeObjectURL
    global.URL.createObjectURL = vi.fn(() => 'blob:mock-url-' + Math.random());
    global.URL.revokeObjectURL = vi.fn();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('isValidImage()', () => {
    it('should return true for valid image MIME types', () => {
      const jpegFile = new File([mockBlob], 'test.jpg', { type: 'image/jpeg' });
      const pngFile = new File([mockBlob], 'test.png', { type: 'image/png' });
      const webpFile = new File([mockBlob], 'test.webp', { type: 'image/webp' });
      const gifFile = new File([mockBlob], 'test.gif', { type: 'image/gif' });

      expect(service.isValidImage(jpegFile)).toBe(true);
      expect(service.isValidImage(pngFile)).toBe(true);
      expect(service.isValidImage(webpFile)).toBe(true);
      expect(service.isValidImage(gifFile)).toBe(true);
    });

    it('should return false for invalid MIME types', () => {
      const pdfFile = new File([mockBlob], 'document.pdf', { type: 'application/pdf' });
      const textFile = new File([mockBlob], 'text.txt', { type: 'text/plain' });
      const videoFile = new File([mockBlob], 'video.mp4', { type: 'video/mp4' });

      expect(service.isValidImage(pdfFile)).toBe(false);
      expect(service.isValidImage(textFile)).toBe(false);
      expect(service.isValidImage(videoFile)).toBe(false);
    });

    it('should return false for valid MIME but invalid extension', () => {
      const fileWithWrongExt = new File([mockBlob], 'test.pdf', { type: 'image/jpeg' });
      expect(service.isValidImage(fileWithWrongExt)).toBe(false);
    });

    it('should return false for invalid MIME but valid extension', () => {
      const fileWithWrongMime = new File([mockBlob], 'test.jpg', { type: 'application/pdf' });
      expect(service.isValidImage(fileWithWrongMime)).toBe(false);
    });
  });

  describe('getImageDimensions()', () => {
    it('should return image dimensions for a valid image', async () => {
      const mockImage: Partial<HTMLImageElement> = {
        width: 800,
        height: 600,
        naturalWidth: 800,
        naturalHeight: 600,
        onload: null,
        onerror: null,
        src: ''
      };

      global.Image = function() { return mockImage as HTMLImageElement; } as unknown as typeof Image;

      const promise = service.getImageDimensions(mockFile);
      
      // Simulate image load
      setTimeout(() => mockImage.onload && mockImage.onload.call(mockImage as any, new Event('load')), 0);

      const dimensions = await promise;
      expect(dimensions).toEqual({ width: 800, height: 600 });
    });

    it('should reject when image fails to load', async () => {
      const mockImage: Partial<HTMLImageElement> = {
        width: 0,
        height: 0,
        naturalWidth: 0,
        naturalHeight: 0,
        onload: null,
        onerror: null,
        src: ''
      };

      global.Image = function() { return mockImage as HTMLImageElement; } as unknown as typeof Image;

      const promise = service.getImageDimensions(mockFile);
      
      // Simulate image error
      setTimeout(() => mockImage.onerror && mockImage.onerror.call(mockImage as any, new Event('error')), 0);

      await expect(promise).rejects.toThrow('Failed to load image');
    });
  });

  describe('needsCompression()', () => {
    it('should return true when file size exceeds maxSizeMB', () => {
      const largeBlob = new Blob(['x'.repeat(3 * 1024 * 1024)], { type: 'image/jpeg' });
      const largeFile = new File([largeBlob], 'large.jpg', { type: 'image/jpeg' });
      
      expect(service.needsCompression(largeFile, 2)).toBe(true);
    });

    it('should return false when file size is below maxSizeMB', () => {
      const smallBlob = new Blob(['small content'], { type: 'image/jpeg' });
      const smallFile = new File([smallBlob], 'small.jpg', { type: 'image/jpeg' });
      
      expect(service.needsCompression(smallFile, 2)).toBe(false);
    });

    it('should return false when file size equals maxSizeMB', () => {
      const exactBlob = new Blob(['x'.repeat(2 * 1024 * 1024)], { type: 'image/jpeg' });
      const exactFile = new File([exactBlob], 'exact.jpg', { type: 'image/jpeg' });
      
      expect(service.needsCompression(exactFile, 2)).toBe(false);
    });
  });

  describe('toBase64()', () => {
    it('should convert file to base64 string', async () => {
      const mockBase64 = 'data:image/jpeg;base64,dGVzdCBjb250ZW50';
      
      const mockFileReader: Partial<FileReader> = {
        readAsDataURL: vi.fn(),
        abort: vi.fn(),
        onload: null,
        onerror: null,
        result: mockBase64
      };

      global.FileReader = function() { return mockFileReader as FileReader; } as unknown as typeof FileReader;

      const promise = service.toBase64(mockFile);
      
      // Simulate successful read
      setTimeout(() => mockFileReader.onload && mockFileReader.onload.call(mockFileReader as any, new ProgressEvent('load') as any), 0);

      const result = await promise;
      expect(result).toBe(mockBase64);
      expect(mockFileReader.readAsDataURL).toHaveBeenCalledWith(mockFile);
    });

    it('should reject on FileReader error', async () => {
      const mockFileReader: Partial<FileReader> = {
        readAsDataURL: vi.fn(),
        abort: vi.fn(),
        onload: null,
        onerror: null,
        result: null
      };

      global.FileReader = function() { return mockFileReader as FileReader; } as unknown as typeof FileReader;

      const promise = service.toBase64(mockFile);
      
      // Simulate error
      setTimeout(() => mockFileReader.onerror && mockFileReader.onerror.call(mockFileReader as any, new ProgressEvent('error') as any), 0);

      await expect(promise).rejects.toThrow('Failed to convert file to base64');
    });

    it('should reject when result is not a string', async () => {
      const mockFileReader: Partial<FileReader> = {
        readAsDataURL: vi.fn(),
        abort: vi.fn(),
        onload: null,
        onerror: null,
        result: new ArrayBuffer(8) // Not a string
      };

      global.FileReader = function() { return mockFileReader as FileReader; } as unknown as typeof FileReader;

      const promise = service.toBase64(mockFile);
      
      // Simulate successful read but with non-string result
      setTimeout(() => mockFileReader.onload && mockFileReader.onload.call(mockFileReader as any, new ProgressEvent('load') as any), 0);

      await expect(promise).rejects.toThrow('Failed to convert to base64');
    });
  });

  describe('getImageInfo()', () => {
    it('should return complete image information including aspect ratio', async () => {
      const mockImage: Partial<HTMLImageElement> = {
        width: 1920,
        height: 1080,
        naturalWidth: 1920,
        naturalHeight: 1080,
        onload: null,
        onerror: null,
        src: ''
      };

      global.Image = function() { return mockImage as HTMLImageElement; } as unknown as typeof Image;

      const testFile = new File([mockBlob], 'photo.jpg', { type: 'image/jpeg' });
      Object.defineProperty(testFile, 'size', { value: 2048000 }); // 2MB

      const promise = service.getImageInfo(testFile);
      
      // Simulate image load
      setTimeout(() => mockImage.onload && mockImage.onload.call(mockImage as any, new Event('load')), 0);

      const info = await promise;
      
      expect(info.name).toBe('photo.jpg');
      expect(info.size).toBe(2048000);
      expect(info.formattedSize).toBe('1.95 MB'); // 2048000 / 1024 / 1024 = 1.953125
      expect(info.format).toBe('jpeg');
      expect(info.width).toBe(1920);
      expect(info.height).toBe(1080);
      expect(info.aspectRatio).toBeCloseTo(1.778, 2);
      expect(info.aspectRatioString).toBe('16:9');
    });

    it('should handle 1:1 aspect ratio correctly', async () => {
      const mockImage: Partial<HTMLImageElement> = {
        width: 1000,
        height: 1000,
        naturalWidth: 1000,
        naturalHeight: 1000,
        onload: null,
        onerror: null,
        src: ''
      };

      global.Image = function() { return mockImage as HTMLImageElement; } as unknown as typeof Image;

      const promise = service.getImageInfo(mockFile);
      setTimeout(() => mockImage.onload && mockImage.onload.call(mockImage as any, new Event('load')), 0);

      const info = await promise;
      
      expect(info.aspectRatioString).toBe('1:1');
      expect(info.aspectRatio).toBe(1);
    });

    it('should handle different image formats', async () => {
      const pngFile = new File([mockBlob], 'image.png', { type: 'image/png' });
      const webpFile = new File([mockBlob], 'image.webp', { type: 'image/webp' });

      const mockImage1: Partial<HTMLImageElement> = {
        width: 800,
        height: 600,
        naturalWidth: 800,
        naturalHeight: 600,
        onload: null,
        onerror: null,
        src: ''
      };

      global.Image = function() { return mockImage1 as HTMLImageElement; } as unknown as typeof Image;

      const pngPromise = service.getImageInfo(pngFile);
      setTimeout(() => mockImage1.onload && mockImage1.onload.call(mockImage1 as any, new Event('load')), 0);
      const pngInfo = await pngPromise;
      
      expect(pngInfo.format).toBe('png');

      const mockImage2: Partial<HTMLImageElement> = {
        width: 800,
        height: 600,
        naturalWidth: 800,
        naturalHeight: 600,
        onload: null,
        onerror: null,
        src: ''
      };

      global.Image = function() { return mockImage2 as HTMLImageElement; } as unknown as typeof Image;
      
      const webpPromise = service.getImageInfo(webpFile);
      setTimeout(() => mockImage2.onload && mockImage2.onload.call(mockImage2 as any, new Event('load')), 0);
      const webpInfo = await webpPromise;
      
      expect(webpInfo.format).toBe('webp');
    });
  });

  describe('createThumbnail()', () => {
    it('should create a thumbnail with default maxSize', async () => {
      const compressedBlob = new Blob(['compressed'], { type: 'image/jpeg' });
      const compressedFile = new File([compressedBlob], 'thumb.jpg', { type: 'image/jpeg' });
      
      vi.mocked(browserImageCompression.default).mockResolvedValue(compressedFile);

      const thumbnail = await service.createThumbnail(mockFile);

      expect(browserImageCompression.default).toHaveBeenCalledWith(mockFile, {
        maxSizeMB: 0.1,
        maxWidthOrHeight: 200,
        useWebWorker: false,
        fileType: 'image/jpeg',
        initialQuality: 0.8
      });
      expect(thumbnail).toBe(compressedFile);
    });

    it('should create a thumbnail with custom maxSize', async () => {
      const compressedBlob = new Blob(['compressed'], { type: 'image/jpeg' });
      const compressedFile = new File([compressedBlob], 'thumb.jpg', { type: 'image/jpeg' });
      
      vi.mocked(browserImageCompression.default).mockResolvedValue(compressedFile);

      const thumbnail = await service.createThumbnail(mockFile, 400);

      expect(browserImageCompression.default).toHaveBeenCalledWith(mockFile, {
        maxSizeMB: 0.1,
        maxWidthOrHeight: 400,
        useWebWorker: false,
        fileType: 'image/jpeg',
        initialQuality: 0.8
      });
    });

    it('should throw error when thumbnail creation fails', async () => {
      vi.mocked(browserImageCompression.default).mockRejectedValue(new Error('Compression failed'));

      await expect(service.createThumbnail(mockFile)).rejects.toThrow('Failed to create thumbnail');
    });
  });

  describe('validateAspectRatio()', () => {
    it('should return true for matching 16:9 aspect ratio', async () => {
      const mockImage: Partial<HTMLImageElement> = {
        width: 1920,
        height: 1080,
        naturalWidth: 1920,
        naturalHeight: 1080,
        onload: null,
        onerror: null,
        src: ''
      };

      global.Image = function() { return mockImage as HTMLImageElement; } as unknown as typeof Image;

      const promise = service.validateAspectRatio(mockFile, '16:9');
      setTimeout(() => mockImage.onload && mockImage.onload.call(mockImage as any, new Event('load')), 0);

      const result = await promise;
      expect(result).toBe(true);
    });

    it('should return false for non-matching aspect ratio', async () => {
      const mockImage: Partial<HTMLImageElement> = {
        width: 1920,
        height: 1080,
        naturalWidth: 1920,
        naturalHeight: 1080,
        onload: null,
        onerror: null,
        src: ''
      };

      global.Image = function() { return mockImage as HTMLImageElement; } as unknown as typeof Image;

      const promise = service.validateAspectRatio(mockFile, '1:1');
      setTimeout(() => mockImage.onload && mockImage.onload.call(mockImage as any, new Event('load')), 0);

      const result = await promise;
      expect(result).toBe(false);
    });

    it('should handle 4:3 aspect ratio', async () => {
      const mockImage: Partial<HTMLImageElement> = {
        width: 800,
        height: 600,
        naturalWidth: 800,
        naturalHeight: 600,
        onload: null,
        onerror: null,
        src: ''
      };

      global.Image = function() { return mockImage as HTMLImageElement; } as unknown as typeof Image;

      const promise = service.validateAspectRatio(mockFile, '4:3');
      setTimeout(() => mockImage.onload && mockImage.onload.call(mockImage as any, new Event('load')), 0);

      const result = await promise;
      expect(result).toBe(true);
    });

    it('should accept custom tolerance', async () => {
      // With default tolerance (0.01) should fail
      // 16:9 = 1.7777..., 1920:1080 = 1.7777..., 1935:1080 = 1.791... (difference ~0.014)
      const mockImage1: Partial<HTMLImageElement> = {
        width: 1935,
        height: 1080,
        naturalWidth: 1935,
        naturalHeight: 1080,
        onload: null,
        onerror: null,
        src: ''
      };

      global.Image = function() { return mockImage1 as HTMLImageElement; } as unknown as typeof Image;

      const strictPromise = service.validateAspectRatio(mockFile, '16:9');
      setTimeout(() => mockImage1.onload && mockImage1.onload.call(mockImage1 as any, new Event('load')), 0);
      const strictResult = await strictPromise;
      expect(strictResult).toBe(false); // 1935/1080 = 1.791... (diff > 0.01)

      // With higher tolerance (0.05) should pass
      const mockImage2: Partial<HTMLImageElement> = {
        width: 1935,
        height: 1080,
        naturalWidth: 1935,
        naturalHeight: 1080,
        onload: null,
        onerror: null,
        src: ''
      };

      global.Image = function() { return mockImage2 as HTMLImageElement; } as unknown as typeof Image;

      const lenientPromise = service.validateAspectRatio(mockFile, '16:9', 0.05);
      setTimeout(() => mockImage2.onload && mockImage2.onload.call(mockImage2 as any, new Event('load')), 0);
      const lenientResult = await lenientPromise;
      expect(lenientResult).toBe(true); // diff ~0.014 < 0.05
    });

    it('should handle invalid ratio format', async () => {
      await expect(service.validateAspectRatio(mockFile, 'invalid')).rejects.toThrow(
        'Invalid aspect ratio format'
      );
    });
  });

  describe('estimateCompressedSize()', () => {
    it('should estimate size with quality 80', () => {
      const file = new File([mockBlob], 'test.jpg', { type: 'image/jpeg' });
      Object.defineProperty(file, 'size', { value: 1000000 }); // 1MB

      const estimated = service.estimateCompressedSize(file, 80);
      
      // Improved algorithm uses power curve and size adjustment
      // Expect approximately 697473 based on new formula
      expect(estimated).toBeCloseTo(697473, -2); // Within 100 bytes
    });

    it('should estimate size for PNG with quality factor', () => {
      const blob = new Blob(['test'], { type: 'image/png' });
      const file = new File([blob], 'test.png', { type: 'image/png' });
      Object.defineProperty(file, 'size', { value: 2000000 }); // 2MB

      const estimated = service.estimateCompressedSize(file, 90);
      
      // Improved algorithm with power curve and size adjustment
      expect(estimated).toBeCloseTo(1326154, -2);
    });

    it('should estimate size for WebP format', () => {
      const blob = new Blob(['test'], { type: 'image/webp' });
      const file = new File([blob], 'test.webp', { type: 'image/webp' });
      Object.defineProperty(file, 'size', { value: 500000 }); // 500KB

      const estimated = service.estimateCompressedSize(file, 70);
      
      // Improved algorithm with better accuracy
      expect(estimated).toBeCloseTo(241992, -2);
    });

    it('should handle quality = 100', () => {
      const file = new File([mockBlob], 'test.jpg', { type: 'image/jpeg' });
      Object.defineProperty(file, 'size', { value: 1000000 });

      const estimated = service.estimateCompressedSize(file, 100);
      // Improved algorithm with size adjustment
      expect(estimated).toBeCloseTo(833788, -2);
    });

    it('should handle quality = 0', () => {
      const file = new File([mockBlob], 'test.jpg', { type: 'image/jpeg' });
      Object.defineProperty(file, 'size', { value: 1000000 });

      const estimated = service.estimateCompressedSize(file, 0);
      expect(estimated).toBe(0); // 1000000 * 0 * 0.85
    });

    it('should use targetFormat compression factor instead of source format', () => {
      const jpegFile = new File([mockBlob], 'photo.jpg', { type: 'image/jpeg' });
      Object.defineProperty(jpegFile, 'size', { value: 1000000 });

      // No targetFormat → uses JPEG factor (0.85)
      const jpegEstimate = service.estimateCompressedSize(jpegFile, 80);
      // targetFormat='webp' → uses WebP factor (0.65)
      const webpEstimate = service.estimateCompressedSize(jpegFile, 80, 'webp');
      // targetFormat='avif' → uses AVIF factor (0.50)
      const avifEstimate = service.estimateCompressedSize(jpegFile, 80, 'avif');

      // More efficient formats → smaller estimated size
      expect(webpEstimate).toBeLessThan(jpegEstimate);
      expect(avifEstimate).toBeLessThan(webpEstimate);
      // Ratio between formats must match COMPRESSION_FACTORS exactly
      expect(webpEstimate / jpegEstimate).toBeCloseTo(0.65 / 0.85, 5);
      expect(avifEstimate / jpegEstimate).toBeCloseTo(0.50 / 0.85, 5);
    });
  });

  describe('getBestQuality()', () => {
    it('should return 100 when file is already smaller than target', () => {
      const smallBlob = new Blob(['small'], { type: 'image/jpeg' });
      const smallFile = new File([smallBlob], 'small.jpg', { type: 'image/jpeg' });
      Object.defineProperty(smallFile, 'size', { value: 500000 }); // 0.5MB

      const quality = service.getBestQuality(smallFile, 2);
      expect(quality).toBe(100);
    });

    it('should calculate quality for JPEG compression', () => {
      const file = new File([mockBlob], 'test.jpg', { type: 'image/jpeg' });
      Object.defineProperty(file, 'size', { value: 5000000 }); // 5MB

      const quality = service.getBestQuality(file, 2); // Target 2MB
      
      // Improved algorithm with inverse power curve
      // Expected around 47 with better accuracy
      expect(quality).toBeCloseTo(47, 0);
    });

    it('should return 10 as minimum quality', () => {
      const largeFile = new File([mockBlob], 'huge.jpg', { type: 'image/jpeg' });
      Object.defineProperty(largeFile, 'size', { value: 100 * 1024 * 1024 }); // 100MB

      const quality = service.getBestQuality(largeFile, 1); // Target 1MB
      expect(quality).toBe(10); // Capped at minimum
    });

    it('should handle PNG compression factor', () => {
      const blob = new Blob(['test'], { type: 'image/png' });
      const file = new File([blob], 'test.png', { type: 'image/png' });
      Object.defineProperty(file, 'size', { value: 4000000 }); // 4MB

      const quality = service.getBestQuality(file, 2); // Target 2MB
      
      // Improved algorithm gives more accurate result
      expect(quality).toBeCloseTo(71, 0);
    });

    it('should handle WebP compression factor', () => {
      const blob = new Blob(['test'], { type: 'image/webp' });
      const file = new File([blob], 'test.webp', { type: 'image/webp' });
      Object.defineProperty(file, 'size', { value: 3000000 }); // 3MB

      const quality = service.getBestQuality(file, 1); // Target 1MB
      
      // Improved algorithm with better estimation
      expect(quality).toBeCloseTo(50, 0);
    });

    it('should not exceed quality of 100', () => {
      const file = new File([mockBlob], 'test.jpg', { type: 'image/jpeg' });
      Object.defineProperty(file, 'size', { value: 500000 }); // 0.5MB

      const quality = service.getBestQuality(file, 10); // Very high target
      expect(quality).toBe(100); // Capped at maximum
    });

    it('should use targetFormat compression factor instead of source format', () => {
      const jpegFile = new File([mockBlob], 'photo.jpg', { type: 'image/jpeg' });
      Object.defineProperty(jpegFile, 'size', { value: 5000000 }); // 5 MB

      const jpegQuality = service.getBestQuality(jpegFile, 1);           // JPEG factor
      const webpQuality  = service.getBestQuality(jpegFile, 1, 'webp');  // WebP factor
      const avifQuality  = service.getBestQuality(jpegFile, 1, 'avif');  // AVIF factor

      // WebP/AVIF compress better → same target size is reachable at higher quality
      expect(webpQuality).toBeGreaterThan(jpegQuality);
      expect(avifQuality).toBeGreaterThan(webpQuality);
    });
  });

  describe('formatBytes()', () => {
    it('should format 0 bytes', () => {
      expect(service.formatBytes(0)).toBe('0 Bytes');
    });

    it('should format KB', () => {
      expect(service.formatBytes(1024)).toBe('1 KB');
    });

    it('should format MB', () => {
      expect(service.formatBytes(1048576)).toBe('1 MB');
    });

    it('should format GB', () => {
      expect(service.formatBytes(1073741824)).toBe('1 GB');
    });

    it('should format bytes with decimals', () => {
      expect(service.formatBytes(1536)).toBe('1.5 KB');
    });

    it('should format bytes with custom decimals', () => {
      expect(service.formatBytes(1536, 0)).toBe('2 KB');
      expect(service.formatBytes(1536, 3)).toBe('1.5 KB');
    });

    it('should handle negative decimals by using 0', () => {
      expect(service.formatBytes(1536, -1)).toBe('2 KB');
    });

    it('should return N/A for negative bytes', () => {
      expect(service.formatBytes(-1)).toBe('N/A');
      expect(service.formatBytes(-1000)).toBe('N/A');
    });

    it('should return N/A for NaN bytes', () => {
      expect(service.formatBytes(NaN)).toBe('N/A');
    });

    it('should return N/A for Infinity bytes', () => {
      expect(service.formatBytes(Infinity)).toBe('N/A');
      expect(service.formatBytes(-Infinity)).toBe('N/A');
    });
  });

  describe('Validation', () => {
    describe('validateDimensions()', () => {
      it('should return true for valid dimensions', async () => {
        const mockImage: Partial<HTMLImageElement> = {
          width: 1920,
          height: 1080,
          naturalWidth: 1920,
          naturalHeight: 1080,
          onload: null,
          onerror: null,
          src: ''
        };

        global.Image = function() { return mockImage as HTMLImageElement; } as unknown as typeof Image;

        const promise = service.validateDimensions(mockFile, 100, 100, 4096, 4096);
        
        setTimeout(() => mockImage.onload && mockImage.onload.call(mockImage as any, new Event('load')), 0);

        const result = await promise;
        expect(result).toBe(true);
      });

      it('should return false for width below minimum', async () => {
        const mockImage: Partial<HTMLImageElement> = {
          width: 50,
          height: 1080,
          naturalWidth: 50,
          naturalHeight: 1080,
          onload: null,
          onerror: null,
          src: ''
        };

        global.Image = function() { return mockImage as HTMLImageElement; } as unknown as typeof Image;

        const promise = service.validateDimensions(mockFile, 100, 100, 4096, 4096);
        
        setTimeout(() => mockImage.onload && mockImage.onload.call(mockImage as any, new Event('load')), 0);

        const result = await promise;
        expect(result).toBe(false);
      });

      it('should return false for width above maximum', async () => {
        const mockImage: Partial<HTMLImageElement> = {
          width: 5000,
          height: 1080,
          naturalWidth: 5000,
          naturalHeight: 1080,
          onload: null,
          onerror: null,
          src: ''
        };

        global.Image = function() { return mockImage as HTMLImageElement; } as unknown as typeof Image;

        const promise = service.validateDimensions(mockFile, 100, 100, 4096, 4096);
        
        setTimeout(() => mockImage.onload && mockImage.onload.call(mockImage as any, new Event('load')), 0);

        const result = await promise;
        expect(result).toBe(false);
      });

      it('should throw on load error', async () => {
        const mockImage: Partial<HTMLImageElement> = {
          width: 0,
          height: 0,
          naturalWidth: 0,
          naturalHeight: 0,
          onload: null,
          onerror: null,
          src: ''
        };

        global.Image = function() { return mockImage as HTMLImageElement; } as unknown as typeof Image;

        const promise = service.validateDimensions(mockFile, 100, 100, 4096, 4096);
        
        setTimeout(() => mockImage.onerror && mockImage.onerror.call(mockImage as any, new Event('error')), 0);

        await expect(promise).rejects.toThrow('Failed to load image');
      });
    });

    describe('validateFileSize()', () => {
      it('should return true for valid file size', () => {
        const file = new File([new Uint8Array(1024 * 1024 * 2)], 'test.jpg');
        expect(service.validateFileSize(file, 5)).toBe(true);
      });

      it('should return false for file exceeding max size', () => {
        const file = new File([new Uint8Array(1024 * 1024 * 10)], 'test.jpg');
        expect(service.validateFileSize(file, 5)).toBe(false);
      });

      it('should return false for file below min size', () => {
        const file = new File([new Uint8Array(1024 * 50)], 'test.jpg');
        expect(service.validateFileSize(file, 5, 0.1)).toBe(false);
      });

      it('should return true for file within min and max range', () => {
        const file = new File([new Uint8Array(1024 * 1024 * 2)], 'test.jpg');
        expect(service.validateFileSize(file, 5, 0.1)).toBe(true);
      });
    });

    describe('validateBatch()', () => {
      it('should validate a batch of files with all valid', async () => {
        const file1 = new File([new Uint8Array(1024 * 100)], 'test1.jpg', { type: 'image/jpeg' });
        const file2 = new File([new Uint8Array(1024 * 200)], 'test2.png', { type: 'image/png' });

        const results = await service.validateBatch([file1, file2], {
          maxSizeMB: 1,
          allowedFormats: ['image/jpeg', 'image/png']
        });

        expect(results).toHaveLength(2);
        expect(results[0].valid).toBe(true);
        expect(results[1].valid).toBe(true);
        expect(results[0].errors).toHaveLength(0);
        expect(results[1].errors).toHaveLength(0);
      });

      it('should return errors for invalid file type', async () => {
        const file = new File([new Uint8Array(1024)], 'test.pdf', { type: 'application/pdf' });

        const results = await service.validateBatch([file], {
          allowedFormats: ['image/jpeg', 'image/png']
        });

        expect(results[0].valid).toBe(false);
        expect(results[0].errors.length).toBeGreaterThan(0);
        expect(results[0].errors[0]).toContain('Invalid format');
      });

      it('should return errors for file size exceeding limit', async () => {
        const file = new File([new Uint8Array(1024 * 1024 * 10)], 'test.jpg', { type: 'image/jpeg' });

        const results = await service.validateBatch([file], {
          maxSizeMB: 5
        });

        expect(results[0].valid).toBe(false);
        expect(results[0].errors.some(e => e.includes('File size'))).toBe(true);
      });

      it('should validate dimensions when options provided', async () => {
        const file = new File([mockBlob], 'test.jpg', { type: 'image/jpeg' });

        // Mock URL.createObjectURL
        global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
        global.URL.revokeObjectURL = vi.fn();

        let savedOnload: ((event: Event) => void) | null = null;

        const mockImage: any = {
          width: 5000,
          height: 5000,
          naturalWidth: 5000,
          naturalHeight: 5000,
          set onload(handler: any) {
            savedOnload = handler;
          },
          get onload() {
            return savedOnload;
          },
          set onerror(_handler: any) {},
          set src(_value: string) {
            // Trigger onload when src is set
            queueMicrotask(() => {
              if (savedOnload) {
                savedOnload(new Event('load'));
              }
            });
          }
        };

        global.Image = function() { return mockImage; } as unknown as typeof Image;

        const results = await service.validateBatch([file], {
          maxWidth: 4096,
          maxHeight: 4096
        });

        expect(results[0].valid).toBe(false);
        expect(results[0].errors.some(e => e.includes('Dimensions'))).toBe(true);
      });

      it('should return error for invalid image without allowedFormats', async () => {
        const file = new File([new Uint8Array(1024)], 'test.txt', { type: 'text/plain' });

        const results = await service.validateBatch([file], {
          maxSizeMB: 5
        });

        expect(results[0].valid).toBe(false);
        expect(results[0].errors.some(e => e.includes('Not a valid image file'))).toBe(true);
      });

      it('should return error when dimension validation throws', async () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        
        const file = new File([mockBlob], 'test.jpg', { type: 'image/jpeg' });

        // Mock getImageDimensions to throw
        vi.spyOn(service as any, 'getImageDimensions').mockRejectedValue(new Error('Failed to load'));

        const results = await service.validateBatch([file], {
          maxWidth: 4096,
          maxHeight: 4096
        });

        expect(results[0].valid).toBe(false);
        expect(results[0].errors.some(e => e.includes('Failed to read image dimensions'))).toBe(true);
        
        consoleErrorSpy.mockRestore();
      });
    });
  });

  describe('Image Analysis', () => {
    describe('hasTransparency()', () => {
      beforeEach(() => {
        global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
        global.URL.revokeObjectURL = vi.fn();
      });

      it('should return false for JPEG (no alpha support)', async () => {
        const jpegFile = new File([mockBlob], 'test.jpg', { type: 'image/jpeg' });
        const result = await service.hasTransparency(jpegFile);
        expect(result).toBe(false);
      });

      it('should detect transparency in PNG', async () => {
        const pngFile = new File([mockBlob], 'test.png', { type: 'image/png' });

        const mockCanvas = {
          width: 0,
          height: 0,
          getContext: vi.fn(() => ({
            drawImage: vi.fn(),
            getImageData: vi.fn(() => ({
              data: new Uint8ClampedArray([255, 0, 0, 128, 0, 255, 0, 255])
            }))
          }))
        };

        vi.spyOn(document, 'createElement').mockReturnValue(mockCanvas as any);
        
        // Mock URL.createObjectURL
        global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
        global.URL.revokeObjectURL = vi.fn();

        let savedOnload: ((event: Event) => void) | null = null;

        const mockImage: any = {
          width: 2,
          height: 1,
          naturalWidth: 2,
          naturalHeight: 1,
          set onload(handler: any) {
            savedOnload = handler;
          },
          get onload() {
            return savedOnload;
          },
          set onerror(_handler: any) {},
          set src(_value: string) {
            // Trigger onload when src is set
            queueMicrotask(() => {
              if (savedOnload) {
                savedOnload(new Event('load'));
              }
            });
          }
        };

        global.Image = function() { return mockImage; } as unknown as typeof Image;

        const result = await service.hasTransparency(pngFile);
        expect(result).toBe(true);
      });

      it('should return false when no transparency found', async () => {
        const pngFile = new File([mockBlob], 'test.png', { type: 'image/png' });

        // Create proper RGBA data with full alpha (no transparency)
        // Must use ArrayBuffer to ensure proper Uint32Array compatibility
        const buffer = new ArrayBuffer(8); // 2 pixels * 4 bytes
        const rgbaData = new Uint8ClampedArray(buffer);
        // Pixel 1: Red with full alpha
        rgbaData[0] = 255; // R
        rgbaData[1] = 0;   // G
        rgbaData[2] = 0;   // B
        rgbaData[3] = 255; // A (fully opaque)
        // Pixel 2: Green with full alpha
        rgbaData[4] = 0;   // R
        rgbaData[5] = 255; // G
        rgbaData[6] = 0;   // B
        rgbaData[7] = 255; // A (fully opaque)
        
        const mockCanvas = {
          width: 0,
          height: 0,
          getContext: vi.fn(() => ({
            drawImage: vi.fn(),
            getImageData: vi.fn(() => ({
              data: rgbaData
            }))
          }))
        };

        vi.spyOn(document, 'createElement').mockReturnValue(mockCanvas as any);
        
        // Mock URL.createObjectURL
        global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
        global.URL.revokeObjectURL = vi.fn();

        let savedOnload: ((event: Event) => void) | null = null;

        const mockImage: any = {
          width: 2,
          height: 1,
          naturalWidth: 2,
          naturalHeight: 1,
          set onload(handler: any) {
            savedOnload = handler;
          },
          get onload() {
            return savedOnload;
          },
          set onerror(_handler: any) {},
          set src(_value: string) {
            // Trigger onload when src is set
            queueMicrotask(() => {
              if (savedOnload) {
                savedOnload(new Event('load'));
              }
            });
          }
        };

        global.Image = function() { return mockImage; } as unknown as typeof Image;

        const result = await service.hasTransparency(pngFile);
        expect(result).toBe(false);
      });

      it('should return false when getImageDimensions throws error', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const pngFile = new File([mockBlob], 'test.png', { type: 'image/png' });

        // Mock getImageDimensions to throw
        vi.spyOn(service as any, 'getImageDimensions').mockRejectedValue(new Error('Failed to load'));

        const result = await service.hasTransparency(pngFile);
        
        expect(result).toBe(false);
        expect(errorSpy).toHaveBeenCalledWith(
          expect.stringContaining('Failed to check transparency'),
          expect.any(Error)
        );
      });

      it('should return false when canvas context fails in hasTransparency', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const pngFile = new File([mockBlob], 'test.png', { type: 'image/png' });

        // Mock getImageDimensions to return valid dimensions
        vi.spyOn(service as any, 'getImageDimensions').mockResolvedValue({ width: 100, height: 100 });

        const mockCanvas = {
          width: 0,
          height: 0,
          getContext: vi.fn(() => null) // Return null to simulate failure
        };

        vi.spyOn(document, 'createElement').mockReturnValue(mockCanvas as any);

        const result = await service.hasTransparency(pngFile);
        
        expect(result).toBe(false);
        expect(errorSpy).toHaveBeenCalledWith(
          expect.stringContaining('Failed to check transparency'),
          expect.any(Error)
        );
      });
    });

    describe('isAnimated()', () => {
      it('should return false for non-animatable formats', async () => {
        const jpegFile = new File([mockBlob], 'test.jpg', { type: 'image/jpeg' });
        const result = await service.isAnimated(jpegFile);
        expect(result).toBe(false);
      });

      it('should detect animated GIF (two Image Descriptor blocks)', async () => {
        // Minimal 2-frame GIF89a (1×1 px, no GCT, minimal LZW sub-blocks).
        // The block-structure parser counts Image Descriptors (0x2C); when it
        // finds the second one it returns true without decoding any LZW data.
        //
        // Layout (offsets):
        //   0-5   GIF89a header
        //   6-12  Logical Screen Descriptor (1×1, no GCT)
        //   13    0x2C  Image Descriptor #1
        //   14-22 descriptor fields + packed (no LCT)
        //   23    LZW min code size byte
        //   24-27 sub-block (len=2 + 2 bytes) + terminator
        //   28    0x2C  Image Descriptor #2  → frameCount = 2 → return true
        const buf = new Uint8Array(40);
        // Header
        buf.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61], 0);
        // LSD: width=1, height=1, packed=0 (no GCT), bg=0, ratio=0
        buf[6] = 1; buf[7] = 0; buf[8] = 1; buf[9] = 0;
        buf[10] = 0x00; buf[11] = 0x00; buf[12] = 0x00;
        // Image Descriptor #1 at 13
        buf[13] = 0x2C;
        buf[14] = 0; buf[15] = 0; buf[16] = 0; buf[17] = 0; // left, top
        buf[18] = 1; buf[19] = 0; buf[20] = 1; buf[21] = 0; // w, h
        buf[22] = 0x00; // packed: no LCT
        buf[23] = 0x02; // LZW min code size
        buf[24] = 0x02; buf[25] = 0x4C; buf[26] = 0x01; // sub-block: len=2, 2 bytes
        buf[27] = 0x00; // sub-block terminator
        // Image Descriptor #2 at 28 — triggers return true
        buf[28] = 0x2C;

        const gifFile = new File([buf], 'animated.gif', { type: 'image/gif' });
        Object.defineProperty(gifFile, 'slice', {
          value: vi.fn().mockReturnValue({
            arrayBuffer: vi.fn().mockResolvedValue(buf.buffer)
          }),
          writable: true
        });

        const result = await service.isAnimated(gifFile);
        expect(result).toBe(true);
      });

      it('should NOT false-positive on 0x2C bytes inside LZW sub-block data', async () => {
        // Regression test for the old raw-scan approach.
        // This single-frame GIF has three 0x2C bytes embedded in the LZW sub-block
        // payload. The block-structure parser skips sub-block bodies and never sees
        // them, so frameCount stays at 1 and the result is false.
        const buf = new Uint8Array(32);
        buf.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61], 0); // GIF89a
        buf[6] = 1; buf[7] = 0; buf[8] = 1; buf[9] = 0;   // 1×1
        buf[10] = 0x00; buf[11] = 0x00; buf[12] = 0x00;    // packed (no GCT)
        buf[13] = 0x2C;                                      // Image Descriptor
        buf[14] = 0; buf[15] = 0; buf[16] = 0; buf[17] = 0;
        buf[18] = 1; buf[19] = 0; buf[20] = 1; buf[21] = 0;
        buf[22] = 0x00;  // packed: no LCT
        buf[23] = 0x02;  // LZW min code size
        // Sub-block with 0x2C bytes embedded in the (fake) LZW data
        buf[24] = 0x04;  // sub-block length = 4
        buf[25] = 0x2C; buf[26] = 0x2C; buf[27] = 0x2C; buf[28] = 0xFF;
        buf[29] = 0x00;  // sub-block terminator
        buf[30] = 0x3B;  // GIF Trailer

        const gifFile = new File([buf], 'single-frame.gif', { type: 'image/gif' });
        Object.defineProperty(gifFile, 'slice', {
          value: vi.fn().mockReturnValue({
            arrayBuffer: vi.fn().mockResolvedValue(buf.buffer)
          }),
          writable: true
        });

        const result = await service.isAnimated(gifFile);
        expect(result).toBe(false);
      });

      it('should return false for single-frame GIF with NETSCAPE looping extension', async () => {
        // A GIF with NETSCAPE2.0 but only ONE frame is not animated — it just
        // loops a still image. The old NETSCAPE2.0 string-search approach would
        // wrongly return true here.
        const netscape = new TextEncoder().encode('NETSCAPE2.0');
        const buf = new Uint8Array(60);
        buf.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61], 0);
        buf[6] = 1; buf[7] = 0; buf[8] = 1; buf[9] = 0;
        buf[10] = 0x00; buf[11] = 0x00; buf[12] = 0x00;
        // Application Extension (NETSCAPE looping)
        buf[13] = 0x21; buf[14] = 0xFF;    // extension introducer + Application label
        buf[15] = 0x0B;                    // sub-block: 11 bytes
        netscape.forEach((b, i) => { buf[16 + i] = b; }); // "NETSCAPE2.0"
        buf[27] = 0x03;                    // sub-block: 3 bytes (loop count)
        buf[28] = 0x01; buf[29] = 0x00; buf[30] = 0x00;
        buf[31] = 0x00;                    // sub-block terminator
        // Single Image Descriptor
        buf[32] = 0x2C;
        buf[33] = 0; buf[34] = 0; buf[35] = 0; buf[36] = 0;
        buf[37] = 1; buf[38] = 0; buf[39] = 1; buf[40] = 0;
        buf[41] = 0x00;
        buf[42] = 0x02;  // LZW min code size
        buf[43] = 0x02; buf[44] = 0x4C; buf[45] = 0x01;
        buf[46] = 0x00;  // sub-block terminator
        buf[47] = 0x3B;  // GIF Trailer

        const gifFile = new File([buf], 'looping-still.gif', { type: 'image/gif' });
        Object.defineProperty(gifFile, 'slice', {
          value: vi.fn().mockReturnValue({
            arrayBuffer: vi.fn().mockResolvedValue(buf.buffer)
          }),
          writable: true
        });

        const result = await service.isAnimated(gifFile);
        expect(result).toBe(false);
      });

      it('should return false for static GIF', async () => {
        const staticGif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
        const buffer = staticGif.buffer;
        const gifFile = new File([staticGif], 'test.gif', { type: 'image/gif' });
        
        // Mock arrayBuffer method
        gifFile.arrayBuffer = vi.fn().mockResolvedValue(buffer);

        const result = await service.isAnimated(gifFile);
        expect(result).toBe(false);
      });

      it('should detect animated WebP via VP8X animation flag', async () => {
        // Real animated WebP structure:
        //   RIFF(4) + size(4) + WEBP(4) + VP8X(4) + chunk-size(4) + flags(4) + canvas-dims(6) = 30 bytes
        // The animation flag is bit 1 (0x02) of the flags byte at offset 20.
        const buf = new Uint8Array(30);
        const view = new DataView(buf.buffer);
        buf.set(new TextEncoder().encode('RIFF'), 0);   // offset  0-3
        view.setUint32(4, 22, true);                    // offset  4-7: file size (LE)
        buf.set(new TextEncoder().encode('WEBP'), 8);   // offset  8-11
        buf.set(new TextEncoder().encode('VP8X'), 12);  // offset 12-15
        view.setUint32(16, 10, true);                   // offset 16-19: VP8X payload size = 10 (LE)
        buf[20] = 0x02;                                 // offset 20: flags — animation bit set
        // canvas width-1 (24-bit LE): 99 → 100px
        buf[24] = 0x63; buf[25] = 0x00; buf[26] = 0x00;
        // canvas height-1 (24-bit LE): 99 → 100px
        buf[27] = 0x63; buf[28] = 0x00; buf[29] = 0x00;

        const webpFile = new File([buf], 'test.webp', { type: 'image/webp' });
        Object.defineProperty(webpFile, 'slice', {
          value: vi.fn().mockReturnValue({
            arrayBuffer: vi.fn().mockResolvedValue(buf.buffer)
          }),
          writable: true
        });

        const result = await service.isAnimated(webpFile);
        expect(result).toBe(true);
      });

      it('should return false for non-animated extended WebP (VP8X without animation flag)', async () => {
        // Same VP8X structure but animation flag cleared (0x00)
        const buf = new Uint8Array(30);
        const view = new DataView(buf.buffer);
        buf.set(new TextEncoder().encode('RIFF'), 0);
        view.setUint32(4, 22, true);
        buf.set(new TextEncoder().encode('WEBP'), 8);
        buf.set(new TextEncoder().encode('VP8X'), 12);
        view.setUint32(16, 10, true);
        buf[20] = 0x00; // flags — no animation, no other features

        const webpFile = new File([buf], 'test.webp', { type: 'image/webp' });
        Object.defineProperty(webpFile, 'slice', {
          value: vi.fn().mockReturnValue({
            arrayBuffer: vi.fn().mockResolvedValue(buf.buffer)
          }),
          writable: true
        });

        const result = await service.isAnimated(webpFile);
        expect(result).toBe(false);
      });

      it('should return false on error when arrayBuffer fails', async () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        
        const gifFile = new File([new Uint8Array(10)], 'test.gif', { type: 'image/gif' });
        
        // Mock slice method to return object with failing arrayBuffer
        Object.defineProperty(gifFile, 'slice', {
          value: vi.fn().mockReturnValue({
            arrayBuffer: vi.fn().mockRejectedValue(new Error('Failed to read buffer'))
          }),
          writable: true
        });

        const result = await service.isAnimated(gifFile);
        expect(result).toBe(false);
        
        consoleErrorSpy.mockRestore();
      });

      it('should handle WebP files without proper RIFF header', async () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        
        const buffer = new ArrayBuffer(50);
        const view = new Uint8Array(buffer);
        // Intentionally not setting proper RIFF header
        
        const webpFile = new File([view], 'test.webp', { type: 'image/webp' });
        webpFile.arrayBuffer = vi.fn().mockResolvedValue(buffer);

        const result = await service.isAnimated(webpFile);
        expect(result).toBe(false);
        
        consoleErrorSpy.mockRestore();
      });
    });

    describe('getDominantColor()', () => {
      it('should return dominant color as hex string', async () => {
        const file = new File([mockBlob], 'test.jpg', { type: 'image/jpeg' });

        const mockCanvas = {
          width: 0,
          height: 0,
          getContext: vi.fn(() => ({
            drawImage: vi.fn(),
            getImageData: vi.fn(() => ({
              data: new Uint8ClampedArray([
                255, 0, 0, 255,
                255, 0, 0, 255,
                255, 0, 0, 255,
                0, 0, 255, 255
              ])
            }))
          }))
        };

        vi.spyOn(document, 'createElement').mockReturnValue(mockCanvas as any);
        
        // Mock URL.createObjectURL
        global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
        global.URL.revokeObjectURL = vi.fn();

        let savedOnload: ((event: Event) => void) | null = null;

        const mockImage: any = {
          width: 2,
          height: 2,
          naturalWidth: 2,
          naturalHeight: 2,
          set onload(handler: any) {
            savedOnload = handler;
          },
          get onload() {
            return savedOnload;
          },
          set onerror(_handler: any) {},
          set src(_value: string) {
            // Trigger onload when src is set
            queueMicrotask(() => {
              if (savedOnload) {
                savedOnload(new Event('load'));
              }
            });
          }
        };

        global.Image = function() { return mockImage; } as unknown as typeof Image;

        const result = await service.getDominantColor(file);
        expect(result).toMatch(/^#[0-9A-F]{6}$/);
      });

      it('should skip transparent pixels when calculating dominant color', async () => {
        const file = new File([mockBlob], 'test.png', { type: 'image/png' });

        // Create array with 20 pixels (80 bytes)
        // step=4 means we sample pixels 0, 4, 8, 12, 16
        const pixelData = new Uint8ClampedArray(80);
        
        // Pixel 0: opaque red
        pixelData[0] = 255; pixelData[1] = 0; pixelData[2] = 0; pixelData[3] = 255;
        
        // Pixels 1-3: some other colors (won't be sampled)
        for (let i = 4; i < 16; i += 4) {
          pixelData[i] = 0; pixelData[i+1] = 255; pixelData[i+2] = 0; pixelData[i+3] = 255;
        }
        
        // Pixel 4: transparent (THIS SHOULD BE SKIPPED with continue)
        pixelData[16] = 100; pixelData[17] = 100; pixelData[18] = 100; pixelData[19] = 50; // alpha < 128
        
        // Pixels 5-7: some other colors (won't be sampled)
        for (let i = 20; i < 32; i += 4) {
          pixelData[i] = 0; pixelData[i+1] = 0; pixelData[i+2] = 255; pixelData[i+3] = 255;
        }
        
        // Pixel 8: opaque red
        pixelData[32] = 255; pixelData[33] = 0; pixelData[34] = 0; pixelData[35] = 255;
        
        // Fill rest with opaque pixels
        for (let i = 36; i < 80; i += 4) {
          pixelData[i] = 255; pixelData[i+1] = 0; pixelData[i+2] = 0; pixelData[i+3] = 255;
        }

        const mockCanvas = {
          width: 0,
          height: 0,
          getContext: vi.fn(() => ({
            drawImage: vi.fn(),
            getImageData: vi.fn(() => ({
              data: pixelData
            }))
          }))
        };

        vi.spyOn(document, 'createElement').mockReturnValue(mockCanvas as any);
        
        global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
        global.URL.revokeObjectURL = vi.fn();

        let savedOnload: ((event: Event) => void) | null = null;

        const mockImage: any = {
          width: 10,
          height: 2,
          naturalWidth: 10,
          naturalHeight: 2,
          set onload(handler: any) {
            savedOnload = handler;
          },
          get onload() {
            return savedOnload;
          },
          set onerror(_handler: any) {},
          set src(_value: string) {
            queueMicrotask(() => {
              if (savedOnload) {
                savedOnload(new Event('load'));
              }
            });
          }
        };

        global.Image = function() { return mockImage; } as unknown as typeof Image;

        const result = await service.getDominantColor(file);
        expect(result).toMatch(/^#[0-9A-F]{6}$/);
        // Should be red-ish since transparent pixels are skipped
      });

      it('should return black when canvas context fails', async () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        
        const file = new File([mockBlob], 'test.jpg', { type: 'image/jpeg' });

        const mockCanvas = {
          width: 0,
          height: 0,
          getContext: vi.fn(() => null) // Return null to simulate failure
        };

        vi.spyOn(document, 'createElement').mockReturnValue(mockCanvas as any);
        
        global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
        global.URL.revokeObjectURL = vi.fn();

        let savedOnload: ((event: Event) => void) | null = null;

        const mockImage: any = {
          width: 2,
          height: 2,
          naturalWidth: 2,
          naturalHeight: 2,
          set onload(handler: any) {
            savedOnload = handler;
          },
          get onload() {
            return savedOnload;
          },
          set onerror(_handler: any) {},
          set src(_value: string) {
            queueMicrotask(() => {
              if (savedOnload) {
                savedOnload(new Event('load'));
              }
            });
          }
        };

        global.Image = function() { return mockImage; } as unknown as typeof Image;

        const result = await service.getDominantColor(file);
        expect(result).toBe('#000000');
        
        consoleErrorSpy.mockRestore();
      });

      it('should return black on error', async () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        
        const file = new File([mockBlob], 'test.jpg', { type: 'image/jpeg' });

        const mockImage: Partial<HTMLImageElement> = {
          width: 0,
          height: 0,
          naturalWidth: 0,
          naturalHeight: 0,
          onload: null,
          onerror: null,
          src: ''
        };

        global.Image = function() { return mockImage as HTMLImageElement; } as unknown as typeof Image;

        const promise = service.getDominantColor(file);
        
        setTimeout(() => mockImage.onerror && mockImage.onerror.call(mockImage as any, new Event('error')), 0);

        const result = await promise;
        expect(result).toBe('#000000');
        
        consoleErrorSpy.mockRestore();
      });
    });

    // ────────────────────────────────────────────────────────────────────

    describe('suggestOptimalFormat()', () => {
      let mockImage: Partial<HTMLImageElement>;

      beforeEach(() => {
        mockImage = {
          naturalWidth: 0,
          naturalHeight: 0,
          onload: null as any,
          onerror: null as any,
          src: '',
        };
        global.HTMLImageElement = function() { return mockImage as HTMLImageElement; } as any;
        global.Image = function() { return mockImage as HTMLImageElement; } as unknown as typeof Image;
      });

      it('suggests avif for photos (opaque, > 1MP)', async () => {
        // 1920×1080 = 2 073 600 px > 1 000 000 threshold
        const file = new File([mockBlob], 'photo.jpg', { type: 'image/jpeg' });
        vi.spyOn(service, 'getImageDimensions').mockResolvedValue({ width: 1920, height: 1080 });
        vi.spyOn(service, 'hasTransparency').mockResolvedValue(false);
        const result = await service.suggestOptimalFormat(file);
        expect(result).toBe('avif');
      });

      it('suggests avif for images with transparency', async () => {
        const file = new File([mockBlob], 'icon.png', { type: 'image/png' });
        vi.spyOn(service, 'hasTransparency').mockResolvedValue(true);
        const result = await service.suggestOptimalFormat(file);
        expect(result).toBe('avif');
      });

      it('suggests webp for small opaque graphics (< 1MP)', async () => {
        // 400×300 = 120 000 px < 1 000 000 threshold
        const file = new File([mockBlob], 'icon.jpg', { type: 'image/jpeg' });
        vi.spyOn(service, 'getImageDimensions').mockResolvedValue({ width: 400, height: 300 });
        vi.spyOn(service, 'hasTransparency').mockResolvedValue(false);
        const result = await service.suggestOptimalFormat(file);
        expect(result).toBe('webp');
      });

      it('falls back to webp on error', async () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const file = new File([mockBlob], 'broken.jpg', { type: 'image/jpeg' });
        vi.spyOn(service, 'hasTransparency').mockRejectedValue(new Error('canvas fail'));
        const result = await service.suggestOptimalFormat(file);
        expect(result).toBe('webp');
        consoleErrorSpy.mockRestore();
      });
    });
  });
});
