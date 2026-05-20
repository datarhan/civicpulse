const common = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
}

export const Ic = {
  home: (p) => (
    <svg {...p} viewBox="0 0 20 20" {...common}>
      <path d="M3 9l7-5 7 5v8a1 1 0 0 1-1 1h-4v-5H8v5H4a1 1 0 0 1-1-1V9z" />
    </svg>
  ),
  warn: (p) => (
    <svg {...p} viewBox="0 0 20 20" {...common}>
      <path d="M10 6v5M10 14h0" />
      <circle cx="10" cy="10" r="7.5" />
    </svg>
  ),
  people: (p) => (
    <svg {...p} viewBox="0 0 20 20" {...common}>
      <circle cx="7" cy="7.5" r="2.5" />
      <circle cx="14" cy="8" r="2" />
      <path d="M2.5 16c.5-3 2.5-4.5 4.5-4.5s4 1.5 4.5 4.5M13 16c.3-2 1.5-3 3-3" />
    </svg>
  ),
  coin: (p) => (
    <svg {...p} viewBox="0 0 20 20" {...common}>
      <rect x="2.5" y="4.5" width="15" height="11" rx="1.5" />
      <path d="M2.5 8.5h15M5 12.5h3" />
    </svg>
  ),
  scale: (p) => (
    <svg {...p} viewBox="0 0 20 20" {...common}>
      <path d="M10 3v14M5 17h10M4 8l2-4 2 4H4zM12 8l2-4 2 4h-4z" />
    </svg>
  ),
  chart: (p) => (
    <svg {...p} viewBox="0 0 20 20" {...common}>
      <path d="M3 17V5M3 17h14M7 14V9M11 14V6M15 14v-3" />
    </svg>
  ),
  search: (p) => (
    <svg {...p} viewBox="0 0 20 20" {...common}>
      <circle cx="9" cy="9" r="5.5" />
      <path d="m13 13 4 4" />
    </svg>
  ),
  bell: (p) => (
    <svg {...p} viewBox="0 0 20 20" {...common}>
      <path d="M5 14c0-5 1-8 5-8s5 3 5 8l1 2H4l1-2zM8 17a2 2 0 0 0 4 0" />
    </svg>
  ),
  plus: (p) => (
    <svg {...p} viewBox="0 0 20 20" {...common}>
      <path d="M10 4v12M4 10h12" />
    </svg>
  ),
  up: (p) => (
    <svg {...p} viewBox="0 0 10 10" fill="currentColor">
      <path d="M5 2l4 5H1z" />
    </svg>
  ),
  down: (p) => (
    <svg {...p} viewBox="0 0 10 10" fill="currentColor">
      <path d="M5 8L1 3h8z" />
    </svg>
  ),
  cmd: (p) => (
    <svg {...p} viewBox="0 0 20 20" {...common}>
      <path d="M7 4.5a2.5 2.5 0 1 0 0 5h6a2.5 2.5 0 1 0 0-5v11a2.5 2.5 0 1 1-5 0h-1a2.5 2.5 0 1 1 0-5h11a2.5 2.5 0 1 1 0 5" />
    </svg>
  ),
  dot: (p) => (
    <svg {...p} viewBox="0 0 10 10">
      <circle cx="5" cy="5" r="3" fill="currentColor" />
    </svg>
  ),
  arrow: (p) => (
    <svg {...p} viewBox="0 0 20 20" {...common}>
      <path d="M5 10h10m-4-4 4 4-4 4" />
    </svg>
  ),
  filter: (p) => (
    <svg {...p} viewBox="0 0 20 20" {...common}>
      <path d="M3 5h14l-5 6v5l-4-2v-3L3 5z" />
    </svg>
  ),
  more: (p) => (
    <svg {...p} viewBox="0 0 20 20" fill="currentColor">
      <circle cx="5" cy="10" r="1.25" />
      <circle cx="10" cy="10" r="1.25" />
      <circle cx="15" cy="10" r="1.25" />
    </svg>
  ),
  settings: (p) => (
    <svg {...p} viewBox="0 0 20 20" {...common}>
      <circle cx="10" cy="10" r="2.5" />
      <path d="M10 2v2M10 16v2M18 10h-2M4 10H2M15.5 4.5l-1.4 1.4M5.9 14.1l-1.4 1.4M15.5 15.5l-1.4-1.4M5.9 5.9 4.5 4.5" />
    </svg>
  ),
  check: (p) => (
    <svg
      {...p}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m5 10 3 3 7-7" />
    </svg>
  ),
  chevron: (p) => (
    <svg
      {...p}
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m3 5 3-3 3 3M3 7l3 3 3-3" />
    </svg>
  ),
  building: (p) => (
    <svg {...p} viewBox="0 0 20 20" {...common}>
      <path d="M4 17V5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v12M4 17h12M7 8h1M12 8h1M7 11h1M12 11h1M9 17v-3h2v3" />
    </svg>
  ),
  lab: (p) => (
    <svg {...p} viewBox="0 0 20 20" {...common}>
      <path d="M8 3v5L4 16a1 1 0 0 0 .9 1.5h10.2A1 1 0 0 0 16 16l-4-8V3M7 3h6M8 11h4" />
    </svg>
  ),
}
