import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import {
  ArrowDownToLine,
  ArrowRight,
  BookOpen,
  Camera,
  Check,
  ChevronRight,
  CircleHelp,
  Cpu,
  FileImage,
  FlaskConical,
  ImagePlus,
  Info,
  Leaf,
  Lightbulb,
  LoaderCircle,
  LockKeyhole,
  Monitor,
  Search,
  ShieldCheck,
  Sprout,
  Sun,
  Trash2,
  Upload,
  Wifi,
  X,
} from 'lucide-react';
import { CAMERA_IMAGE, useFarm } from '../context/FarmContext';
import { analyzeImage, CONDITIONS, downloadBlob, downloadCsv, formatTime } from '../lib/screening';
import type { CameraMode, Page, Preferences, Scan } from '../lib/screening';
import { Composition, ConditionBadge, Modal } from './ui';
import { CameraSnapshot } from './CameraImage';

export function Dialogs({ onNavigate }: { onNavigate: (page: Page) => void }) {
  const { modal, setModal, selectedScan, setSelectedScan } = useFarm();
  return (
    <>
      {modal === 'settings' && <SettingsDialog />}
      {modal === 'scan' && <NewScanDialog />}
      {modal === 'help' && <HelpDialog />}
      {modal === 'search' && <SearchDialog onNavigate={onNavigate} />}
      {selectedScan && !modal && (
        <ScanDialog scan={selectedScan} onClose={() => setSelectedScan(null)} />
      )}
      {modal && !['settings', 'scan', 'help', 'search'].includes(modal) && (
        <Modal title="Smartfarm" onClose={() => setModal(null)}>
          <p>Welcome to your farm.</p>
        </Modal>
      )}
    </>
  );
}

