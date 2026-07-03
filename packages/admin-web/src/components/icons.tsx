import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

const baseProps: IconProps = {
  width: 20,
  height: 20,
  viewBox: '0 0 20 20',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': 'true',
};

export function IconDashboard(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <rect x="3" y="3" width="6.5" height="6.5" rx="1.4" />
      <rect x="10.5" y="3" width="6.5" height="9.5" rx="1.4" />
      <rect x="3" y="11" width="6.5" height="6" rx="1.4" />
      <rect x="10.5" y="14.5" width="6.5" height="2.5" rx="1.2" />
    </svg>
  );
}

export function IconLots(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <rect x="3" y="4" width="14" height="12" rx="1.6" />
      <path d="M7 4v12M13 4v12M3 10h14" />
    </svg>
  );
}

export function IconReservations(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <rect x="3.5" y="3.5" width="13" height="13" rx="1.6" />
      <path d="M3.5 7.5h13M6.5 2v3M13.5 2v3" />
      <path d="M6.5 11h2M6.5 13.5h4" />
    </svg>
  );
}

export function IconCustomers(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <circle cx="7.5" cy="7" r="2.75" />
      <path d="M2.5 17c0-2.9 2.24-5 5-5s5 2.1 5 5" />
      <circle cx="14.5" cy="6.5" r="2.1" />
      <path d="M12.6 8.75c.53-.28 1.15-.45 1.9-.45 2.3 0 4 1.75 4 4.4" />
    </svg>
  );
}

export function IconAnalytics(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M3 17V9M8.5 17V3M14 17v-6M17.5 17H2.5" strokeLinecap="round" />
    </svg>
  );
}

export function IconLogout(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M8 3H4.5A1.5 1.5 0 0 0 3 4.5v11A1.5 1.5 0 0 0 4.5 17H8" />
      <path d="M13 13.5 17 10l-4-3.5" />
      <path d="M17 10H7.5" />
    </svg>
  );
}
