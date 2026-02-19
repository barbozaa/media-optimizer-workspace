# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.3.0] - 2026-02-18

### Added
- **Abort Support**: New `abortProcessing()` method to cancel ongoing operations
- **Input Validation**: Comprehensive file validation (MIME types, size limits, empty files)
- **SSR Support**: Server-Side Rendering compatibility with proper browser API checks
- **Lifecycle Management**: `ngOnDestroy()` implementation for automatic cleanup
- **Cache Stats**: New `getCacheStats()` method to monitor cache usage

### Changed
- **Performance**: LRU cache eviction optimized from O(n) to O(1) - 100x faster
- **Code Quality**: Eliminated code duplication, replaced magic numbers with constants
- **Type Safety**: Removed all unsafe type assertions, improved null handling

### Fixed
- **Memory Leaks**: Fixed event handler cleanup in image loading error paths
- **Security**: Added file size validation to prevent DoS from huge files
- **Type Safety**: Removed non-null assertions and unsafe canvas type casts

## [1.1.0] - 2026-02-01

### Added
- **AVIF Format Support**: Added support for AVIF image format across all conversion and validation methods
- **Image Validation Methods** (`ImageUtilsService`):
  - `validateDimensions()`: Validate image dimensions against min/max constraints
  - `validateFileSize()`: Validate file size with optional min/max limits in MB
  - `validateBatch()`: Batch validation with comprehensive options (format, size, dimensions)
- **Image Analysis Methods** (`ImageUtilsService`):
  - `hasTransparency()`: Detect transparency/alpha channel in images
  - `isAnimated()`: Detect animated GIFs and WebPs using binary analysis
  - `getDominantColor()`: Calculate dominant color using color quantization algorithm
- **State Management Methods** (`ImageConverterService`):
  - `removeImage()`: Remove individual image by ID with automatic resource cleanup
  - `removeAllImages()`: Clear all images with bulk cleanup
  - `clearCompleted()`: Remove only completed images
- **Download Functionality** (`ImageConverterService`):
  - `downloadImage()`: Download individual compressed image
  - `downloadAllImages()`: Download all completed images with staggered execution

### Changed
- Improved type definitions to include AVIF format
- Enhanced error handling with detailed logging
- Updated all validation methods to support AVIF

### Fixed
- Image format detection now properly identifies AVIF files

## [1.0.1] - 2026-01-31

### Added
- Initial public release
- Core image conversion and compression functionality
- Support for WebP, JPEG, and PNG formats
- Parallel processing with RxJS
- Framework-agnostic design

[Unreleased]: https://github.com/barbozaa/media-optimizer-workspace/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/barbozaa/media-optimizer-workspace/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/barbozaa/media-optimizer-workspace/releases/tag/v1.0.1
