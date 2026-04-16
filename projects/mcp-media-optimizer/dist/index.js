#!/usr/bin/env node
/**
 * MCP server for image compression and analysis.
 *
 * Replicates the API surface of ngx-media-optimizer (ImageConverterService +
 * ImageUtilsService) for use in Node.js environments, using `sharp` as the
 * native codec backend instead of the browser-only OffscreenCanvas pipeline.
 *
 * Key algorithms ported from the library:
 *  - Binary search quality (NativeImageCodec.encodeWithBudget)
 *  - Format suggestion heuristics (ImageUtilsService.suggestOptimalFormat)
 *  - Size estimation (ImageUtilsService.estimateCompressedSize)
 *  - Concurrent batch processing (runConcurrent)
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, } from '@modelcontextprotocol/sdk/types.js';
import sharp from 'sharp';
import * as fs from 'fs';
import * as path from 'path';
// ── Utilities ─────────────────────────────────────────────────────────────────
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0)
        return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
}
function gcd(a, b) {
    return b === 0 ? a : gcd(b, a % b);
}
function detectFormat(filepath) {
    const ext = path.extname(filepath).toLowerCase().slice(1);
    if (ext === 'webp')
        return 'webp';
    if (ext === 'avif')
        return 'avif';
    if (ext === 'png')
        return 'png';
    return 'jpeg';
}
function applySharpFormat(img, format, quality) {
    switch (format) {
        case 'webp': return img.webp({ quality });
        case 'jpeg': return img.jpeg({ quality, mozjpeg: true });
        case 'avif': return img.avif({ quality });
        case 'png': return img.png({ compressionLevel: 9, effort: 10 });
    }
}
/**
 * Binary search for highest quality that fits within maxBytes.
 * Direct port of NativeImageCodec.encodeWithBudget from the library.
 */
async function encodeWithBudget(inputBuffer, format, initialQuality, maxBytes) {
    const encode = (q) => applySharpFormat(sharp(inputBuffer), format, q).toBuffer();
    const first = await encode(initialQuality);
    if (first.length <= maxBytes || format === 'png') {
        return { buffer: first, quality: initialQuality };
    }
    const MIN_QUALITY = 10;
    const MAX_ATTEMPTS = 5;
    let lo = MIN_QUALITY;
    let hi = initialQuality;
    let fittingBuffer = null;
    let fittingQuality = MIN_QUALITY;
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
        const mid = Math.round((lo + hi) / 2);
        const candidate = await encode(mid);
        if (candidate.length <= maxBytes) {
            lo = mid;
            fittingBuffer = candidate;
            fittingQuality = mid;
        }
        else {
            hi = mid;
        }
    }
    if (fittingBuffer)
        return { buffer: fittingBuffer, quality: fittingQuality };
    const fallback = await encode(MIN_QUALITY);
    return { buffer: fallback, quality: MIN_QUALITY };
}
/**
 * Concurrent queue processor.
 * Port of runConcurrent from the library.
 */
