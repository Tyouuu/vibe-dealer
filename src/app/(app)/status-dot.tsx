type StatusDotColor = 'jade-bright' | 'brass-bright' | 'clay-bright' | 'slate-bright'

// One status treatment for the whole app.
//
// There were two, and /records used both on the same row: Status rendered as
// a bare coloured dot with bold coloured text, Delivery two columns to its
// left rendered as a bordered chip with a dot. SIM Card Stock used the chip,
// Reconciliation used the bare dot, dealer detail used the chip. Same
// meaning, two shapes, and no rule deciding which.
//
// The rule was already written beside .pill-neutral in globals.css and only
// half-followed: a state is a neutral chip with a coloured dot, a category or
// a count is the same chip with no dot. So the chip wins, and this component
// now renders it — which unifies all eight call sites without touching any
// of them.
//
// The colour also stops being carried by the label text. Coloured bold text
// as the state signal leans on colour harder than a dot does, against Geist's
// "don't rely on colour alone for status" rule. The dot is the marker, the
// word is the label, and the word stays readable ink instead of becoming
// decoration.
const PILL_CLASS: Record<StatusDotColor, string> = {
  'jade-bright': 'pill-jade',
  'brass-bright': 'pill-brass',
  'clay-bright': 'pill-clay',
  'slate-bright': 'pill-slate',
}

export function StatusDot({ color, label, pulse }: { color: StatusDotColor; label: string; pulse?: boolean }) {
  return <span className={`pill ${PILL_CLASS[color]}${pulse ? ' pill-pulse' : ''}`}>{label}</span>
}
