import { isFn } from "@mono/shared/utils";
import { scheduleUpdateOnFiber } from "./ReactFiberWorkLoop";
import type { Fiber, FiberRoot } from "./ReactInternalTypes";
import { HostRoot } from "./ReactWorkTags";

type Hook = {
  memorizedState: any;
  next: null | Hook;
};
let currentlyRenderingFiber: Fiber | null = null;
let workInProgressHook: Hook | null = null;
let currentHook: Hook | null = null;

export function renderWithHook(
  current: Fiber | null,
  workInProgress: Fiber,
  component: any,
  props: any
) {
  currentlyRenderingFiber = workInProgress;
  workInProgress.memoizedState = null;
  let children = component(props);

  finishRenderingHooks();
  return children;
}

// reset
export function finishRenderingHooks() {
  currentlyRenderingFiber = null;
  currentHook = null;
  workInProgressHook = null;
}
// 返回新建立的 Hook 並且構建 hook鏈表
function updateWorkInProgressHook(): Hook {
  let hook: Hook;
  // 老的fiber
  const current = currentlyRenderingFiber?.alternate;
  // update 階段
  if (current) {
    // 把老的state掛載到新的fiber的memoizedState上
    currentlyRenderingFiber!.memoizedState = current.memoizedState;
    if (workInProgressHook) {
      // 把當前新的hook掛載到鏈表上，並更新當前的hook
      workInProgressHook = hook = workInProgressHook.next!;
      currentHook = currentHook?.next as Hook;
    } else {
      // 第一個hook
      hook = workInProgressHook = currentlyRenderingFiber?.memoizedState;
      // 把老的hook倒給 currentHook
      currentHook = current.memoizedState;
    }
  } else {
    // 初次渲染 mount
    currentHook = null;
    hook = {
      memorizedState: null,
      next: null,
    };
    if (workInProgressHook) {
      workInProgressHook = workInProgressHook.next = hook;
    } else {
      // 第一個hook
      workInProgressHook = currentlyRenderingFiber!.memoizedState = hook;
    }
  }
  return hook;
}

export function useReducer<S, I, A>(
  reducer: ((state: S, action: A) => S) | null,
  initialArg: I,
  init?: (initialArg: I) => S
) {
  // TODO: 構建Hook鏈表
  const hook: Hook = updateWorkInProgressHook();

  let initialState: S;
  if (init) {
    initialState = init(initialArg);
  } else {
    initialState = initialArg as any;
  }

  // 初次掛載還是更新
  // mount階段，初次渲染，才需要發送初始值
  if (!currentlyRenderingFiber?.alternate) {
    hook.memorizedState = initialState;
  }

  // TODO: 構建dispatch
  // 之所以會用bind是要保留當前的全局變量，因為currentlyRenderingFiber隨時會變動
  const dispatch = dispatchReducerAction.bind(
    null,
    currentlyRenderingFiber!,
    hook,
    reducer as any
  );

  return [hook.memorizedState, dispatch];
}

// 源碼當中，useState 和 useReducer 對比
// 1. useState 如果 state 沒改變，不會引起改變，useReducer 不是！
// 2. reducer 代表的是修改的規則，儲存邏輯。 useReducer 比較方便復用這個參數。所以在複雜的狀態下，比方多組件共用同個狀態，但又有很多需要判斷的邏輯，就使用 useReducer
// 在源碼當中，在掛載階段執行的是 mountState()，dispatch 會去呼叫 dispatchSetState（會去判斷有沒有改變，再做掛載）
// 在這邊簡化成 dispatchReducerAction
// 源碼中 updateState 則是套用 useReducer
export function useState<S>(initialState: (() => S) | S) {
  const init = isFn(initialState) ? initialState() : initialState;
  return useReducer(null, init);
}

function dispatchReducerAction<S, I, A>(
  fiber: Fiber,
  hook: Hook,
  reducer?: (state: S, action: A) => S,
  action?: any
) {
  hook.memorizedState = reducer ? reducer(hook.memorizedState, action) : action;
  fiber.alternate = { ...fiber };
  const root = getRootForUpdateFiber(fiber);
  scheduleUpdateOnFiber(root, fiber);
}

function getRootForUpdateFiber(fiber: Fiber): FiberRoot {
  let parent = fiber.return;
  let node = fiber;
  while (parent !== null) {
    node = parent;
    parent = node.return;
  }
  return node.tag === HostRoot ? node.stateNode : null;
}
