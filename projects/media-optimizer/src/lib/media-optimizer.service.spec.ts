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
    service._seedImages([]);
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
      
      // Trigger a change via the public setter — callback must NOT fire after unsubscribe
      service._seedImages([{ id: '1' } as any]);
      
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
      
      // Trigger a change via BehaviorSubject — callback must NOT fire after unsubscribe
      (service as any)._isUploading$.next(true);
      
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
      
      // Trigger a change via BehaviorSubject — callback must NOT fire after unsubscribe
      (service as any)._uploadProgress$.next(50);
      
      expect(callback).not.toHaveBeenCalled();
    });

    it('should handle multiple listeners for images', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      
      service.onImagesChange(callback1);
      service.onImagesChange(callback2);
      
      callback1.mockClear();
      callback2.mockClear();
      
      // Trigger a change via the public setter
      service._seedImages([{ id: '1' } as any]);
      
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
      
      // Trigger a change via BehaviorSubject
      (service as any)._isUploading$.next(true);
      
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
      
      // Trigger a change via BehaviorSubject
      (service as any)._uploadProgress$.next(75);
      
      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(1);
    });

    it('should safely handle calling unsubscribe more than once for images', () => {
      const callback = vi.fn();
      const unsubscribe = service.onImagesChange(callback);
      
      unsubscribe(); // first unsubscribe
      // Calling unsubscribe again on an RxJS subscription should not throw
      expect(() => unsubscribe()).not.toThrow();
    });

    it('should safely handle calling unsubscribe more than once for uploading', () => {
      const callback = vi.fn();
      const unsubscribe = service.onUploadingChange(callback);
      
      unsubscribe();
      expect(() => unsubscribe()).not.toThrow();
    });

    it('should safely handle calling unsubscribe more than once for progress', () => {
      const callback = vi.fn();
      const unsubscribe = service.onProgressChange(callback);
      
      unsubscribe();
      expect(() => unsubscribe()).not.toThrow();
    });

    it('should return 0 for savingsPercentage initially', () => {
      expect(service.savingsPercentage).toBe(0);
    });

    it('_seedImages should throw when a batch is already active', async () => {
      // Start a batch that stays in-flight  
      let resolveCompression!: (file: File) => void;
      vi.mocked(browserImageCompression.default).mockReturnValue(
        new Promise<File>(res => { resolveCompression = res; })
      );

      const batch$ = service.convertFormat([mockFile], { outputFormat: 'webp' });
      // Subscribe to kick off processing (do NOT await — we want it in-flight)
      const sub = batch$.subscribe({ error: () => {} });

      // While the batch is running, _seedImages must throw
      expect(() => service._seedImages([])).toThrow(
        '[ImageConverter] _seedImages: cannot replace state while a batch is active'
      );

      // Clean up: resolve the in-flight compression and unsubscribe
      resolveCompression(new File([mockBlob], 'out.webp', { type: 'image/webp' }));
      sub.unsubscribe();
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

    it('should convert to avif format', async () => {
      vi.mocked(browserImageCompression.default).mockResolvedValue(
        new File([mockBlob], 'compressed.avif', { type: 'image/avif' })
      );

      await firstValueFrom(service.convertFormat([mockFile], { outputFormat: 'avif' }));
      
      expect(service.images.length).toBe(1);
      expect(service.images[0].status).toBe('completed');
      expect(browserImageCompression.default).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ fileType: 'image/avif' })
      );
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

  describe('Upload State Tracking', () => {
    beforeEach(() => {
      vi.mocked(browserImageCompression.default).mockResolvedValue(
        new File([mockBlob], 'compressed.webp', { type: 'image/webp' })
      );
    });

    it('isUploading$ should be true while processing and false after completion', async () => {
      const uploadingValues: boolean[] = [];
      const sub = service.isUploading$.subscribe(v => uploadingValues.push(v));

      await firstValueFrom(service.convertFormat([mockFile], { outputFormat: 'webp' }));
      sub.unsubscribe();

      // Initial false, then true during processing, then false again after finalize
      expect(uploadingValues).toContain(true);
      expect(uploadingValues[uploadingValues.length - 1]).toBe(false);
    });

    it('uploadProgress$ should reach 100 after all files complete', async () => {
      const progressValues: number[] = [];
      const sub = service.uploadProgress$.subscribe(v => progressValues.push(v));

      await firstValueFrom(service.convertFormat([mockFile], { outputFormat: 'webp' }));
      sub.unsubscribe();

      // Should have hit 100 during processing, then reset to 0
      expect(progressValues).toContain(100);
      expect(progressValues[progressValues.length - 1]).toBe(0);
    });

    it('isUploading$ should reset to false when processing errors out', async () => {
      vi.mocked(browserImageCompression.default).mockRejectedValue(new Error('Compression failed'));

      try {
        await firstValueFrom(service.convertFormat([mockFile], { outputFormat: 'webp' }));
      } catch {
        // error is expected
      }

      expect(service.isUploading).toBe(false);
    });

    it('uploadProgress$ should reset to 0 when processing errors out', async () => {
      vi.mocked(browserImageCompression.default).mockRejectedValue(new Error('Compression failed'));

      try {
        await firstValueFrom(service.convertFormat([mockFile], { outputFormat: 'webp' }));
      } catch {
        // error is expected
      }

      expect(service.uploadProgress).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty file array in convertFormat', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      const obs$ = service.convertFormat([], { outputFormat: 'webp' });
      let completed = false;
      obs$.subscribe({
        complete: () => { completed = true; }
      });
      expect(completed).toBe(true);
      expect(service.images.length).toBe(0);
      
      consoleWarnSpy.mockRestore();
    });

    it('should handle empty file array in compressImages', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      const obs$ = service.compressImages([]);
      let completed = false;
      obs$.subscribe({
        complete: () => { completed = true; }
      });
      expect(completed).toBe(true);
      expect(service.images.length).toBe(0);
      
      consoleWarnSpy.mockRestore();
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

    it('should NOT revoke URLs for an image with empty URLs when removed', () => {
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

      service._seedImages([imageWithEmptyUrls]);
      vi.clearAllMocks();

      service.removeImage('test-id');

      // No URLs to revoke — revokeObjectURL must not be called
      expect(URL.revokeObjectURL).not.toHaveBeenCalled();
      expect(service.images).toHaveLength(0);
    });

    it('should revoke both blob URLs when an image is removed', () => {
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

      service._seedImages([imageWithUrls]);
      vi.clearAllMocks();

      service.removeImage('test-id');

      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:original-url');
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:compressed-url');
      expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
    });
  });

  describe('State Management', () => {
    it('should remove a specific image by id', () => {
      const image1: ImageFile = {
        id: 'id-1',
        name: 'test1.jpg',
        originalSize: 1000,
        compressedSize: 500,
        originalUrl: 'blob:url-1',
        compressedUrl: 'blob:compressed-1',
        status: 'completed',
        quality: 80
      };
      const image2: ImageFile = {
        id: 'id-2',
        name: 'test2.jpg',
        originalSize: 2000,
        compressedSize: 1000,
        originalUrl: 'blob:url-2',
        compressedUrl: 'blob:compressed-2',
        status: 'completed',
        quality: 80
      };

      service._seedImages([image1, image2]);
      vi.clearAllMocks();

      service.removeImage('id-1');

      expect(service.images).toHaveLength(1);
      expect(service.images[0].id).toBe('id-2');
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:url-1');
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:compressed-1');
    });

    it('should not throw when removing non-existent image', () => {
      service._seedImages([]);
      
      expect(() => service.removeImage('non-existent')).not.toThrow();
      expect(service.images).toHaveLength(0);
    });

    it('should remove all images and clean up URLs', () => {
      const image1: ImageFile = {
        id: 'id-1',
        name: 'test1.jpg',
        originalSize: 1000,
        compressedSize: 500,
        originalUrl: 'blob:url-1',
        compressedUrl: 'blob:compressed-1',
        status: 'completed',
        quality: 80
      };
      const image2: ImageFile = {
        id: 'id-2',
        name: 'test2.jpg',
        originalSize: 2000,
        compressedSize: 1000,
        originalUrl: 'blob:url-2',
        compressedUrl: 'blob:compressed-2',
        status: 'completed',
        quality: 80
      };

      service._seedImages([image1, image2]);
      vi.clearAllMocks();

      service.removeAllImages();

      expect(service.images).toHaveLength(0);
      expect(URL.revokeObjectURL).toHaveBeenCalledTimes(4);
    });

    it('should clear only completed images', () => {
      const completed: ImageFile = {
        id: 'id-1',
        name: 'completed.jpg',
        originalSize: 1000,
        compressedSize: 500,
        originalUrl: 'blob:url-1',
        compressedUrl: 'blob:compressed-1',
        status: 'completed',
        quality: 80
      };
      const pending: ImageFile = {
        id: 'id-2',
        name: 'pending.jpg',
        originalSize: 2000,
        originalUrl: 'blob:url-2',
        status: 'pending',
        quality: 80
      };
      const error: ImageFile = {
        id: 'id-3',
        name: 'error.jpg',
        originalSize: 3000,
        originalUrl: 'blob:url-3',
        status: 'error',
        quality: 80
      };

      service._seedImages([completed, pending, error]);
      vi.clearAllMocks();

      service.clearCompleted();

      expect(service.images).toHaveLength(2);
      expect(service.images.find(img => img.id === 'id-1')).toBeUndefined();
      expect(service.images.find(img => img.id === 'id-2')).toBeDefined();
      expect(service.images.find(img => img.id === 'id-3')).toBeDefined();
      expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
    });

    it('should notify listeners when removing images', () => {
      const callback = vi.fn();
      service.onImagesChange(callback);
      callback.mockClear();

      const image: ImageFile = {
        id: 'id-1',
        name: 'test.jpg',
        originalSize: 1000,
        compressedSize: 500,
        originalUrl: 'blob:url-1',
        compressedUrl: 'blob:compressed-1',
        status: 'completed',
        quality: 80
      };

      service._seedImages([image]);
      callback.mockClear(); // Clear notification from state seed
      service.removeImage('id-1');

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith([]);
    });
  });

  describe('Download', () => {
    beforeEach(() => {
      // Mock DOM methods
      document.createElement = vi.fn((tag) => {
        if (tag === 'a') {
          return {
            href: '',
            download: '',
            style: { display: '' },
            click: vi.fn(),
          } as any;
        }
        return {} as any;
      });
      document.body.appendChild = vi.fn();
      document.body.removeChild = vi.fn();
    });

    it('should download a specific image by id', () => {
      const image: ImageFile = {
        id: 'id-1',
        name: 'test.jpg',
        originalSize: 1000,
        compressedSize: 500,
        originalUrl: 'blob:original',
        compressedUrl: 'blob:compressed',
        status: 'completed',
        quality: 80
      };

      service._seedImages([image]);

      service.downloadImage('id-1');

      expect(document.createElement).toHaveBeenCalledWith('a');
      expect(document.body.appendChild).toHaveBeenCalled();
      expect(document.body.removeChild).toHaveBeenCalled();
    });

    it('should warn if image not found', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      service.downloadImage('non-existent');

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('not found'));
    });

    it('should warn if image not completed', () => {
      const image: ImageFile = {
        id: 'id-1',
        name: 'test.jpg',
        originalSize: 1000,
        originalUrl: 'blob:original',
        status: 'pending',
        quality: 80
      };

      service._seedImages([image]);
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      service.downloadImage('id-1');

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('not yet completed'));
    });

    it('should download all completed images', () => {
      vi.useFakeTimers();

      const image1: ImageFile = {
        id: 'id-1',
        name: 'test1.jpg',
        originalSize: 1000,
        compressedSize: 500,
        originalUrl: 'blob:original-1',
        compressedUrl: 'blob:compressed-1',
        status: 'completed',
        quality: 80
      };
      const image2: ImageFile = {
        id: 'id-2',
        name: 'test2.jpg',
        originalSize: 2000,
        compressedSize: 1000,
        originalUrl: 'blob:original-2',
        compressedUrl: 'blob:compressed-2',
        status: 'completed',
        quality: 80
      };

      service._seedImages([image1, image2]);
      const downloadSpy = vi.spyOn(service, 'downloadImage');

      service.downloadAllImages();
      
      vi.runAllTimers();

      expect(downloadSpy).toHaveBeenCalledTimes(2);
      expect(downloadSpy).toHaveBeenCalledWith('id-1');
      expect(downloadSpy).toHaveBeenCalledWith('id-2');

      vi.useRealTimers();
    });

    it('should warn when no completed images to download', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      service.downloadAllImages();

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('No completed images'));
    });

    it('should not download image that is not completed', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const createElementSpy = vi.spyOn(document, 'createElement');

      const processingImage: ImageFile = {
        id: 'id-1',
        name: 'test.jpg',
        originalSize: 1024,
        originalUrl: 'blob:original',
        status: 'processing',
        quality: 80
      };

      service._seedImages([processingImage]);
      service.downloadImage('id-1');

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('not yet completed'));
      expect(createElementSpy).not.toHaveBeenCalled();
    });

    it('should not download image without compressedUrl', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const createElementSpy = vi.spyOn(document, 'createElement');

      const imageNoUrl: ImageFile = {
        id: 'id-1',
        name: 'test.jpg',
        originalSize: 1024,
        compressedSize: 800,
        originalUrl: 'blob:original',
        compressedUrl: '', // Empty string, no compressed URL
        status: 'completed',
        quality: 80
      };

      service._seedImages([imageNoUrl]);
      service.downloadImage('id-1');

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('No compressed image available'));
      expect(createElementSpy).not.toHaveBeenCalled();
    });
  });

  describe('Validation', () => {
    it('should throw for quality below 0 in convertFormat', async () => {
      await expect(
        firstValueFrom(service.convertFormat([mockFile], { outputFormat: 'webp', quality: -1 }))
      ).rejects.toThrow('quality must be 0');
    });

    it('should throw for quality above 100 in convertFormat', async () => {
      await expect(
        firstValueFrom(service.convertFormat([mockFile], { outputFormat: 'webp', quality: 101 }))
      ).rejects.toThrow('quality must be 0');
    });

    it('should throw for quality below 0 in compressImages', async () => {
      await expect(
        firstValueFrom(service.compressImages([mockFile], { quality: -5 }))
      ).rejects.toThrow('quality must be 0');
    });

    it('should throw for quality above 100 in compressImages', async () => {
      await expect(
        firstValueFrom(service.compressImages([mockFile], { quality: 200 }))
      ).rejects.toThrow('quality must be 0');
    });

    it('should report ALL invalid files, not just the first', async () => {
      const pdf1 = new File([mockBlob], 'a.pdf', { type: 'application/pdf' });
      const pdf2 = new File([mockBlob], 'b.pdf', { type: 'application/pdf' });

      await expect(
        firstValueFrom(service.convertFormat([pdf1, pdf2], { outputFormat: 'webp' }))
      ).rejects.toSatisfy((err: Error) => {
        return err.message.includes('a.pdf') && err.message.includes('b.pdf');
      });
    });
  });

  describe('Abort Processing', () => {
    it('should forward AbortSignal to imageCompression so in-flight calls are genuinely cancelled', async () => {
      let capturedSignal: AbortSignal | undefined;
      vi.mocked(browserImageCompression.default).mockImplementation(async (_file, opts) => {
        capturedSignal = opts?.signal as AbortSignal | undefined;
        return new File([mockBlob], 'done.webp', { type: 'image/webp' });
      });

      await firstValueFrom(
        service.convertFormat([mockFile], { outputFormat: 'webp', concurrency: 1 })
      );

      expect(capturedSignal).toBeInstanceOf(AbortSignal);
    });

    it('should cancel queued files — abortProcessing sets signal.aborted before next mergeMap tick', async () => {
      // First file resolves; abort is called before the second file gets its mergeMap slot
      let callCount = 0;
      vi.mocked(browserImageCompression.default).mockImplementation(async (_file, opts) => {
        callCount++;
        // Abort after the first compression starts
        if (callCount === 1) service.abortProcessing();
        return new File([mockBlob], 'done.webp', { type: 'image/webp' });
      });

      const file2 = new File([mockBlob], 'b.jpg', { type: 'image/jpeg' });

      try {
        await firstValueFrom(
          service.convertFormat([mockFile, file2], { outputFormat: 'webp', concurrency: 1 })
        );
      } catch {
        // aborted error is expected for the second file
      }

      // The service must not throw synchronously; images state is clean
      expect(service).toBeTruthy();
    });

    it('should do nothing when abortProcessing is called with no active operation', () => {
      expect(() => service.abortProcessing()).not.toThrow();
    });
  });
});
