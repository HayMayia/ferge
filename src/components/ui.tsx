import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { Check, Leaf, X } from 'lucide-react';
import { CONDITIONS } from '../lib/screening';
import type { Condition, Screening } from '../lib/screening';

export function Brand({ small = false }: { small?: boolean }) {
  return (
    <div className={`brand ${small ? 'brand-small' : ''}`}>
      <span className="brand-symbol">
        <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
          <path
            d="M16 25V15m0 5C9 20 7.5 15.5 8 10c6.5 0 9.5 4 8 10Zm0-4c0-5.5 3.5-8 9-8 .5 6-2.5 10-9 10"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      {!small && (
        <span>
          smartfarm<span className="brand-period">.</span>
        </span>
      )}
    </div>
  );
}

export function ConditionBadge({ cls, compact = false }: { cls: Condition; compact?: boolean }) {
  return (
    <span className={`condition-badge tone-${CONDITIONS[cls].tone}`}>
      {cls === 1 ? <Check size={11} strokeWidth={2.5} /> : <span className="tiny-dot" />}
      {compact ? CONDITIONS[cls].short : CONDITIONS[cls].label}
    </span>
  );
}

export function Composition({
  status,
  showLegend = true,
  compact = false,
}: {
  status: Screening;
  showLegend?: boolean;
  compact?: boolean;
}) {
  return (
    <div className={`composition ${compact ? 'composition-compact' : ''}`}>
      <div
        className="composition-bar"
        role="img"
        aria-label={`Green ${status.green.toFixed(1)}%, yellow ${status.yellow.toFixed(1)}%, brown ${status.brown.toFixed(1)}%`}
      >
        <span className="bar-green" style={{ width: `${status.green}%` }} />
        <span className="bar-yellow" style={{ width: `${status.yellow}%` }} />
        <span className="bar-brown" style={{ width: `${status.brown}%` }} />
      </div>
      {showLegend && (
        <div className="composition-legend">
          {[
            ['Green', status.green, 'green'],
            ['Yellow', status.yellow, 'yellow'],
            ['Brown', status.brown, 'brown'],
          ].map(([label, value, color]) => (
            <div key={label} className="legend-item">
              <span className={`legend-dot dot-${color}`} />
              <span>{label}</span>
              <strong>
                {Number(value).toFixed(1)}
                <span>%</span>
              </strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Modal({
  title,
  eyebrow,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const first =
      panel.current?.querySelector<HTMLElement>('[data-autofocus]') ||
      panel.current?.querySelector<HTMLElement>('input, button, select, textarea, [tabindex="0"]');
    first?.focus();
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') closeRef.current();
      if (event.key === 'Tab') {
        const elements = Array.from(
          panel.current?.querySelectorAll<HTMLElement>(
            'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]',
          ) || [],
        ).filter((el) => el.getClientRects().length > 0);
        const firstEl = elements[0],
          lastEl = elements[elements.length - 1];
        if (!firstEl) {
          event.preventDefault();
          return;
        }
        if (event.shiftKey && document.activeElement === firstEl) {
          event.preventDefault();
          lastEl.focus();
        } else if (!event.shiftKey && document.activeElement === lastEl) {
          event.preventDefault();
          firstEl.focus();
        }
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = oldOverflow;
      document.removeEventListener('keydown', handleKey);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={`modal ${wide ? 'modal-wide' : ''}`}
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="modal-header">
          <div>
            {eyebrow && <span className="eyebrow">{eyebrow}</span>}
            <h2 id={titleId}>{title}</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close dialog">
            <X size={20} />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Leaf size={28} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {children}
    </div>
  );
}

export function Sparkline({
  color = '#608366',
  variant = 0,
}: {
  color?: string;
  variant?: number;
}) {
  return (
    <svg className="sparkline" viewBox="0 0 100 35" fill="none" aria-hidden="true">
      <path
        d={
          variant === 0
            ? 'M1 29L10 25L18 27L26 18L35 22L44 13L53 16L62 11L71 14L80 5L89 8L99 3'
            : 'M1 28L10 26L20 27L30 18L40 20L50 11L60 13L70 9L80 11L90 6L99 7'
        }
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
