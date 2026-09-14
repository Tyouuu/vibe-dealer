import { ImageResponse } from 'next/og'

// Same mark for every generated icon size — the manifest needs 192 and 512
// as two separate files, and Apple's convention wants its own 180. All three
// draw from here so the mark never drifts between them. Colours are the
// app's own (--color-paper / --color-primary in globals.css), not a new
// identity invented for the icon.
export function markIcon(px: number) {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#14273d',
        }}
      >
        <svg width={px * 0.53} height={px * 0.53} viewBox="0 0 24 24" fill="none">
          <path
            d="M4 6L12 18L20 6"
            stroke="#0570de"
            strokeWidth={3.2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    ),
    { width: px, height: px },
  )
}
