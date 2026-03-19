/**
 * Algorithm correctness tests for ImageHelpers.
 *
 * Unlike the service-layer specs that verify integration wiring through mocks,
 * these tests hit the pure-function core directly with real synthetic data:
 *   - Uint8ClampedArray pixel buffers (no HTMLImageElement / canvas mocks)
 *   - Programmatically constructed binary file headers (PNG, GIF, JPEG, WebP)
 *
 * If any algorithm regresses, these tests will catch it even if all the
 * mock-based tests continue to pass.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { ImageHelpers } from './shared/image-helpers';

// ─── jsdom polyfill ───────────────────────────────────────────────────────────
// jsdom 27 ships a minimal Blob that omits arrayBuffer() / text().
// extractDimensionsFromMetadata uses file.slice().arrayBuffer(), so we polyfill
// using jsdom's working FileReader.readAsArrayBuffer before the tests run.
beforeAll(() => {
  if (typeof Blob !== 'undefined' && typeof Blob.prototype.arrayBuffer !== 'function') {
    Blob.prototype.arrayBuffer = function (): Promise<ArrayBuffer> {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          if (reader.error) reject(reader.error);
          else resolve(reader.result as ArrayBuffer);
        };
        reader.readAsArrayBuffer(this);
      });
    };
  }
});

// ─── Binary file-header builders ─────────────────────────────────────────────

/**
 * Minimal valid PNG file (≥24 bytes).
 * Signature at 0–7; IHDR width @ 16, height @ 20 (big-endian).
 */
function makePngFile(width: number, height: number): File {
  const buf = new Uint8Array(25);
  const v = new DataView(buf.buffer);
  v.setUint32(0, 0x89504e47, false); // PNG signature hi
  v.setUint32(4, 0x0d0a1a0a, false); // PNG signature lo
  v.setUint32(16, width, false);
  v.setUint32(20, height, false);
  return new File([buf], 'test.png', { type: 'image/png' });
}

/**
 * Minimal valid GIF89a file (≥10 bytes).
 * "GIF8" at 0–3; width @ 6, height @ 8 (little-endian).
 */
function makeGifFile(width: number, height: number): File {
  const buf = new Uint8Array(12);
  const v = new DataView(buf.buffer);
  v.setUint32(0, 0x47494638, false); // "GIF8"
  buf[4] = 0x39; buf[5] = 0x61;     // "9a" → GIF89a
  v.setUint16(6, width, true);
  v.setUint16(8, height, true);
  return new File([buf], 'test.gif', { type: 'image/gif' });
}

/**
 * Minimal JPEG: SOI + APP0(16 bytes) + SOF0.
 *
 * Buffer layout
 *   0–1   FF D8            SOI
 *   2–3   FF E0            APP0 marker
 *   4–5   00 10            APP0 length = 16
 *   6–19  (zeros)          APP0 payload — content irrelevant
 *   20–21 FF C0            SOF0 marker  ← offset = 20
 *   22–23 00 11            SOF0 length = 17
 *   24    08               precision
 *   25–26 height BE        offset + 5
 *   27–28 width  BE        offset + 7
 */
function makeJpegFile(width: number, height: number): File {
  const buf = new Uint8Array(38);
  const v = new DataView(buf.buffer);
  buf[0] = 0xff; buf[1] = 0xd8;          // SOI
  buf[2] = 0xff; buf[3] = 0xe0;          // APP0 marker
  v.setUint16(4, 16, false);             // APP0 length
  // APP0 payload indices 6–19: zeros OK
  buf[20] = 0xff; buf[21] = 0xc0;        // SOF0 marker
  v.setUint16(22, 17, false);            // SOF0 length
  buf[24] = 0x08;                        // precision
  v.setUint16(25, height, false);        // height
  v.setUint16(27, width, false);         // width
  return new File([buf], 'test.jpg', { type: 'image/jpeg' });
}

