// Type declarations for View Transitions API
// See: https://developer.mozilla.org/en-US/docs/Web/API/View_Transitions_API

interface ViewTransition {
  /** Promise that fulfills when the transition is ready to start */
  ready: Promise<void>;
  /** Promise that fulfills when the transition animation finishes */
  finished: Promise<void>;
  /** Promise that fulfills when the update callback is done */
  updateCallbackDone: Promise<void>;
  /** Skips the animation part of the view transition */
  skipTransition(): void;
}

interface Document {
  /** 
   * Starts a view transition 
   * @param callback - Function that makes DOM changes
   * @returns ViewTransition object
   */
  startViewTransition?: (callback?: () => void | Promise<void>) => ViewTransition;
}

interface KeyframeAnimationOptions extends KeyframeEffectOptions {
  /** Unique id for the animation (spec addition) */
  id?: string;
  /** Associated timeline for the animation (spec addition) */
  timeline?: AnimationTimeline | null;
}
