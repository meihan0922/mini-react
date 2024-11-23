import type { WorkTag } from "./ReactWorkTags";
import type { Flags } from "./ReactFiberFlags";
import type { LaneMap, Lanes, Lane } from "./ReactFiberLane";
import type { ReactContext } from "@mono/shared/ReactTypes";

export type ContextDependency<T> = {
  context: ReactContext<T>;
  next: ContextDependency<any> | null;
  memoizedValue: T;
};
export type Dependencies = {
  lanes: Lanes;
  firstContext: ContextDependency<any> | null;
};

export type Fiber = {
  // Tag identifying the type of fiber.
  // 標記 fiber 類型，及描述組件類型
  // ex: 原生標籤、函式組件、類組件、Fragment等等。
  tag: WorkTag;

  // Unique identifier of this child.
  // 標記組件當前層級的唯一性，協調階段會使用 key 區分組件
  // 復用要滿足三個條件：同一層級、key相同、type相同
  key: null | string;

  // The value of element.type which is used to preserve the identity during
  // reconciliation of this child.
  // 組件類型，基本上和 type 一樣，協調階段會用到
  elementType: any;

  // The resolved function/class/ associated with this fiber.
  // 標記組件類型
  // 如果是原生組件，這立是字符串
  // 如果是函式組件，這裡是函式
  // 如果是類組件，這裡是類
  type: any;

  // The local state associated with this fiber.
  // 如果是原生標籤，是DOM
  // 如果是類組件，是實例
  // 如果是函式組件，是null
  stateNode: any;

  // Conceptual aliases
  // parent : Instance -> return The parent happens to be the same as the
  // return fiber since we've merged the fiber and instance.

  // Remaining fields belong to Fiber

  // The Fiber to return to after finishing processing this one.
  // This is effectively the parent, but there can be multiple parents (two)
  // so this is only the parent of the thing we're currently processing.
  // It is conceptually the same as the return address of a stack frame.
  // 父 fiber
  return: Fiber | null;

  // Singly Linked List Tree Structure.
  // 單鏈表結構
  // 第一個子 fiber
  child: Fiber | null;
  // 下一個兄弟節點
  sibling: Fiber | null;
  // 紀錄節點在當前層級中的位置下標，用於 diff 時判斷是否需要位移
  // 鏈表沒有下標，所以才有 index 紀錄
  index: number;

  // Input is the data coming into process this fiber. Arguments. Props.
  // 新的 props
  pendingProps: any; // This type will be more specific once we overload the tag.
  // 上次渲染時用的 props
  memoizedProps: any; // The props used to create the output.

  // A queue of state updates and callbacks.
  // 隊列，存儲 updates 和 callbacks，比如 createRoot(root).render 或是 setState 的更新
  // 先儲存，統一後續處理更新
  updateQueue: any;

  // The state used to create the output
  // 不同的組件的 memoizedState 存儲不同
  // 類組件：state
  // 函式組件：hook[0]
  memoizedState: any;

  // Effect
  flags: Flags;
  subtreeFlags: Flags;
  // 紀錄要刪除的子節點，在父節點上紀錄，比起在子節點上一一掛在flags上要高效，到commit階段直接遍歷刪除
  deletions: Array<Fiber> | null;

  // Singly linked list fast path to the next fiber with side-effects.
  nextEffect: Fiber | null;

  // Lanes 模型
  lanes: Lanes;
  // 子節點的lanes
  childLanes: Lanes;

  // Dependencies (contexts, events) for this fiber, if it has any
  // 依賴，比方說 context
  dependencies: Dependencies | null;

  // This is a pooled version of a Fiber. Every fiber that gets updated will
  // eventually have a pair. There are cases when we can clean up pairs to save
  // memory if we need to.
  // 用於儲存更新前的 fiber
  alternate: Fiber | null;
};

export type Container = Element | Document | DocumentFragment;

export type FiberRoot = {
  containerInfo: Container;
  // 掛載舊的樹，目前呈現的樹
  current: Fiber;

  // A finished work-in-progress HostRoot that's ready to be committed.
  // 準備提交的樹 workInprogress, 類型是 HostRoot
  finishedWork: Fiber | null;

  // Timeout handle returned by setTimeout. Used to cancel a pending timeout, if
  // it's superseded by a new one.
  timeoutHandle: number;

  // Node returned by Scheduler.scheduleCallback. Represents the next rendering
  // task that the root will work on.
  callbackNode: any;
  callbackPriority: Lane;
  eventTimes: LaneMap<number>;
  expirationTimes: LaneMap<number>;

  // 未處理的 lanes
  pendingLanes: Lanes;
  suspendedLanes: Lanes;
  pingedLanes: Lanes;
  expiredLanes: Lanes;

  finishedLanes: Lanes;

  entangledLanes: Lanes;
  entanglements: LaneMap<Lanes>;
};
