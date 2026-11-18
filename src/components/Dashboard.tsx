import { useEffect, useRef, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowRight,
  Camera,
  Check,
  ChevronRight,
  CircleHelp,
  Cpu,
  Expand,
  Leaf,
  Lightbulb,
  LoaderCircle,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Radio,
  RefreshCw,
  ScanLine,
  ShieldCheck,
  SlidersHorizontal,
  Sprout,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { CAMERA_IMAGE, useFarm } from '../context/FarmContext';
import { apiUrl, CONDITIONS, downloadBlob, formatTime } from '../lib/screening';
import type { Page, Scan } from '../lib/screening';
import { Composition, ConditionBadge, EmptyState, Sparkline } from './ui';

export function StatsGrid() {
  const { status, scans, isDemo, connected, connecting } = useFarm();
  const available = isDemo || connected;
  const today = new Date().toDateString();
  const count = scans.filter((scan) => new Date(scan.timestamp).toDateString() === today).length;
  return (
    <div className="stats-grid">
      <article className="stat-card">
        <div className="stat-top">
          <span>Camera status</span>
          <span className="stat-icon icon-sage">
            <Wifi size={18} />
          </span>
        </div>
        <div className="stat-value">
          <span className={`status-dot ${available ? 'online' : ''}`} />
          {connecting ? 'Connecting' : available ? 'Online' : 'Offline'}
        </div>
        <div className="stat-bottom">
          <span>{isDemo ? 'ESP32-CAM · Demo feed' : 'ESP32-CAM · AI Thinker'}</span>
          {available && (
            <span className="micro-badge green-badge">{isDemo ? 'Sample' : 'Connected'}</span>
          )}
        </div>
      </article>
      <article className="stat-card">
        <div className="stat-top">
          <span>Current condition</span>
          <span className="stat-icon icon-sage">
            <Sprout size={18} />
          </span>
        </div>
        <div className={`stat-value ${available ? `text-${CONDITIONS[status.cls].tone}` : ''}`}>
          {available ? CONDITIONS[status.cls].short : '—'}
        </div>
        <div className="stat-bottom">
          <span>
            {available
              ? status.cls === 1
                ? 'A happy, healthy-looking leaf'
                : 'View the screening below'
              : 'Waiting for your camera'}
          </span>
          {available && status.cls === 1 && <Check size={15} className="text-green" />}
        </div>
      </article>
      <article className="stat-card">
        <div className="stat-top">
          <span>Scans today</span>
          <span className="stat-icon icon-peach">
            <ScanLine size={18} />
          </span>
        </div>
        <div className="stat-value">
          {String(count).padStart(2, '0')}
          <span className="stat-unit">scans</span>
        </div>
        <div className="stat-bottom">
          <span>{isDemo ? 'Sample screening history' : 'Captured & uploaded leaves'}</span>
          {isDemo && <Sparkline color="#d9885b" />}
        </div>
      </article>
      <article className="stat-card">
        <div className="stat-top">
          <span>Green composition</span>
          <span className="stat-icon icon-sage">
            <Leaf size={18} />
          </span>
        </div>
        <div className="stat-value">
          {available ? status.green.toFixed(1) : '—'}
          <span className="percent-unit">{available ? '%' : ''}</span>
        </div>
        <div className="stat-bottom">
          <span>Of detected leaf pixels</span>
          {isDemo && <Sparkline />}
        </div>
      </article>
    </div>
  );
}

export function CameraPanel({ large = false }: { large?: boolean }) {
  const {
    preferences,
    isDemo,
    connected,
    connecting,
    status,
    updatedAt,
    setModal,
    capture,
    capturing,
    notify,
  } = useFarm();
  const [paused, setPaused] = useState(false);
  const [frozen, setFrozen] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [streamError, setStreamError] = useState(false);
  const [version, setVersion] = useState(0);
  const image = useRef<HTMLImageElement>(null);
  const panel = useRef<HTMLElement>(null);
  const available = isDemo || connected;
  useEffect(() => {
    setPaused(false);
    setFrozen('');
    setStreamError(false);
    setVersion((v) => v + 1);
  }, [preferences.mode, preferences.host, connected]);
  useEffect(() => {
    if (!expanded) return;
    const old = document.body.style.overflow;
    const previous = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';
    panel.current?.querySelector<HTMLButtonElement>('[aria-label="Exit full screen"]')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setExpanded(false);
      if (event.key === 'Tab') {
        const buttons = Array.from(
          panel.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') || [],
        );
        const first = buttons[0],
          last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = old;
      document.removeEventListener('keydown', onKey);
      previous?.focus();
    };
  }, [expanded]);
  const togglePause = () => {
    if (paused) {
      setPaused(false);
      setVersion((v) => v + 1);
      return;
    }
    if (isDemo) {
      setFrozen(CAMERA_IMAGE);
      setPaused(true);
      return;
    }
    try {
      const canvas = document.createElement('canvas');
      if (!image.current?.naturalWidth) throw new Error('No frame is available yet.');
      canvas.width = image.current.naturalWidth;
      canvas.height = image.current.naturalHeight;
      canvas.getContext('2d')!.drawImage(image.current, 0, 0);
      setFrozen(canvas.toDataURL('image/jpeg'));
      setPaused(true);
    } catch {
      notify('No frame is available to pause yet. Try again when the stream is ready.');
    }
  };
  return (
    <>
      {expanded && <div className="camera-scrim" onClick={() => setExpanded(false)} />}
      <section
        className={`card camera-card ${large ? 'camera-large' : ''} ${expanded ? 'camera-expanded' : ''}`}
        role={expanded ? 'dialog' : undefined}
        aria-modal={expanded || undefined}
        aria-label={expanded ? 'Expanded camera view' : 'Camera feed'}
        ref={panel}
      >
        <div className="card-heading">
          <div className="heading-group">
            <span className={`status-dot ${available ? 'online' : ''}`} />
            <h2>Live camera</h2>
            <span className="subtle-tag">CAM 01</span>
          </div>
          <button
            className="icon-button"
            title="Camera settings"
            aria-label="Camera settings"
            onClick={() => setModal('settings')}
          >
            <SlidersHorizontal size={17} />
          </button>
        </div>
        <div className="camera-stage">
          {available && !streamError ? (
            <>
              <img
                ref={image}
                className="camera-image"
                src={
                  paused
                    ? frozen
                    : isDemo
                      ? CAMERA_IMAGE
                      : `${apiUrl('stream', preferences.host)}&v=${version}`
                }
                alt={
                  isDemo
                    ? 'Sample camera frame of a healthy tomato leaf in a greenhouse'
                    : 'Live ESP32-CAM stream'
                }
                onError={() => setStreamError(true)}
              />
              <div className="camera-gradient" />
              <div className="camera-topline">
                <span className={`feed-badge ${paused ? 'feed-paused' : ''}`}>
                  <span />
                  {paused ? 'PAUSED' : isDemo ? 'DEMO FEED' : 'LIVE'}
                </span>
                <span className="resolution-badge">
                  {isDemo ? 'SAMPLE' : 'QVGA'}
                  <span />
                  320 × 240
                </span>
              </div>
              <div className="framing-guide" aria-hidden="true">
                <i />
                <i />
                <i />
                <i />
                <span>
                  <Leaf size={11} /> LEAF SCREENING
                </span>
              </div>
              <div className="camera-caption">
                <div>
                  <span className="camera-location">
                    <Camera size={14} />
                    {preferences.location}
                  </span>
                  <span className="camera-meta">
                    {preferences.name}
                    <span>•</span>
                    {isDemo ? 'Sample image' : formatTime(updatedAt || new Date(), true)}
                  </span>
                </div>
                <span className="framing-hint">Keep a leaf in the frame</span>
              </div>
              {paused && (
                <div className="pause-overlay">
                  <span>
                    <Pause size={19} />
                    Stream paused
                  </span>
                  <button onClick={togglePause}>
                    Resume <Play size={13} />
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="camera-disconnected">
              {connecting ? <LoaderCircle className="spin" size={32} /> : <WifiOff size={32} />}
              <h3>
                {connecting
                  ? 'Finding your camera…'
                  : streamError
                    ? 'The stream is unavailable'
                    : 'Your field, a little closer.'}
              </h3>
              <p>
                {streamError
                  ? 'The status may be online, but the video could not load. Check port 81 on your camera.'
                  : 'Connect your ESP32-CAM to start watching your plants grow.'}
              </p>
              <button
                className="button button-light"
                onClick={() =>
                  streamError
                    ? (setStreamError(false), setVersion((v) => v + 1))
                    : setModal('settings')
                }
              >
                {streamError ? <RefreshCw size={15} /> : <Wifi size={15} />}
                {streamError ? 'Retry stream' : 'Connect camera'}
              </button>
            </div>
          )}
        </div>
        <div className="camera-toolbar">
          <span className="camera-auto">
            <Radio size={14} />
            <span>
              {paused
                ? 'Display paused · screening continues'
                : isDemo
                  ? 'Sample preview · try a capture'
                  : status.cls === 0
                    ? 'Position a leaf in good light'
                    : 'Auto-screening every 3 seconds'}
            </span>
          </span>
          <div className="camera-actions">
            <button
              className="icon-button"
              onClick={togglePause}
              disabled={!available || streamError}
              title={paused ? 'Resume stream' : 'Pause stream'}
              aria-label={paused ? 'Resume stream' : 'Pause stream'}
            >
              {paused ? <Play size={16} /> : <Pause size={16} />}
            </button>
            <button
              className="button button-small button-outline capture-button"
              onClick={() => void capture()}
              disabled={!available || capturing}
            >
              {capturing ? <LoaderCircle size={15} className="spin" /> : <Camera size={15} />}
              Capture
            </button>
            <button
              className="icon-button"
              onClick={() => setExpanded(!expanded)}
              title={expanded ? 'Exit full screen' : 'Expand camera'}
              aria-label={expanded ? 'Exit full screen' : 'Expand camera'}
            >
              {expanded ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
            </button>
          </div>
        </div>
      </section>
    </>
  );
}

export function ScreeningPanel() {
  const { status, isDemo, connected, updatedAt, connecting, refresh, setModal } = useFarm();
  const available = isDemo || connected;
  const condition = CONDITIONS[status.cls];
  return (
    <section className="card screening-card">
      <div className="card-heading">
        <h2>Leaf screening</h2>
        <button
          className="icon-button"
          aria-label="About colour screening"
          title="About colour screening"
          onClick={() => setModal('help')}
        >
          <CircleHelp size={17} />
        </button>
      </div>
      <div className="screening-body">
        <div className="screening-status">
          <span className={`health-leaf tone-${available ? condition.tone : 'neutral'}`}>
            <Leaf size={30} strokeWidth={1.6} />
          </span>
          <div>
            <span className="eyebrow">DETECTED CONDITION</span>
            <div className="screening-condition">
              {available
                ? condition.short === 'Healthy'
                  ? 'Healthy leaf'
                  : condition.short
                : 'Awaiting a leaf'}
              {available && status.cls === 1 && (
                <span className="health-check">
                  <Check size={12} strokeWidth={3} />
                </span>
              )}
            </div>
          </div>
          <span className={`screening-label tone-${available ? condition.tone : 'neutral'}`}>
            {isDemo ? 'Sample' : available ? 'Live' : 'Offline'}
          </span>
        </div>
        <p className="screening-description">
          {available
            ? condition.detail
            : 'Connect your camera for a fresh look at your plants. We’ll take care of the colour screening.'}
        </p>
        <div className="colour-heading">
          <h3>Colour composition</h3>
          <span>Leaf pixels</span>
        </div>
        <Composition status={available ? status : { ...status, green: 0, yellow: 0, brown: 0 }} />
        <div className={`care-tip ${available && status.cls !== 1 ? 'care-tip-attention' : ''}`}>
          <span className="care-tip-icon">
            <Lightbulb size={18} strokeWidth={1.7} />
          </span>
          <div>
            <h4>
              {available
                ? status.cls === 1
                  ? 'Keep up the good growth'
                  : 'Recommended next step'
                : 'Good light makes a difference'}
            </h4>
            <p>
              {available
                ? status.cls === 1
                  ? 'Maintain regular watering and check in on new growth.'
                  : status.solution
                : 'Hold one leaf close to the camera, with even, natural lighting.'}
            </p>
          </div>
        </div>
      </div>
      <div className="screening-footer">
        <span>
          <ShieldCheck size={13} />
          Screening, not a diagnosis
        </span>
        <button
          className="text-button refresh-button"
          title={isDemo ? 'About sample readings' : 'Refresh screening'}
          onClick={() => void refresh()}
          disabled={connecting}
        >
          <RefreshCw size={12} className={connecting ? 'spin' : ''} />
          <span>{isDemo ? 'Sample data' : connected && updatedAt ? 'Auto-updated' : 'Retry'}</span>
        </button>
      </div>
    </section>
  );
}

export function RecentScans({
  onNavigate,
  full = false,
  scans: customScans,
}: {
  onNavigate: (page: Page) => void;
  full?: boolean;
  scans?: Scan[];
}) {
  const { scans, setSelectedScan } = useFarm();
  const items = customScans ?? scans;
  return (
    <section className={`card recent-card ${full ? 'recent-full' : ''}`}>
      {!full && (
        <div className="card-heading">
          <div className="heading-group">
            <h2>Recent scans</h2>
            <span className="count-badge">{items.length}</span>
          </div>
          <button className="text-button" onClick={() => onNavigate('history')}>
            View all <ArrowRight size={14} />
          </button>
        </div>
      )}
      {items.length ? (
        <div className="table-scroll">
          <table className="scans-table">
            <thead>
              <tr>
                <th>LEAF SCAN</th>
                <th>CONDITION</th>
                <th className="composition-column">GREEN PIXELS</th>
                <th>TIME</th>
                <th>
                  <span className="sr-only">View scan</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {(full ? items : items.slice(0, 4)).map((scan, i) => (
                <tr key={scan.id} onClick={() => setSelectedScan(scan)}>
                  <td>
                    <button
                      className="scan-leaf-cell"
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedScan(scan);
                      }}
                    >
                      <span className={`scan-thumbnail tone-${CONDITIONS[scan.cls].tone}`}>
                        {scan.image || (scan.source === 'demo' && scan.cls === 1) ? (
                          <img src={scan.image || CAMERA_IMAGE} alt="" />
                        ) : (
                          <Leaf size={19} />
                        )}
                      </span>
                      <span>
                        <strong>
                          {scan.source === 'upload'
                            ? 'Uploaded leaf'
                            : scan.source === 'demo'
                              ? 'Tomato leaf'
                              : 'Camera leaf'}
                        </strong>
                        <small>
                          {scan.source === 'demo'
                            ? 'Demo scan'
                            : scan.source === 'camera'
                              ? 'ESP32-CAM'
                              : 'Photo upload'}{' '}
                          <span>·</span> #{String(items.length - i).padStart(3, '0')}
                        </small>
                      </span>
                    </button>
                  </td>
                  <td>
                    <ConditionBadge cls={scan.cls} compact />
                  </td>
                  <td className="composition-column">
                    <div className="table-composition">
                      <span className="mini-progress">
                        <i style={{ width: `${scan.green}%` }} />
                      </span>
                      <span>{scan.green.toFixed(1)}%</span>
                    </div>
                  </td>
                  <td className="scan-time">{formatTime(scan.timestamp)}</td>
                  <td>
                    <button
                      className="icon-button row-arrow"
                      aria-label={`View ${scan.label.toLowerCase()} scan from ${formatTime(scan.timestamp)}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedScan(scan);
                      }}
                    >
                      <ChevronRight size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title="Your first insight is one scan away"
          description="Capture a frame or upload a leaf photo to start your screening history."
        >
          <button className="button button-outline" onClick={() => onNavigate('camera')}>
            <Camera size={16} />
            Go to camera
          </button>
        </EmptyState>
      )}
    </section>
  );
}

export function DeviceSummary({ onNavigate }: { onNavigate: (page: Page) => void }) {
  const { isDemo, connected, preferences, setModal } = useFarm();
  return (
    <section className="card device-summary">
      <div className="card-heading">
        <h2>Your camera</h2>
        <button
          className="icon-button"
          title="Manage device"
          aria-label="Manage device"
          onClick={() => onNavigate('devices')}
        >
          <Expand size={15} />
        </button>
      </div>
      <div className="device-summary-main">
        <span className="device-chip">
          <Cpu size={29} strokeWidth={1.4} />
        </span>
        <div>
          <h3>{preferences.name}</h3>
          <p>
            AI Thinker <span>·</span> CAM 01
          </p>
        </div>
        <span className={`device-online ${isDemo || connected ? '' : 'device-offline'}`}>
          <span />
          {isDemo ? 'Demo' : connected ? 'Online' : 'Offline'}
        </span>
      </div>
      <dl className="device-details">
        <div>
          <dt>Network</dt>
          <dd>
            F450-ESP32-DRONE <Wifi size={12} />
          </dd>
        </div>
        <div>
          <dt>Resolution</dt>
          <dd>
            320 × 240 <span>QVGA</span>
          </dd>
        </div>
        <div>
          <dt>Screening interval</dt>
          <dd>Every 3 seconds</dd>
        </div>
      </dl>
      <button className="device-manage text-button" onClick={() => setModal('settings')}>
        Manage connection <ArrowRight size={14} />
      </button>
    </section>
  );
}

export function Overview({ onNavigate }: { onNavigate: (page: Page) => void }) {
  return (
    <>
      <StatsGrid />
      <div className="monitor-grid">
        <CameraPanel />
        <ScreeningPanel />
      </div>
      <div className="bottom-grid">
        <RecentScans onNavigate={onNavigate} />
        <DeviceSummary onNavigate={onNavigate} />
      </div>
      <div className="growth-note">
        <Sprout size={16} />
        <span>Small insights. Healthier plants. Better harvests.</span>
        <span className="growth-note-right">Built around your ESP32-CAM</span>
      </div>
    </>
  );
}

export function CameraPage() {
  const { isDemo, notify, preferences } = useFarm();
  const downloadFrame = async () => {
    try {
      const response = await fetch(isDemo ? CAMERA_IMAGE : apiUrl('jpg', preferences.host), {
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error();
      downloadBlob(
        await response.blob(),
        isDemo ? 'smartfarm-sample.webp' : `smartfarm-frame-${Date.now()}.jpg`,
      );
      notify('Your frame has been downloaded.');
    } catch {
      notify('Could not download a frame. Check the camera connection and try again.');
    }
  };
  return (
    <>
      <div className="monitor-grid camera-page-grid">
        <CameraPanel large />
        <ScreeningPanel />
      </div>
      <section className="card camera-tips">
        <span className="tips-icon">
          <Lightbulb size={24} />
        </span>
        <div>
          <h3>A better frame. A better screening.</h3>
          <p>
            Hold one leaf close, use natural light, and keep the camera steady. The camera combines
            five results to reduce flicker.
          </p>
        </div>
        <button className="button button-outline" onClick={() => void downloadFrame()}>
          <ArrowDownToLine size={16} />
          Download frame
        </button>
      </section>
    </>
  );
}