/**
 * JPEG with two extra 0xFF padding bytes before each segment marker.
 * Per JPEG spec §B.1.1.3, any number of 0xFF fill bytes may precede a marker;
 * a buggy parser that reads offset+1 as the marker byte without skipping
 * padding would misidentify 0xFF as the marker and misdecode the dimensions.
 *
 * Layout (offsets):
 *   0–1   FF D8           SOI
 *   2–4   FF FF FF        2 padding + marker-start for APP0
 *   5     E0              APP0 type
 *   6–7   00 10           APP0 length = 16
 *   8–21  (zeros)         APP0 payload
 *  22–24  FF FF FF        2 padding + marker-start for SOF0
 *  25    C0              SOF0 type
 *  26–27  00 11           SOF0 length = 17
 *  28    08              precision
 *  29–30  height BE
 *  31–32  width  BE
 */
function makeJpegFileWithPadding(width: number, height: number): File {
  const buf = new Uint8Array(40);
  const v = new DataView(buf.buffer);
  buf[0] = 0xff; buf[1] = 0xd8;    // SOI
  buf[2] = 0xff; buf[3] = 0xff;    // 0xFF padding
  buf[4] = 0xff; buf[5] = 0xe0;    // 0xFF marker-start + APP0 type
  v.setUint16(6, 16, false);       // APP0 length
  buf[22] = 0xff; buf[23] = 0xff;  // 0xFF padding
  buf[24] = 0xff; buf[25] = 0xc0;  // 0xFF marker-start + SOF0 type
  v.setUint16(26, 17, false);      // SOF0 length
  buf[28] = 0x08;                  // precision
  v.setUint16(29, height, false);  // height
  v.setUint16(31,  width, false);  // width
  return new File([buf], 'padded.jpg', { type: 'image/jpeg' });
}
function makeWebpFile(width: number, height: number): File {
  const buf = new Uint8Array(32);
  const v = new DataView(buf.buffer);
  v.setUint32(0, 0x52494646, false);  // "RIFF"
  v.setUint32(4, 24, true);           // file size (LE, placeholder)
  v.setUint32(8, 0x57454250, false);  // "WEBP"
  v.setUint32(12, 0x56503820, false); // "VP8 " chunk type
  v.setUint32(16, 10, true);          // chunk data size (LE)
  // frame tag (bytes 20–22) = zeros (key frame)
  // VP8 start code optional — extractor only checks offsets 26/28
  v.setUint16(26, width, true);       // width LE (lower 14 bits)
  v.setUint16(28, height, true);      // height LE (lower 14 bits)
  return new File([buf], 'test.webp', { type: 'image/webp' });
}

// ─── Pixel-data builders ──────────────────────────────────────────────────────

/** Build an RGBA Uint8ClampedArray from an array of { r, g, b, a? } descriptors. */
function makePixelData(
  pixels: { r: number; g: number; b: number; a?: number }[],
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(pixels.length * 4);
  pixels.forEach(({ r, g, b, a = 255 }, i) => {
    data[i * 4 + 0] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = a;
  });
  return data;
}

/** Repeat a single pixel `count` times. */
function solid(r: number, g: number, b: number, count: number, a = 255): Uint8ClampedArray {
  return makePixelData(Array.from({ length: count }, () => ({ r, g, b, a })));
}

// ─────────────────────────────────────────────────────────────────────────────

