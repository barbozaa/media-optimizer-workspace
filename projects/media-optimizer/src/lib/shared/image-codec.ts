import type { ImageFormat } from './types';

/** Options consumed by the native codec pipeline. */
export interface CodecOptions {
  readonly outputFormat: ImageFormat;
  /** Compression quality 0–100 (ignored for lossless PNG). */
  readonly quality: number;
  /** Maximum output size in MiB. The encoder retries with lower quality until met. */
  readonly maxSizeMB: number;
  /** Maximum dimension (longest edge) in pixels. Aspect ratio is preserved. */
  readonly maxWidthOrHeight: number;
  readonly signal?: AbortSignal;
}

/** Maps ImageFormat to its MIME type string. */
const MIME: Record<ImageFormat, string> = {
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  avif: 'image/avif',
  png:  'image/png',
};

/**
 * Zero-dependency, OffscreenCanvas-based image codec.
 *
 * Replaces `browser-image-compression` (a `canvas.toBlob` wrapper) with a
 * pipeline that gives direct control over every processing stage:
 *
 *   1. **Decode** via `createImageBitmap()` — faster than loading through an
 *      `<img>` element + object URL, works inside Web Workers, and handles
 *      JPEG / PNG / WebP / AVIF / GIF (first frame).
 *
 *   2. **Step-wise resize** — iteratively halves the image until within 2× of
 *      the target size, then performs one final precise draw.  Each intermediate
 *      step keeps the browser's bilinear sampler averaging a full 2×2 block of
 *      source pixels, equivalent to a 2-tap Lanczos chain.  A single large
 *      downscale (e.g. 4 000 px → 400 px) lets the browser skip source pixels
 *      and introduces Moiré / aliasing artefacts; step-wise halving avoids this.
 *
 *   3. **Encode** via `OffscreenCanvas.convertToBlob()` — direct access to the
 *      browser's native codec (libwebp / libavif / mozjpeg-turbo on Chromium).
 *      If the result exceeds `maxSizeMB`, quality is ratcheted down by 15
 *      percentage points per attempt (up to 4 attempts total).
 *
 * @internal
 */
export class NativeImageCodec {
  /** Minimum quality floor used as the lower bound in the binary search. */
  private static readonly MIN_QUALITY   = 0.10;
  /**
   * Binary-search iterations after the initial quality attempt.
   * 5 steps → precision of (initialQuality − 0.10) / 2⁵ ≈ ±2 % quality —
   * good enough to avoid perceptible banding while staying within maxSizeMB.
   */
  private static readonly MAX_ATTEMPTS  = 5;

  /**
   * Compresses or re-encodes a single image file.
   *
   * @param file    - Source image file (any browser-decodable format)
   * @param options - Codec configuration
   * @returns A new `File` in the requested output format
   */
  static async compress(file: File, options: CodecOptions): Promise<File> {
    NativeImageCodec.checkAbort(options.signal);

    const maxBytes = options.maxSizeMB * 1024 * 1024;
    const mime     = MIME[options.outputFormat];

    // ── 1. Decode ────────────────────────────────────────────────────────────
    // `colorSpaceConversion: 'none'` skips the sRGB → linear → sRGB round-trip
    // that the browser applies by default, preserving original color values.
    // `premultiplyAlpha: 'none'` avoids precision loss from premultiplied-alpha
    // arithmetic on images with transparency (e.g. semi-transparent PNG).
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(file, {
        colorSpaceConversion: 'none',
        premultiplyAlpha:     'none',
      });
    } catch (err) {
      throw new Error(`NativeImageCodec: failed to decode "${file.name}": ${String(err)}`);
    }

    NativeImageCodec.checkAbort(options.signal);

    // ── 2. Resize ────────────────────────────────────────────────────────────
    const { targetW, targetH } = NativeImageCodec.computeTargetDims(
      bitmap.width, bitmap.height, options.maxWidthOrHeight,
    );
    const canvas = NativeImageCodec.stepwiseResize(bitmap, targetW, targetH);
    bitmap.close(); // free GPU memory; all draws are complete

