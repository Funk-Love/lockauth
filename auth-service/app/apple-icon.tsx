import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#141210',
        }}
      >
        <svg width="128" height="128" viewBox="0 0 32 32" fill="none">
          <circle cx="16" cy="16" r="13" stroke="#efebe4" strokeWidth="1.3" opacity="0.45" />
          <circle cx="16" cy="16" r="9.4" fill="#efebe4" />
          <rect x="13.95" y="11.5" width="1.7" height="9" rx="0.85" fill="#141210" />
          <rect x="16.95" y="11.5" width="1.7" height="9" rx="0.85" fill="#6fb3a4" />
        </svg>
      </div>
    ),
    size,
  );
}
