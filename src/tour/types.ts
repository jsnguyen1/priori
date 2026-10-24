// Guided-demo types. The tour walks a non-expert through one scenario, spotlighting real controls
// (tagged with data-tour="<id>" in the modules) and advancing when the app state shows the step
// was actually done.
import type { ModuleId } from '../domain/types';
import type { Actions, State } from '../state/store';

export type AppState = State & Actions;

export interface TourChapter {
  id: string;
  label: string;
}

export interface ControlNote {
  /** what the control is called on screen */
  label: string;
  /** plain-English meaning */
  meaning: string;
}

export interface TourStep {
  id: string;
  chapter: string;
  module: ModuleId;
  title: string;
  /** What you're looking at — plain English, 1–3 short sentences. */
  body: string;
  /** Why it matters for the story (optional, one sentence). */
  why?: string;
  /** Jargon or on-screen controls explained. */
  controls?: ControlNote[];
  /** data-tour id of the element to spotlight. */
  target?: string;
  placement?: 'right' | 'left' | 'top' | 'bottom' | 'center';
  /**
   * If present, the step is an ACTION: the user must do something in the app.
   * `instruction` tells them exactly where to click; the step completes when `done` returns true.
   */
  action?: {
    instruction: string;
    done: (s: AppState) => boolean;
  };
  /** Idempotent state preparation when the step is entered (e.g. after Back or a skip). */
  prepare?: (s: AppState) => void;
  /** Allow the user to skip an action step ("Do it for me"). */
  autoDo?: (s: AppState) => void;
}
