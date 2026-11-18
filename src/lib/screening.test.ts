import { describe, expect, it } from 'vitest';
import {
  analyzePixels,
  CONDITIONS,
  DEMO_SCREENING,
  makeDemoScans,
  parseStatus,
  toCsv,
} from './screening';

const GREEN = [40, 170, 50];
const YELLOW = [220, 200, 40];
const BROWN = [120, 75, 30];
const DARK = [10, 10, 10];
const BACKGROUND = [220, 220, 220];

function frame(...groups: [number[], number][]) {
  const pixels: number[] = [];
  // Each sample appears twice because the firmware samples every second pixel.
  for (const [rgb, count] of groups)
    for (let i = 0; i < count; i++) pixels.push(...rgb, 255, ...rgb, 255);
  return new Uint8ClampedArray(pixels);
}

describe('ESP32-compatible colour screening', () => {
  it('recognises a healthy green leaf', () => {
    expect(analyzePixels(frame([GREEN, 100]))).toEqual({
      cls: 1,
      label: 'Healthy',
      solution: CONDITIONS[1].solution,
      green: 100,
      yellow: 0,
      brown: 0,
    });
  });
  it('flags yellowing above 25% of leaf pixels', () => {
    const result = analyzePixels(frame([GREEN, 70], [YELLOW, 30]));
    expect(result.cls).toBe(2);
    expect(result.yellow).toBe(30);
  });
  it('does not flag yellow at exactly 25%', () =>
    expect(analyzePixels(frame([GREEN, 75], [YELLOW, 25])).cls).toBe(1));
  it('flags brown above 12% before considering yellowing', () => {
    expect(analyzePixels(frame([GREEN, 45], [YELLOW, 40], [BROWN, 15])).cls).toBe(3);
  });
  it('does not flag brown at exactly 12%', () =>
    expect(analyzePixels(frame([GREEN, 88], [BROWN, 12])).cls).toBe(1));
  it('prioritises small dark specks on leafy frames', () => {
    expect(analyzePixels(frame([GREEN, 79], [BROWN, 20], [DARK, 1])).cls).toBe(4);
  });
  it('rejects a frame dominated by dark background as a pest signal', () => {
    expect(analyzePixels(frame([GREEN, 90], [DARK, 10])).cls).toBe(1);
  });
  it('does not classify darkness alone as a leaf', () =>
    expect(analyzePixels(frame([DARK, 100])).cls).toBe(0));
  it('requires at least 5% leaf-coloured pixels', () => {
    const result = analyzePixels(frame([GREEN, 4], [BACKGROUND, 96]));
    expect(result.cls).toBe(0);
    expect(result.green).toBe(0);
    expect(analyzePixels(frame([GREEN, 5], [BACKGROUND, 95])).cls).toBe(1);
  });
  it('uses leaf pixels, not the whole image, for percentages', () => {
    const result = analyzePixels(frame([GREEN, 20], [YELLOW, 5], [BACKGROUND, 75]));
    expect(result.green).toBe(80);
    expect(result.yellow).toBe(20);
    expect(result.cls).toBe(1);
  });
  it('handles empty input safely', () => expect(analyzePixels([]).cls).toBe(0));
});

describe('camera status validation', () => {
  it('accepts the supplied firmware JSON schema', () =>
    expect(parseStatus(DEMO_SCREENING)).toEqual(DEMO_SCREENING));
  it('supplies safe labels when optional text is missing', () => {
    expect(parseStatus({ cls: 1, green: 95, yellow: 3, brown: 2 }).label).toBe('Healthy');
  });
  it.each([
    null,
    [],
    {},
    { ...DEMO_SCREENING, cls: 5 },
    { ...DEMO_SCREENING, cls: 1.5 },
    { ...DEMO_SCREENING, green: -1 },
    { ...DEMO_SCREENING, green: 101 },
    { ...DEMO_SCREENING, green: NaN },
    { ...DEMO_SCREENING, yellow: '5' },
  ])('rejects malformed telemetry: %j', (value) => expect(() => parseStatus(value)).toThrow());
});

describe('clearly separated sample history', () => {
  const now = new Date('2026-11-18T12:00:00Z');
  const scans = makeDemoScans(now);
  it('creates 24 explicitly marked sample scans', () => {
    expect(scans).toHaveLength(24);
    expect(scans.every((s) => s.source === 'demo')).toBe(true);
  });
  it('creates normalised colours, stable IDs, and descending timestamps', () => {
    expect(new Set(scans.map((s) => s.id)).size).toBe(24);
    for (let i = 0; i < scans.length; i++) {
      const scan = scans[i];
      expect(scan.green + scan.yellow + scan.brown).toBeCloseTo(100, 5);
      expect(Date.parse(scan.timestamp)).toBeLessThan(now.getTime());
      if (i) expect(Date.parse(scan.timestamp)).toBeLessThan(Date.parse(scans[i - 1].timestamp));
    }
  });
});

describe('CSV exports', () => {
  it('includes all the firmware fields and UTC timestamps', () => {
    const csv = toCsv(makeDemoScans(new Date('2026-11-18T12:00:00Z')).slice(0, 1));
    expect(csv.split('\r\n')).toHaveLength(2);
    expect(csv).toContain('"Date (UTC)"');
    expect(csv).toContain('2026-11-18T11:58:00.000Z');
    expect(csv).toContain('"92.4","5.2","2.4","demo"');
  });
  it('escapes quotes and neutralises spreadsheet formulas', () => {
    const scan = {
      ...makeDemoScans()[0],
      label: '=HYPERLINK("malicious")',
      solution: 'Inspect "both" sides, gently.',
    };
    const csv = toCsv([scan]);
    expect(csv).toContain('"\'=HYPERLINK(""malicious"")"');
    expect(csv).toContain('"Inspect ""both"" sides, gently."');
  });
});
