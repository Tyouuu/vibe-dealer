'use client'

// error.tsx only catches errors thrown *inside* the root layout's children. If
// the root layout itself throws, Next has no rendered shell to put that
// boundary in, and without this file it falls back to its own unstyled default
// page — the one screen in the product that would look like it belongs to a
// different app.
//
// This owns <html> and <body> because there is no layout above it to provide
// them. That also means no globals.css class is reachable here: this component
// renders when the thing that loads the stylesheet is the thing that broke. So
// the styling is inline and deliberately minimal, using literal values rather
// than the design tokens the rest of the app is built on.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          minHeight: '100vh',
          margin: 0,
          display: 'grid',
          placeItems: 'center',
          padding: '0 16px',
          background: '#f6f8fb',
          color: '#0f1729',
          fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif',
        }}
      >
        <div style={{ maxWidth: '384px', textAlign: 'center' }}>
          <p style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>Something went wrong</p>
          <p style={{ fontSize: '14px', color: '#5b6780', marginTop: '6px' }}>
            That&apos;s on us — nothing you did caused this. Try again, and it should be back to normal.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: '24px',
              padding: '9px 18px',
              borderRadius: '8px',
              border: 'none',
              background: '#3358d4',
              color: '#fff',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
          {error.digest && (
            <p style={{ fontSize: '12px', color: '#5b6780', marginTop: '20px' }}>
              Reference: <code>{error.digest}</code>
            </p>
          )}
        </div>
      </body>
    </html>
  )
}
