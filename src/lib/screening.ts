export type Condition = 0 | 1 | 2 | 3 | 4;
export type CameraMode = 'demo' | 'device';
export type Page = 'overview' | 'camera' | 'history' | 'devices' | 'guide';
export interface Screening {
  cls: Condition;
  label: string;
  solution: string;
  green: number;
  yellow: number;
  brown: number;
}
export interface Scan extends Screening {
  id: string;
  timestamp: string;
  source: 'demo' | 'camera' | 'upload';
  image?: string;
}
export interface Preferences {
  mode: CameraMode;
  host: string;
  name: string;
  location: string;
}

export const CONDITIONS: Record<
  Condition,
  { label: string; title: string; short: string; solution: string; detail: string; tone: string }
> = {
  0: {
    label: 'No leaf in view',
    title: 'Let’s find a leaf',
    short: 'No leaf',
    tone: 'neutral',
    solution: 'Bring a leaf closer to the camera, in good light.',
    detail:
      'The camera needs a clear view of a leaf. Fill the centre of the frame with foliage and avoid strong shadows.',
  },
  1: {
    label: 'Healthy',
    title: 'Looking good, growing strong.',
    short: 'Healthy',
    tone: 'green',
    solution: 'Plant looks healthy. No action needed.',
    detail:
      'No significant yellowing or brown areas detected. Keep giving your plants the care they love.',
  },
  2: {
    label: 'Yellowing',
    title: 'A little extra care is needed.',
    short: 'Yellowing',
    tone: 'yellow',
    solution: 'Check nitrogen, watering and soil pH. Fertilise lightly and avoid over-watering.',
    detail:
      'Yellow makes up more than 25% of the detected leaf pixels. Nutrient imbalance or watering stress may be involved.',
  },
  3: {
    label: 'Possible leaf spot',
    title: 'Some spots need a closer look.',
    short: 'Leaf spot',
    tone: 'brown',
    solution:
      'Remove affected leaves, avoid overhead watering and improve airflow. Use a suitable fungicide if it spreads.',
    detail:
      'Brown makes up more than 12% of the detected leaf pixels. Inspect the leaf in person to confirm any spots.',
  },
  4: {
    label: 'Possible pest / leaf damage',
    title: 'Time for a closer inspection.',
    short: 'Possible damage',
    tone: 'purple',
    solution:
      'Colour screening suggests dark specks on the leaf. Inspect both leaf sides for insects; this is not a trained pest detector.',
    detail:
      'Dark pixels on a leafy frame can indicate damage, but shadows and soil can look similar. This is not pest identification.',
  },
};

export const DEFAULT_PREFERENCES: Preferences = {
  mode: 'demo',
  host: '192.168.4.3',
  name: 'ESP32-CAM',
  location: 'North greenhouse',
};

export const DEMO_SCREENING: Screening = {
  cls: 1,
  label: CONDITIONS[1].label,
  solution: CONDITIONS[1].solution,
  green: 92.4,
  yellow: 5.2,
  brown: 2.4,
};

/** Same HSV thresholds and decision order as the supplied ESP32 firmware.
 * Canvas provides RGB, so no ESP32-specific BGR channel swap is needed here.
 * A single uploaded image does not use the firmware's five-frame majority vote.
 */
export function analyzePixels(pixels: ArrayLike<number>): Screening {
  let green = 0,
    yellow = 0,
    brown = 0,
    dark = 0,
    sampled = 0;
  for (let i = 0; i + 3 < pixels.length; i += 8) {
    const r = pixels[i] / 255,
      g = pixels[i + 1] / 255,
      b = pixels[i + 2] / 255;
    const mx = Math.max(r, g, b),
      mn = Math.min(r, g, b),
      d = mx - mn;
    const s = mx <= 0 ? 0 : d / mx;
    let h = 0;
    if (d > 0) {
      if (mx === r) h = 60 * (((g - b) / d) % 6);
      else if (mx === g) h = 60 * ((b - r) / d + 2);
      else h = 60 * ((r - g) / d + 4);
      if (h < 0) h += 360;
    }
    sampled++;
    if (mx < 0.15) {
      dark++;
      continue;
    }
    if (h >= 70 && h < 170 && s > 0.25) green++;
    else if (h >= 40 && h < 70 && s > 0.35 && mx > 0.35) yellow++;
    else if (h >= 10 && h < 40 && s > 0.3 && mx < 0.65) brown++;
  }
  const leaf = green + yellow + brown;
  let cls: Condition = 0;
  let fg = 0,
    fy = 0,
    fb = 0;
  if (sampled > 0 && leaf / sampled >= 0.05) {
    fg = green / leaf;
    fy = yellow / leaf;
    fb = brown / leaf;
    const darkShare = dark / sampled;
    if (darkShare > 0.005 && darkShare < 0.08 && fg > 0.25) cls = 4;
    else if (fb > 0.12) cls = 3;
    else if (fy > 0.25) cls = 2;
    else cls = 1;
  }
  return {
    cls,
    label: CONDITIONS[cls].label,
    solution: CONDITIONS[cls].solution,
    green: round(fg * 100),
    yellow: round(fy * 100),
    brown: round(fb * 100),
  };
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}

export function parseStatus(value: unknown): Screening {
  if (!value || typeof value !== 'object')
    throw new Error('The camera returned an invalid status.');
  const data = value as Record<string, unknown>;
  if (typeof data.cls !== 'number' || !Number.isInteger(data.cls) || data.cls < 0 || data.cls > 4) {
    throw new Error('The camera returned an unknown condition.');
  }
  for (const key of ['green', 'yellow', 'brown']) {
    if (
      typeof data[key] !== 'number' ||
      !Number.isFinite(data[key]) ||
      (data[key] as number) < 0 ||
      (data[key] as number) > 100
    ) {
      throw new Error('The camera returned invalid colour percentages.');
    }
  }
  const cls = data.cls as Condition;
  return {
    cls,
    label: typeof data.label === 'string' ? data.label : CONDITIONS[cls].label,
    solution: typeof data.solution === 'string' ? data.solution : CONDITIONS[cls].solution,
    green: data.green as number,
    yellow: data.yellow as number,
    brown: data.brown as number,
  };
}