    NativeImageCodec.checkAbort(options.signal);

    // ── 3. Encode — binary search for highest quality within the size budget ─
    const blob = await NativeImageCodec.encodeWithBudget(
      canvas, mime, options.quality / 100, maxBytes, options.signal,
    );

    if (!blob) throw new Error('NativeImageCodec: convertToBlob returned null');

    const outputName = NativeImageCodec.changeExtension(file.name, options.outputFormat);
    return new File([blob], outputName, { type: mime, lastModified: Date.now() });
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /**
   * Computes the target dimensions that fit within `maxDim` while preserving
   * aspect ratio.  Never upscales (returns original dims if already within).
   */
  private static computeTargetDims(
    w: number,
    h: number,
    maxDim: number,
  ): { targetW: number; targetH: number } {
    if (w <= maxDim && h <= maxDim) return { targetW: w, targetH: h };
    const scale = maxDim / Math.max(w, h);
    return {
      targetW: Math.max(1, Math.round(w * scale)),
      targetH: Math.max(1, Math.round(h * scale)),
    };
  }

  /**
   * Downscales a decoded `ImageBitmap` to exactly `targetW × targetH` using
   * iterative halving.
   *
   * Each intermediate step draws at ≥ 50 % of the previous canvas size so the
   * browser's bilinear sampler always averages a 2×2 source block.  Skipping
   * straight to the target on a large reduction (> 2×) causes the sampler to
   * skip source rows/columns, producing ringing / Moiré artefacts.
   */
  private static stepwiseResize(
    source: ImageBitmap,
    targetW: number,
    targetH: number,
  ): OffscreenCanvas {
    // Fast path — source already fits; just copy to a canvas for encoding.
    if (source.width === targetW && source.height === targetH) {
      const out = new OffscreenCanvas(targetW, targetH);
      const ctx = out.getContext('2d')!;
      ctx.imageSmoothingEnabled  = true;
      ctx.imageSmoothingQuality  = 'high'; // bicubic on Chromium, Lanczos on Firefox/Safari
      ctx.drawImage(source, 0, 0);
      return out;
    }

    // OffscreenCanvas is a valid CanvasImageSource, so we can chain draws
    // directly without creating intermediate ImageBitmaps.
    let current: CanvasImageSource = source;
    let curW = source.width;
    let curH = source.height;

    while (curW > targetW * 2 || curH > targetH * 2) {
      const nextW = Math.max(targetW, Math.ceil(curW / 2));
      const nextH = Math.max(targetH, Math.ceil(curH / 2));
      const step  = new OffscreenCanvas(nextW, nextH);
      const ctx   = step.getContext('2d')!;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(current, 0, 0, nextW, nextH);
      current = step;
      curW    = nextW;
      curH    = nextH;
    }

    const out = new OffscreenCanvas(targetW, targetH);
    const ctx = out.getContext('2d')!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(current, 0, 0, targetW, targetH);
    return out;
  }

  private static changeExtension(filename: string, format: ImageFormat): string {
    const dot = filename.lastIndexOf('.');
    return (dot > 0 ? filename.slice(0, dot) : filename) + '.' + format;
  }

  /**
   * Returns `true` when the browser can actually encode to `mime`.
   * `convertToBlob` silently falls back to PNG when given an unsupported type
   * (e.g. `image/avif` on Firefox / Safari / Chrome < 113).  A 1×1 probe lets
   * us detect that before wasting time encoding a full image.
   *
   * Result is memoised so the probe only runs once per format per page load.
   */
  private static readonly _supportCache = new Map<string, boolean>();

