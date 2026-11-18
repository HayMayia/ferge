const HEADER_END = [13, 10, 13, 10];
const MAX_FRAME = 2 * 1024 * 1024;

/** Parses the firmware's Content-Length-delimited MJPEG parts across arbitrary
 * network chunk boundaries. Never searches for EOI inside JPEG/EXIF data. */
export class MjpegDecoder {
  private pending = new Uint8Array(0);
  private expected = 0;

  push(chunk: Uint8Array): Uint8Array[] {
    if (this.pending.length + chunk.length > MAX_FRAME * 2)
      throw new Error('Camera stream buffer exceeded its safety limit.');
    const combined = new Uint8Array(this.pending.length + chunk.length);
    combined.set(this.pending);
    combined.set(chunk, this.pending.length);
    this.pending = combined;
    const frames: Uint8Array[] = [];
    while (true) {
      if (!this.expected) {
        let end = -1;
        for (let i = 0; i + 3 < this.pending.length; i++) {
          if (HEADER_END.every((byte, n) => this.pending[i + n] === byte)) {
            end = i;
            break;
          }
        }
        if (end < 0) {
          if (this.pending.length > 8192) throw new Error('Invalid camera stream headers.');
          break;
        }
        const headers = new TextDecoder().decode(this.pending.subarray(0, end));
        const length = headers.match(/(?:^|\r\n)content-length:\s*(\d+)\s*(?:\r\n|$)/i);
        if (!/content-type:\s*image\/jpeg/i.test(headers) || !length)
          throw new Error('The camera stream must contain JPEG parts with Content-Length.');
        this.expected = Number(length[1]);
        if (this.expected < 4 || this.expected > MAX_FRAME)
          throw new Error('Camera frame length is invalid.');
        this.pending = this.pending.slice(end + 4);
      }
      if (this.pending.length < this.expected) break;
      const jpeg = this.pending.slice(0, this.expected);
      if (
        jpeg[0] !== 255 ||
        jpeg[1] !== 216 ||
        jpeg[jpeg.length - 2] !== 255 ||
        jpeg[jpeg.length - 1] !== 217
      ) {
        throw new Error('The camera sent an invalid JPEG frame.');
      }
      frames.push(jpeg);
      this.pending = this.pending.slice(this.expected);
      this.expected = 0;
    }
    return frames;
  }
}
