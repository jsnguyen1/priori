import { useEffect, useState } from 'react';
import { useStore } from '../state/store';
import { fmt } from '../ui/primitives';
import { MODEL_VERSION, PROTOCOL_SUITE_VERSION } from '../sim/channel';
import { CLASSIFIER_VERSION } from '../sim/classifier';
import { ATLAS_VARIANTS } from '../data/variants';

export function StatusBar() {
  const log = useStore((s) => s.log);
  const sessionStart = useStore((s) => s.sessionStart);
  const toggleLog = useStore((s) => s.toggleLog);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const last = log[log.length - 1];
  return (
    <footer className="h-6 shrink-0 flex items-center gap-4 px-3 border-t border-line2 bg-bg font-mono text-[10px] text-dim select-none">
      <span className="flex items-center gap-1.5 whitespace-nowrap shrink-0">
        <span className="w-1.5 h-1.5 rounded-full bg-cyan/80" /> LOCAL · OFFLINE
      </span>
      <span className="whitespace-nowrap shrink-0">SESSION {fmt.time(now - sessionStart)}</span>
      <button onClick={() => toggleLog(true)} className="flex-1 min-w-0 truncate whitespace-nowrap text-mute hover:text-ink text-left">
        {last ? `${fmt.time(last.t)}  ${last.type}  ${last.detail}` : ''}
      </button>
      <span className="whitespace-nowrap shrink-0" title={`${MODEL_VERSION} · ${CLASSIFIER_VERSION} · ${PROTOCOL_SUITE_VERSION} · seed 0x5C2A2005`}>ATLAS {ATLAS_VARIANTS.length.toLocaleString()} RECORDS · ALL DATA SIMULATED</span>
    </footer>
  );
}
