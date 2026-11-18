import { useMemo, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowRight,
  BookOpen,
  Bug,
  CalendarDays,
  Check,
  CheckCheck,
  CircleDot,
  Code2,
  Cpu,
  Droplets,
  EthernetPort,
  FlaskConical,
  Info,
  Leaf,
  Search,
  ShieldCheck,
  Sprout,
  Wifi,
} from 'lucide-react';
import { useFarm } from '../context/FarmContext';
import { CONDITIONS, downloadCsv } from '../lib/screening';
import type { Condition, Page } from '../lib/screening';
import { RecentScans } from './Dashboard';
import { ConditionBadge, EmptyState } from './ui';

export function HistoryPage({ onNavigate }: { onNavigate: (page: Page) => void }) {
  const { scans, notify, isDemo } = useFarm();
  const [query, setQuery] = useState('');
  const [condition, setCondition] = useState('all');
  const [date, setDate] = useState('all');
  const filtered = useMemo(
    () =>
      scans.filter(
        (scan) =>
          (condition === 'all' || scan.cls === Number(condition)) &&
          (date === 'all' ||
            new Date(scan.timestamp).toDateString() === new Date().toDateString()) &&
          `${scan.label} ${scan.source} ${scan.source === 'demo' ? 'Tomato leaf Demo scan' : scan.source === 'upload' ? 'Uploaded leaf Photo upload' : 'Camera leaf ESP32-CAM'} ${new Date(scan.timestamp).toLocaleString()}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      ),
    [scans, query, condition, date],
  );
  const healthy = scans.filter((scan) => scan.cls === 1).length;
  const attention = scans.filter((scan) => scan.cls > 1).length;
  return (
    <>
      <div className="history-summary">
        <div className="history-summary-copy">
          <span className="history-icon">
            <Sprout size={27} />
          </span>
          <div>
            <h2>Every leaf tells a story.</h2>
            <p>Keep track of the little changes that make a big difference.</p>
          </div>
        </div>
        <div className="history-number">
          <strong>{scans.length}</strong>
          <span>Total scans</span>
        </div>
        <div className="history-number">
          <strong className="text-green">{healthy}</strong>
          <span>Looking healthy</span>
        </div>
        <div className="history-number">
          <strong className="text-yellow">{attention}</strong>
          <span>Need a closer look</span>
        </div>
      </div>
      <div className="history-toolbar">
        <label className="search-field">
          <Search size={17} />
          <input
            aria-label="Search scans"
            placeholder="Search your scans…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="history-filters">
          <select
            aria-label="Filter by condition"
            value={condition}
            onChange={(event) => setCondition(event.target.value)}
          >
            <option value="all">All conditions</option>
            {Object.entries(CONDITIONS).map(([id, item]) => (
              <option key={id} value={id}>
                {item.short}
              </option>
            ))}
          </select>
          <label className="date-select">
            <CalendarDays size={15} />
            <select
              aria-label="Filter scan date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            >
              <option value="all">All time</option>
              <option value="today">Today</option>
            </select>
          </label>
          <button
            className="button button-outline"
            disabled={!filtered.length}
            onClick={() => {
              downloadCsv(filtered);
              notify(`${filtered.length} scan${filtered.length === 1 ? '' : 's'} exported as CSV.`);
            }}
          >
            <ArrowDownToLine size={15} />
            Export CSV
          </button>
        </div>
      </div>
      {!filtered.length && scans.length > 0 ? (
        <section className="card">
          <EmptyState
            title="No scans match just yet."
            description="Try another search, or clear your filters to see all your leaves."
          >
            <button
              className="button button-outline"
              onClick={() => {
                setQuery('');
                setCondition('all');
                setDate('all');
              }}
            >
              Clear filters
            </button>
          </EmptyState>
        </section>
      ) : (
        <RecentScans full scans={filtered} onNavigate={onNavigate} />
      )}
      <div className="history-footnote">
        <span>
          <ShieldCheck size={14} />
          Photos and scan history stay in this browser.
        </span>
        <span>
          {filtered.length} of {scans.length} scans {isDemo && '· Includes demo examples'}
        </span>
      </div>
      <p className="quiet-note">
        Only captured frames and uploaded photos are saved. Continuous live readings are not added
        to your history.
      </p>
    </>
  );
}

export function DevicesPage() {
  const { preferences, isDemo, connected, connecting, error, setModal, useDemo } = useFarm();
  const online = isDemo || connected;
  return (
    <>
      {!isDemo && error && (
        <div className="alert alert-warning">
          <Info size={18} />
          <div>
            <strong>Your camera needs a little attention.</strong>
            <p>{error}</p>
          </div>
        </div>
      )}
      <div className="devices-grid">
        <section className="card device-primary">
          <div className="card-heading">
            <h2>Your connected camera</h2>
            <span className={`device-online ${online ? '' : 'device-offline'}`}>
              <span />
              {isDemo
                ? 'Demo device'
                : connecting
                  ? 'Connecting'
                  : connected
                    ? 'Online'
                    : 'Offline'}
            </span>
          </div>
          <div className="device-illustration">
            <div className="circuit-lines">
              <i />
              <i />
              <i />
              <i />
            </div>
            <div className="illustrated-board">
              <span className="board-dot" />
              <div className="board-lens">
                <i />
                <span />
              </div>
              <div className="board-label">ESP32-CAM</div>
              <Cpu size={25} />
            </div>
            <span className="device-illustration-tag">
              <Wifi size={13} />
              {isDemo ? 'SAMPLE DEVICE' : preferences.host}
            </span>
          </div>
          <div className="device-primary-info">
            <div>
              <span className="eyebrow">CAMERA 01</span>
              <h2>{preferences.name}</h2>
              <p>AI Thinker ESP32-CAM · {preferences.location}</p>
            </div>
            <button className="button button-primary" onClick={() => setModal('settings')}>
              <EthernetPort size={16} />
              Configure camera
            </button>
          </div>
          <div className="device-specs">
            <div>
              <span>Camera address</span>
              <strong>{isDemo ? 'Demo mode' : preferences.host}</strong>
            </div>
            <div>
              <span>Frame resolution</span>
              <strong>320 × 240 px</strong>
            </div>
            <div>
              <span>Screening interval</span>
              <strong>3 seconds</strong>
            </div>
            <div>
              <span>Connection</span>
              <strong>Wi-Fi · Station mode</strong>
            </div>
          </div>
        </section>
        <section className="card setup-card">
          <div className="card-heading">
            <h2>A few steps to a live view</h2>
            <Wifi size={17} />
          </div>
          <ol className="setup-steps">
            <li>
              <span>1</span>
              <div>
                <h3>Join your farm’s Wi-Fi</h3>
                <p>
                  Connect the computer running this dashboard to <code>F450-ESP32-DRONE</code>, the
                  same access point as the camera.
                </p>
              </div>
            </li>
            <li>
              <span>2</span>
              <div>
                <h3>Find the camera’s IP address</h3>
                <p>
                  Open the Arduino Serial Monitor at 115200 baud after resetting your ESP32-CAM.
                  Look for “Open http://…”.
                </p>
              </div>
            </li>
            <li>
              <span>3</span>
              <div>
                <h3>Make the connection</h3>
                <p>
                  Open camera settings, select ESP32-CAM, enter its address, and connect. Your live
                  view will be ready.
                </p>
              </div>
            </li>
          </ol>
          <div className="setup-note">
            <FlaskConical size={19} />
            <p>
              No hardware handy?{' '}
              {isDemo
                ? 'You’re exploring a demo workspace.'
                : 'You can explore a sample workspace instead.'}
            </p>
            {!isDemo && (
              <button className="text-button" onClick={() => useDemo()}>
                Try demo <ArrowRight size={14} />
              </button>
            )}
          </div>
        </section>
      </div>
      <section className="card endpoints-card">
        <div className="card-heading">
          <div className="heading-group">
            <Code2 size={18} />
            <h2>Built for your firmware</h2>
          </div>
          <span className="subtle-tag">NO FIRMWARE CHANGES</span>
        </div>
        <div className="endpoint-grid">
          <div>
            <span className="endpoint-icon">
              <CheckCheck size={20} />
            </span>
            <div>
              <code>GET /status</code>
              <h3>Fresh screening results</h3>
              <p>
                Condition, colour composition, and a recommended next step. Refreshed every 3
                seconds.
              </p>
              <span>Port 80 · JSON</span>
            </div>
          </div>
          <div>
            <span className="endpoint-icon">
              <CircleDot size={20} />
            </span>
            <div>
              <code>GET /jpg</code>
              <h3>A moment worth saving</h3>
              <p>
                Capture a single JPEG, save it to your scan history, or download it for a closer
                look.
              </p>
              <span>Port 80 · JPEG</span>
            </div>
          </div>
          <div>
            <span className="endpoint-icon">
              <Wifi size={20} />
            </span>
            <div>
              <code>GET /stream</code>
              <h3>Your live eyes in the field</h3>
              <p>
                A continuous MJPEG camera view, with pause and framing controls in your dashboard.
              </p>
              <span>Port 81 · MJPEG</span>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

export function GuidePage() {
  const { setModal } = useFarm();
  const [active, setActive] = useState<Condition | null>(null);
  const icons = { 1: Sprout, 2: Droplets, 3: CircleDot, 4: Bug };
  return (
    <>
      <section className="guide-intro">
        <div>
          <span className="eyebrow">A LITTLE KNOW-HOW GOES A LONG WAY</span>
          <h2>Get to know your greens.</h2>
          <p>
            A practical guide to what the camera sees, what it might mean,
            <br className="desktop-break" /> and how to give your plants a little extra care.
          </p>
          <button className="button button-dark" onClick={() => setModal('scan')}>
            <Leaf size={16} />
            Screen a leaf <ArrowRight size={15} />
          </button>
        </div>
        <div className="botanical-art" aria-hidden="true">
          <span className="botanical-circle" />
          <svg viewBox="0 0 260 240" fill="none">
            <path
              d="M133 231C125 172 137 103 159 45"
              stroke="#456b4c"
              strokeWidth="4"
              strokeLinecap="round"
            />
            <path d="M141 146C82 150 49 114 48 65c61-4 103 24 93 81Z" fill="#507752" />
            <path d="M141 146 66 84" stroke="#bed0a8" strokeWidth="2" />
            <path d="M137 182c56 5 90-22 99-66-53-13-98 6-99 66Z" fill="#7a965d" />
            <path d="m137 182 79-53" stroke="#d0dcaf" strokeWidth="2" />
            <path d="M154 80c-12-37 5-63 40-74 23 34 3 65-40 74Z" fill="#365b40" />
            <path d="m154 80 34-60" stroke="#a6bf8c" strokeWidth="2" />
            <path d="M129 222c-50-2-76-31-77-66 47-7 81 15 77 66Z" fill="#a1b27a" />
            <path d="m129 222-59-49" stroke="#eff0c3" strokeWidth="2" />
            <circle cx="213" cy="53" r="8" fill="#ed9561" />
            <circle cx="58" cy="207" r="4" fill="#ed9561" />
          </svg>
        </div>
      </section>
      <div className="guide-filter">
        <span>Explore conditions</span>
        <div>
          <button
            className={`filter-chip ${active === null ? 'active' : ''}`}
            onClick={() => setActive(null)}
          >
            All conditions
          </button>
          {([1, 2, 3, 4] as Condition[]).map((cls) => (
            <button
              key={cls}
              className={`filter-chip ${active === cls ? 'active' : ''}`}
              onClick={() => setActive(cls)}
            >
              {CONDITIONS[cls].short}
            </button>
          ))}
        </div>
      </div>
      <div className="guide-grid">
        {([1, 2, 3, 4] as const)
          .filter((cls) => active === null || active === cls)
          .map((cls) => {
            const item = CONDITIONS[cls],
              Icon = icons[cls];
            return (
              <article className="card guide-card" key={cls}>
                <div className={`guide-card-top tone-${item.tone}`}>
                  <span>
                    <Icon size={30} strokeWidth={1.5} />
                  </span>
                  <ConditionBadge cls={cls} compact />
                </div>
                <div className="guide-card-body">
                  <h3>
                    {cls === 1
                      ? 'Keep the good growth going.'
                      : cls === 2
                        ? 'When green turns yellow.'
                        : cls === 3
                          ? 'The story behind the spots.'
                          : 'A closer look at the little things.'}
                  </h3>
                  <p>{item.detail}</p>
                  <div className="guide-action">
                    <span className="eyebrow">
                      {cls === 1 ? 'YOUR EVERYDAY CARE' : 'WHAT YOU CAN DO'}
                    </span>
                    <p>
                      {cls === 1
                        ? 'Keep a consistent watering routine, provide good drainage, and check both sides of the leaves regularly.'
                        : item.solution}
                    </p>
                  </div>
                  <span className="guide-method">
                    <Check size={13} />
                    {cls === 1
                      ? 'Colour-based observation'
                      : cls === 2
                        ? 'Yellow share > 25% of leaf pixels'
                        : cls === 3
                          ? 'Brown share > 12% of leaf pixels'
                          : 'Dark pixels · not a pest diagnosis'}
                  </span>
                </div>
              </article>
            );
          })}
      </div>
      <div className="guide-disclaimer">
        <span>
          <BookOpen size={23} />
        </span>
        <div>
          <h3>A starting point, not a final answer.</h3>
          <p>
            This tool screens colours, not diseases. Lighting, shadows, and backgrounds can affect
            results. Confirm any concerns by eye, and speak with a local agronomist before treating
            a plant.
          </p>
        </div>
        <button className="text-button" onClick={() => setModal('help')}>
          How it works <ArrowRight size={15} />
        </button>
      </div>
    </>
  );
}
