# Changelog - ngx-media-optimizer

All notable changes to this package will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-02-01

### Added

#### AVIF Format Support
- Complete support for AVIF image format in all conversion and validation methods
- Automatic AVIF format detection based on MIME type

#### Image Validation (`ImageUtilsService`)
- **`validateDimensions(file, minWidth, minHeight, maxWidth, maxHeight)`**
  - Validates image dimensions against specified constraints
  - Returns `Promise<boolean>` with detailed validation
  - Example: `await imageUtils.validateDimensions(file, 100, 100, 4096, 4096)`

- **`validateFileSize(file, maxSizeMB, minSizeMB?)`**
  - Validates file size with optional min/max limits
  - Returns `boolean` for instant validation
  - Example: `imageUtils.validateFileSize(file, 5)` // Max 5MB

- **`validateBatch(files, options)`**
  - Comprehensive batch validation with multiple criteria
  - Options: `allowedFormats`, `maxSizeMB`, `minSizeMB`, `minWidth`, `minHeight`, `maxWidth`, `maxHeight`
  - Returns `Promise<ValidationResult[]>` with per-file validation details
  - Example:
    ```typescript
    const results = await imageUtils.validateBatch(files, {
      allowedFormats: ['image/jpeg', 'image/png'],
      maxSizeMB: 5,
      maxWidth: 4096,
      maxHeight: 4096
    });
    ```

#### Image Analysis (`ImageUtilsService`)
- **`hasTransparency(file)`**
  - Detects transparency/alpha channel in PNG/WebP images
  - Uses canvas-based pixel analysis
  - Returns `Promise<boolean>`
  - Example: `const transparent = await imageUtils.hasTransparency(pngFile)`

- **`isAnimated(file)`**
  - Detects animated GIFs and WebPs using binary analysis
  - Searches for NETSCAPE2.0 marker (GIF) and ANIM chunk (WebP)
  - Returns `Promise<boolean>`
  - Example: `const animated = await imageUtils.isAnimated(gifFile)`

- **`getDominantColor(file)`**
  - Calculates dominant color using color quantization algorithm
  - Skips transparent pixels automatically
  - Returns `Promise<string>` in hex format (#RRGGBB)
  - Example: `const color = await imageUtils.getDominantColor(file)` // "#FF0000"

#### State Management (`ImageConverterService`)
- **`removeImage(id)`**
  - Removes individual image by unique ID
  - Automatic cleanup of blob URLs to prevent memory leaks
  - Triggers reactive state update
  - Example: `service.removeImage('image-id-123')`

- **`removeAllImages()`**
  - Clears all images from state
  - Bulk cleanup of all blob URLs
  - Resets state to empty array
  - Example: `service.removeAllImages()`

- **`clearCompleted()`**
  - Removes only completed images
  - Preserves pending/processing/error images
  - Selective cleanup of resources
  - Example: `service.clearCompleted()`

#### Download Functionality (`ImageConverterService`)
- **`downloadImage(id)`**
  - Downloads individual compressed image
  - Creates temporary anchor element for download
  - Validates image status before download
  - Example: `service.downloadImage('image-id-123')`

- **`downloadAllImages()`**
  - Downloads all completed images
  - Staggered execution (100ms delay between downloads)
  - Prevents browser blocking on multiple simultaneous downloads
  - Example: `service.downloadAllImages()`

### Changed
- Enhanced `ImageFormat` type to include `'avif'`
- Improved error handling with consistent logging format
- Updated `isValidImage()` to accept AVIF MIME type
- Enhanced `detectImageFormat()` to recognize AVIF

### Technical Improvements
- **100% line coverage** across all new methods
- 137 unit tests (all passing)
- Complete JSDoc documentation with examples
- Robust error handling with try-catch blocks
- Immutable state management patterns
- Automatic resource cleanup (blob URLs)
- TypeScript strict mode compliance

### Performance
- Color quantization uses sampling (every 4th pixel) for speed
- Dimension validation uses cached Image object
- Batch validation processes files in parallel
- Minimal memory footprint with automatic cleanup

## [1.0.1] - 2026-01-31

### Added
- Initial public release
- Core image conversion and compression
- Support for WebP, JPEG, and PNG formats
- Parallel processing with concurrency control
- Reactive state management with RxJS
- Framework-agnostic architecture
- TypeScript strict mode support

### Features
- `convertFormat()`: Convert images to different formats
- `compressImages()`: Compress images with quality control
- `getImageInfo()`: Extract detailed image metadata
- Signal-based reactive state
- Callback subscriptions for state changes
- Automatic blob URL management

[1.1.0]: https://github.com/barbozaa/media-optimizer-workspace/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/barbozaa/media-optimizer-workspace/releases/tag/v1.0.1
