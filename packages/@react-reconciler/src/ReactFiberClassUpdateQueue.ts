import { enqueueConcurrentClassUpdate } from "./ReactFiberConcurrentUpdates";
import type { Lane, Lanes } from "./ReactFiberLane";
import type { Fiber } from "./ReactInternalTypes";
import { NoLanes } from "./ReactFiberLane";
import { FiberRoot } from "./ReactInternalTypes";

export const UpdateState = 0 as const;
export const ReplaceState = 1 as const;
export const ForceUpdate = 2 as const;
export const CaptureUpdate = 3 as const;

export type Update<State> = {
  eventTime: number;
  lane: Lane;
  tag:
    | typeof UpdateState
    | typeof ReplaceState
    | typeof ForceUpdate
    | typeof CaptureUpdate;
  payload: any;
  callback: (() => any) | null;
  next: Update<State> | null;
};

export type SharedQueue<State> = {
  pending: Update<State> | null;
  lanes: Lanes;
  hiddenCallbacks: Array<() => any> | null;
};

export type UpdateQueue<State> = {
  baseState: State;
  firstBaseUpdate: Update<State> | null;
  lastBaseUpdate: Update<State> | null;
  shared: SharedQueue<State>;
  callbacks: Array<() => any> | null;
};

// 創建一個 update 結構
export function createUpdate(eventTime: number, lane: Lane): Update<any> {
  const update = {
    eventTime,
    lane,

    tag: UpdateState,
    payload: null,
    callback: null,

    next: null,
  };

  return update;
}

// 將 update 入隊到帶更新暫存區，返回根節點 fiber
export function enqueueUpdate<State>(
  fiber: Fiber,
  update: Update<State>,
  lane: Lane
): FiberRoot | null {
  const updateQueue = fiber.updateQueue;
  if (updateQueue == null) {
    // Only occurs if the fiber has been unmounted.
    return null;
  }
  const shareQueue: SharedQueue<State> = updateQueue.shared;

  return enqueueConcurrentClassUpdate(fiber, shareQueue, update as any, lane);
}

// 初始化 UpdateQueue
export function initializeUpdateQueue<State>(fiber: Fiber): void {
  const queue: UpdateQueue<State> = {
    baseState: fiber.memoizedState,
    firstBaseUpdate: null,
    lastBaseUpdate: null,
    shared: {
      pending: null,
      lanes: NoLanes,
      hiddenCallbacks: null,
    },
    callbacks: null,
  };

  fiber.updateQueue = queue;
}
