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
        onload: null,
        onerror: null,
        src: ''
      };

      global.Image = function() { return mockImage as HTMLImageElement; } as unknown as typeof Image;

      const promise = service.getImageDimensions(mockFile);
      
      // Simulate image error
      setTimeout(() => mockImage.onerror && mockImage.onerror.call(mockImage as any, new Event('error')), 0);

      await expect(promise).rejects.toThrow('Failed to load image dimensions');
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
      
      // For JPEG: size * (quality/100) * 0.85
      expect(estimated).toBe(680000); // 1000000 * 0.8 * 0.85
    });

    it('should estimate size for PNG with quality factor', () => {
      const blob = new Blob(['test'], { type: 'image/png' });
      const file = new File([blob], 'test.png', { type: 'image/png' });
      Object.defineProperty(file, 'size', { value: 2000000 }); // 2MB

      const estimated = service.estimateCompressedSize(file, 90);
      
      // For PNG: size * (quality/100) * 0.75
      expect(estimated).toBe(1350000); // 2000000 * 0.9 * 0.75
    });

    it('should estimate size for WebP format', () => {
      const blob = new Blob(['test'], { type: 'image/webp' });
      const file = new File([blob], 'test.webp', { type: 'image/webp' });
      Object.defineProperty(file, 'size', { value: 500000 }); // 500KB

      const estimated = service.estimateCompressedSize(file, 70);
      
      // For WebP: size * (quality/100) * 0.65
      expect(estimated).toBe(227500); // 500000 * 0.7 * 0.65
    });

    it('should handle quality = 100', () => {
      const file = new File([mockBlob], 'test.jpg', { type: 'image/jpeg' });
      Object.defineProperty(file, 'size', { value: 1000000 });

      const estimated = service.estimateCompressedSize(file, 100);
      expect(estimated).toBe(850000); // 1000000 * 1 * 0.85
    });

    it('should handle quality = 0', () => {
      const file = new File([mockBlob], 'test.jpg', { type: 'image/jpeg' });
      Object.defineProperty(file, 'size', { value: 1000000 });

      const estimated = service.estimateCompressedSize(file, 0);
      expect(estimated).toBe(0); // 1000000 * 0 * 0.85
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
      
      // targetBytes / (file.size * compressionFactor) * 100
      // 2097152 / (5000000 * 0.85) * 100 = 49.36
      expect(quality).toBeCloseTo(49, 0);
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
      
      // 2097152 / (4000000 * 0.75) * 100 = 69.9
      expect(quality).toBeCloseTo(70, 0);
    });

    it('should handle WebP compression factor', () => {
      const blob = new Blob(['test'], { type: 'image/webp' });
      const file = new File([blob], 'test.webp', { type: 'image/webp' });
      Object.defineProperty(file, 'size', { value: 3000000 }); // 3MB

      const quality = service.getBestQuality(file, 1); // Target 1MB
      
      // 1048576 / (3000000 * 0.65) * 100 = 53.8
      expect(quality).toBeCloseTo(54, 0);
    });

    it('should not exceed quality of 100', () => {
      const file = new File([mockBlob], 'test.jpg', { type: 'image/jpeg' });
      Object.defineProperty(file, 'size', { value: 500000 }); // 0.5MB

      const quality = service.getBestQuality(file, 10); // Very high target
      expect(quality).toBe(100); // Capped at maximum
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
  });
});
