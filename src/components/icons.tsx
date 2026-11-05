// Small inline SVG icons (no icon pack). 16px, 1.75 stroke, currentColor – they follow the text colour in both themes.
import type { ReactNode } from "react";

function Svg({ children, size = 16 }: { children: ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}

export const IconDashboard = () => (
  <Svg>
    <rect x="3" y="3" width="7" height="9" rx="1.5" />
    <rect x="14" y="3" width="7" height="5" rx="1.5" />
    <rect x="14" y="12" width="7" height="9" rx="1.5" />
    <rect x="3" y="16" width="7" height="5" rx="1.5" />
  </Svg>
);
export const IconPipeline = () => (
  <Svg>
    <rect x="3" y="4" width="5" height="16" rx="1.5" />
    <rect x="10" y="4" width="5" height="11" rx="1.5" />
    <rect x="17" y="4" width="4" height="7" rx="1.5" />
  </Svg>
);
export const IconSync = () => (
  <Svg>
    <path d="M4 8h13l-3-3" />
    <path d="M20 16H7l3 3" />
  </Svg>
);
export const IconIntake = () => (
  <Svg>
    <rect x="3" y="3" width="18" height="18" rx="3" />
    <path d="M12 8v8M8 12h8" />
  </Svg>
);
export const IconSparkle = () => (
  <Svg>
    <path d="M12 3l1.8 4.9L19 9.7l-5.2 1.8L12 16.5l-1.8-5L5 9.7l5.2-1.8z" />
    <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" />
  </Svg>
);
export const IconInbox = ({ size = 20 }: { size?: number }) => (
  <Svg size={size}>
    <path d="M3 13l2.5-7.5A2 2 0 0 1 7.4 4h9.2a2 2 0 0 1 1.9 1.5L21 13" />
    <path d="M3 13v5a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5h-5l-1.5 2h-5L8 13z" />
  </Svg>
);
export const IconActivity = ({ size = 20 }: { size?: number }) => (
  <Svg size={size}>
    <path d="M3 12h4l3-8 4 16 3-8h4" />
  </Svg>
);
export const IconChat = ({ size = 20 }: { size?: number }) => (
  <Svg size={size}>
    <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.4A8 8 0 1 1 21 12z" />
  </Svg>
);

/** RefurbOps mark: a circular "renew" arrow. */
export const LogoMark = () => (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M20 12a8 8 0 0 1-14.3 4.9" />
    <path d="M4 12a8 8 0 0 1 14.3-4.9" />
    <path d="M18.5 3v4.2h-4.2" />
    <path d="M5.5 21v-4.2h4.2" />
  </svg>
);

/** Friendly empty state: icon + title + one-line hint. */
export function EmptyState({ icon, title, hint }: { icon: ReactNode; title: string; hint?: string }) {
  return (
    <div className="empty-state">
      <span className="empty-icon">{icon}</span>
      <span className="empty-title">{title}</span>
      {hint && <span className="empty-hint">{hint}</span>}
    </div>
  );
}