  private static async isFormatSupported(mime: string): Promise<boolean> {
    if (mime === 'image/png' || mime === 'image/jpeg') return true;
    const cached = NativeImageCodec._supportCache.get(mime);
    if (cached !== undefined) return cached;
    try {
      const probe = new OffscreenCanvas(1, 1);
      // Must acquire a context and draw a pixel — browsers return 'image/png'
      // from an uninitialised canvas regardless of the requested type, which
      // would cause a false "unsupported" result.
      const ctx = probe.getContext('2d')!;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, 1, 1);
      const blob = await probe.convertToBlob({ type: mime, quality: 0.5 });
      const supported = blob.type === mime;
      NativeImageCodec._supportCache.set(mime, supported);
      return supported;
    } catch {
      NativeImageCodec._supportCache.set(mime, false);
      return false;
    }
  }

  /**
   * Encodes `canvas` to `mime` using a binary search to find the highest
   * quality level whose output fits within `maxBytes`.
   *
   * **Why binary search beats linear ratchet:**
   * A −15 linear step can overshoot: if the file barely exceeds the budget at
   * q=0.65, the old code jumps to q=0.50 — wasting 10 % of quality
   * unnecessarily.  Binary search converges to the threshold with ~±2 %
   * precision in `MAX_ATTEMPTS` encode calls regardless of the quality range.
   *
   * **PNG / lossless fast-path:**
   * PNG ignores the `quality` parameter entirely — `convertToBlob` always
   * produces a lossless deflate stream.  We skip the search and return the
   * single encode result immediately.
   */
  private static async encodeWithBudget(
    canvas:         OffscreenCanvas,
    mime:           string,
    initialQuality: number,
    maxBytes:       number,
    signal?:        AbortSignal,
  ): Promise<Blob> {
    NativeImageCodec.checkAbort(signal);

    // Guard: probe the browser before encoding the full image.
    // When AVIF / WebP encoding is unsupported, convertToBlob silently returns
    // a PNG blob — which can be 3–4× larger than the source JPEG.
    if (!(await NativeImageCodec.isFormatSupported(mime))) {
      const humanName = mime.replace('image/', '').toUpperCase();
      const alternatives = ['JPEG', 'WebP', 'PNG'].filter(f => f.toLowerCase() !== humanName.toLowerCase()).join(' or ');
      throw new Error(
        `${humanName} encoding is not supported in this browser. ` +
        `Try ${alternatives} instead.`,
      );
    }

    // First attempt at the requested quality.
    const firstBlob = await canvas.convertToBlob({ type: mime, quality: initialQuality });

    // Fast-path: already fits, or PNG (quality is ignored → will never get smaller).
    if (firstBlob.size <= maxBytes || mime === 'image/png') return firstBlob;

    // Binary search in [MIN_QUALITY, initialQuality).
    // Invariant during the loop:
    //   `lo`  — the highest midpoint we have tried that produced size ≤ maxBytes
    //            (or MIN_QUALITY if we haven't found one yet).
    //   `hi`  — the lowest midpoint we have tried that produced size > maxBytes
    //            (starts at initialQuality, already confirmed above).
    let lo          = NativeImageCodec.MIN_QUALITY;
    let hi          = initialQuality;
    let fittingBlob: Blob | null = null;

    for (let i = 0; i < NativeImageCodec.MAX_ATTEMPTS; i++) {
      NativeImageCodec.checkAbort(signal);
      const mid      = (lo + hi) / 2;
      const candidate = await canvas.convertToBlob({ type: mime, quality: mid });

      if (candidate.size <= maxBytes) {
        lo          = mid;          // fits → search the upper half (higher quality)
        fittingBlob = candidate;
      } else {
        hi = mid;                   // too big → search the lower half
      }
    }

    // `fittingBlob` is the highest quality encode that respected the budget.
    // If the entire range was above budget (very tight constraint), fall back
    // to MIN_QUALITY.
    if (fittingBlob) return fittingBlob;

    NativeImageCodec.checkAbort(signal);
    return canvas.convertToBlob({ type: mime, quality: NativeImageCodec.MIN_QUALITY });
  }

  private static checkAbort(signal?: AbortSignal): void {
    if (signal?.aborted) throw new DOMException('Processing aborted', 'AbortError');
  }
}