function SettingsDialog() {
  const {
    preferences,
    gatewayToken,
    connectCamera,
    disconnectCamera,
    useDemo,
    setModal,
    clearScans,
  } = useFarm();
  const [form, setForm] = useState<Preferences>({ ...preferences });
  const [accessKey, setAccessKey] = useState(gatewayToken);
  const connection = useRef(new AbortController());
  useEffect(() => {
    connection.current = new AbortController();
    return () => connection.current.abort();
  }, []);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [error, setError] = useState('');
  const [clearArmed, setClearArmed] = useState(false);
  const change = (key: keyof Preferences, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (key === 'gatewayUrl') setAccessKey('');
    setError('');
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting.current) return;
    const next = {
      ...form,
      name: form.name.trim() || 'ESP32-CAM',
      location: form.location.trim() || 'My farm',
      host: form.host.trim(),
    };
    if (form.mode === 'demo') {
      useDemo(next);
      setModal(null);
      return;
    }
    submitting.current = true;
    setBusy(true);
    setError('');
    try {
      await connectCamera(next, accessKey, connection.current.signal);
      setModal(null);
    } catch (e) {
      if (!connection.current.signal.aborted)
        setError(e instanceof Error ? e.message : 'Could not connect to the camera.');
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };
  return (
    <Modal
      title="Make yourself at home."
      eyebrow="WORKSPACE & CONNECTION"
      onClose={() => setModal(null)}
    >
      <form onSubmit={(event) => void submit(event)}>
        <div className="modal-body settings-body">
          <p className="modal-intro">
            A sample workspace or a real view of your farm. It’s up to you.
          </p>
          <div className="mode-picker" role="radiogroup" aria-label="Camera source">
            {(
              [
                ['demo', FlaskConical, 'Demo workspace', 'Explore with sample data'],
                ['device', Cpu, 'ESP32-CAM', 'Connect your own camera'],
              ] as const
            ).map(([mode, Icon, label, sub]) => (
              <button
                type="button"
                role="radio"
                disabled={busy}
                aria-checked={form.mode === mode}
                key={mode}
                className={`mode-option ${form.mode === mode ? 'selected' : ''}`}
                onClick={() => change('mode', mode as CameraMode)}
              >
                <span className="mode-radio">{form.mode === mode && <span />}</span>
                <Icon size={23} strokeWidth={1.5} />
                <strong>{label}</strong>
                <small>{sub}</small>
              </button>
            ))}
          </div>
          {form.mode === 'device' ? (
            <div className="camera-address-field">
              <label htmlFor="camera-address">Camera IP address</label>
              <div className="input-with-prefix">
                <span>http://</span>
                <input
                  id="camera-address"
                  disabled={busy}
                  required
                  value={form.host}
                  onChange={(event) => change('host', event.target.value)}
                  placeholder="192.168.4.3"
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={15}
                />
              </div>
              <p className="input-hint">Use the address printed in your camera’s Serial Monitor.</p>
              <div className="form-grid" style={{ marginTop: 18 }}>
                <label>
                  HTTPS gateway URL
                  <input
                    type="url"
                    disabled={busy}
                    value={form.gatewayUrl || ''}
                    onChange={(event) => change('gatewayUrl', event.target.value)}
                    placeholder="https://your-gateway.example.com"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </label>
                <label>
                  Gateway access key
                  <input
                    type="password"
                    disabled={busy}
                    value={accessKey}
                    onChange={(event) => setAccessKey(event.target.value)}
                    placeholder="Session only"
                    autoComplete="off"
                    maxLength={1024}
                  />
                </label>
              </div>
              <p className="input-hint">
                Leave the gateway URL blank only when running the dashboard locally. The key is kept
                in this tab’s session, not in your scan history.
              </p>
              <div className="connection-note">
                <Wifi size={17} />
                <p>
                  The gateway must be on your camera’s Wi-Fi. To connect from this published site,
                  it must have a trusted HTTPS URL, an access key, and allow this website’s origin.
                  GitHub Pages cannot directly reach your private HTTP camera.
                </p>
              </div>
            </div>
          ) : (
            <div className="demo-explanation">
              <Sprout size={19} />
              <p>
                Your demo includes a sample camera frame and 24 example screenings. No hardware or
                account needed.
              </p>
            </div>
          )}
          <div className="form-section-title">YOUR WORKSPACE</div>
          <div className="form-grid">
            <label>
              Camera name
              <input
                required
                disabled={busy}
                value={form.name}
                onChange={(event) => change('name', event.target.value)}
                placeholder="ESP32-CAM"
                maxLength={40}
              />
            </label>
            <label>
              Location
              <input
                required
                disabled={busy}
                value={form.location}
                onChange={(event) => change('location', event.target.value)}
                placeholder="North greenhouse"
                maxLength={60}
              />
            </label>
          </div>
          {error && (
            <div className="inline-error" role="alert">
              <Info size={16} />
              <p>{error}</p>
            </div>
          )}
          <details className="privacy-details">
            <summary>
              <ShieldCheck size={14} />
              Data & privacy
              <ChevronRight size={13} />
            </summary>
            <p>
              Your photos and history are stored only in this browser, never sent to an AI service.
              Clearing saved scans does not remove the demo examples.
            </p>
            <button
              type="button"
              className="text-button danger-text"
              onClick={() => {
                if (clearArmed) {
                  clearScans();
                  setClearArmed(false);
                } else setClearArmed(true);
              }}
            >
              <Trash2 size={13} />
              {clearArmed ? 'Click again to clear saved scans' : 'Clear saved scans'}
            </button>
          </details>
          {(preferences.host || preferences.mode === 'demo') && (
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() => {
                disconnectCamera();
                setModal(null);
              }}
            >
              Use photos only · disconnect camera
            </button>
          )}
        </div>
        <div className="modal-footer">
          <button type="button" className="button button-outline" onClick={() => setModal(null)}>
            Cancel
          </button>
          <button type="submit" disabled={busy} className="button button-primary">
            {busy ? (
              <LoaderCircle size={16} className="spin" />
            ) : form.mode === 'device' ? (
              <Wifi size={16} />
            ) : (
              <Check size={16} />
            )}
            {busy ? 'Connecting…' : form.mode === 'device' ? 'Connect camera' : 'Save workspace'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function NewScanDialog() {
  const {
    isDemo,
    connected,
    preferences,
    setModal,
    capture,
    capturing,
    saveUpload,
    setSelectedScan,
    notify,
    gatewayToken,
  } = useFarm();
  const [tab, setTab] = useState<'camera' | 'upload'>(isDemo || connected ? 'camera' : 'upload');
  const uploadLock = useRef(false);
  const work = useRef(new AbortController());
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    work.current = new AbortController();
    return () => {
      active.current = false;
      work.current.abort();
    };
  }, []);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  const choose = (next?: File) => {
    if (!next || uploadLock.current) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(next.type)) {
      setFile(null);
      setPreview('');
      setError('Please choose a JPG, PNG, or WebP image.');
      return;
    }
    if (next.size > 12 * 1024 * 1024) {
      setFile(null);
      setPreview('');
      setError('Choose an image smaller than 12 MB.');
      return;
    }
    setFile(next);
    setPreview(URL.createObjectURL(next));
    setError('');
  };
  const analyze = async () => {
    if (!preview || uploadLock.current) return;
    uploadLock.current = true;
    setBusy(true);
    setError('');
    try {
      const { result, thumbnail } = await analyzeImage(preview);
      if (!active.current) return;
      const scan = saveUpload(result, thumbnail);
      setModal(null);
      setSelectedScan(scan);
      notify('Screening saved. Your photo stayed right here in your browser.');
    } catch {
      setError('We couldn’t read that image. Try another JPG, PNG, or WebP photo.');
    } finally {
      uploadLock.current = false;
      setBusy(false);
    }
  };
  return (
    <Modal title="Let’s check on a leaf." eyebrow="A CLOSER LOOK" onClose={() => setModal(null)}>
      <div className="modal-body">
        <div className="segmented-tabs" role="tablist" aria-label="Scan source">
          <button
            role="tab"
            aria-selected={tab === 'camera'}
            className={tab === 'camera' ? 'active' : ''}
            onClick={() => {
              setTab('camera');
              setError('');
            }}
          >
            <Camera size={16} />
            Camera capture
          </button>
          <button
            role="tab"
            aria-selected={tab === 'upload'}
            className={tab === 'upload' ? 'active' : ''}
            onClick={() => {
              setTab('upload');
              setError('');
            }}
          >
            <Upload size={16} />
            Upload a photo
          </button>
        </div>
        {tab === 'camera' ? (
          <div role="tabpanel">
            {isDemo || connected ? (
              <>
                <div className="scan-preview">
                  {!previewFailed ? (
                    isDemo ? (
                      <img
                        src={CAMERA_IMAGE}
                        alt="Sample tomato leaf ready for a demo screening"
                        onError={() => setPreviewFailed(true)}
                      />
                    ) : (
                      <CameraSnapshot
                        target={preferences}
                        token={gatewayToken}
                        alt="Current real camera frame"
                      />
                    )
                  ) : (
                    <div className="preview-error">
                      <Camera size={30} />
                      <p>Preview unavailable. You can try capturing again.</p>
                    </div>
                  )}
                  <span className="scan-preview-badge">
                    <span />
                    {isDemo ? 'SAMPLE FRAME' : 'CAMERA PREVIEW'}
                  </span>
                </div>
                <p className="scan-modal-description">
                  {isDemo
                    ? 'Try a capture with our sample frame. The result will be clearly marked as a demo scan.'
                    : 'Capture and screen the exact JPEG. Live readings use the firmware’s separate five-frame vote; saved captures use single-image colour screening.'}
                </p>
              </>
            ) : (
              <div className="scan-connect-empty">
                <Wifi size={32} />
                <h3>Let’s connect your camera first.</h3>
                <p>Or switch to the upload tab to screen a photo right here.</p>
                <button className="button button-outline" onClick={() => setModal('settings')}>
                  Open camera settings <ArrowRight size={15} />
                </button>
              </div>
            )}
            <div className="scan-tips">
              <span>
                <Sun size={14} />
                Natural light
              </span>
              <span>
                <Leaf size={14} />
                One leaf at a time
              </span>
              <span>
                <Camera size={14} />A steady frame
              </span>
            </div>
          </div>
        ) : (
          <div role="tabpanel">
            <input
              className="sr-only"
              type="file"
              ref={input}
              accept="image/jpeg,image/png,image/webp"
              aria-label="Choose leaf photo"
              onChange={(event: ChangeEvent<HTMLInputElement>) => choose(event.target.files?.[0])}
            />
            {preview ? (
              <div className="upload-selected">
                <div className="upload-image-wrap">
                  <img src={preview} alt="Your selected leaf photo" />
                  <button
                    className="icon-button"
                    aria-label="Remove selected photo"
                    disabled={busy}
                    onClick={() => {
                      setFile(null);
                      setPreview('');
                      if (input.current) input.current.value = '';
                    }}
                  >
                    <X size={17} />
                  </button>
                </div>
                <div className="upload-file-info">
                  <FileImage size={17} />
                  <span>{file?.name}</span>
                  <small>{((file?.size || 0) / 1024 / 1024).toFixed(1)} MB</small>
                </div>
              </div>
            ) : (
              <div
                className={`drop-zone ${dragging ? 'dragging' : ''}`}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  choose(event.dataTransfer.files[0]);
                }}
              >
                <span>
                  <ImagePlus size={31} strokeWidth={1.5} />
                </span>
                <h3>A little leaf. A little insight.</h3>
                <p>Drop a leaf photo here, or choose one below.</p>
                <button className="button button-outline" onClick={() => input.current?.click()}>
                  <Upload size={15} />
                  Choose a photo
                </button>
                <small>JPG, PNG or WebP · Up to 12 MB</small>
              </div>
            )}
            <div className="upload-privacy">
              <LockKeyhole size={14} />
              <span>Analysed on your device. No uploads, no API key needed.</span>
            </div>
            <p className="upload-method">
              Uses the same colour thresholds as your ESP32 firmware. A single photo is screened
              without the five-frame majority vote.
            </p>
          </div>
        )}
        {error && (
          <div className="inline-error" role="alert">
            <Info size={16} />
            <p>{error}</p>
          </div>
        )}
      </div>
      <div className="modal-footer">
        <button className="button button-outline" onClick={() => setModal(null)}>
          Cancel
        </button>
        {tab === 'camera' ? (
          <button
            className="button button-primary"
            disabled={capturing || (!isDemo && !connected)}
            onClick={() => void capture(work.current.signal)}
          >
            {capturing ? <LoaderCircle size={16} className="spin" /> : <ScanIcon />}
            {capturing ? 'Capturing…' : isDemo ? 'Try a sample scan' : 'Capture & screen'}
          </button>
        ) : (
          <button
            className="button button-primary"
            disabled={!preview || busy}
            onClick={() => void analyze()}
          >
            {busy ? <LoaderCircle size={16} className="spin" /> : <Leaf size={16} />}
            {busy ? 'Screening your leaf…' : 'Screen this leaf'}
          </button>
        )}
      </div>
    </Modal>
  );
}
function ScanIcon() {
  return <Camera size={16} />;
}

