import React from 'react';

/**
 * Exact SVG from logos/main-logo.svg
 * Geometric S Logo Mark for SolarSeeker
 */
export function MainLogo({ className = 'w-6 h-6', ...props }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 539.23 486.64"
      fill="none"
      className={className}
      aria-hidden="true"
      {...props}
    >
      {/* Top Chevron (Upper-Left Main Body) */}
      <path
        d="M 203.74 0 L 365.05 0 L 165.13 199.93 L 261.24 296.04 L 139.54 296.04 L 23.62 180.12 Z"
        fill="currentColor"
      />
      {/* Upper-Right Parallelogram */}
      <path
        d="M 400.26 0 L 539.23 0 L 408.99 130.24 L 270.02 130.24 Z"
        fill="currentColor"
      />
      {/* Bottom Chevron (Lower-Right Main Body) */}
      <path
        d="M 335.49 486.64 L 174.18 486.64 L 374.10 286.71 L 277.99 190.60 L 399.69 190.60 L 515.61 306.52 Z"
        fill="currentColor"
      />
      {/* Lower-Left Parallelogram */}
      <path
        d="M 138.97 486.64 L 0 486.64 L 130.24 356.40 L 269.21 356.40 Z"
        fill="currentColor"
      />
    </svg>
  );
}

/**
 * Exact SVG from logos/phoebe-logo.svg
 * Interlocking Monogram Logo for Phoebe AI HEMS
 */
export function PhoebeLogo({ className = 'w-4 h-4', ...props }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 92 70"
      fill="none"
      className={className}
      aria-hidden="true"
      {...props}
    >
      {/* Top-left hook */}
      <path
        d="M 60 0 H 36 A 36 36 0 0 0 0 36 V 58 H 18 V 36 A 18 18 0 0 1 36 18 H 60 Z"
        fill="currentColor"
      />
      {/* Center horizontal bar */}
      <rect x="32" y="32" width="28" height="6" fill="currentColor" />
      {/* Bottom-right hook */}
      <path
        d="M 32 70 H 56 A 36 36 0 0 0 92 34 V 12 H 74 V 34 A 18 18 0 0 1 56 52 H 32 Z"
        fill="currentColor"
      />
    </svg>
  );
}
