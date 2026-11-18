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
  apiUrl,
  DEFAULT_PREFERENCES,
  DEMO_SCREENING,
  fetchStatus,
  loadPreferences,
  loadScans,
  makeDemoScans,
} from '../lib/screening';
import type { Preferences, Scan, Screening } from '../lib/screening';

export const CAMERA_IMAGE = `${import.meta.env.BASE_URL}images/leaf-camera.webp`;

type Modal = 'settings' | 'scan' | 'help' | 'search' | null;
interface FarmState {
  preferences: Preferences;
  status: Screening;
  updatedAt: Date | null;
  connected: boolean;
  connecting: boolean;
  error: string;
  scans: Scan[];
  isDemo: boolean;
  modal: Modal;
  setModal: (modal: Modal) => void;
  selectedScan: Scan | null;
  setSelectedScan: (scan: Scan | null) => void;
  toast: string;
  notify: (message: string) => void;
  capture: () => Promise<void>;
  capturing: boolean;
  saveUpload: (result: Screening, image: string) => Scan;
  connectCamera: (preferences: Preferences) => Promise<void>;
  useDemo: (preferences?: Preferences) => void;
  refresh: () => Promise<void>;
  clearScans: () => void;
}
const FarmContext = createContext<FarmState | null>(null);

export function FarmProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState(loadPreferences);
  const [status, setStatus] = useState<Screening>(DEMO_SCREENING);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');
  const [storedScans, setStoredScans] = useState<Scan[]>(loadScans);
  const [demoScans] = useState(makeDemoScans);
  const [modal, setModal] = useState<Modal>(null);
  const [selectedScan, setSelectedScan] = useState<Scan | null>(null);
  const [toast, setToast] = useState('');
  const [capturing, setCapturing] = useState(false);
  const captureLock = useRef(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const isDemo = preferences.mode === 'demo';

  const notify = useCallback((message: string) => {
    clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(''), 4500);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  useEffect(() => {
    try {
      localStorage.setItem('smartfarm-preferences', JSON.stringify(preferences));
    } catch {
      /* Browsers may disable local storage; the dashboard still works in memory. */
    }
  }, [preferences]);

  useEffect(() => {
    try {
      localStorage.setItem('smartfarm-scans', JSON.stringify(storedScans));
    } catch {
      try {
        localStorage.setItem(
          'smartfarm-scans',
          JSON.stringify(storedScans.map(({ image: _image, ...scan }) => scan)),
        );
      } catch {
        /* Session history remains available when storage is full or disabled. */
      }
    }
  }, [storedScans]);

  useEffect(() => {
    if (preferences.mode === 'demo') {
      setStatus(DEMO_SCREENING);
      setError('');
      setConnecting(false);
      setConnected(false);
      setUpdatedAt(null);
      return;
    }
    const controller = new AbortController();
    let active = true;
    let pending = false;
    setConnecting(true);
    setConnected(false);
    setStatus({
      cls: 0,
      label: 'No leaf in view',
      solution: 'Connect your camera to start screening.',
      green: 0,
      yellow: 0,
      brown: 0,
    });
    setUpdatedAt(null);
    const update = async () => {
      if (pending) return;
      pending = true;
      try {
        const result = await fetchStatus(preferences.host, controller.signal);
        if (active) {
          setStatus(result);
          setConnected(true);
          setError('');
          setUpdatedAt(new Date());
        }
      } catch (e) {
        if (active) {
          setConnected(false);
          setError(e instanceof Error ? e.message : 'Camera unavailable.');
        }
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
  }, [preferences.mode, preferences.host]);

  const scans = useMemo(
    () =>
      [
        ...storedScans.filter((s) => isDemo || s.source !== 'demo'),
        ...(isDemo ? demoScans : []),
      ].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp)),
    [storedScans, demoScans, isDemo],
  );

  const addScan = useCallback((result: Screening, source: Scan['source'], image?: string): Scan => {
    const scan: Scan = {
      ...result,
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      source,
      image,
    };
    setStoredScans((prev) => [scan, ...prev].slice(0, 60));
    return scan;
  }, []);

  const refresh = useCallback(async () => {
    if (isDemo) {
      notify('This is a sample screening. Connect your camera for live updates.');
      return;
    }
    setConnecting(true);
    try {
      const result = await fetchStatus(preferences.host);
      setStatus(result);
      setUpdatedAt(new Date());
      setConnected(true);
      setError('');
      notify('Camera screening refreshed.');
    } catch (e) {
      setConnected(false);
      const message = e instanceof Error ? e.message : 'Unable to refresh the camera.';
      setError(message);
      notify(message);
    } finally {
      setConnecting(false);
    }
  }, [isDemo, preferences.host, notify]);

  const capture = useCallback(async () => {
    if (captureLock.current) return;
    captureLock.current = true;
    setCapturing(true);
    try {
      let result = DEMO_SCREENING;
      let thumbnail = CAMERA_IMAGE;
      if (!isDemo) {
        if (!connected) throw new Error('Connect your ESP32-CAM before capturing a frame.');
        const response = await fetch(`${apiUrl('jpg', preferences.host)}&t=${Date.now()}`, {
          signal: AbortSignal.timeout(8000),
          cache: 'no-store',
        });
        if (!response.ok)
          throw new Error('Could not capture a frame. Check your camera connection.');
        const url = URL.createObjectURL(await response.blob());
        try {
          thumbnail = (await analyzeImage(url)).thumbnail;
        } finally {
          URL.revokeObjectURL(url);
        }
        result = await fetchStatus(preferences.host);
        setStatus(result);
        setUpdatedAt(new Date());
      }
      const scan = addScan(result, isDemo ? 'demo' : 'camera', thumbnail);
      setModal(null);
      setSelectedScan(scan);
      notify(isDemo ? 'Sample scan saved to your history.' : 'Frame captured and screening saved.');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not capture this frame.');
    } finally {
      setCapturing(false);
      captureLock.current = false;
    }
  }, [isDemo, connected, preferences.host, addScan, notify]);

  const connectCamera = useCallback(
    async (next: Preferences) => {
      const result = await fetchStatus(next.host);
      setPreferences({ ...next, mode: 'device' });
      setStatus(result);
      setConnected(true);
      setUpdatedAt(new Date());
      setError('');
      notify('Your ESP32-CAM is connected. Welcome to a clearer view.');
    },
    [notify],
  );

  const useDemo = useCallback(
    (next?: Preferences) => {
      setPreferences({ ...(next || preferences || DEFAULT_PREFERENCES), mode: 'demo' });
      notify('Demo mode is on. All camera readings are sample data.');
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
        modal,
        setModal,
        selectedScan,
        setSelectedScan,
        toast,
        notify,
        capture,
        capturing,
        saveUpload: (result, image) => addScan(result, 'upload', image),
        connectCamera,
        useDemo,
        refresh,
        clearScans: () => {
          setStoredScans([]);
          notify('Saved scans cleared. Demo examples remain available in demo mode.');
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
