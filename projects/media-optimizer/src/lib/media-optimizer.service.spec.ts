import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { firstValueFrom } from 'rxjs';
import { ImageConverterService } from './media-optimizer.service';
import type { ImageFormat, ConvertOptions, CompressOptions, ImageFile } from './media-optimizer.service';
import * as browserImageCompression from 'browser-image-compression';

// Mock browser-image-compression
vi.mock('browser-image-compression', () => ({
  default: vi.fn()
}));

describe('ImageConverterService', () => {
  let service: ImageConverterService;
  let mockFile: File;
  let mockBlob: Blob;

  beforeEach(() => {
    service = new ImageConverterService();

    // Create mock file
    mockBlob = new Blob(['test content'], { type: 'image/jpeg' });
    mockFile = new File([mockBlob], 'test.jpg', { type: 'image/jpeg' });

    // Mock URL.createObjectURL and revokeObjectURL
    global.URL.createObjectURL = vi.fn(() => 'blob:mock-url-' + Math.random());
    global.URL.revokeObjectURL = vi.fn();

    // Mock fetch
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true }),
        blob: () => Promise.resolve(mockBlob)
      } as Response)
    );

    // Mock console methods
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    // State cleanup - reset images manually
    service._images = [];
    vi.clearAllMocks();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('Signal State', () => {
    it('should initialize with empty images array', () => {
      expect(service.images).toEqual([]);
    });

    it('should initialize isUploading as false', () => {
      expect(service.isUploading).toBe(false);
    });

    it('should initialize uploadProgress as 0', () => {
      expect(service.uploadProgress).toBe(0);
    });

    it('should return empty array for completedImages initially', () => {
      expect(service.completedImages).toEqual([]);
    });

    it('should return 0 for completedCount initially', () => {
      expect(service.completedCount).toBe(0);
    });

    it('should return 0 for totalOriginalSize initially', () => {
      expect(service.totalOriginalSize).toBe(0);
    });

    it('should return 0 for totalCompressedSize initially', () => {
      expect(service.totalCompressedSize).toBe(0);
    });

  });

  describe('Callback Subscriptions', () => {
    it('should call onImagesChange callback immediately with current state', () => {
      const callback = vi.fn();
      
      service.onImagesChange(callback);
      
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith([]);
    });

    it('should call onImagesChange callback when images change', async () => {
      const callback = vi.fn();
      service.onImagesChange(callback);
      callback.mockClear(); // Clear initial call
      
      const mockCompressedFile = new File([mockBlob], 'test.webp', { type: 'image/webp' });
      vi.mocked(browserImageCompression.default).mockResolvedValue(mockCompressedFile);
      
      await firstValueFrom(service.convertFormat([mockFile], { outputFormat: 'webp' }));
      
      expect(callback).toHaveBeenCalled();
      expect(callback.mock.calls[callback.mock.calls.length - 1][0].length).toBe(1);
    });

    it('should unsubscribe from onImagesChange', () => {
      const callback = vi.fn();
      const unsubscribe = service.onImagesChange(callback);
      
      callback.mockClear();
      unsubscribe();
      
      // Trigger a change
      service._images = [{ id: '1' } as any];
      (service as any).notifyImagesChange();
      
      expect(callback).not.toHaveBeenCalled();
    });

    it('should call onUploadingChange callback immediately with current state', () => {
      const callback = vi.fn();
      
      service.onUploadingChange(callback);
      
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(false);
    });

    it('should unsubscribe from onUploadingChange', () => {
      const callback = vi.fn();
      const unsubscribe = service.onUploadingChange(callback);
      
      callback.mockClear();
      unsubscribe();
      
      // Trigger a change
      (service as any)._isUploading = true;
      (service as any).notifyUploadingChange();
      
      expect(callback).not.toHaveBeenCalled();
    });

    it('should call onProgressChange callback immediately with current state', () => {
      const callback = vi.fn();
      
      service.onProgressChange(callback);
      
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(0);
    });

    it('should unsubscribe from onProgressChange', () => {
      const callback = vi.fn();
      const unsubscribe = service.onProgressChange(callback);
      
      callback.mockClear();
      unsubscribe();
      
      // Trigger a change
      (service as any)._uploadProgress = 50;
      (service as any).notifyProgressChange();
      
      expect(callback).not.toHaveBeenCalled();
    });

    it('should handle multiple listeners for images', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      
      service.onImagesChange(callback1);
      service.onImagesChange(callback2);
      
      callback1.mockClear();
      callback2.mockClear();
      
      // Trigger a change
      service._images = [{ id: '1' } as any];
      (service as any).notifyImagesChange();
      
      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(1);
    });

    it('should handle multiple listeners for uploading', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      
      service.onUploadingChange(callback1);
      service.onUploadingChange(callback2);
      
      callback1.mockClear();
      callback2.mockClear();
      
      // Trigger a change
      (service as any)._isUploading = true;
      (service as any).notifyUploadingChange();
      
      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(1);
    });

    it('should handle multiple listeners for progress', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      
      service.onProgressChange(callback1);
      service.onProgressChange(callback2);
      
      callback1.mockClear();
      callback2.mockClear();
      
      // Trigger a change
      (service as any)._uploadProgress = 75;
      (service as any).notifyProgressChange();
      
      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(1);
    });

    it('should safely handle unsubscribing non-existent callback for images', () => {
      const callback = vi.fn();
      const unsubscribe = service.onImagesChange(callback);
      
      // Remove callback manually to simulate non-existent callback
      (service as any)._imagesListeners = [];
      
      // Should not throw error
      expect(() => unsubscribe()).not.toThrow();
    });

    it('should safely handle unsubscribing non-existent callback for uploading', () => {
      const callback = vi.fn();
      const unsubscribe = service.onUploadingChange(callback);
      
      // Remove callback manually to simulate non-existent callback
      (service as any)._uploadingListeners = [];
      
      // Should not throw error
      expect(() => unsubscribe()).not.toThrow();
    });

    it('should safely handle unsubscribing non-existent callback for progress', () => {
      const callback = vi.fn();
      const unsubscribe = service.onProgressChange(callback);
      
      // Remove callback manually to simulate non-existent callback
      (service as any)._progressListeners = [];
      
      // Should not throw error
      expect(() => unsubscribe()).not.toThrow();
    });

    it('should return 0 for savingsPercentage initially', () => {
      expect(service.savingsPercentage).toBe(0);
    });
  });

  describe('Utility Methods', () => {
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
      expect(service.formatBytes(1536000)).toBe('1.46 MB');
    });

    it('should format bytes with custom decimals', () => {
      expect(service.formatBytes(2048, 0)).toBe('2 KB');
      expect(service.formatBytes(1536, 3)).toBe('1.5 KB');
    });

    it('should handle negative decimals by using 0', () => {
      expect(service.formatBytes(1536, -5)).toBe('2 KB');
    });

    it('should calculate savings percentage correctly', () => {
      expect(service.getSavingsPercentage(1000, 500)).toBe(50);
      expect(service.getSavingsPercentage(1000, 750)).toBe(25);
      expect(service.getSavingsPercentage(1000, 0)).toBe(100);
      expect(service.getSavingsPercentage(0, 0)).toBe(0);
    });

    it('should return negative percentage when compressed is larger', () => {
      expect(service.getSavingsPercentage(500, 1000)).toBe(-100);
    });
  });

  describe('getImageSize', () => {
    it('should return formatted size for a file', () => {
      const file = new File([mockBlob], 'test.jpg', { type: 'image/jpeg' });
      const size = service.getImageSize(file);
      
      expect(typeof size).toBe('string');
      expect(size).toBeDefined();
    });

    it('should handle large files', () => {
      const largeBlob = new Blob(['x'.repeat(5000000)], { type: 'image/jpeg' });
      const file = new File([largeBlob], 'large.jpg', { type: 'image/jpeg' });
      const size = service.getImageSize(file);
      
      expect(size).toContain('MB');
    });
  });



  describe('convertFormat', () => {
    beforeEach(() => {
      vi.mocked(browserImageCompression.default).mockResolvedValue(
        new File([mockBlob], 'compressed.webp', { type: 'image/webp' })
      );
    });

    it('should convert to webp format', async () => {
      await firstValueFrom(service.convertFormat([mockFile], { outputFormat: 'webp' }));
      
      expect(service.images.length).toBe(1);
      expect(service.images[0].status).toBe('completed');
      expect(browserImageCompression.default).toHaveBeenCalled();
    });

    it('should convert to png format', async () => {
      await firstValueFrom(service.convertFormat([mockFile], { outputFormat: 'png' }));
      
      expect(service.images.length).toBe(1);
      expect(service.images[0].status).toBe('completed');
    });

    it('should convert to jpeg format', async () => {
      await firstValueFrom(service.convertFormat([mockFile], { outputFormat: 'jpeg' }));
      
      expect(service.images.length).toBe(1);
      expect(service.images[0].status).toBe('completed');
    });

    it('should accept custom quality option', async () => {
      const options: ConvertOptions = { outputFormat: 'webp', quality: 70 };
      await firstValueFrom(service.convertFormat([mockFile], options));
      
      expect(browserImageCompression.default).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ initialQuality: 0.7 })
      );
    });

    it('should handle errors during conversion', async () => {
      vi.mocked(browserImageCompression.default).mockRejectedValue(
        new Error('Compression failed')
      );

      try {
        await firstValueFrom(service.convertFormat([mockFile], { outputFormat: 'webp' }));
      } catch (error) {
        // Expected to throw
      }
      
      const image = service.images[0];
      expect(image.status).toBe('error');
      expect(console.error).toHaveBeenCalled();
    });

    it('should handle multiple files', async () => {
      const file2 = new File([mockBlob], 'test2.jpg', { type: 'image/jpeg' });
      
      await firstValueFrom(service.convertFormat([mockFile, file2], { outputFormat: 'webp' }));
      
      expect(service.images.length).toBe(2);
    });

    it('should update completedImages computed signal', async () => {
      await firstValueFrom(service.convertFormat([mockFile], { outputFormat: 'webp' }));
      
      expect(service.completedImages.length).toBe(1);
      expect(service.completedCount).toBe(1);
    });
  });

  describe('compressImages', () => {
    beforeEach(() => {
      const smallerBlob = new Blob(['smaller'], { type: 'image/jpeg' });
      vi.mocked(browserImageCompression.default).mockResolvedValue(
        new File([smallerBlob], 'compressed.jpg', { type: 'image/jpeg' })
      );
    });

    it('should compress images with default options', async () => {
      await firstValueFrom(service.compressImages([mockFile]));
      
      expect(service.images.length).toBe(1);
      expect(service.images[0].status).toBe('completed');
    });

    it('should accept custom compression options', async () => {
      const options: CompressOptions = {
        quality: 60,
        maxSizeMB: 0.5,
        maxWidthOrHeight: 1024
      };
      
      await firstValueFrom(service.compressImages([mockFile], options));
      
      expect(browserImageCompression.default).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          initialQuality: 0.6,
          maxSizeMB: 0.5,
          maxWidthOrHeight: 1024
        })
      );
    });

    it('should calculate totalOriginalSize', async () => {
      await firstValueFrom(service.compressImages([mockFile]));
      
      expect(service.totalOriginalSize).toBeGreaterThan(0);
    });

    it('should calculate totalCompressedSize', async () => {
      await firstValueFrom(service.compressImages([mockFile]));
      
      expect(service.totalCompressedSize).toBeGreaterThan(0);
    });

    it('should calculate savingsPercentage', async () => {
      await firstValueFrom(service.compressImages([mockFile]));
      
      expect(service.savingsPercentage).toBeGreaterThanOrEqual(0);
    });

    it('should handle compression errors', async () => {
      vi.mocked(browserImageCompression.default).mockRejectedValue(
        new Error('Compression failed')
      );

      try {
        await firstValueFrom(service.compressImages([mockFile]));
      } catch (error) {
        // Expected to throw
      }
      
      const image = service.images[0];
      expect(image.status).toBe('error');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty file array in convertFormat', async () => {
      const obs$ = service.convertFormat([], { outputFormat: 'webp' });
      let completed = false;
      obs$.subscribe({
        complete: () => { completed = true; }
      });
      expect(completed).toBe(true);
      expect(service.images.length).toBe(0);
    });

    it('should handle empty file array in compressImages', async () => {
      const obs$ = service.compressImages([]);
      let completed = false;
      obs$.subscribe({
        complete: () => { completed = true; }
      });
      expect(completed).toBe(true);
      expect(service.images.length).toBe(0);
    });

    it('should handle PNG file type detection', () => {
      const pngFile = new File([mockBlob], 'test.png', { type: 'image/png' });
      vi.mocked(browserImageCompression.default).mockResolvedValue(pngFile);
      
      return firstValueFrom(service.compressImages([pngFile])).then(() => {
        expect(service.images[0]).toBeDefined();
      });
    });

    it('should handle WebP file type detection', () => {
      const webpFile = new File([mockBlob], 'test.webp', { type: 'image/webp' });
      vi.mocked(browserImageCompression.default).mockResolvedValue(webpFile);
      
      return firstValueFrom(service.compressImages([webpFile])).then(() => {
        expect(service.images[0]).toBeDefined();
      });
    });

    it('should handle file name without extension', async () => {
      const file = new File([mockBlob], 'testfile', { type: 'image/jpeg' });
      vi.mocked(browserImageCompression.default).mockResolvedValue(
        new File([mockBlob], 'compressed.webp', { type: 'image/webp' })
      );
      
      await firstValueFrom(service.convertFormat([file], { outputFormat: 'webp' }));
      
      expect(service.images[0].name).toContain('.webp');
    });

    it('should handle revokeImageUrls with empty URLs', () => {
      const imageWithEmptyUrls: ImageFile = {
        id: 'test-id',
        name: 'test.jpg',
        status: 'completed',
        originalUrl: '',
        compressedUrl: '',
        originalSize: 1000,
        compressedSize: 500,
        quality: 80
      };

      vi.clearAllMocks();
      
      service.revokeImageUrls(imageWithEmptyUrls);
      
      expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    });

    it('should call revokeImageUrls for images with valid URLs', () => {
      const imageWithUrls: ImageFile = {
        id: 'test-id',
        name: 'test.jpg',
        status: 'completed',
        originalUrl: 'blob:original-url',
        compressedUrl: 'blob:compressed-url',
        originalSize: 1000,
        compressedSize: 500,
        quality: 80
      };

      vi.clearAllMocks();
      
      service.revokeImageUrls(imageWithUrls);
      
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:original-url');
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:compressed-url');
      expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
    });
  });
});
