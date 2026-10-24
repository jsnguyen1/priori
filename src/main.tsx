import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './App';
import { useStore } from './state/store';
import { STEPS, goToStep, nextStep, prevStep } from './state/presentation';
import { useTour } from './tour/tourStore';
import { STEPS as TOUR_STEPS } from './tour/steps';

// QA hook: `?qa` exposes the store and narrative controls for automated testing.
if (new URLSearchParams(location.search).has('qa')) {
  Object.assign(window, { __store: useStore, __pres: { STEPS, goToStep, nextStep, prevStep }, __tour: useTour, __tourSteps: TOUR_STEPS });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
