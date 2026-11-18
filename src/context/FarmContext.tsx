import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import {
  analyzeImage,
  createScanId,
  DEFAULT_PREFERENCES,
  DEMO_SCREENING,
  EMPTY_SCREENING,
  loadPreferences,
  loadScans,
  makeDemoScans,
} from '../lib/screening';
import {
  fetchJpeg,
  fetchStatus,
  loadGatewayToken,
  normalizeGatewayUrl,
  storeGatewayToken,
  validateCameraHost,
} from '../lib/transport';
import type { Preferences, Scan, Screening } from '../lib/screening';

export const CAMERA_IMAGE = `${import.meta.env.BASE_URL}images/leaf-camera.webp`;
type Modal = 'settings' | 'scan' | 'help' | 'search' | null;
export type ScreeningSource = 'camera' | 'upload' | 'saved' | 'demo' | null;
interface FarmState {
  preferences: Preferences;
  status: Screening;
  updatedAt: Date | null;
  connected: boolean;
  connecting: boolean;
  error: string;
  scans: Scan[];
  isDemo: boolean;
  hasScreening: boolean;
  screeningSource: ScreeningSource;
  latestScan: Scan | null;
  gatewayToken: string;
  modal: Modal;
  setModal: (modal: Modal) => void;
  selectedScan: Scan | null;
  setSelectedScan: (scan: Scan | null) => void;
  toast: string;
  notify: (message: string) => void;
  capture: (signal?: AbortSignal) => Promise<void>;
  capturing: boolean;
  saveUpload: (result: Screening, image: string) => Scan;
  connectCamera: (preferences: Preferences, token?: string, signal?: AbortSignal) => Promise<void>;
  useDemo: (preferences?: Preferences) => void;
  disconnectCamera: () => void;
  refresh: () => Promise<void>;
  clearScans: () => void;
}
const FarmContext = createContext<FarmState | null>(null);
const keyFor = (prefs: Preferences) => `${prefs.mode}|${prefs.gatewayUrl || ''}|${prefs.host}`;

