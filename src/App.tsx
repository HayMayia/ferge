import { useEffect, useRef, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowRight,
  Bell,
  BookOpen,
  CalendarDays,
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Command,
  Cpu,
  FlaskConical,
  Home,
  LayoutGrid,
  Leaf,
  Menu,
  Plus,
  ScanLine,
  Search,
  Settings2,
  ShieldCheck,
  Sprout,
  X,
} from 'lucide-react';
import { FarmProvider, useFarm } from './context/FarmContext';
import { CameraPage, Overview } from './components/Dashboard';
import { DevicesPage, GuidePage, HistoryPage } from './components/Pages';
import { Dialogs } from './components/Dialogs';
import { Brand } from './components/ui';
import { downloadCsv } from './lib/screening';
import type { Page } from './lib/screening';

const PAGES: Record<Page, { title: string; subtitle: string }> = {
  overview: { title: 'Farm overview', subtitle: 'A little insight. A healthier harvest.' },
  camera: { title: 'Live camera', subtitle: 'A closer look at what’s growing.' },
  history: { title: 'Scan history', subtitle: 'The story of your plants, one leaf at a time.' },
  devices: { title: 'Your devices', subtitle: 'Good connections make for better growing.' },
  guide: { title: 'Field guide', subtitle: 'A little care goes a long way.' },
};
function pageFromHash(): Page {
  const hash = window.location.hash.replace('#', '') as Page;
  return Object.hasOwn(PAGES, hash) ? hash : 'overview';
}

export default function App() {
  return (
    <FarmProvider>
      <Workspace />
    </FarmProvider>
  );
}

function Workspace() {
  const [page, setPage] = useState<Page>(pageFromHash);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 768px)').matches);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 768px)');
    const update = () => setMobile(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  const { isDemo, setModal, scans, notify, toast } = useFarm();
  const onNavigate = (next: Page) => {
    setPage(next);
    window.location.hash = next;
    setMobileOpen(false);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  useEffect(() => {
    const onHash = () => setPage(pageFromHash());
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault();
        setModal('search');
      }
    };
    window.addEventListener('hashchange', onHash);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('keydown', onKey);
    };
  }, [setModal]);
  useEffect(() => {
    document.title = `${PAGES[page].title} — Smartfarm`;
  }, [page]);
  return (
    <div className="app-shell">
      <a
        href="#main-content"
        className="skip-link"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById('main-content')?.focus();
        }}
      >
        Skip to content
      </a>
      {mobileOpen && <div className="sidebar-scrim" onClick={() => setMobileOpen(false)} />}
      <Sidebar
        page={page}
        onNavigate={onNavigate}
        open={mobileOpen}
        mobile={mobile}
        close={() => setMobileOpen(false)}
      />
      <div className="workspace" inert={mobile && mobileOpen}>
        <Topbar page={page} onMenu={() => setMobileOpen(!mobileOpen)} />
        <main id="main-content" tabIndex={-1}>
          <header className="page-heading">
            <div>
              <div className="page-eyebrow">
                <span />
                GROW WITH CONFIDENCE
              </div>
              <h1>{PAGES[page].title}</h1>
              <p>{PAGES[page].subtitle}</p>
            </div>
            <div className="page-heading-actions">
              {isDemo && (
                <button
                  className="demo-pill"
                  onClick={() => setModal('settings')}
                  title="Switch to a real camera"
                >
                  <FlaskConical size={13} />
                  <span>Demo mode</span>
                </button>
              )}
              {page === 'overview' && (
                <button
                  className="button button-outline export-report"
                  disabled={!scans.length}
                  onClick={() => {
                    downloadCsv(scans);
                    notify('Your farm report has been exported as CSV.');
                  }}
                >
                  <ArrowDownToLine size={15} />
                  <span>Export report</span>
                </button>
              )}
              <button className="button button-primary" onClick={() => setModal('scan')}>
                <Plus size={17} />
                <span>New scan</span>
              </button>
            </div>
          </header>
          {page === 'overview' && <Overview onNavigate={onNavigate} />}
          {page === 'camera' && <CameraPage />}
          {page === 'history' && <HistoryPage onNavigate={onNavigate} />}
          {page === 'devices' && <DevicesPage />}
          {page === 'guide' && <GuidePage />}
        </main>
      </div>
      <Dialogs onNavigate={onNavigate} />
      {toast && (
        <div className="toast" role="status">
          <span>
            <Check size={15} />
          </span>
          <p>{toast}</p>
        </div>
      )}
    </div>
  );
}

