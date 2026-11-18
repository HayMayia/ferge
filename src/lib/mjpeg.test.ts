import { describe, expect, it } from 'vitest';
import { MjpegDecoder } from './mjpeg';
const jpeg = new Uint8Array([255, 216, 1, 2, 3, 4, 255, 217]);
function part(frame = jpeg, lowercase = false) {
  const header = new TextEncoder().encode(
    `\r\n--farm\r\n${lowercase ? 'content-type' : 'Content-Type'}: image/jpeg\r\nContent-Length: ${frame.length}\r\n\r\n`,
  );
  const body = new Uint8Array(header.length + frame.length);
  body.set(header);
  body.set(frame, header.length);
  return body;
}

describe('firmware MJPEG decoding', () => {
  it('extracts a real multipart JPEG part', () =>
    expect(new MjpegDecoder().push(part())).toEqual([jpeg]));
  it('handles every possible split of a header and JPEG', () => {
    const body = part();
    for (let split = 0; split <= body.length; split++) {
      const decoder = new MjpegDecoder();
      expect([...decoder.push(body.slice(0, split)), ...decoder.push(body.slice(split))]).toEqual([
        jpeg,
      ]);
    }
  });
  it('handles one-byte network chunks', () => {
    const decoder = new MjpegDecoder(),
      frames: Uint8Array[] = [];
    for (const byte of part()) frames.push(...decoder.push(new Uint8Array([byte])));
    expect(frames).toEqual([jpeg]);
  });
  it('extracts multiple frames in one chunk', () => {
    const first = part(),
      second = part();
    const chunk = new Uint8Array(first.length + second.length);
    chunk.set(first);
    chunk.set(second, first.length);
    expect(new MjpegDecoder().push(chunk)).toEqual([jpeg, jpeg]);
  });
  it('uses Content-Length, not false end markers inside an EXIF thumbnail', () => {
    const withThumbnail = new Uint8Array([255, 216, 255, 216, 1, 255, 217, 4, 5, 255, 217]);
    expect(new MjpegDecoder().push(part(withThumbnail))).toEqual([withThumbnail]);
  });
  it('accepts case-insensitive headers', () =>
    expect(new MjpegDecoder().push(part(jpeg, true))).toEqual([jpeg]));
  it('does not emit partial frames', () =>
    expect(new MjpegDecoder().push(part().slice(0, -1))).toEqual([]));
  it('rejects missing lengths', () => {
    expect(() =>
      new MjpegDecoder().push(
        new TextEncoder().encode('--farm\r\nContent-Type: image/jpeg\r\n\r\n'),
      ),
    ).toThrow('Content-Length');
  });
  it('rejects corrupt JPEG data', () =>
    expect(() => new MjpegDecoder().push(part(new Uint8Array([1, 2, 3, 4])))).toThrow(
      'invalid JPEG',
    ));
  it('bounds frame lengths and stream headers', () => {
    expect(() =>
      new MjpegDecoder().push(
        new TextEncoder().encode(
          '--farm\r\nContent-Type: image/jpeg\r\nContent-Length: 9999999\r\n\r\n',
        ),
      ),
    ).toThrow('length');
    expect(() => new MjpegDecoder().push(new Uint8Array(8193))).toThrow('headers');
  });
});
