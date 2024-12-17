/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 *
 */

import {
  findCurrentHostFiber,
  findCurrentHostFiberWithNoPortals,
} from "./ReactFiberTreeReflection";
import { get as getInstance } from "shared/ReactInstanceMap";
import {
  HostComponent,
  HostSingleton,
  ClassComponent,
  HostRoot,
  SuspenseComponent,
} from "./ReactWorkTags";
import getComponentNameFromFiber from "react-reconciler/src/getComponentNameFromFiber";
import isArray from "shared/isArray";
import { enableSchedulingProfiler } from "shared/ReactFeatureFlags";
import ReactSharedInternals from "shared/ReactSharedInternals";
import { getPublicInstance } from "./ReactFiberConfig";
import {
  findCurrentUnmaskedContext,
  processChildContext,
  emptyContextObject,
  isContextProvider as isLegacyContextProvider,
} from "./ReactFiberContext";
import { createFiberRoot } from "./ReactFiberRoot";
import { isRootDehydrated } from "./ReactFiberShellHydration";
import {
  injectInternals,
  markRenderScheduled,
  onScheduleRoot,
} from "./ReactFiberDevToolsHook";
import {
  requestUpdateLane,
  scheduleUpdateOnFiber,
  scheduleInitialHydrationOnRoot,
  flushRoot,
  batchedUpdates,
  flushSync,
  isAlreadyRendering,
  deferredUpdates,
  discreteUpdates,
  flushPassiveEffects,
} from "./ReactFiberWorkLoop";
import { enqueueConcurrentRenderForLane } from "./ReactFiberConcurrentUpdates";
import {
  createUpdate,
  enqueueUpdate,
  entangleTransitions,
} from "./ReactFiberClassUpdateQueue";
import {
  isRendering as ReactCurrentFiberIsRendering,
  current as ReactCurrentFiberCurrent,
  resetCurrentFiber as resetCurrentDebugFiberInDEV,
  setCurrentFiber as setCurrentDebugFiberInDEV,
} from "./ReactCurrentFiber";
import { StrictLegacyMode } from "./ReactTypeOfMode";
import {
  SyncLane,
  SelectiveHydrationLane,
  getHighestPriorityPendingLanes,
  higherPriorityLane,
} from "./ReactFiberLane";
import {
  getCurrentUpdatePriority,
  runWithPriority,
} from "./ReactEventPriorities";
import {
  scheduleRefresh,
  scheduleRoot,
  setRefreshHandler,
  findHostInstancesForRefresh,
} from "./ReactFiberHotReloading";
import ReactVersion from "shared/ReactVersion";
export { createPortal } from "./ReactPortal";
// export {
//   createComponentSelector,
//   createHasPseudoClassSelector,
//   createRoleSelector,
//   createTestNameSelector,
//   createTextSelector,
//   getFindAllNodesFailureDescription,
//   findAllNodes,
//   findBoundingRects,
//   focusWithin,
//   observeVisibleRects,
// } from "./ReactTestSelectors";
export { startHostTransition } from "./ReactFiberHooks";

// 0 is PROD, 1 is DEV.
// Might add PROFILE later.

let didWarnAboutNestedUpdates;
let didWarnAboutFindNodeInStrictMode;

if (__DEV__) {
  didWarnAboutNestedUpdates = false;
  didWarnAboutFindNodeInStrictMode = {};
}

function getContextForSubtree(parentComponent) {
  if (!parentComponent) {
    return emptyContextObject;
  }

  const fiber = getInstance(parentComponent);
  const parentContext = findCurrentUnmaskedContext(fiber);

  if (fiber.tag === ClassComponent) {
    const Component = fiber.type;
    if (isLegacyContextProvider(Component)) {
      return processChildContext(fiber, Component, parentContext);
    }
  }

  return parentContext;
}

function findHostInstance(component) {
  const fiber = getInstance(component);
  if (fiber === undefined) {
    if (typeof component.render === "function") {
      throw new Error("Unable to find node on an unmounted component.");
    } else {
      const keys = Object.keys(component).join(",");
      throw new Error(
        `Argument appears to not be a ReactComponent. Keys: ${keys}`
      );
    }
  }
  const hostFiber = findCurrentHostFiber(fiber);
  if (hostFiber === null) {
    return null;
  }
  return getPublicInstance(hostFiber.stateNode);
}