export function FarmProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState(loadPreferences);
  const [gatewayToken, setGatewayToken] = useState(() =>
    loadGatewayToken(preferences.gatewayUrl || ''),
  );
  const [cameraData, setCameraData] = useState<{ key: string; result: Screening; at: Date } | null>(
    null,
  );
  const [cameraError, setCameraError] = useState<{ key: string; message: string } | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [storedScans, setStoredScans] = useState<Scan[]>(loadScans);
  const [demoScans] = useState(makeDemoScans);
  const [modal, setModal] = useState<Modal>(null);
  const [selectedScan, setSelectedScan] = useState<Scan | null>(null);
  const [toast, setToast] = useState('');
  const [capturing, setCapturing] = useState(false);
  const captureLock = useRef(false);
  const captureController = useRef<AbortController | null>(null);
  const connectIntent = useRef(0);
  const requests = useRef(0);
  const lastApplied = useRef(0);
  const storageWarned = useRef(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const isDemo = preferences.mode === 'demo';
  const key = keyFor(preferences);
  const currentKey = useRef(key);
  currentKey.current = key;
  const connected = !isDemo && cameraData?.key === key && cameraError?.key !== key;
  const error = cameraError?.key === key ? cameraError.message : '';
  const latestScan = storedScans.find((scan) => scan.source !== 'demo') || null;
  const screeningSource: ScreeningSource = isDemo
    ? 'demo'
    : connected
      ? 'camera'
      : latestScan
        ? latestScan.source === 'upload'
          ? 'upload'
          : 'saved'
        : null;
  const status = isDemo
    ? DEMO_SCREENING
    : connected
      ? cameraData!.result
      : latestScan || EMPTY_SCREENING;
  const updatedAt = connected ? cameraData!.at : latestScan ? new Date(latestScan.timestamp) : null;

  const notify = useCallback((message: string) => {
    clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(''), 6000);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  useEffect(() => {
    try {
      localStorage.setItem('smartfarm-preferences', JSON.stringify(preferences));
    } catch {
      /* Workspace remains usable when browser storage is disabled. */
    }
  }, [preferences]);
  useEffect(() => {
    try {
      localStorage.setItem('smartfarm-scans', JSON.stringify(storedScans));
    } catch {
      let detailsSaved = false;
      try {
        localStorage.setItem(
          'smartfarm-scans',
          JSON.stringify(storedScans.map(({ image: _image, ...scan }) => scan)),
        );
        detailsSaved = true;
      } catch {
        /* Keep the full result in memory. */
      }
      if (storedScans.length && !storageWarned.current) {
        storageWarned.current = true;
        notify(
          detailsSaved
            ? 'Browser storage is full. Scan details were saved, but photos may only remain for this session.'
            : 'Browser storage is unavailable. Export your results before closing this page.',
        );
      }
    }
  }, [storedScans, notify]);

  const applyStatus = useCallback(
    (requestKey: string, sequence: number, result?: Screening, message?: string) => {
      if (requestKey !== currentKey.current || sequence < lastApplied.current) return;
      lastApplied.current = sequence;
      if (result) {
        setCameraData({ key: requestKey, result, at: new Date() });
        setCameraError(null);
      } else {
        setCameraData(null);
        setCameraError({ key: requestKey, message: message || 'Camera unavailable.' });
      }
    },
    [],
  );

  useEffect(() => {
    if (isDemo || !preferences.host) {
      setConnecting(false);
      return;
    }
    setConnecting(true);
    const controller = new AbortController();
    let active = true,
      pending = false;
    const update = async () => {
      if (pending) return;
      pending = true;
      const sequence = ++requests.current;
      try {
        const result = await fetchStatus(preferences, gatewayToken, controller.signal);
        if (active) applyStatus(key, sequence, result);
      } catch (e) {
        if (active)
          applyStatus(
            key,
            sequence,
            undefined,
            e instanceof Error ? e.message : 'Camera unavailable.',
          );
      } finally {
        pending = false;
        if (active) setConnecting(false);
      }
    };
    void update();
    const timer = setInterval(() => void update(), 3000);
    return () => {
      active = false;
      controller.abort();
      clearInterval(timer);
    };
  }, [key, isDemo, preferences.host, preferences.gatewayUrl, gatewayToken, applyStatus]);

  const scans = useMemo(
    () =>
      [
        ...storedScans.filter((scan) => isDemo || scan.source !== 'demo'),
        ...(isDemo ? demoScans : []),
      ].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp)),
    [storedScans, demoScans, isDemo],
  );

  const addScan = useCallback((result: Screening, source: Scan['source'], image?: string): Scan => {
    const scan: Scan = {
      ...result,
      id: createScanId(),
      timestamp: new Date().toISOString(),
      source,
      method: source === 'demo' ? undefined : 'single-frame',
      image,
    };
    setStoredScans((prev) => [scan, ...prev].slice(0, 60));
    return scan;
  }, []);

  const refresh = useCallback(async () => {
    if (isDemo) {
      notify(
        'Sample data is not a live reading. Choose ESP32-CAM in Settings to use real hardware.',
      );
      return;
    }
    if (!preferences.host) {
      setModal('settings');
      return;
    }
    const requestKey = key;
    const sequence = ++requests.current;
    setConnecting(true);
    try {
      const result = await fetchStatus(preferences, gatewayToken);
      applyStatus(requestKey, sequence, result);
      if (currentKey.current === requestKey) notify('Camera screening refreshed.');
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unable to refresh the camera.';
      applyStatus(requestKey, sequence, undefined, message);
      if (currentKey.current === requestKey) notify(message);
    } finally {
      if (currentKey.current === requestKey) setConnecting(false);
    }
  }, [isDemo, key, preferences, gatewayToken, notify, applyStatus]);

  useEffect(() => () => captureController.current?.abort(), [key, gatewayToken]);
  const capture = useCallback(
    async (cancel?: AbortSignal) => {
      if (captureLock.current || cancel?.aborted) return;
      const requestKey = key;
      const controller = new AbortController();
      captureController.current = controller;
      const signal = cancel ? AbortSignal.any([cancel, controller.signal]) : controller.signal;
      captureLock.current = true;
      setCapturing(true);
      try {
        let result = DEMO_SCREENING,
          thumbnail = CAMERA_IMAGE;
        if (!isDemo) {
          if (!connected)
            throw new Error(
              'No camera is connected. Upload a real photo or connect your ESP32-CAM first.',
            );
          const url = URL.createObjectURL(await fetchJpeg(preferences, gatewayToken, signal));
          try {
            // /status is a separate background majority vote. Screen the captured
            // JPEG itself so its saved percentages actually describe this image.
            const screened = await analyzeImage(url);
            result = screened.result;
            thumbnail = screened.thumbnail;
          } finally {
            URL.revokeObjectURL(url);
          }
        }
        if (signal.aborted || currentKey.current !== requestKey) return;
        const scan = addScan(result, isDemo ? 'demo' : 'camera', thumbnail);
        setModal(null);
        setSelectedScan(scan);
        notify(
          isDemo
            ? 'Sample scan saved as demo data.'
            : 'Camera frame captured and screened from its own pixels.',
        );
      } catch (e) {
        if (!signal.aborted && currentKey.current === requestKey)
          notify(e instanceof Error ? e.message : 'Could not capture this frame.');
      } finally {
        setCapturing(false);
        captureLock.current = false;
      }
    },
    [isDemo, key, connected, preferences, gatewayToken, addScan, notify],
  );

  const connectCamera = useCallback(
    async (next: Preferences, token = '', signal?: AbortSignal) => {
      const intent = ++connectIntent.current;
      const clean = {
        ...next,
        mode: 'device' as const,
        demoOptIn: false,
        host: validateCameraHost(next.host),
        gatewayUrl: normalizeGatewayUrl(next.gatewayUrl || ''),
      };
      const result = await fetchStatus(clean, token.trim(), signal);
      if (signal?.aborted || intent !== connectIntent.current)
        throw new Error('Camera connection cancelled.');
      setPreferences(clean);
      setGatewayToken(token.trim());
      storeGatewayToken(token.trim(), clean.gatewayUrl);
      lastApplied.current = ++requests.current;
      setCameraData({ key: keyFor(clean), result, at: new Date() });
      setCameraError(null);
      setConnecting(false);
      notify('ESP32-CAM status verified. Live readings are now coming from your camera.');
    },
    [notify],
  );

  const useDemo = useCallback(
    (next?: Preferences) => {
      connectIntent.current++;
      setPreferences({
        ...(next || preferences || DEFAULT_PREFERENCES),
        mode: 'demo',
        demoOptIn: true,
      });
      setConnecting(false);
      notify('Example mode was explicitly enabled. These are sample readings, not your camera.');
    },
    [preferences, notify],
  );

  return (
    <FarmContext.Provider
      value={{
        preferences,
        status,
        updatedAt,
        connected,
        connecting,
        error,
        scans,
        isDemo,
        hasScreening: screeningSource !== null,
        screeningSource,
        latestScan,
        gatewayToken,
        modal,
        setModal,
        selectedScan,
        setSelectedScan,
        toast,
        notify,
        capture,
        capturing,
        saveUpload: (result, image) => {
          if (isDemo) setPreferences((prev) => ({ ...prev, mode: 'device', demoOptIn: false }));
          return addScan(result, 'upload', image);
        },
        connectCamera,
        useDemo,
        disconnectCamera: () => {
          connectIntent.current++;
          storeGatewayToken('', preferences.gatewayUrl || '');
          setGatewayToken('');
          setCameraData(null);
          setCameraError(null);
          setConnecting(false);
          setPreferences((prev) => ({
            ...prev,
            mode: 'device',
            demoOptIn: false,
            host: '',
            gatewayUrl: '',
          }));
          notify('Camera disconnected. Your photos and scan history are still available.');
        },
        refresh,
        clearScans: () => {
          setStoredScans([]);
          setSelectedScan(null);
          notify('Your saved scans were cleared from this browser.');
        },
      }}
    >
      {children}
    </FarmContext.Provider>
  );
}

export function useFarm() {
  const context = useContext(FarmContext);
  if (!context) throw new Error('useFarm must be used inside FarmProvider');
  return context;
}