function ScanDialog({ scan, onClose }: { scan: Scan; onClose: () => void }) {
  const { notify } = useFarm();
  const image = scan.image || (scan.source === 'demo' && scan.cls === 1 ? CAMERA_IMAGE : '');
  const downloadImage = async () => {
    try {
      const response = await fetch(image);
      if (!response.ok) throw new Error();
      downloadBlob(
        await response.blob(),
        `smartfarm-leaf-${scan.id.slice(0, 8)}.${image.endsWith('.webp') ? 'webp' : 'jpg'}`,
      );
      notify('Leaf photo downloaded.');
    } catch {
      notify('This image could not be downloaded.');
    }
  };
  return (
    <Modal
      title="A little insight into your leaf."
      eyebrow={scan.source === 'demo' ? 'SAMPLE SCREENING' : 'YOUR SCREENING RESULT'}
      onClose={onClose}
    >
      <div className="modal-body">
        <div className={`result-preview tone-${CONDITIONS[scan.cls].tone}`}>
          {image ? <img src={image} alt="Screened leaf" /> : <Leaf size={65} strokeWidth={1} />}
          {image && (
            <button
              className="result-download"
              title="Download leaf photo"
              aria-label="Download leaf photo"
              onClick={() => void downloadImage()}
            >
              <ArrowDownToLine size={17} />
            </button>
          )}
          <ConditionBadge cls={scan.cls} />
        </div>
        <div className="result-meta">
          <span>
            {scan.source === 'demo' ? (
              <FlaskConical size={13} />
            ) : scan.source === 'upload' ? (
              <Upload size={13} />
            ) : (
              <Camera size={13} />
            )}
            {scan.source === 'demo'
              ? 'Demo scan · sample data'
              : scan.source === 'upload'
                ? 'Uploaded leaf photo'
                : 'ESP32-CAM capture'}
          </span>
          <span>
            {new Date(scan.timestamp).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
            })}{' '}
            · {formatTime(scan.timestamp)}
          </span>
        </div>
        <h3 className="result-title">{CONDITIONS[scan.cls].title}</h3>
        <p className="result-description">{CONDITIONS[scan.cls].detail}</p>
        <div className="colour-heading">
          <h3>Colour composition</h3>
          <span>Of leaf pixels</span>
        </div>
        <Composition status={scan} />
        <div className="result-recommendation">
          <Lightbulb size={19} />
          <div>
            <h4>Recommended next step</h4>
            <p>{scan.solution}</p>
          </div>
        </div>
        <p className="result-disclaimer">
          <ShieldCheck size={14} />
          {scan.source === 'camera'
            ? scan.method === 'single-frame'
              ? 'Exact captured frame · single-image HSV screening, not a diagnosis.'
              : 'Legacy capture · firmware vote was not synchronised with this JPEG.'
            : 'Colour-based screening, not a diagnosis. Confirm concerns by eye.'}
        </p>
      </div>
      <div className="modal-footer">
        <button
          className="button button-outline"
          onClick={() => {
            downloadCsv([scan]);
            notify('Scan report exported as CSV.');
          }}
        >
          <ArrowDownToLine size={15} />
          Export scan
        </button>
        <button className="button button-primary" onClick={onClose}>
          All done <Check size={16} />
        </button>
      </div>
    </Modal>
  );
}