function findHostInstanceWithWarning(component, methodName) {
  if (__DEV__) {
    const fiber = getInstance(component);
    if (fiber === undefined) {
      if (typeof component.render === "function") {
        throw new Error("Unable to find node on an unmounted component.");
      } else {
        const keys = Object.keys(component).join(",");
        throw new Error(
          `Argument appears to not be a ReactComponent. Keys: ${keys}`
        );
      }
    }
    const hostFiber = findCurrentHostFiber(fiber);
    if (hostFiber === null) {
      return null;
    }
    if (hostFiber.mode & StrictLegacyMode) {
      const componentName = getComponentNameFromFiber(fiber) || "Component";
      if (!didWarnAboutFindNodeInStrictMode[componentName]) {
        didWarnAboutFindNodeInStrictMode[componentName] = true;

        const previousFiber = ReactCurrentFiberCurrent;
        try {
          setCurrentDebugFiberInDEV(hostFiber);
          if (fiber.mode & StrictLegacyMode) {
            console.error(
              "%s is deprecated in StrictMode. " +
                "%s was passed an instance of %s which is inside StrictMode. " +
                "Instead, add a ref directly to the element you want to reference. " +
                "Learn more about using refs safely here: " +
                "https://reactjs.org/link/strict-mode-find-node",
              methodName,
              methodName,
              componentName
            );
          } else {
            console.error(
              "%s is deprecated in StrictMode. " +
                "%s was passed an instance of %s which renders StrictMode children. " +
                "Instead, add a ref directly to the element you want to reference. " +
                "Learn more about using refs safely here: " +
                "https://reactjs.org/link/strict-mode-find-node",
              methodName,
              methodName,
              componentName
            );
          }
        } finally {
          // Ideally this should reset to previous but this shouldn't be called in
          // render and there's another warning for that anyway.
          if (previousFiber) {
            setCurrentDebugFiberInDEV(previousFiber);
          } else {
            resetCurrentDebugFiberInDEV();
          }
        }
      }
    }
    return getPublicInstance(hostFiber.stateNode);
  }
  return findHostInstance(component);
}
/**
 *
 * @param {*} containerInfo: 指的就是容器，ex:div#root
 * @param {*} tag: RootTag -> ConcurrentRoot
 * @param {*} hydrationCallbacks -> null
 * 剩下是 createRoot options?
 * @returns
 */
export function createContainer(
  containerInfo,
  tag,
  hydrationCallbacks,
  isStrictMode,
  concurrentUpdatesByDefaultOverride,
  identifierPrefix,
  onRecoverableError,
  transitionCallbacks
) {
  console.log(
    "%c [ createContainer ]: ",
    "color: #000; background: orange; font-size: 13px;",
    ""
  );
  const hydrate = false;
  const initialChildren = null; // 初始子節點
  return createFiberRoot(
    containerInfo,
    tag,
    hydrate,
    initialChildren,
    hydrationCallbacks,
    isStrictMode,
    concurrentUpdatesByDefaultOverride,
    identifierPrefix,
    onRecoverableError,
    transitionCallbacks
  );
}

export function createHydrationContainer(
  initialChildren,
  // TODO: Remove `callback` when we delete legacy mode.
  callback,
  containerInfo,
  tag,
  hydrationCallbacks,
  isStrictMode,
  concurrentUpdatesByDefaultOverride,
  identifierPrefix,
  onRecoverableError,
  transitionCallbacks
) {
  const hydrate = true;
  const root = createFiberRoot(
    containerInfo,
    tag,
    hydrate,
    initialChildren,
    hydrationCallbacks,
    isStrictMode,
    concurrentUpdatesByDefaultOverride,
    identifierPrefix,
    onRecoverableError,
    transitionCallbacks
  );

  // TODO: Move this to FiberRoot constructor
  root.context = getContextForSubtree(null);

  // Schedule the initial render. In a hydration root, this is different from
  // a regular update because the initial render must match was was rendered
  // on the server.
  // NOTE: This update intentionally doesn't have a payload. We're only using
  // the update to schedule work on the root fiber (and, for legacy roots, to
  // enqueue the callback if one is provided).
  const current = root.current;
  const lane = requestUpdateLane(current);
  const update = createUpdate(lane);
  update.callback =
    callback !== undefined && callback !== null ? callback : null;
  enqueueUpdate(current, update, lane);
  scheduleInitialHydrationOnRoot(root, lane);

  return root;
}
/**
 * ! 把 element 渲染到 container 中
 * @param {*} element: ReactNodeList
 * @param {*} container: 指向 FiberRootNode
 * @param {*} parentComponent: 已過時，為了老代碼保留
 * @param {*} callback: 已過時，為了老代碼保留
 * @returns
 */
