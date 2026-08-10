type StatusDotColor = 'jade-bright' | 'brass-bright' | 'clay-bright' | 'slate-bright'

// A state: a coloured dot, and a label at full reading contrast.
//
// The label used to take the hue as well. That is the exact treatment the
// `.pill` rules in globals.css were rewritten to get away from, and the reason
// given there applies here word for word: the label carries the meaning and a
// pale hue is the weakest contrast on the page for it, and a differently
// coloured shape per state makes the eye re-read each one instead of comparing
// one small mark.
//
// Nine columns of a transactions row ending in a brass dot, brass "Pending", a
// white-outlined button and a pink-tinted button is four objects and three
// colour families in the space of two cells. The dot is the only one of them
// that needs the colour.
export function StatusDot({ color, label, pulse }: { color: StatusDotColor; label: string; pulse?: boolean }) {
  return (
    <span className="status-dot-row">
      <span className={`status-dot ${pulse ? 'pulse' : ''}`} style={{ background: `var(--color-${color})` }} />
      {label}
    </span>
  )
}
