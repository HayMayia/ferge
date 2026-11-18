import { afterEach, describe, expect, it, vi } from 'vitest';
import { CONDITIONS, DEMO_SCREENING, loadScans, toCsv } from './screening';

function saved(value: unknown) {
  vi.stubGlobal('localStorage', { getItem: () => JSON.stringify(value) });
}
const scan = {
  ...DEMO_SCREENING,
  id: 'actual-upload',
  source: 'upload',
  timestamp: '2026-11-18T12:00:00.000Z',
};
afterEach(() => vi.unstubAllGlobals());

describe('recoverable browser scan history', () => {
  it('normalises optional labels instead of letting missing strings crash search', () => {
    saved([{ ...scan, label: undefined, solution: undefined }]);
    expect(loadScans()[0]).toMatchObject({
      label: CONDITIONS[1].label,
      solution: CONDITIONS[1].solution,
    });
  });
  it('drops corrupt entries but keeps valid history', () => {
    saved([
      null,
      {},
      { ...scan, cls: 99 },
      { ...scan, timestamp: 'invalid' },
      { ...scan, source: 'random' },
      scan,
    ]);
    expect(loadScans()).toHaveLength(1);
  });
  it('deduplicates IDs and orders newest scans first', () => {
    saved([scan, scan, { ...scan, id: 'newer', timestamp: '2026-11-18T13:00:00.000Z' }]);
    expect(loadScans().map((item) => item.id)).toEqual(['newer', scan.id]);
  });
  it('retains at most the latest 60 scans', () => {
    saved(
      Array.from({ length: 80 }, (_, i) => ({
        ...scan,
        id: `scan-${i}`,
        timestamp: new Date(Date.parse(scan.timestamp) + i * 60000).toISOString(),
      })),
    );
    expect(loadScans()).toHaveLength(60);
    expect(loadScans()[0].id).toBe('scan-79');
  });
  it('discards external image URLs but keeps the result', () => {
    saved([{ ...scan, image: 'https://unrelated.example.com/tracker.jpg' }]);
    expect(loadScans()[0].image).toBeUndefined();
  });
  it('retains valid local thumbnails', () => {
    saved([{ ...scan, image: 'data:image/jpeg;base64,/9j/2Q==' }]);
    expect(loadScans()[0].image).toBe('data:image/jpeg;base64,/9j/2Q==');
  });
  it('marks legacy camera captures as unsynchronised firmware readings', () => {
    saved([{ ...scan, source: 'camera' }]);
    expect(loadScans()[0].method).toBe('firmware');
    expect(toCsv(loadScans())).toContain('not frame-synchronised');
  });
  it('preserves the exact-frame analysis method on new captures', () => {
    saved([{ ...scan, source: 'camera', method: 'single-frame' }]);
    expect(loadScans()[0].method).toBe('single-frame');
    expect(toCsv(loadScans())).toContain('single-frame HSV');
  });
  it('rejects impossible colour totals without rejecting normal rounding', () => {
    saved([
      { ...scan, green: 100, yellow: 100, brown: 100 },
      { ...scan, green: 33.4, yellow: 33.3, brown: 33.4, id: 'rounded' },
    ]);
    expect(loadScans()).toHaveLength(1);
    expect(loadScans()[0].id).toBe('rounded');
  });
  it('recovers from invalid JSON and a non-array storage value', () => {
    vi.stubGlobal('localStorage', { getItem: () => '{not JSON' });
    expect(loadScans()).toEqual([]);
    saved({ not: 'a scan list' });
    expect(loadScans()).toEqual([]);
  });
});