export function updateContainer(element, container, parentComponent, callback) {
  console.log(
    "%c [ updateContainer ]: ",
    "color: #fff; background: red; font-size: 13px;",
    ""
  );
  // outputs: a Vegas style super shiny string

  if (__DEV__) {
    onScheduleRoot(container, element);
  }
  // ! 獲取當前的老樹，在 FiberRootNode 上
  // ! FiberRootNode.current -> HostRootFiber
  const current = container.current;

  /**
   * ! 獲取本次的update對應的優先級：
   * 標示任務的優先級，可以理解為表示 update 的優先級的一種機制，
   * 每個 update 都會被分配一個或多個 lane，
   * 以確定其在更新隊列中的優先順序。
   *
   * ! 頁面初次渲染，defaultLane 32
   */
  const lane = requestUpdateLane(current);

  if (enableSchedulingProfiler) {
    markRenderScheduled(lane);
  }

  /**
   * parentComponent 為 null，此處代碼只是返回一個空對象
   * 此處用於兼容老代碼
   */
  const context = getContextForSubtree(parentComponent);
  if (container.context === null) {
    container.context = context;
  } else {
    container.pendingContext = context;
  }

  if (__DEV__) {
    if (
      ReactCurrentFiberIsRendering &&
      ReactCurrentFiberCurrent !== null &&
      !didWarnAboutNestedUpdates
    ) {
      didWarnAboutNestedUpdates = true;
      console.error(
        "Render methods should be a pure function of props and state; " +
          "triggering nested component updates from render is not allowed. " +
          "If necessary, trigger nested updates in componentDidUpdate.\n\n" +
          "Check the render method of %s.",
        getComponentNameFromFiber(ReactCurrentFiberCurrent) || "Unknown"
      );
    }
  }

  /**
   * ! 創建更新對象
   *
   * 類組件setState, forceUpdate 和 createRoot(domNode).render() 都會產生的update
   * update: {
   *    lane: any;
   *    tag: number; // 更新類型 0 | 1 | 2 | 3
   *    payload: any;
   *    callback: any;
   *    next: any; // 下一個更新
   * }
   * 會先儲存起來，一起處理，再一次commit
   * 比方去釣魚，一個update就是一隻魚，會搜集起來放進籃子中
   * 再一起賣掉
   */
  const update = createUpdate(lane);
  // Caution: React DevTools currently depends on this property
  // being called "element".
  update.payload = { element };
  // console.log("創建Update對象，子節點變成 update 裡的 payload.element了");

  // ! 從 React18 開始，render 不再傳入 callback 了，即這裡的if就沒有作用了
  callback = callback === undefined ? null : callback;
  if (callback !== null) {
    if (__DEV__) {
      if (typeof callback !== "function") {
        console.error(
          "render(...): Expected the last optional `callback` argument to be a " +
            "function. Instead received: %s.",
          callback
        );
      }
    }
    update.callback = callback;
  }
  /**
   * ! 把創建的更新，加到到更新鏈表當中
   * ! 沒有立刻把 update 放到 fiber 上面，先放到 concurrentQueues，
   * ! 如果渲染正在進行中，並且收到來自併發事件的更新，
   * ! 就會等到當前的渲染結束，（不論是完成或是被中斷），
   *
   * 如果 setState 2次 -> 2個update，
   * 重複2次(createUpdate -> enqueueUpdate -> scheduleUpdateOnFiber)
   * 將update推送到這個陣列中，這樣以後就可以訪問 queue, fiber, update 等等
   *
   * 再在 render 後、workLoopSync 前
   * finishQueueingConcurrentUpdates 一次處理，將其添加到 queue.shared.pending; 隊列當中
   *
   * workLoopSync
   *  -> beginWork
   *    -> updateHostRoot | updateClassComponent（函式組件和 hook 相關，先略過
   *      -> 如果需要處理 fiber 上的 updateQueue 就會調用 processUpdateQueue
   *
   */
  const root = enqueueUpdate(current, update, lane);
  if (root !== null) {
    // ! 根據優先級 創建更新任務
    scheduleUpdateOnFiber(root, current, lane);
    entangleTransitions(root, current, lane);
  }

  return lane;
}

