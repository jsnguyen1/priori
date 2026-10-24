// Plain-language primer on SCN2A for non-specialists (Simple view, opening screen).
import { C } from '../../ui/tokens';

const ITEMS: { k: string; title: string; text: string }[] = [
  { k: '1', title: 'SCN2A is a gene', text: 'An instruction in DNA for building one protein, called NaV1.2.' },
  { k: '2', title: 'NaV1.2 is a sodium gate', text: 'A tiny channel in brain cells. It opens to let sodium in, that is how a neuron fires a signal.' },
  { k: '3', title: 'One typo changes the gate', text: 'Too open → too much firing (often seizures). Too weak → too little (often autism, developmental delay, later seizures).' },
];

export function Scn2aExplainer() {
  return (
    <div className="mt-1 mb-2 border border-line2 rounded bg-[#030507]/85">
      <div className="flex items-center justify-between px-4 h-8 border-b border-line2">
        <span className="font-mono text-[10px] tracking-[0.14em] text-cyan">WHAT IS SCN2A?</span>
        <span className="font-mono text-[9px] tracking-[0.1em] text-dim">PUBLISHED BIOLOGY · SANDERS ET AL. 2018</span>
      </div>
      <div className="grid grid-cols-[1fr_1fr_1fr_150px] gap-0">
        {ITEMS.map((it) => (
          <div key={it.k} className="px-4 py-3 border-r border-line2">
            <div className="text-[13px] text-ink font-medium">{it.title}</div>
            <div className="mt-1 text-[12px] leading-[17px] text-mute">{it.text}</div>
          </div>
        ))}
        {/* minimal gate diagram: membrane with a channel, sodium entering */}
        <svg viewBox="0 0 150 92" className="w-full h-full p-2" aria-label="Sodium channel in a cell membrane">
          <rect x="0" y="34" width="150" height="24" fill={C.surface2} />
          <text x="4" y="30" fontSize="8" fill={C.dim} fontFamily="IBM Plex Mono">OUTSIDE</text>
          <text x="4" y="70" fontSize="8" fill={C.dim} fontFamily="IBM Plex Mono">INSIDE CELL</text>
          <rect x="62" y="30" width="10" height="32" rx="2" fill={C.lof} opacity="0.8" />
          <rect x="80" y="30" width="10" height="32" rx="2" fill={C.lof} opacity="0.8" />
          {[14, 26, 40, 56].map((y, i) => (
            <circle key={i} cx={76} cy={y + (i > 1 ? 18 : 0)} r="3" fill={C.cyan} />
          ))}
          <text x="96" y="20" fontSize="8" fill={C.cyan} fontFamily="IBM Plex Mono">Na⁺ in</text>
          <path d="M76 6 v80" stroke={C.cyan} strokeWidth="0.6" strokeDasharray="2 2" />
        </svg>
      </div>
    </div>
  );
}
