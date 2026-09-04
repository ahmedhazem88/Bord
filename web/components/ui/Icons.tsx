import { SVGProps } from "react";

/**
 * Minimal inline stroke-icon set (no external icon package) matching the
 * Airbnb-style system's clear, single-weight iconography. Each icon is a
 * simple 24x24 outline; keep additions consistent with this weight (1.75px
 * stroke, round caps).
 */
function Icon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    />
  );
}

export const HomeIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M3 11.5 12 4l9 7.5" />
    <path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9" />
  </Icon>
);

export const CalendarIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <rect x="3.5" y="5" width="17" height="16" rx="2.5" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </Icon>
);

export const ShieldIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M12 3.5 19.5 6.5V11.5C19.5 16.2 16.3 19.9 12 21C7.7 19.9 4.5 16.2 4.5 11.5V6.5L12 3.5Z" />
  </Icon>
);

export const DocumentIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M6.5 3.5h8L19 8v12.5a1 1 0 0 1-1 1h-11.5a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1Z" />
    <path d="M14.5 3.5V8H19" />
  </Icon>
);

export const PeopleIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <circle cx="9" cy="8" r="3" />
    <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
    <circle cx="17.5" cy="9" r="2.5" />
    <path d="M15.5 12.3A5.5 5.5 0 0 1 21.5 18" />
  </Icon>
);

export const SettingsIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 13a7.9 7.9 0 0 0 0-2l2-1.5-2-3.5-2.4 1a8 8 0 0 0-1.7-1L15 3h-4l-.3 2.5a8 8 0 0 0-1.7 1l-2.4-1-2 3.5L6.6 11a7.9 7.9 0 0 0 0 2l-2 1.5 2 3.5 2.4-1a8 8 0 0 0 1.7 1L11 21h4l.3-2.5a8 8 0 0 0 1.7-1l2.4 1 2-3.5Z" />
  </Icon>
);

export const BellIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M6 10a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5h-15S6 14 6 10Z" />
    <path d="M10 19a2 2 0 0 0 4 0" />
  </Icon>
);

export const ChevronDownIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="m6 9 6 6 6-6" />
  </Icon>
);

export const CheckIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />
  </Icon>
);

export const AlertTriangleIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M12 4 22 20H2L12 4Z" />
    <path d="M12 10.5v4M12 17h.01" />
  </Icon>
);

export const ArrowLeftIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </Icon>
);

export const MicIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  </Icon>
);

export const PhoneOffIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M4 4l16 16" />
    <path d="M6.5 10.5c1 2 2 3 4 4l1.5-1.5a1 1 0 0 1 1.1-.2c1 .4 2 .6 3 .7a1 1 0 0 1 .9 1V17a1 1 0 0 1-1.1 1C9.5 17.5 4.5 12.5 4 6.1A1 1 0 0 1 5 5h2.5a1 1 0 0 1 1 .9c.1 1 .3 2 .7 3a1 1 0 0 1-.2 1.1L8 10.5" />
  </Icon>
);

export const UserPlusIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
    <path d="M18.5 8v6M15.5 11h6" />
  </Icon>
);

export const InfoIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5.5M12 7.5h.01" />
  </Icon>
);