describe('ImageHelpers – algorithm correctness', () => {

  // ── formatBytes ─────────────────────────────────────────────────────────────

  describe('formatBytes()', () => {
    it.each([
      [0,                 '0 Bytes'],
      [1,                 '1 Bytes'],
      [1023,              '1023 Bytes'],
      [1024,              '1 KB'],
      [1536,              '1.5 KB'],
      [1048576,           '1 MB'],
      [1073741824,        '1 GB'],
      [1099511627776,     '1 TB'],   // 1024^4
      [1125899906842624,  '1 PB'],   // 1024^5
    ])('formatBytes(%d) → %s', (input, expected) => {
      expect(ImageHelpers.formatBytes(input)).toBe(expected);
    });

    it.each([
      [-1],
      [-0.001],
      [NaN],
      [Infinity],
      [-Infinity],
    ])('formatBytes(%s) returns N/A', (bad) => {
      expect(ImageHelpers.formatBytes(bad)).toBe('N/A');
    });
  });

  // ── calculateGCD ─────────────────────────────────────────────────────────────

  describe('calculateGCD()', () => {
    it.each([
      [1920, 1080, 120], // 16:9
      [800,  600,  200], // 4:3
      [1000, 500,  500], // 2:1
      [7,    3,    1  ], // coprime
      [12,   8,    4  ],
      [100,  100,  100], // square
    ])('GCD(%d, %d) = %d', (a, b, expected) => {
      expect(ImageHelpers.calculateGCD(a, b)).toBe(expected);
    });
  });

  // ── medianCut ────────────────────────────────────────────────────────────────

  describe('medianCut()', () => {
    it('depth=0 returns the input as a single cluster', () => {
      const colors: [number, number, number][] = [[255, 0, 0], [0, 255, 0]];
      const result = ImageHelpers.medianCut(colors, 0);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(colors);
    });

    it('single-element array returns one cluster regardless of depth', () => {
      const colors: [number, number, number][] = [[128, 64, 32]];
      const result = ImageHelpers.medianCut(colors, 4);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(colors);
    });

    it('produces at most 2^depth clusters', () => {
      const colors: [number, number, number][] = Array.from(
        { length: 50 }, (_, i) => [i * 5, i * 3, i * 2]
      );
      for (const depth of [1, 2, 3, 4]) {
        const clusters = ImageHelpers.medianCut(colors, depth);
        expect(clusters.length).toBeLessThanOrEqual(2 ** depth);
      }
    });

    it('total pixel count is preserved across all clusters', () => {
      const colors: [number, number, number][] = Array.from(
        { length: 100 }, (_, i) => [i % 256, (i * 3) % 256, (i * 7) % 256]
      );
      const clusters = ImageHelpers.medianCut(colors, 4);
      const total = clusters.reduce((sum, c) => sum + c.length, 0);
      expect(total).toBe(100);
    });

    it('does NOT mutate the input array', () => {
      const colors: [number, number, number][] = [
        [255, 0, 0], [0, 0, 255], [128, 128, 0],
      ];
      const snapshot = colors.map(c => [...c]);
      ImageHelpers.medianCut(colors, 3);
      expect(colors).toEqual(snapshot);
    });

    it('splits on the channel with the widest range', () => {
      // B spans 0–255, R and G are constant → split must be on channel 2 (B)
      const reds:  [number, number, number][] = Array.from({ length: 10 }, () => [128, 64, 0]);
      const blues: [number, number, number][] = Array.from({ length: 10 }, () => [128, 64, 255]);
      const mixed = [...reds, ...blues];

      const clusters = ImageHelpers.medianCut(mixed, 1);
      expect(clusters).toHaveLength(2);

      // Each cluster must be internally uniform in the B channel
      for (const cluster of clusters) {
        const bValues = cluster.map(c => c[2]);
        expect(new Set(bValues).size).toBe(1);
      }
    });
  });

  // ── getClusterCenter ─────────────────────────────────────────────────────────

  describe('getClusterCenter()', () => {
    it('empty cluster returns #000000', () => {
      expect(ImageHelpers.getClusterCenter([])).toBe('#000000');
    });

    it('single pixel returns that pixel as hex', () => {
      expect(ImageHelpers.getClusterCenter([[255, 0,   0  ]])).toBe('#FF0000');
      expect(ImageHelpers.getClusterCenter([[0,   255, 0  ]])).toBe('#00FF00');
      expect(ImageHelpers.getClusterCenter([[0,   0,   255]])).toBe('#0000FF');
      expect(ImageHelpers.getClusterCenter([[255, 255, 255]])).toBe('#FFFFFF');
      expect(ImageHelpers.getClusterCenter([[0,   0,   0  ]])).toBe('#000000');
    });

    it('averages multiple pixel values', () => {
      // (0 + 254) / 2 = 127 exactly → 0x7F
      const result = ImageHelpers.getClusterCenter([[0, 0, 0], [254, 254, 254]]);
      expect(result).toBe('#7F7F7F');
    });

    it('rounds correctly: red + white = #FF8080', () => {
      // R: (255+255)/2=255, G: (0+255)/2=127.5→128=0x80, B: same → #FF8080
      const result = ImageHelpers.getClusterCenter([[255, 0, 0], [255, 255, 255]]);
      expect(result).toBe('#FF8080');
    });

    it('output is always uppercase hex with # prefix', () => {
      const result = ImageHelpers.getClusterCenter([[10, 20, 30]]);
      expect(result).toMatch(/^#[0-9A-F]{6}$/);
    });
  });

  // ── extractDominantColorMedianCut ────────────────────────────────────────────

  describe('extractDominantColorMedianCut()', () => {
    it('solid red image returns #FF0000', () => {
      expect(ImageHelpers.extractDominantColorMedianCut(solid(255, 0, 0, 25))).toBe('#FF0000');
    });

    it('solid blue image returns #0000FF', () => {
      expect(ImageHelpers.extractDominantColorMedianCut(solid(0, 0, 255, 25))).toBe('#0000FF');
    });

    it('solid white image returns #FFFFFF', () => {
      expect(ImageHelpers.extractDominantColorMedianCut(solid(255, 255, 255, 25))).toBe('#FFFFFF');
    });

    it('solid black image returns #000000', () => {
      expect(ImageHelpers.extractDominantColorMedianCut(solid(0, 0, 0, 25))).toBe('#000000');
    });

    it('all fully-transparent pixels fall back to #000000', () => {
      expect(ImageHelpers.extractDominantColorMedianCut(solid(255, 0, 0, 25, 0))).toBe('#000000');
    });

    it('pixels with alpha < 128 are ignored (semi-transparent = transparent)', () => {
      // 24 red transparent + 1 blue opaque → only the 1 blue pixel counts
      const data = makePixelData([
        ...Array.from({ length: 24 }, () => ({ r: 255, g: 0, b: 0, a: 127 })),
        { r: 0, g: 0, b: 255, a: 255 },
      ]);
      expect(ImageHelpers.extractDominantColorMedianCut(data)).toBe('#0000FF');
    });

    it('80 blue + 20 red pixels → blue dominates by frequency', () => {
      const data = makePixelData([
        ...Array.from({ length: 80 }, () => ({ r: 0, g: 0, b: 255 })),
        ...Array.from({ length: 20 }, () => ({ r: 255, g: 0, b: 0 })),
      ]);
      // Blue should win because it has more pixels (frequency, not uniqueness)
      expect(ImageHelpers.extractDominantColorMedianCut(data)).toBe('#0000FF');
    });

    /**
     * This test validates the critical bug fix: before the fix, a Set was used to
     * deduplicate colors *before* running median cut. That made 3 slightly-different
     * blue shades beat 100 identical red pixels (3 unique blues > 1 unique red).
     * The fix keeps all pixels so cluster.length == pixel frequency.
     */
    it('pixel frequency beats unique-color count (regression for Set-dedup bug)', () => {
      const data = makePixelData([
        // 100 identical red pixels (1 unique color)
        ...Array.from({ length: 100 }, () => ({ r: 255, g: 0, b: 0 })),
        // 3 slightly-different blue shades (3 unique colors)
        { r: 0, g: 0, b: 250 },
        { r: 0, g: 0, b: 253 },
        { r: 0, g: 0, b: 255 },
      ]);
      // With frequency-correct code: red wins (100px >> 3px).
      // With old Set-dedup code: blue would win (3 unique > 1 unique). Bug!
      const result = ImageHelpers.extractDominantColorMedianCut(data);
      expect(result).toBe('#FF0000');
    });

    it('throws when input exceeds 100×100 pixels', () => {
      const oversize = new Uint8ClampedArray((100 * 100 + 1) * 4);
      expect(() => ImageHelpers.extractDominantColorMedianCut(oversize))
        .toThrow('maximum is 10000');
    });
  });

  // ── calculateImageEntropy ─────────────────────────────────────────────────────

  describe('calculateImageEntropy()', () => {
    it('uniform image (all same luminance) has entropy = 0', () => {
      // Rec.601: luminance(128,128,128) = round(0.299·128 + 0.587·128 + 0.114·128) = 128
      // P(128) = 1 → entropy = -1·log2(1) = 0
      const data = solid(128, 128, 128, 100);
      expect(ImageHelpers.calculateImageEntropy(data)).toBe(0);
    });

    it('two equal groups of maximally-different luminance → entropy = 1.0', () => {
      // 50 black (lum=0) + 50 white (lum=255) → P(0)=0.5, P(255)=0.5
      // H = -(0.5·log2(0.5) + 0.5·log2(0.5)) = 1.0
      const data = makePixelData([
        ...Array.from({ length: 50 }, () => ({ r: 0, g: 0, b: 0 })),
        ...Array.from({ length: 50 }, () => ({ r: 255, g: 255, b: 255 })),
      ]);
      expect(ImageHelpers.calculateImageEntropy(data)).toBeCloseTo(1.0, 10);
    });

    it('result is always in [0, 8] (theoretical maximum for 8-bit channel)', () => {
      // Random-ish data with many distinct luminance values → high entropy
      const noise = new Uint8ClampedArray(256 * 4);
      for (let i = 0; i < 256; i++) {
        noise[i * 4 + 0] = i;       // R
        noise[i * 4 + 1] = i;       // G (same → lum ≈ i)
        noise[i * 4 + 2] = i;       // B
        noise[i * 4 + 3] = 255;
      }
      const entropy = ImageHelpers.calculateImageEntropy(noise);
      expect(entropy).toBeGreaterThanOrEqual(0);
      expect(entropy).toBeLessThanOrEqual(8);
    });

    it('high-entropy data scores higher than low-entropy data', () => {
      const uniform = solid(128, 128, 128, 256);
      const varied  = new Uint8ClampedArray(256 * 4);
      for (let i = 0; i < 256; i++) {
        varied[i * 4 + 0] = i; varied[i * 4 + 1] = i;
        varied[i * 4 + 2] = i; varied[i * 4 + 3] = 255;
      }
      expect(ImageHelpers.calculateImageEntropy(varied))
        .toBeGreaterThan(ImageHelpers.calculateImageEntropy(uniform));
    });
  });

  // ── extractDimensionsFromMetadata ────────────────────────────────────────────

  describe('extractDimensionsFromMetadata()', () => {
    /**
     * Regression test for JPEG multi-0xFF padding (JPEG spec §B.1.1.3).
     * A parser that reads offset+1 as the marker byte without skipping 0xFF
     * fill bytes would see 0xFF instead of 0xE0/0xC0 and misdecode dimensions.
     */
    it('reads JPEG dimensions when markers are preceded by 0xFF padding bytes', async () => {
      const result = await ImageHelpers.extractDimensionsFromMetadata(
        makeJpegFileWithPadding(1920, 1080)
      );
      expect(result).toEqual({ width: 1920, height: 1080 });
    });

    it('reads PNG dimensions from real binary header', async () => {
      const result = await ImageHelpers.extractDimensionsFromMetadata(
        makePngFile(1920, 1080)
      );
      expect(result).toEqual({ width: 1920, height: 1080 });
    });

    it('reads GIF89a dimensions from real binary header', async () => {
      const result = await ImageHelpers.extractDimensionsFromMetadata(
        makeGifFile(320, 240)
      );
      expect(result).toEqual({ width: 320, height: 240 });
    });

    it('reads JPEG (SOF0) dimensions from real binary header', async () => {
      const result = await ImageHelpers.extractDimensionsFromMetadata(
        makeJpegFile(1920, 1080)
      );
      expect(result).toEqual({ width: 1920, height: 1080 });
    });

    it('reads WebP VP8 dimensions from real binary header', async () => {
      const result = await ImageHelpers.extractDimensionsFromMetadata(
        makeWebpFile(800, 600)
      );
      expect(result).toEqual({ width: 800, height: 600 });
    });

    it('returns null for a random unsupported file type', async () => {
      const file = new File([new Uint8Array(32)], 'test.bmp', { type: 'image/bmp' });
      expect(await ImageHelpers.extractDimensionsFromMetadata(file)).toBeNull();
    });

    it('returns null for a PNG file with a wrong signature', async () => {
      const buf = new Uint8Array(25); // all zeros → wrong signature
      const file = new File([buf.buffer], 'bad.png', { type: 'image/png' });
      expect(await ImageHelpers.extractDimensionsFromMetadata(file)).toBeNull();
    });

    it('returns null for a JPEG file that does not start with FF D8', async () => {
      const buf = new Uint8Array(38); // zeros → getUint16(0) ≠ 0xFFD8
      const file = new File([buf.buffer], 'bad.jpg', { type: 'image/jpeg' });
      expect(await ImageHelpers.extractDimensionsFromMetadata(file)).toBeNull();
    });

    it('returns null for a PNG with zero-value dimensions', async () => {
      // Correct signature but width/height = 0
      const buf = new Uint8Array(25);
      const v = new DataView(buf.buffer);
      v.setUint32(0, 0x89504e47, false);
      v.setUint32(4, 0x0d0a1a0a, false);
      v.setUint32(16, 0, false); // width = 0
      v.setUint32(20, 0, false); // height = 0
      const file = new File([buf], 'zero.png', { type: 'image/png' });
      expect(await ImageHelpers.extractDimensionsFromMetadata(file)).toBeNull();
    });

    it('reads WebP VP8X (extended/animated) canvas dimensions from header', async () => {
      // VP8X WebP layout (30 bytes minimum):
      //   RIFF(4) + size(4) + WEBP(4) + VP8X(4) + chunk-size(4) + flags(4)
      //   + canvas-width-minus-1 (3-byte 24-bit LE) + canvas-height-minus-1 (3-byte 24-bit LE)
      const buf = new Uint8Array(30);
      const v = new DataView(buf.buffer);
      v.setUint32(0, 0x52494646, false);  // 'RIFF'
      v.setUint32(4, 22, true);           // file size (LE)
      v.setUint32(8, 0x57454250, false);  // 'WEBP'
      v.setUint32(12, 0x56503858, false); // 'VP8X' chunk FourCC
      v.setUint32(16, 10, true);          // VP8X payload size (LE)
      buf[20] = 0x02;                     // flags: animation bit set
      // canvas width  − 1 = 1279 → stored as 24-bit LE: 0x4FF
      buf[24] = 0xFF; buf[25] = 0x04; buf[26] = 0x00;
      // canvas height − 1 = 719 → stored as 24-bit LE: 0x2CF
      buf[27] = 0xCF; buf[28] = 0x02; buf[29] = 0x00;
      const file = new File([buf], 'animated.webp', { type: 'image/webp' });
      const result = await ImageHelpers.extractDimensionsFromMetadata(file);
      expect(result).toEqual({ width: 1280, height: 720 });
    });

    it('detectImageFormat returns webp for image/gif (not jpeg)', () => {
      // GIF is not a valid output ImageFormat. The correct mapping is WebP
      // because WebP preserves both animation and transparency.
      // If this returns 'jpeg', compressImages() on a GIF would silently
      // destroy animation and transparency.
      expect(ImageHelpers.detectImageFormat('image/gif')).toBe('webp');
    });
  });

  // ── optimizeBatchOrder ────────────────────────────────────────────────────────

  describe('optimizeBatchOrder()', () => {
    const small  = new File([new Uint8Array(100)],  'small.jpg');
    const medium = new File([new Uint8Array(500)],  'medium.jpg');
    const large  = new File([new Uint8Array(1000)], 'large.jpg');
    const files  = [large, small, medium]; // intentionally scrambled

    it('asc: smallest file first', () => {
      const result = ImageHelpers.optimizeBatchOrder(files, 'asc');
      expect(result.map(f => f.name)).toEqual(['small.jpg', 'medium.jpg', 'large.jpg']);
    });

    it('desc: largest file first', () => {
      const result = ImageHelpers.optimizeBatchOrder(files, 'desc');
      expect(result.map(f => f.name)).toEqual(['large.jpg', 'medium.jpg', 'small.jpg']);
    });

    it('none: preserves original order', () => {
      const result = ImageHelpers.optimizeBatchOrder(files, 'none');
      expect(result.map(f => f.name)).toEqual(['large.jpg', 'small.jpg', 'medium.jpg']);
    });

    it('default sort order is asc', () => {
      const result = ImageHelpers.optimizeBatchOrder(files);
      expect(result.map(f => f.name)).toEqual(['small.jpg', 'medium.jpg', 'large.jpg']);
    });

    it('does NOT mutate the input array', () => {
      const input  = [large, small, medium];
      const before = input.map(f => f.name);
      ImageHelpers.optimizeBatchOrder(input, 'asc');
      expect(input.map(f => f.name)).toEqual(before);
    });
  });
});
