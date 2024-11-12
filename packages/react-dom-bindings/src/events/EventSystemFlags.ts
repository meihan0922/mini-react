export type EventSystemFlags = number;

export const IS_EVENT_HANDLE_NON_MANAGED_NODE = 1;
export const IS_NON_DELEGATED = 1 << 1;
export const IS_CAPTURE_PHASE = 1 << 2;
export const IS_PASSIVE = 1 << 3;
export const IS_LEGACY_FB_SUPPORT_MODE = 1 << 4;

export const SHOULD_NOT_DEFER_CLICK_FOR_FB_SUPPORT_MODE =
  IS_LEGACY_FB_SUPPORT_MODE | IS_CAPTURE_PHASE;

export const SHOULD_NOT_PROCESS_POLYFILL_EVENT_PLUGINS =
  IS_EVENT_HANDLE_NON_MANAGED_NODE | IS_NON_DELEGATED | IS_CAPTURE_PHASE;
