import { useEffect, useState } from 'react';
import { Camera, LoaderCircle } from 'lucide-react';
import { cameraResponse, fetchJpeg } from '../lib/transport';
import type { CameraTarget } from '../lib/transport';
import { MjpegDecoder } from '../lib/mjpeg';

export function useCameraStream(
  target: CameraTarget,
  token: string,
  enabled: boolean,
  revision: number,
) {
  // Retain a Blob, not a new object URL for every incoming chunk. React can batch
  // frames; skipped state updates must not leak URLs during a long camera session.
  const [jpeg, setJpeg] = useState<Blob | null>(null);
  const [frame, setFrame] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (!jpeg) {
      setFrame('');
      return;
    }
    const url = URL.createObjectURL(jpeg);
    setFrame(url);
    return () => URL.revokeObjectURL(url);
  }, [jpeg]);
  useEffect(() => {
    setJpeg(null);
    setError('');
    if (!enabled) return;
    const controller = new AbortController();
    let active = true;
    let timeout: ReturnType<typeof setTimeout>;
    const resetTimeout = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        if (active) {
          setError('No new video frames arrived. Check the camera and retry the stream.');
          controller.abort();
        }
      }, 10000);
    };
    const read = async () => {
      resetTimeout();
      try {
        const response = await cameraResponse('stream', target, token, controller.signal);
        if (!response.body) throw new Error('Video streaming is not supported by this browser.');
        const reader = response.body.getReader();
        const decoder = new MjpegDecoder();
        try {
          while (active) {
            const { value, done } = await reader.read();
            if (done) throw new Error('The camera stream ended. Retry to reconnect.');
            const frames = decoder.push(value);
            const next = frames[frames.length - 1];
            if (next && active) {
              resetTimeout();
              setJpeg(new Blob([next], { type: 'image/jpeg' }));
            }
          }
        } finally {
          await reader.cancel().catch(() => {});
        }
      } catch (e) {
        if (active && !controller.signal.aborted)
          setError(e instanceof Error ? e.message : 'The camera stream is unavailable.');
      } finally {
        clearTimeout(timeout);
      }
    };
    void read();
    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
    };
    // Target values, not object identity, define a camera connection.
  }, [target.host, target.gatewayUrl, token, enabled, revision]);
  return { frame: enabled ? frame : '', error: enabled ? error : '' };
}

export function CameraSnapshot({
  target,
  token,
  alt,
}: {
  target: CameraTarget;
  token: string;
  alt: string;
}) {
  const [image, setImage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    let url = '';
    let active = true;
    setImage('');
    setError('');
    void fetchJpeg(target, token, controller.signal)
      .then((blob) => {
        if (active) {
          url = URL.createObjectURL(blob);
          setImage(url);
        }
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : 'Preview unavailable.');
      });
    return () => {
      active = false;
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [target.host, target.gatewayUrl, token]);
  return image ? (
    <img
      src={image}
      alt={alt}
      onError={() => {
        setImage('');
        setError('The camera returned an unreadable image.');
      }}
    />
  ) : (
    <div className="preview-error">
      {error ? <Camera size={28} /> : <LoaderCircle className="spin" size={28} />}
      <p>{error || 'Loading a real camera frame…'}</p>
    </div>
  );
}
