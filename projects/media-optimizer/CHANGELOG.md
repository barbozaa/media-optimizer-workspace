# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2025-12-29

### 🎯 Breaking Changes
- **Removed Angular Signals** - Replaced with callback-based reactive state management
  - Migration: Replace signal calls `images()` with property access `images`
  - Migration: Subscribe to state changes using `onImagesChange(callback)`
  - Migration: Cleanup subscriptions in `ngOnDestroy` to prevent memory leaks
- State properties are now **getters** instead of signals
  - `images`, `completedCount`, `savingsPercentage` are now plain properties
  - No need to call them as functions anymore

### ✨ Added
- **Framework-agnostic architecture** - Now works with React, Vue, and vanilla JavaScript
  - `onImagesChange(callback)` - Subscribe to image state changes
  - `onUploadingChange(callback)` - Subscribe to upload status changes
  - `onProgressChange(callback)` - Subscribe to progress changes
  - All callbacks return unsubscribe functions for cleanup
- **React support** - Use with `useState` and `useEffect`
- **Vue support** - Compatible with Composition API (`ref`, `onMounted`)
- **`convertFormat(files, options)`** - Convert images between formats (PNG, JPEG, WebP)
- **`compressImages(files, options)`** - Compress images while preserving format
- **Bundled dependencies** - `browser-image-compression` included in package
- **Disabled web workers by default** - Prevents CDN loading issues
  - Set `useWebWorker: true` to enable if needed

### ⚡ Changed
- State management from Angular Signals to callback-based system
- All computed properties now use JavaScript getters
- Improved memory management with explicit unsubscribe functions
- Updated documentation with React and Vue examples
- `browser-image-compression` moved from peer to bundled dependency

### 🐛 Fixed
- UI not updating when state changes (signal reactivity issue)
- Memory leaks from unmanaged subscriptions
- Web workers attempting CDN loads for bundled dependencies
- Quality slider triggering unnecessary reprocessing on initial load

### 📚 Documentation
- Added framework-agnostic usage examples
- React integration guide with hooks
- Vue integration guide with Composition API
- Memory leak prevention guidelines
- Migration guide from v1.x to v2.0.0

### 🧪 Testing
- All 82 unit tests passing (100% coverage maintained)
- Added ProgressEvent mock for FileReader tests
- Updated tests to use property access instead of signal calls
- Updated README with dual-API documentation and simplified installation
- Improved type safety across all methods

### Migration Guide
```typescript
// Before (deprecated)
await service.processFiles(files, 75);

// After - Option 1: Convert to WebP
await service.convertFormat(files, { 
  outputFormat: 'webp', 
  quality: 75 
});

// After - Option 2: Compress without format change
await service.compressImages(files, { quality: 75 });
```

## [1.0.0] - 2025-12-29

### Added
- Initial release
- WebP image conversion with configurable quality
- Parallel image processing for multiple files
- Download single or all compressed images
- Upload images to server with progress tracking
- Memory management with automatic URL cleanup
- Compression statistics and savings calculation
- Full TypeScript support with JSDoc documentation
- 100% test coverage with Vitest
- Angular Signals for reactive state management

### Features
- `processFiles()` - Process multiple images in parallel
- `downloadImage()` - Download single image
- `downloadAll()` - Download all completed images
- `uploadAllToServer()` - Upload images with progress
- `removeImage()` - Remove specific image
- `clearAll()` - Clear all images
- `formatBytes()` - Format byte sizes
- `getSavingsPercentage()` - Calculate compression savings
- `getTotalOriginalSize()` - Get total original size
- `getTotalCompressedSize()` - Get total compressed size
- `getCompletedCount()` - Count completed images
