import { Fiber } from "@mono/react-reconciler/src/ReactInternalTypes";

type BaseSynctheticEvent = {
  isPersistent: () => boolean;
  isPropagationStopped: () => boolean;
  _targetInst: Fiber;
  nativeEvent: Event;
  target?: any;
  relatedTarget?: any;
  type: string;
  currentTarget: null | EventTarget;
};

// 已知的有效的合成事件
export type KnownReactSynctheticEvent = BaseSynctheticEvent & {
  _reactName: string;
};

// 比方寫了 react 不支持的事件
export type UnknownReactSynctheticEvent = BaseSynctheticEvent & {
  _reactName: string;
};

export type ReactSyntheticEvent =
  | KnownReactSynctheticEvent
  | UnknownReactSynctheticEvent;
