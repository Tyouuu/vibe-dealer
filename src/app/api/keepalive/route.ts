// Somewhere for the browser to say "still here".
//
// The idle clock in the middleware measures the gap between requests, and
// typing produces none. Without this, someone thinking their way through a
// long transaction entry is indistinguishable from an empty chair, and would
// be signed out on submit with the form still full.
//
// It does no work. Reaching the middleware at all is the whole point: that is
// what refreshes the last-seen cookie. The 204 is just somewhere to stop.
export async function POST() {
  return new Response(null, { status: 204 })
}
