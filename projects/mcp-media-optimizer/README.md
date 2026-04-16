# mcp-media-optimizer

MCP server for image compression and analysis. Compress, convert, and analyze images (WebP, AVIF, JPEG, PNG) directly from any MCP-compatible AI assistant like Claude.

Built on [Sharp](https://sharp.pixelplumbing.com/) — same codecs as the browser (libwebp, libavif, mozjpeg), faster and with better resize quality (Lanczos3).

## Quick Start

Add to your `~/.cursor/mcp.json` or `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "mcp-media-optimizer": {
      "command": "npx",
      "args": ["-y", "mcp-media-optimizer"]
    }
  }
}
```

Then restart your AI client. No install needed — `npx` handles it automatically.

## Tools

### `analyze_image`
Get full metadata for an image: dimensions, format, size, transparency, animation status, suggested output format, and estimated compressed sizes for all formats.

```
imagePath: "/path/to/image.jpg"
```

### `compress_image`
Compress or convert a single image. Uses binary-search quality to hit the size budget while maximizing quality.

```
inputPath:        "/path/to/input.jpg"
outputPath:       "/path/to/output.webp"   (optional)
outputFormat:     "webp" | "jpeg" | "png" | "avif"
quality:          80                        (0–100, default: 80)
maxSizeMB:        10                        (default: 10)
maxWidthOrHeight: 1920                      (default: 1920)
```

### `compress_batch`
Compress multiple images in parallel.

```
inputPaths:       ["/img1.jpg", "/img2.png"]
outputDir:        "/output/"               (optional)
outputFormat:     "webp"
quality:          80
maxSizeMB:        10
maxWidthOrHeight: 1920
concurrency:      4                        (default: 4)
```

### `suggest_format`
Analyze an image and recommend the best output format based on its content (transparency, resolution, type).

```
imagePath: "/path/to/image.png"
```

### `estimate_size`
Estimate the compressed size for a given quality and format — without actually compressing the image.

```
imagePath:    "/path/to/image.jpg"
quality:      80
targetFormat: "avif"
```

## Example Results

| Input | Format | Quality | Original | Compressed | Savings |
|-------|--------|---------|----------|------------|---------|
| Photo 1920×1080 | JPEG → WebP | 80 | 503 KB | 25 KB | 95% |
| Photo 1920×1080 | JPEG → AVIF | 80 | 503 KB | 65 KB | 87% |
| Icon PNG 256×256 | PNG → WebP | 80 | 9 KB | 2.7 KB | 70% |

## Requirements

- Node.js ≥ 18
- Works on Linux, macOS, Windows (Sharp has prebuilt binaries for all platforms)

## License

MIT