function Sidebar({
  page,
  onNavigate,
  open,
  close,
  mobile,
}: {
  page: Page;
  onNavigate: (page: Page) => void;
  open: boolean;
  close: () => void;
  mobile: boolean;
}) {
  const { setModal, isDemo, connected, preferences } = useFarm();
  const sidebar = useRef<HTMLElement>(null);
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (!mobile || !open) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    sidebar.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current();
      if (event.key === 'Tab') {
        const buttons = Array.from(
          sidebar.current?.querySelectorAll<HTMLButtonElement>('button') || [],
        ).filter((button) => button.getClientRects().length > 0);
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
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', onKey);
      previous?.focus();
    };
  }, [mobile, open]);
  const openSettings = () => {
    close();
    setModal('settings');
  };
  const openHelp = () => {
    close();
    setModal('help');
  };
  const primary = [
    { page: 'overview' as Page, label: 'Overview', Icon: LayoutGrid },
    { page: 'camera' as Page, label: 'Live camera', Icon: Camera },
    { page: 'history' as Page, label: 'Scan history', Icon: ScanLine },
  ];
  const secondary = [
    { page: 'devices' as Page, label: 'Devices', Icon: Cpu },
    { page: 'guide' as Page, label: 'Field guide', Icon: BookOpen },
  ];
  return (
    <aside
      className={`sidebar ${open ? 'sidebar-open' : ''}`}
      aria-label="Main navigation"
      ref={sidebar}
      inert={mobile && !open}
      aria-hidden={mobile && !open ? true : undefined}
    >
      <div className="sidebar-brand">
        <button
          className="brand-button"
          onClick={() => onNavigate('overview')}
          aria-label="Smartfarm home"
        >
          <Brand />
        </button>
        <button className="icon-button mobile-close" onClick={close} aria-label="Close navigation">
          <X size={19} />
        </button>
      </div>
      <button className="farm-switcher" onClick={openSettings}>
        <span className="farm-switcher-icon">
          <Sprout size={19} strokeWidth={1.6} />
        </span>
        <span>
          <strong>My farm</strong>
          <small>{preferences.location}</small>
        </span>
        <ChevronDown size={13} />
      </button>
      <nav>
        <div className="nav-label">WORKSPACE</div>
        {primary.map(({ page: next, label, Icon }) => (
          <button
            key={next}
            onClick={() => onNavigate(next)}
            className={`nav-item ${page === next ? 'nav-active' : ''}`}
            aria-current={page === next ? 'page' : undefined}
          >
            <Icon size={18} strokeWidth={1.7} />
            <span>{label}</span>
            {next === 'camera' && (
              <span className={`nav-live-dot ${isDemo || connected ? 'live' : ''}`} />
            )}
          </button>
        ))}
        <div className="nav-divider" />
        <div className="nav-label">MANAGE & LEARN</div>
        {secondary.map(({ page: next, label, Icon }) => (
          <button
            key={next}
            onClick={() => onNavigate(next)}
            className={`nav-item ${page === next ? 'nav-active' : ''}`}
            aria-current={page === next ? 'page' : undefined}
          >
            <Icon size={18} strokeWidth={1.7} />
            <span>{label}</span>
            {next === 'devices' && (
              <span className="nav-count">{isDemo || preferences.host ? '01' : '00'}</span>
            )}
          </button>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <div className="sidebar-care-card">
          <div className="care-card-art" aria-hidden="true">
            <svg viewBox="0 0 100 73" fill="none">
              <path d="M54 72c-1-26 3-44 10-61" stroke="#75906b" strokeWidth="2" />
              <path d="M58 44C34 47 23 31 24 15c24-2 38 11 34 29Z" fill="#a9bc93" />
              <path d="M58 44 32 22" stroke="#edf1de" strokeWidth="1.2" />
              <path d="M58 57c22 1 35-11 37-28-24-3-38 9-37 28Z" fill="#64845d" />
              <path d="m58 57 28-22" stroke="#c1d0b2" strokeWidth="1.2" />
              <path d="M64 21C60 9 67 2 78 1c4 12-1 20-14 20Z" fill="#466c49" />
              <circle cx="16" cy="51" r="3" fill="#d5b995" />
            </svg>
          </div>
          <span className="care-card-eyebrow">A LITTLE CARE, A LOT OF GROWTH</span>
          <h3>
            Healthier leaves.
            <br />
            Happier harvests.
          </h3>
          <button onClick={() => onNavigate('guide')}>
            Explore the field guide <ArrowRight size={14} />
          </button>
        </div>
        <button className="nav-item" onClick={openSettings}>
          <Settings2 size={18} strokeWidth={1.7} />
          <span>Settings</span>
        </button>
        <button className="nav-item" onClick={openHelp}>
          <CircleHelp size={18} strokeWidth={1.7} />
          <span>Help & getting started</span>
          <span className="help-shortcut">?</span>
        </button>
        <div className="sidebar-status">
          <span className={`status-dot ${isDemo || connected ? 'online' : ''}`} />
          <span>
            {isDemo
              ? 'Growing in demo mode'
              : connected
                ? 'Camera connected'
                : 'Camera not connected'}
          </span>
        </div>
        <div className="sidebar-copyright">Thoughtfully built for growing.</div>
      </div>
    </aside>
  );
}

function Topbar({ page, onMenu }: { page: Page; onMenu: () => void }) {
  const { setModal, isDemo, connected } = useFarm();
  const [popover, setPopover] = useState<'notifications' | 'profile' | null>(null);
  const [unread, setUnread] = useState(true);
  const popoverRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!popover) return;
    const onClick = (event: MouseEvent) => {
      if (!popoverRef.current?.contains(event.target as Node)) setPopover(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPopover(null);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [popover]);
  return (
    <header className="topbar">
      <div className="breadcrumb">
        <button className="icon-button mobile-menu" onClick={onMenu} aria-label="Open navigation">
          <Menu size={20} />
        </button>
        <Home size={14} />
        <ChevronRight size={12} />
        <span>Workspace</span>
        <ChevronRight size={12} />
        <strong>{PAGES[page].title}</strong>
      </div>
      <div className="topbar-right">
        <button className="topbar-search" onClick={() => setModal('search')} title="Quick search">
          <Search size={17} />
          <span>Quick search</span>
          <kbd>
            <Command size={10} />K
          </kbd>
        </button>
        <span className="topbar-date">
          <CalendarDays size={15} />
          {new Date().toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </span>
        <div className="topbar-divider" />
        <div className="topbar-popovers" ref={popoverRef}>
          <button
            className="notification-button icon-button"
            title="Notifications"
            aria-label="Notifications"
            aria-expanded={popover === 'notifications'}
            onClick={() => {
              setPopover(popover === 'notifications' ? null : 'notifications');
              setUnread(false);
            }}
          >
            <Bell size={19} strokeWidth={1.6} />
            {unread && <span />}
          </button>
          <button
            className="profile-button"
            aria-label="SF workspace profile"
            aria-expanded={popover === 'profile'}
            onClick={() => setPopover(popover === 'profile' ? null : 'profile')}
          >
            <span className="avatar">
              SF
              <span />
            </span>
            <ChevronDown size={12} />
          </button>
          {popover === 'notifications' && (
            <div className="topbar-popover notifications-popover">
              <div className="popover-title">
                <h3>A little update</h3>
                <span className="micro-badge green-badge">All caught up</span>
              </div>
              <div className="notification-item">
                <span>
                  <Leaf size={19} />
                </span>
                <div>
                  <strong>
                    {isDemo ? 'Welcome to your growing space.' : 'Your farm, in focus.'}
                  </strong>
                  <p>
                    {isDemo
                      ? 'You’re exploring a demo. Connect a camera whenever you’re ready.'
                      : connected
                        ? 'Your camera readings refresh automatically. Captures are saved only when you choose.'
                        : 'Upload a real leaf photo to start screening. No camera is connected and no readings are simulated.'}
                  </p>
                </div>
              </div>
              <button
                className="notification-item notification-action"
                onClick={() => {
                  setPopover(null);
                  setModal('help');
                }}
              >
                <span>
                  <ShieldCheck size={18} />
                </span>
                <div>
                  <strong>A screening, not a diagnosis.</strong>
                  <p>Learn what the colours can — and can’t — tell you.</p>
                </div>
                <ArrowRight size={15} />
              </button>
            </div>
          )}
          {popover === 'profile' && (
            <div className="topbar-popover profile-popover">
              <span className="eyebrow">YOUR LOCAL WORKSPACE</span>
              <h3>Hi, fellow grower.</h3>
              <p>No account needed. Just you and your plants.</p>
              <button
                onClick={() => {
                  setPopover(null);
                  setModal('settings');
                }}
              >
                <Settings2 size={16} />
                Workspace settings
                <ChevronRight size={14} />
              </button>
              <button
                onClick={() => {
                  setPopover(null);
                  setModal('help');
                }}
              >
                <CircleHelp size={16} />
                Help & getting started
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
