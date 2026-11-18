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
  /** New captures analyse their exact JPEG, not a different majority-voted frame. */
  method?: 'single-frame' | 'firmware';
  image?: string;
}
export interface Preferences {
  mode: CameraMode;
  host: string;
  name: string;
  location: string;
  gatewayUrl?: string;
  demoOptIn?: boolean;
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
  mode: 'device',
  host: '',
  name: 'ESP32-CAM',
  location: 'My farm',
  gatewayUrl: '',
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
  // Permit normal decimal rounding, but never render impossible composition bars.
  if ((data.green as number) + (data.yellow as number) + (data.brown as number) > 100.2) {
    throw new Error('The camera returned invalid colour totals.');
  }
  const cls = data.cls as Condition;
  return {
    cls,
    label:
      typeof data.label === 'string' && data.label.trim()
        ? data.label.slice(0, 200)
        : CONDITIONS[cls].label,
    solution:
      typeof data.solution === 'string' && data.solution.trim()
        ? data.solution.slice(0, 2000)
        : CONDITIONS[cls].solution,
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
  if (!stored || typeof stored !== 'object') return { ...DEFAULT_PREFERENCES };
  // Older releases automatically saved demo preferences. They are not user consent.
  const legacyDemo = stored.mode === 'demo' && stored.demoOptIn !== true;
  return {
    mode: stored.mode === 'demo' && stored.demoOptIn === true ? 'demo' : 'device',
    demoOptIn: stored.demoOptIn === true,
    host: !legacyDemo && typeof stored.host === 'string' ? stored.host.trim() : '',
    gatewayUrl: typeof stored.gatewayUrl === 'string' ? stored.gatewayUrl.trim() : '',
    name:
      typeof stored.name === 'string' && stored.name.trim()
        ? stored.name.trim().slice(0, 40)
        : DEFAULT_PREFERENCES.name,
    location:
      typeof stored.location === 'string' &&
      stored.location.trim() &&
      !(legacyDemo && stored.location === 'North greenhouse')
        ? stored.location.trim().slice(0, 60)
        : DEFAULT_PREFERENCES.location,
  };
}

export function loadScans(): Scan[] {
  const stored = readStored<unknown>('smartfarm-scans', []);
  if (!Array.isArray(stored)) return [];
  const seen = new Set<string>();
  const scans: Scan[] = [];
  for (const value of stored) {
    try {
      const result = parseStatus(value);
      const scan = value as Record<string, unknown>;
      if (
        typeof scan.id !== 'string' ||
        !scan.id ||
        scan.id.length > 100 ||
        seen.has(scan.id) ||
        typeof scan.timestamp !== 'string' ||
        Number.isNaN(Date.parse(scan.timestamp)) ||
        !['demo', 'camera', 'upload'].includes(String(scan.source))
      )
        continue;
      seen.add(scan.id);
      // Local history must never make requests to arbitrary external image URLs.
      const image =
        typeof scan.image === 'string' &&
        scan.image.length < 500_000 &&
        (/^data:image\/(jpeg|png|webp);base64,[a-zA-Z0-9+/=]+$/.test(scan.image) ||
          (scan.source === 'demo' &&
            scan.image === `${import.meta.env.BASE_URL}images/leaf-camera.webp`))
          ? scan.image
          : undefined;
      scans.push({
        ...result,
        id: scan.id,
        timestamp: scan.timestamp,
        source: scan.source as Scan['source'],
        image,
        method:
          scan.method === 'single-frame'
            ? 'single-frame'
            : scan.source === 'camera'
              ? 'firmware'
              : undefined,
      });
    } catch {
      /* Ignore corrupt entries without losing valid saved scans. */
    }
  }
  return scans.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp)).slice(0, 60);
}

export function createScanId(): string {
  // randomUUID is unavailable on ordinary HTTP LAN addresses, unlike getRandomValues.
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export const EMPTY_SCREENING: Screening = {
  cls: 0,
  label: 'No screening yet',
  solution: 'Upload a leaf photo or connect a camera.',
  green: 0,
  yellow: 0,
  brown: 0,
};

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
  // Transparent PNG pixels are background, not black pest specks.
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
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
      'Screening method',
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
      s.source === 'demo'
        ? 'sample'
        : s.source === 'upload' || s.method === 'single-frame'
          ? 'single-frame HSV'
          : 'firmware majority vote (not frame-synchronised)',
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