async function runConcurrent(items, concurrency, handler) {
    const results = [];
    const errors = [];
    const queue = [...items];
    async function worker() {
        while (queue.length > 0) {
            const item = queue.shift();
            try {
                results.push(await handler(item));
            }
            catch (err) {
                errors.push({ item, error: err instanceof Error ? err.message : String(err) });
            }
        }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
    return { results, errors };
}
// ── Core image operations ─────────────────────────────────────────────────────
async function getImageInfo(imagePath) {
    const meta = await sharp(imagePath).metadata();
    const stat = fs.statSync(imagePath);
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    const g = gcd(width, height);
    const pages = meta.pages ?? 1;
    return {
        name: path.basename(imagePath),
        size: stat.size,
        formattedSize: formatBytes(stat.size),
        format: detectFormat(imagePath),
        width,
        height,
        aspectRatio: height > 0 ? width / height : 0,
        aspectRatioString: g > 0 ? `${width / g}:${height / g}` : `${width}:${height}`,
        hasAlpha: meta.hasAlpha ?? false,
        isAnimated: pages > 1,
        pages,
    };
}
/**
 * Port of ImageUtilsService.suggestOptimalFormat.
 */
function suggestFormat(info) {
    if (info.hasAlpha) {
        return {
            format: 'avif',
            reason: 'Image has transparency — AVIF supports alpha and is ~30% smaller than WebP at equal quality',
        };
    }
    const megapixels = (info.width * info.height) / 1_000_000;
    if (megapixels > 1) {
        return {
            format: 'avif',
            reason: 'Large photo (>1MP) — AVIF offers 30–50% better compression than JPEG at equal visual quality',
        };
    }
    return {
        format: 'webp',
        reason: 'Small graphic/icon — WebP is fast to encode with universal browser support',
    };
}
/**
 * Port of ImageUtilsService.estimateCompressedSize.
 */
function estimateSize(info, quality, targetFormat) {
    const COMPRESSION_FACTORS = {
        webp: 0.65, avif: 0.50, png: 0.75, jpeg: 0.85,
    };
    const PNG_EXPANSION = {
        jpeg: 3.2, webp: 2.8, avif: 3.0, png: 1.0,
    };
    if (targetFormat === 'png') {
        // PNG is lossless — estimate from pixel count
        if (info.width && info.height) {
            return Math.round(info.width * info.height * 2.2);
        }
        return Math.round(info.size * PNG_EXPANSION[info.format]);
    }
    const factor = COMPRESSION_FACTORS[targetFormat];
    const adjustedQuality = Math.pow(quality / 100, 0.8);
    const sizeMB = info.size / (1024 * 1024);
    const sizeAdj = Math.max(0.7, Math.min(1.0, 1 - sizeMB / 50));
    return Math.round(info.size * adjustedQuality * factor * sizeAdj);
}
/**
 * Compress a single image using the same pipeline as NativeImageCodec:
 *  1. Decode (sharp)
 *  2. Resize to maxWidthOrHeight preserving aspect ratio
 *  3. Encode with binary search quality budget
 */
async function compressImage(inputPath, outputPath, options) {
    const quality = options.quality ?? 80;
    const maxSizeMB = options.maxSizeMB ?? 10;
    const maxWidthOrHeight = options.maxWidthOrHeight ?? 1920;
    const maxBytes = maxSizeMB * 1024 * 1024;
    const info = await getImageInfo(inputPath);
    const outputFormat = options.outputFormat ?? info.format;
    let img = sharp(inputPath);
    if (info.width > maxWidthOrHeight || info.height > maxWidthOrHeight) {
        img = img.resize(maxWidthOrHeight, maxWidthOrHeight, {
            fit: 'inside',
            withoutEnlargement: true,
            kernel: sharp.kernel.lanczos3,
        });
    }
    // Decode to raw buffer for the encode loop (avoids re-reading the file per attempt)
    const decoded = await img.toBuffer();
    const { buffer, quality: qualityUsed } = await encodeWithBudget(decoded, outputFormat, quality, maxBytes);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, buffer);
    const outMeta = await sharp(buffer).metadata();
    return {
        inputPath,
        outputPath,
        originalSize: info.size,
        compressedSize: buffer.length,
        originalSizeFormatted: formatBytes(info.size),
        compressedSizeFormatted: formatBytes(buffer.length),
        savingsPercent: info.size > 0
            ? Math.round(((info.size - buffer.length) / info.size) * 100)
            : 0,
        outputFormat,
        qualityUsed,
        width: outMeta.width ?? info.width,
        height: outMeta.height ?? info.height,
    };
}
function buildOutputPath(inputPath, outputFormat, outputDir) {
    const ext = outputFormat === 'jpeg' ? 'jpg' : outputFormat;
    const base = path.basename(inputPath, path.extname(inputPath));
    const dir = outputDir ?? path.dirname(inputPath);
    return path.join(dir, `${base}_compressed.${ext}`);
}
// ── MCP Server ────────────────────────────────────────────────────────────────
const server = new Server({ name: 'mcp-media-optimizer', version: '1.0.0' }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
        {
            name: 'compress_image',
            description: 'Compress or convert a single image file (JPEG, PNG, WebP, AVIF). ' +
                'Uses binary-search quality (same algorithm as ngx-media-optimizer) to find the ' +
                'highest quality that fits within maxSizeMB. Resizes to maxWidthOrHeight if needed.',
            inputSchema: {
                type: 'object',
                properties: {
                    inputPath: {
                        type: 'string',
                        description: 'Absolute path to the source image',
                    },
                    outputPath: {
                        type: 'string',
                        description: 'Absolute path for the output file. ' +
                            'Defaults to same directory with _compressed suffix and new extension.',
                    },
                    outputFormat: {
                        type: 'string',
                        enum: ['webp', 'jpeg', 'png', 'avif'],
                        description: 'Output format. Defaults to same as input.',
                    },
                    quality: {
                        type: 'number',
                        description: 'Compression quality 0–100. Default: 80',
                    },
                    maxSizeMB: {
                        type: 'number',
                        description: 'Maximum output file size in MB. Default: 10',
                    },
                    maxWidthOrHeight: {
                        type: 'number',
                        description: 'Maximum dimension (width or height) in pixels. Default: 1920',
                    },
                },
                required: ['inputPath'],
            },
        },
        {
            name: 'analyze_image',
            description: 'Analyze an image: dimensions, format, size, transparency, animation status, ' +
                'suggested output format, and estimated compressed sizes for all formats.',
            inputSchema: {
                type: 'object',
                properties: {
                    imagePath: {
                        type: 'string',
                        description: 'Absolute path to the image file',
                    },
                },
                required: ['imagePath'],
            },
        },
        {
            name: 'compress_batch',
            description: 'Compress or convert multiple images in parallel. ' +
                'Returns per-file results plus a totals summary (total savings, total size).',
            inputSchema: {
                type: 'object',
                properties: {
                    inputPaths: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'Array of absolute paths to source images',
                    },
                    outputDir: {
                        type: 'string',
                        description: 'Output directory for all compressed files. Defaults to each file\'s own directory.',
                    },
                    outputFormat: {
                        type: 'string',
                        enum: ['webp', 'jpeg', 'png', 'avif'],
                        description: 'Output format applied to all files',
                    },
                    quality: {
                        type: 'number',
                        description: 'Compression quality 0–100. Default: 80',
                    },
                    maxSizeMB: {
                        type: 'number',
                        description: 'Maximum output size per file in MB. Default: 10',
                    },
                    maxWidthOrHeight: {
                        type: 'number',
                        description: 'Maximum dimension in pixels. Default: 1920',
                    },
                    concurrency: {
                        type: 'number',
                        description: 'Number of images processed in parallel. Default: 4',
                    },
                },
                required: ['inputPaths'],
            },
        },
        {
            name: 'suggest_format',
            description: 'Suggest the optimal output format for an image based on its content: ' +
                'transparency → avif, large photo → avif, small graphic → webp. ' +
                'Also returns estimated sizes for all formats at quality=80.',
            inputSchema: {
                type: 'object',
                properties: {
                    imagePath: {
                        type: 'string',
                        description: 'Absolute path to the image file',
                    },
                },
                required: ['imagePath'],
            },
        },
        {
            name: 'estimate_size',
            description: 'Estimate the compressed file size for a given quality and target format ' +
                'without actually compressing the image. Useful for planning before batch processing.',
            inputSchema: {
                type: 'object',
                properties: {
                    imagePath: {
                        type: 'string',
                        description: 'Absolute path to the image file',
                    },
                    quality: {
                        type: 'number',
                        description: 'Compression quality 0–100. Default: 80',
                    },
                    targetFormat: {
                        type: 'string',
                        enum: ['webp', 'jpeg', 'png', 'avif'],
                        description: 'Target output format. Defaults to same as input.',
                    },
                },
                required: ['imagePath'],
            },
        },
    ],
}));
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
        switch (name) {
            // ── compress_image ──────────────────────────────────────────────────────
            case 'compress_image': {
                const inputPath = args?.inputPath;
                if (!fs.existsSync(inputPath))
                    throw new Error(`File not found: ${inputPath}`);
                const info = await getImageInfo(inputPath);
                const outputFormat = args?.outputFormat ?? info.format;
                const outputPath = args?.outputPath ??
                    buildOutputPath(inputPath, outputFormat);
                const result = await compressImage(inputPath, outputPath, {
                    outputFormat,
                    quality: args?.quality,
                    maxSizeMB: args?.maxSizeMB,
                    maxWidthOrHeight: args?.maxWidthOrHeight,
                });
                return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
            }
            // ── analyze_image ───────────────────────────────────────────────────────
            case 'analyze_image': {
                const imagePath = args?.imagePath;
                if (!fs.existsSync(imagePath))
                    throw new Error(`File not found: ${imagePath}`);
                const info = await getImageInfo(imagePath);
                const suggestion = suggestFormat(info);
                const estimatedSizes = {};
                for (const fmt of ['webp', 'jpeg', 'png', 'avif']) {
                    estimatedSizes[fmt] = formatBytes(estimateSize(info, 80, fmt));
                }
                return {
                    content: [{
                            type: 'text',
                            text: JSON.stringify({
                                ...info,
                                suggestedFormat: suggestion.format,
                                suggestedFormatReason: suggestion.reason,
                                estimatedSizesAtQ80: estimatedSizes,
                            }, null, 2),
                        }],
                };
            }
            // ── compress_batch ──────────────────────────────────────────────────────
            case 'compress_batch': {
                const inputPaths = args?.inputPaths;
                if (!inputPaths?.length)
                    throw new Error('inputPaths must be a non-empty array');
                const concurrency = args?.concurrency ?? 4;
                const outputDir = args?.outputDir;
                const outputFormat = args?.outputFormat;
                const { results, errors } = await runConcurrent(inputPaths, concurrency, async (inputPath) => {
                    if (!fs.existsSync(inputPath))
                        throw new Error(`File not found: ${inputPath}`);
                    const info = await getImageInfo(inputPath);
                    const fmt = outputFormat ?? info.format;
                    const outputPath = buildOutputPath(inputPath, fmt, outputDir);
                    return compressImage(inputPath, outputPath, {
                        outputFormat: fmt,
                        quality: args?.quality,
                        maxSizeMB: args?.maxSizeMB,
                        maxWidthOrHeight: args?.maxWidthOrHeight,
                    });
                });
                const totalOriginal = results.reduce((s, r) => s + r.originalSize, 0);
                const totalCompressed = results.reduce((s, r) => s + r.compressedSize, 0);
                const totalSavings = totalOriginal > 0
                    ? Math.round(((totalOriginal - totalCompressed) / totalOriginal) * 100)
                    : 0;
                return {
                    content: [{
                            type: 'text',
                            text: JSON.stringify({
                                processed: results.length,
                                failed: errors.length,
                                totalOriginalSize: formatBytes(totalOriginal),
                                totalCompressedSize: formatBytes(totalCompressed),
                                totalSavingsPercent: totalSavings,
                                results,
                                errors,
                            }, null, 2),
                        }],
                };
            }
            // ── suggest_format ──────────────────────────────────────────────────────
            case 'suggest_format': {
                const imagePath = args?.imagePath;
                if (!fs.existsSync(imagePath))
                    throw new Error(`File not found: ${imagePath}`);
                const info = await getImageInfo(imagePath);
                const suggestion = suggestFormat(info);
                const estimatedSizes = {};
                for (const fmt of ['webp', 'jpeg', 'png', 'avif']) {
                    estimatedSizes[fmt] = formatBytes(estimateSize(info, 80, fmt));
                }
                return {
                    content: [{
                            type: 'text',
                            text: JSON.stringify({
                                currentFormat: info.format,
                                currentSize: info.formattedSize,
                                suggestedFormat: suggestion.format,
                                reason: suggestion.reason,
                                estimatedSizesAtQ80: estimatedSizes,
                            }, null, 2),
                        }],
                };
            }
            // ── estimate_size ───────────────────────────────────────────────────────
            case 'estimate_size': {
                const imagePath = args?.imagePath;
                if (!fs.existsSync(imagePath))
                    throw new Error(`File not found: ${imagePath}`);
                const info = await getImageInfo(imagePath);
                const quality = args?.quality ?? 80;
                const targetFormat = args?.targetFormat ?? info.format;
                const estimated = estimateSize(info, quality, targetFormat);
                return {
                    content: [{
                            type: 'text',
                            text: JSON.stringify({
                                imagePath,
                                originalSize: info.formattedSize,
                                originalBytes: info.size,
                                targetFormat,
                                quality,
                                estimatedSize: formatBytes(estimated),
                                estimatedBytes: estimated,
                                estimatedSavingsPercent: info.size > 0
                                    ? Math.round(((info.size - estimated) / info.size) * 100)
                                    : 0,
                            }, null, 2),
                        }],
                };
            }
            default:
                throw new Error(`Unknown tool: ${name}`);
        }
    }
    catch (err) {
        return {
            content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
            isError: true,
        };
    }
});
const transport = new StdioServerTransport();
await server.connect(transport);
//# sourceMappingURL=index.js.map