export {
  batchedUpdates,
  deferredUpdates,
  discreteUpdates,
  flushSync,
  isAlreadyRendering,
  flushPassiveEffects,
};

export function getPublicRootInstance(container) {
  const containerFiber = container.current;
  if (!containerFiber.child) {
    return null;
  }
  switch (containerFiber.child.tag) {
    case HostSingleton:
    case HostComponent:
      return getPublicInstance(containerFiber.child.stateNode);
    default:
      return containerFiber.child.stateNode;
  }
}

export function attemptSynchronousHydration(fiber) {
  switch (fiber.tag) {
    case HostRoot: {
      const root = fiber.stateNode;
      if (isRootDehydrated(root)) {
        // Flush the first scheduled "update".
        const lanes = getHighestPriorityPendingLanes(root);
        flushRoot(root, lanes);
      }
      break;
    }
    case SuspenseComponent: {
      flushSync(() => {
        const root = enqueueConcurrentRenderForLane(fiber, SyncLane);
        if (root !== null) {
          scheduleUpdateOnFiber(root, fiber, SyncLane);
        }
      });
      // If we're still blocked after this, we need to increase
      // the priority of any promises resolving within this
      // boundary so that they next attempt also has higher pri.
      const retryLane = SyncLane;
      markRetryLaneIfNotHydrated(fiber, retryLane);
      break;
    }
  }
}

function markRetryLaneImpl(fiber, retryLane) {
  const suspenseState = fiber.memoizedState;
  if (suspenseState !== null && suspenseState.dehydrated !== null) {
    suspenseState.retryLane = higherPriorityLane(
      suspenseState.retryLane,
      retryLane
    );
  }
}

// Increases the priority of thenables when they resolve within this boundary.
function markRetryLaneIfNotHydrated(fiber, retryLane) {
  markRetryLaneImpl(fiber, retryLane);
  const alternate = fiber.alternate;
  if (alternate) {
    markRetryLaneImpl(alternate, retryLane);
  }
}

export function attemptContinuousHydration(fiber) {
  if (fiber.tag !== SuspenseComponent) {
    // We ignore HostRoots here because we can't increase
    // their priority and they should not suspend on I/O,
    // since you have to wrap anything that might suspend in
    // Suspense.
    return;
  }
  const lane = SelectiveHydrationLane;
  const root = enqueueConcurrentRenderForLane(fiber, lane);
  if (root !== null) {
    scheduleUpdateOnFiber(root, fiber, lane);
  }
  markRetryLaneIfNotHydrated(fiber, lane);
}

export function attemptHydrationAtCurrentPriority(fiber) {
  if (fiber.tag !== SuspenseComponent) {
    // We ignore HostRoots here because we can't increase
    // their priority other than synchronously flush it.
    return;
  }
  const lane = requestUpdateLane(fiber);
  const root = enqueueConcurrentRenderForLane(fiber, lane);
  if (root !== null) {
    scheduleUpdateOnFiber(root, fiber, lane);
  }
  markRetryLaneIfNotHydrated(fiber, lane);
}

export { getCurrentUpdatePriority, runWithPriority };

export { findHostInstance };

export { findHostInstanceWithWarning };

export function findHostInstanceWithNoPortals(fiber) {
  const hostFiber = findCurrentHostFiberWithNoPortals(fiber);
  if (hostFiber === null) {
    return null;
  }
  return getPublicInstance(hostFiber.stateNode);
}

let shouldErrorImpl = (fiber) => null;

export function shouldError(fiber) {
  return shouldErrorImpl(fiber);
}

let shouldSuspendImpl = (fiber) => false;

export function shouldSuspend(fiber) {
  return shouldSuspendImpl(fiber);
}

let overrideHookState = null;
let overrideHookStateDeletePath = null;
let overrideHookStateRenamePath = null;
let overrideProps = null;
let overridePropsDeletePath = null;
let overridePropsRenamePath = null;
let scheduleUpdate = null;
let setErrorHandler = null;
let setSuspenseHandler = null;