export function makeDemoScans(now = new Date()): Scan[] {
  return Array.from({ length: 24 }, (_, i) => {
    const cls: Condition = [2, 12, 20].includes(i) ? 2 : i === 17 ? 3 : 1;
    const colours =
      cls === 1
        ? {
            green: round(92.4 - (i % 5) * 1.3),
            yellow: round(5.2 + (i % 5) * 0.8),
            brown: round(2.4 + (i % 5) * 0.5),
          }
        : cls === 2
          ? { green: 64.2, yellow: 31.6, brown: 4.2 }
          : { green: 74.6, yellow: 8.2, brown: 17.2 };
    return {
      ...colours,
      id: `demo-${i}`,
      cls,
      label: CONDITIONS[cls].label,
      solution: CONDITIONS[cls].solution,
      timestamp: new Date(now.getTime() - i * 7 * 60_000 - 2 * 60_000).toISOString(),
      source: 'demo',
    };
  });
}

export function readStored<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function loadPreferences(): Preferences {
  const stored = readStored<Partial<Preferences> | null>('smartfarm-preferences', null);
  if (!stored || typeof stored !== 'object') return DEFAULT_PREFERENCES;
  return {
    mode: stored.mode === 'device' ? 'device' : 'demo',
    host: typeof stored.host === 'string' ? stored.host : DEFAULT_PREFERENCES.host,
    name:
      typeof stored.name === 'string' && stored.name.trim()
        ? stored.name.slice(0, 40)
        : DEFAULT_PREFERENCES.name,
    location:
      typeof stored.location === 'string' && stored.location.trim()
        ? stored.location.slice(0, 60)
        : DEFAULT_PREFERENCES.location,
  };
}

export function loadScans(): Scan[] {
  const stored = readStored<unknown>('smartfarm-scans', []);
  if (!Array.isArray(stored)) return [];
  return stored
    .filter((scan): scan is Scan => {
      try {
        parseStatus(scan);
        return (
          typeof scan.id === 'string' &&
          typeof scan.timestamp === 'string' &&
          !Number.isNaN(Date.parse(scan.timestamp)) &&
          ['demo', 'camera', 'upload'].includes(scan.source) &&
          (scan.image === undefined || typeof scan.image === 'string')
        );
      } catch {
        return false;
      }
    })
    .slice(0, 60);
}

export async function fetchStatus(host: string, signal?: AbortSignal): Promise<Screening> {
  const response = await fetch(
    `${import.meta.env.BASE_URL}api/camera/status?host=${encodeURIComponent(host)}`,
    {
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(6500)])
        : AbortSignal.timeout(6500),
      cache: 'no-store',
    },
  );
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(
      body?.error ||
        'The local camera gateway is unavailable. Run the dashboard on the same network as your camera.',
    );
  }
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new Error(
      'The local gateway is unavailable. Start the dashboard on a computer connected to your camera’s Wi-Fi.',
    );
  }
  return parseStatus(data);
}

export function apiUrl(kind: 'status' | 'jpg' | 'stream', host: string) {
  return `${import.meta.env.BASE_URL}api/camera/${kind}?host=${encodeURIComponent(host)}`;
}

export async function analyzeImage(url: string): Promise<{ result: Screening; thumbnail: string }> {
  const image = new Image();
  image.src = url;
  await image.decode();
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, 640 / Math.max(image.naturalWidth, image.naturalHeight));
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Image analysis is not supported in this browser.');
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const result = analyzePixels(ctx.getImageData(0, 0, canvas.width, canvas.height).data);
  const thumb = document.createElement('canvas');
  const thumbScale = Math.min(1, 320 / Math.max(canvas.width, canvas.height));
  thumb.width = Math.max(1, Math.round(canvas.width * thumbScale));
  thumb.height = Math.max(1, Math.round(canvas.height * thumbScale));
  thumb.getContext('2d')!.drawImage(canvas, 0, 0, thumb.width, thumb.height);
  return { result, thumbnail: thumb.toDataURL('image/jpeg', 0.65) };
}

export function formatTime(value: string | Date, seconds = false) {
  return new Date(value).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    ...(seconds ? { second: '2-digit' } : {}),
  });
}

export function toCsv(scans: Scan[]): string {
  const rows = [
    [
      'Scan ID',
      'Date (UTC)',
      'Condition',
      'Green %',
      'Yellow %',
      'Brown %',
      'Source',
      'Recommendation',
    ],
    ...scans.map((s) => [
      s.id,
      s.timestamp,
      s.label,
      s.green,
      s.yellow,
      s.brown,
      s.source,
      s.solution,
    ]),
  ];
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const value = String(cell);
          // Quoting alone does not stop spreadsheet formulas from being evaluated.
          const safe =
            typeof cell === 'string' && /^\s*[=+\-@\t\r]/.test(value) ? `'${value}` : value;
          return `"${safe.replaceAll('"', '""')}"`;
        })
        .join(','),
    )
    .join('\r\n');
}

export function downloadCsv(scans: Scan[]) {
  downloadBlob(
    new Blob(['\uFEFF' + toCsv(scans)], { type: 'text/csv;charset=utf-8;' }),
    `smartfarm-scans-${new Date().toISOString().slice(0, 10)}.csv`,
  );
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