function HelpDialog() {
  const { setModal } = useFarm();
  return (
    <Modal
      title="A clearer view of how it works."
      eyebrow="SMALL INSIGHTS, RESPONSIBLY"
      onClose={() => setModal(null)}
    >
      <div className="modal-body help-body">
        <div className="help-intro">
          <span>
            <Leaf size={29} strokeWidth={1.5} />
          </span>
          <p>
            Smartfarm turns your ESP32-CAM’s colour readings into a useful first look at your
            plants. It’s a screening aid, not a trained AI model.
          </p>
        </div>
        <div className="help-item">
          <span>01</span>
          <div>
            <h3>Start with a good view</h3>
            <p>
              Hold a single leaf close to the camera in even, natural light. At least 5% of sampled
              pixels must be leaf-coloured.
            </p>
          </div>
        </div>
        <div className="help-item">
          <span>02</span>
          <div>
            <h3>Let the colours tell their story</h3>
            <p>
              Green, yellow, and brown pixels are compared. More than 25% yellow may suggest
              yellowing; more than 12% brown may suggest leaf spot. Small dark areas can trigger a
              possible damage flag.
            </p>
          </div>
        </div>
        <div className="help-item">
          <span>03</span>
          <div>
            <h3>Take the next step, thoughtfully</h3>
            <p>
              The firmware combines the last five classifications to reduce flicker and analyses a
              frame every 3 seconds. Lighting and shadows still affect results, so always check your
              plants in person.
            </p>
          </div>
        </div>
        <div className="help-gateway">
          <Monitor size={21} />
          <div>
            <h3>Connecting a real camera?</h3>
            <p>
              Run <code>npm install</code> and <code>npm run dev</code> from this repository on a
              computer connected to your drone’s Wi-Fi. The included local gateway safely forwards
              the camera’s status, JPEG, and MJPEG endpoints.
            </p>
            <p>
              The published site screens uploaded photos without a server. To use live hardware from
              GitHub Pages, configure a gateway on the camera network with HTTPS, an access key, and
              this site’s allowed origin. Enter its URL and key in Settings. The repository README
              has the setup instructions.
            </p>
          </div>
        </div>
      </div>
      <div className="modal-footer">
        <span className="modal-footer-note">
          <ShieldCheck size={14} />
          Care begins with a closer look.
        </span>
        <button className="button button-primary" onClick={() => setModal(null)}>
          Got it <Check size={16} />
        </button>
      </div>
    </Modal>
  );
}

