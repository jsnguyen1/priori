import { AnimatePresence, motion } from 'motion/react';
import { useStore } from './state/store';
import { NavRail } from './shell/NavRail';
import { SystemBar } from './shell/SystemBar';
import { StatusBar } from './shell/StatusBar';
import { PresentationOverlay } from './shell/PresentationOverlay';
import { CommandPalette } from './shell/CommandPalette';
import { ExperimentLog } from './shell/ExperimentLog';
import { ProvenanceDrawer } from './shell/ProvenanceDrawer';
import { ResetDialog } from './shell/ResetDialog';
import { useKeyboard } from './shell/useKeyboard';
import { useViewMode } from './ui/viewMode';
import { TourOverlay } from './tour/TourOverlay';
import { TourIntro } from './tour/TourIntro';
import { PatientModule } from './modules/patient/PatientModule';
import { AtlasModule } from './modules/atlas/AtlasModule';
import { LabModule } from './modules/lab/LabModule';
import { TherapyModule } from './modules/therapy/TherapyModule';
import { ReuseModule } from './modules/reuse/ReuseModule';
import { DevelopmentModule } from './modules/development/DevelopmentModule';
import type { ModuleId } from './domain/types';
import { MOTION } from './ui/tokens';

const VIEWS: Record<ModuleId, () => JSX.Element> = {
  patient: PatientModule,
  atlas: AtlasModule,
  lab: LabModule,
  therapy: TherapyModule,
  reuse: ReuseModule,
  development: DevelopmentModule,
};

export function App() {
  const module = useStore((s) => s.module);
  const resetNonce = useStore((s) => s.resetNonce);
  const View = VIEWS[module];
  useKeyboard();
  const simple = useViewMode((v) => v.simple);
  return (
    <div className="h-full w-full flex flex-col bg-bg text-ink">
      <SystemBar />
      <div className="flex-1 min-h-0 flex">
        <NavRail />
        <div className="flex-1 min-w-0 min-h-0 relative">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={`${module}-${resetNonce}`}
              className="absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: MOTION.fast, ease: MOTION.ease }}
            >
              <View />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
      {!simple && <StatusBar />}
      <ExperimentLog />
      <ProvenanceDrawer />
      <PresentationOverlay />
      <CommandPalette />
      <ResetDialog />
      <TourOverlay />
      <TourIntro />
    </div>
  );
}