if (__DEV__) {
  const copyWithDeleteImpl = (obj, path, index) => {
    const key = path[index];
    const updated = isArray(obj) ? obj.slice() : { ...obj };
    if (index + 1 === path.length) {
      if (isArray(updated)) {
        updated.splice(key, 1);
      } else {
        delete updated[key];
      }
      return updated;
    }
    // $FlowFixMe[incompatible-use] number or string is fine here
    updated[key] = copyWithDeleteImpl(obj[key], path, index + 1);
    return updated;
  };

  const copyWithDelete = (obj, path) => {
    return copyWithDeleteImpl(obj, path, 0);
  };

  const copyWithRenameImpl = (obj, oldPath, newPath, index) => {
    const oldKey = oldPath[index];
    const updated = isArray(obj) ? obj.slice() : { ...obj };
    if (index + 1 === oldPath.length) {
      const newKey = newPath[index];
      // $FlowFixMe[incompatible-use] number or string is fine here
      updated[newKey] = updated[oldKey];
      if (isArray(updated)) {
        updated.splice(oldKey, 1);
      } else {
        delete updated[oldKey];
      }
    } else {
      // $FlowFixMe[incompatible-use] number or string is fine here
      updated[oldKey] = copyWithRenameImpl(
        // $FlowFixMe[incompatible-use] number or string is fine here
        obj[oldKey],
        oldPath,
        newPath,
        index + 1
      );
    }
    return updated;
  };

  const copyWithRename = (obj, oldPath, newPath) => {
    if (oldPath.length !== newPath.length) {
      console.warn("copyWithRename() expects paths of the same length");
      return;
    } else {
      for (let i = 0; i < newPath.length - 1; i++) {
        if (oldPath[i] !== newPath[i]) {
          console.warn(
            "copyWithRename() expects paths to be the same except for the deepest key"
          );
          return;
        }
      }
    }
    return copyWithRenameImpl(obj, oldPath, newPath, 0);
  };

  const copyWithSetImpl = (obj, path, index, value) => {
    if (index >= path.length) {
      return value;
    }
    const key = path[index];
    const updated = isArray(obj) ? obj.slice() : { ...obj };
    // $FlowFixMe[incompatible-use] number or string is fine here
    updated[key] = copyWithSetImpl(obj[key], path, index + 1, value);
    return updated;
  };

  const copyWithSet = (obj, path, value) => {
    return copyWithSetImpl(obj, path, 0, value);
  };

  const findHook = (fiber, id) => {
    // For now, the "id" of stateful hooks is just the stateful hook index.
    // This may change in the future with e.g. nested hooks.
    let currentHook = fiber.memoizedState;
    while (currentHook !== null && id > 0) {
      currentHook = currentHook.next;
      id--;
    }
    return currentHook;
  };

  // Support DevTools editable values for useState and useReducer.
  overrideHookState = (fiber, id, path, value) => {
    const hook = findHook(fiber, id);
    if (hook !== null) {
      const newState = copyWithSet(hook.memoizedState, path, value);
      hook.memoizedState = newState;
      hook.baseState = newState;

      // We aren't actually adding an update to the queue,
      // because there is no update we can add for useReducer hooks that won't trigger an error.
      // (There's no appropriate action type for DevTools overrides.)
      // As a result though, React will see the scheduled update as a noop and bailout.
      // Shallow cloning props works as a workaround for now to bypass the bailout check.
      fiber.memoizedProps = { ...fiber.memoizedProps };

      const root = enqueueConcurrentRenderForLane(fiber, SyncLane);
      if (root !== null) {
        scheduleUpdateOnFiber(root, fiber, SyncLane);
      }
    }
  };
  overrideHookStateDeletePath = (fiber, id, path) => {
    const hook = findHook(fiber, id);
    if (hook !== null) {
      const newState = copyWithDelete(hook.memoizedState, path);
      hook.memoizedState = newState;
      hook.baseState = newState;

      // We aren't actually adding an update to the queue,
      // because there is no update we can add for useReducer hooks that won't trigger an error.
      // (There's no appropriate action type for DevTools overrides.)
      // As a result though, React will see the scheduled update as a noop and bailout.
      // Shallow cloning props works as a workaround for now to bypass the bailout check.
      fiber.memoizedProps = { ...fiber.memoizedProps };

      const root = enqueueConcurrentRenderForLane(fiber, SyncLane);
      if (root !== null) {
        scheduleUpdateOnFiber(root, fiber, SyncLane);
      }
    }
  };
  overrideHookStateRenamePath = (fiber, id, oldPath, newPath) => {
    const hook = findHook(fiber, id);
    if (hook !== null) {
      const newState = copyWithRename(hook.memoizedState, oldPath, newPath);
      hook.memoizedState = newState;
      hook.baseState = newState;

      // We aren't actually adding an update to the queue,
      // because there is no update we can add for useReducer hooks that won't trigger an error.
      // (There's no appropriate action type for DevTools overrides.)
      // As a result though, React will see the scheduled update as a noop and bailout.
      // Shallow cloning props works as a workaround for now to bypass the bailout check.
      fiber.memoizedProps = { ...fiber.memoizedProps };

      const root = enqueueConcurrentRenderForLane(fiber, SyncLane);
      if (root !== null) {
        scheduleUpdateOnFiber(root, fiber, SyncLane);
      }
    }
  };

  // Support DevTools props for function components, forwardRef, memo, host components, etc.
  overrideProps = (fiber, path, value) => {
    fiber.pendingProps = copyWithSet(fiber.memoizedProps, path, value);
    if (fiber.alternate) {
      fiber.alternate.pendingProps = fiber.pendingProps;
    }
    const root = enqueueConcurrentRenderForLane(fiber, SyncLane);
    if (root !== null) {
      scheduleUpdateOnFiber(root, fiber, SyncLane);
    }
  };
  overridePropsDeletePath = (fiber, path) => {
    fiber.pendingProps = copyWithDelete(fiber.memoizedProps, path);
    if (fiber.alternate) {
      fiber.alternate.pendingProps = fiber.pendingProps;
    }
    const root = enqueueConcurrentRenderForLane(fiber, SyncLane);
    if (root !== null) {
      scheduleUpdateOnFiber(root, fiber, SyncLane);
    }
  };
  overridePropsRenamePath = (fiber, oldPath, newPath) => {
    fiber.pendingProps = copyWithRename(fiber.memoizedProps, oldPath, newPath);
    if (fiber.alternate) {
      fiber.alternate.pendingProps = fiber.pendingProps;
    }
    const root = enqueueConcurrentRenderForLane(fiber, SyncLane);
    if (root !== null) {
      scheduleUpdateOnFiber(root, fiber, SyncLane);
    }
  };

  scheduleUpdate = (fiber) => {
    const root = enqueueConcurrentRenderForLane(fiber, SyncLane);
    if (root !== null) {
      scheduleUpdateOnFiber(root, fiber, SyncLane);
    }
  };

  setErrorHandler = (newShouldErrorImpl) => {
    shouldErrorImpl = newShouldErrorImpl;
  };

  setSuspenseHandler = (newShouldSuspendImpl) => {
    shouldSuspendImpl = newShouldSuspendImpl;
  };
}