function SearchDialog({ onNavigate }: { onNavigate: (page: Page) => void }) {
  const { setModal, scans, setSelectedScan } = useFarm();
  const [query, setQuery] = useState('');
  const items = [
    {
      page: 'overview' as Page,
      title: 'Farm overview',
      description: 'Your farm at a glance',
      Icon: Sprout,
    },
    {
      page: 'camera' as Page,
      title: 'Live camera',
      description: 'A closer look at your plants',
      Icon: Camera,
    },
    {
      page: 'history' as Page,
      title: 'Scan history',
      description: 'All your saved screenings',
      Icon: Leaf,
    },
    { page: 'devices' as Page, title: 'Devices', description: 'Manage your ESP32-CAM', Icon: Cpu },
    {
      page: 'guide' as Page,
      title: 'Field guide',
      description: 'A little care, a healthier harvest',
      Icon: BookOpen,
    },
  ].filter((item) =>
    `${item.title} ${item.description}`.toLowerCase().includes(query.toLowerCase()),
  );
  const matches = query.trim()
    ? scans.filter((scan) => scan.label.toLowerCase().includes(query.toLowerCase())).slice(0, 4)
    : [];
  return (
    <Modal title="Find your way around." eyebrow="YOUR WORKSPACE" onClose={() => setModal(null)}>
      <div className="modal-body">
        <label className="search-field search-dialog-input">
          <Search size={18} />
          <input
            data-autofocus
            autoFocus
            placeholder="Search pages or scan conditions…"
            aria-label="Search workspace"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="search-results">
          {items.map(({ page, title, description, Icon }) => (
            <button
              key={page}
              onClick={() => {
                onNavigate(page);
                setModal(null);
              }}
            >
              <span>
                <Icon size={20} />
              </span>
              <div>
                <strong>{title}</strong>
                <small>{description}</small>
              </div>
              <ArrowRight size={15} />
            </button>
          ))}
          {matches.map((scan) => (
            <button
              key={scan.id}
              onClick={() => {
                setModal(null);
                setSelectedScan(scan);
              }}
            >
              <span>
                <Leaf size={20} />
              </span>
              <div>
                <strong>{scan.label}</strong>
                <small>
                  {scan.source === 'demo' ? 'Sample scan' : 'Saved scan'} ·{' '}
                  {formatTime(scan.timestamp)}
                </small>
              </div>
              <ChevronRight size={15} />
            </button>
          ))}
          {!items.length && !matches.length && (
            <div className="search-empty">
              <CircleHelp size={26} />
              <p>No matches yet. Try “camera”, “healthy”, or “guide”.</p>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