function findHostInstanceByFiber(fiber) {
  const hostFiber = findCurrentHostFiber(fiber);
  if (hostFiber === null) {
    return null;
  }
  return hostFiber.stateNode;
}

function emptyFindFiberByHostInstance(instance) {
  return null;
}

function getCurrentFiberForDevTools() {
  return ReactCurrentFiberCurrent;
}

export function injectIntoDevTools(devToolsConfig) {
  const { findFiberByHostInstance } = devToolsConfig;
  const { ReactCurrentDispatcher } = ReactSharedInternals;

  return injectInternals({
    bundleType: devToolsConfig.bundleType,
    version: devToolsConfig.version,
    rendererPackageName: devToolsConfig.rendererPackageName,
    rendererConfig: devToolsConfig.rendererConfig,
    overrideHookState,
    overrideHookStateDeletePath,
    overrideHookStateRenamePath,
    overrideProps,
    overridePropsDeletePath,
    overridePropsRenamePath,
    setErrorHandler,
    setSuspenseHandler,
    scheduleUpdate,
    currentDispatcherRef: ReactCurrentDispatcher,
    findHostInstanceByFiber,
    findFiberByHostInstance:
      findFiberByHostInstance || emptyFindFiberByHostInstance,
    // React Refresh
    findHostInstancesForRefresh: __DEV__ ? findHostInstancesForRefresh : null,
    scheduleRefresh: __DEV__ ? scheduleRefresh : null,
    scheduleRoot: __DEV__ ? scheduleRoot : null,
    setRefreshHandler: __DEV__ ? setRefreshHandler : null,
    // Enables DevTools to append owner stacks to error messages in DEV mode.
    getCurrentFiber: __DEV__ ? getCurrentFiberForDevTools : null,
    // Enables DevTools to detect reconciler version rather than renderer version
    // which may not match for third party renderers.
    reconcilerVersion: ReactVersion,
  });
}
