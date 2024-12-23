/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 *
 */

// UpdateQueue is a linked list of prioritized updates.
//
// Like fibers, update queues come in pairs: a current queue, which represents
// the visible state of the screen, and a work-in-progress queue, which can be
// mutated and processed asynchronously before it is committed — a form of
// double buffering. If a work-in-progress render is discarded before finishing,
// we create a new work-in-progress by cloning the current queue.
//
// Both queues share a persistent, singly-linked list structure. To schedule an
// update, we append it to the end of both queues. Each queue maintains a
// pointer to first update in the persistent list that hasn't been processed.
// The work-in-progress pointer always has a position equal to or greater than
// the current queue, since we always work on that one. The current queue's
// pointer is only updated during the commit phase, when we swap in the
// work-in-progress.
//
// For example:
//
//   Current pointer:           A - B - C - D - E - F
//   Work-in-progress pointer:              D - E - F
//                                          ^
//                                          The work-in-progress queue has
//                                          processed more updates than current.
//
// The reason we append to both queues is because otherwise we might drop
// updates without ever processing them. For example, if we only add updates to
// the work-in-progress queue, some updates could be lost whenever a work-in
// -progress render restarts by cloning from current. Similarly, if we only add
// updates to the current queue, the updates will be lost whenever an already
// in-progress queue commits and swaps with the current queue. However, by
// adding to both queues, we guarantee that the update will be part of the next
// work-in-progress. (And because the work-in-progress queue becomes the
// current queue once it commits, there's no danger of applying the same
// update twice.)
//
// Prioritization
// --------------
//
// Updates are not sorted by priority, but by insertion; new updates are always
// appended to the end of the list.
//
// The priority is still important, though. When processing the update queue
// during the render phase, only the updates with sufficient priority are
// included in the result. If we skip an update because it has insufficient
// priority, it remains in the queue to be processed later, during a lower
// priority render. Crucially, all updates subsequent to a skipped update also
// remain in the queue *regardless of their priority*. That means high priority
// updates are sometimes processed twice, at two separate priorities. We also
// keep track of a base state, that represents the state before the first
// update in the queue is applied.
//
// For example:
//
//   Given a base state of '', and the following queue of updates
//
//     A1 - B2 - C1 - D2
//
//   where the number indicates the priority, and the update is applied to the
//   previous state by appending a letter, React will process these updates as
//   two separate renders, one per distinct priority level:
//
//   First render, at priority 1:
//     Base state: ''
//     Updates: [A1, C1]
//     Result state: 'AC'
//
//   Second render, at priority 2:
//     Base state: 'A'            <-  The base state does not include C1,
//                                    because B2 was skipped.
//     Updates: [B2, C1, D2]      <-  C1 was rebased on top of B2
//     Result state: 'ABCD'
//
// Because we process updates in insertion order, and rebase high priority
// updates when preceding updates are skipped, the final result is deterministic
// regardless of priority. Intermediate state may vary according to system
// resources, but the final state is always the same.

import {
  NoLane,
  NoLanes,
  OffscreenLane,
  isSubsetOfLanes,
  mergeLanes,
  removeLanes,
  isTransitionLane,
  intersectLanes,
  markRootEntangled,
} from "./ReactFiberLane";
import {
  enterDisallowedContextReadInDEV,
  exitDisallowedContextReadInDEV,
} from "./ReactFiberNewContext";
import {
  Callback,
  Visibility,
  ShouldCapture,
  DidCapture,
} from "./ReactFiberFlags";
import getComponentNameFromFiber from "./getComponentNameFromFiber";

import { debugRenderPhaseSideEffectsForStrictMode } from "shared/ReactFeatureFlags";

import { StrictLegacyMode } from "./ReactTypeOfMode";
import {
  markSkippedUpdateLanes,
  isUnsafeClassRenderPhaseUpdate,
  getWorkInProgressRootRenderLanes,
} from "./ReactFiberWorkLoop";
import {
  enqueueConcurrentClassUpdate,
  unsafe_markUpdateLaneFromFiberToRoot,
} from "./ReactFiberConcurrentUpdates";
import { setIsStrictModeForDevtools } from "./ReactFiberDevToolsHook";

import assign from "shared/assign";

// 初次渲染
export const UpdateState = 0;
export const ReplaceState = 1;
export const ForceUpdate = 2;
export const CaptureUpdate = 3;

// Global state that is reset at the beginning of calling `processUpdateQueue`.
// It should only be read right after calling `processUpdateQueue`, via
// `checkHasForceUpdateAfterProcessing`.
let hasForceUpdate = false;

let didWarnUpdateInsideUpdate;
let currentlyProcessingQueue;
export let resetCurrentlyProcessingQueue;
if (__DEV__) {
  didWarnUpdateInsideUpdate = false;
  currentlyProcessingQueue = null;
  resetCurrentlyProcessingQueue = () => {
    currentlyProcessingQueue = null;
  };
}

// 初始化 fiber.updateQueue，在初次渲染 createRoot 和類組件初次掛載 mountClassInstance 的時候都會調用
// 在 beginWork 階段，updateHostRoot 中使用 processUpdateQueue 再具體賦值
export function initializeUpdateQueue(fiber) {
  console.log(
    "%c [ initializeUpdateQueue ]: ",
    "color: #fff;background: #a0a; font-size: 13px;",
    ""
  );
  /**
   * `BaseUpdate`: 每次調度時都會判斷當前任務是否有足夠的優先級來執行，
   * 如果優先級不夠，就要重新儲存回鏈表中，下次渲染時重新調度，
   * 所以在新一次的調度時，需要優先處理遺留的任務，再開始新的任務
   */
  const queue = {
    // 基本狀態，比方類組件初次掛載更新存初始狀態、頁面的初次渲染，root掛載就是存element
    baseState: fiber.memoizedState,
    // ! 單鏈表的結構，會一路指向 lastBaseUpdate
    firstBaseUpdate: null,
    // 紀錄尾節點，一般來說是不用紀錄尾節點的，只是為了快速比較兩個單鏈表，用尾節點比較
    lastBaseUpdate: null,
    // 新得到的 update 會放在此，處理完後，會轉移到 BaseUpdate 上
    shared: {
      pending: null, // ! 單向循環鏈表，正在掛載的更新
      lanes: NoLanes, // ! Lanes，整個 pending 的 merge
      /**
       * 先跳過
       * 如果類組件是 Activity(以前叫做offScreen)的後代組件，
       * 需要延遲執行期 setState 的 callback，
       * 這裡只是先暫時收集，commit 階段提交，
       */
      hiddenCallbacks: null,
    },
    callbacks: null,
  };
  fiber.updateQueue = queue;
}

export function cloneUpdateQueue(current, workInProgress) {
  // Clone the update queue from current. Unless it's already a clone.
  const queue = workInProgress.updateQueue;
  const currentQueue = current.updateQueue;
  if (queue === currentQueue) {
    const clone = {
      baseState: currentQueue.baseState,
      firstBaseUpdate: currentQueue.firstBaseUpdate,
      lastBaseUpdate: currentQueue.lastBaseUpdate,
      shared: currentQueue.shared,
      callbacks: null,
    };
    workInProgress.updateQueue = clone;
  }
}

export function createUpdate(lane) {
  console.log(
    "%c [ createUpdate ]: ",
    "color: #fff; background: #bf990f; font-size: 13px;",
    ""
  );
  const update = {
    /**
     * Lane
     */
    lane,
    /**
     * 1 | 2 | 3 | 4
     */
    tag: UpdateState,
    payload: null, // 像是 setState 會有參數，forceUpdate 就沒有
    callback: null, // 以前 render 可以加上 callback
    next: null, // Update<State>
  };
  return update;
}

export function enqueueUpdate(fiber, update, lane) {
  console.log(
    "%c [ updateContainer enqueueUpdate ]: ",
    "color: #fff; background: #2c9f; font-size: 13px;",
    ""
  );
  const updateQueue = fiber.updateQueue;
  if (updateQueue === null) {
    // Only occurs if the fiber has been unmounted.
    return null;
  }
  const sharedQueue = updateQueue.shared;

  if (__DEV__) {
    if (
      currentlyProcessingQueue === sharedQueue &&
      !didWarnUpdateInsideUpdate
    ) {
      const componentName = getComponentNameFromFiber(fiber);
      console.error(
        "An update (setState, replaceState, or forceUpdate) was scheduled " +
          "from inside an update function. Update functions should be pure, " +
          "with zero side-effects. Consider using componentDidUpdate or a " +
          "callback.\n\nPlease update the following component: %s",
        componentName
      );
      didWarnUpdateInsideUpdate = true;
    }
  }

  // 類組件舊的生命週期相關的 update，不再展開說明
  if (isUnsafeClassRenderPhaseUpdate(fiber)) {
    // This is an unsafe render phase update. Add directly to the update
    // queue so we can process it immediately during the current render.
    const pending = sharedQueue.pending;
    if (pending === null) {
      // This is the first update. Create a circular list.
      update.next = update;
    } else {
      update.next = pending.next;
      pending.next = update;
    }
    sharedQueue.pending = update;

    // Update the childLanes even though we're most likely already rendering
    // this fiber. This is for backwards compatibility in the case where you
    // update a different component during render phase than the one that is
    // currently renderings (a pattern that is accompanied by a warning).
    return unsafe_markUpdateLaneFromFiberToRoot(fiber, lane);
  } else {
    // ! 實際是走到這裡
    return enqueueConcurrentClassUpdate(fiber, sharedQueue, update, lane);
  }
}

export function entangleTransitions(root, fiber, lane) {
  const updateQueue = fiber.updateQueue;
  if (updateQueue === null) {
    // Only occurs if the fiber has been unmounted.
    return;
  }

  const sharedQueue = updateQueue.shared;
  if (isTransitionLane(lane)) {
    let queueLanes = sharedQueue.lanes;

    // If any entangled lanes are no longer pending on the root, then they must
    // have finished. We can remove them from the shared queue, which represents
    // a superset of the actually pending lanes. In some cases we may entangle
    // more than we need to, but that's OK. In fact it's worse if we *don't*
    // entangle when we should.
    queueLanes = intersectLanes(queueLanes, root.pendingLanes);

    // Entangle the new transition lane with the other transition lanes.
    const newQueueLanes = mergeLanes(queueLanes, lane);
    sharedQueue.lanes = newQueueLanes;
    // Even if queue.lanes already include lane, we don't know for certain if
    // the lane finished since the last time we entangled it. So we need to
    // entangle it again, just to be sure.
    markRootEntangled(root, newQueueLanes);
  }
}

export function enqueueCapturedUpdate(workInProgress, capturedUpdate) {
  // Captured updates are updates that are thrown by a child during the render
  // phase. They should be discarded if the render is aborted. Therefore,
  // we should only put them on the work-in-progress queue, not the current one.
  let queue = workInProgress.updateQueue;

  // Check if the work-in-progress queue is a clone.
  const current = workInProgress.alternate;
  if (current !== null) {
    const currentQueue = current.updateQueue;
    if (queue === currentQueue) {
      // The work-in-progress queue is the same as current. This happens when
      // we bail out on a parent fiber that then captures an error thrown by
      // a child. Since we want to append the update only to the work-in
      // -progress queue, we need to clone the updates. We usually clone during
      // processUpdateQueue, but that didn't happen in this case because we
      // skipped over the parent when we bailed out.
      let newFirst = null;
      let newLast = null;
      const firstBaseUpdate = queue.firstBaseUpdate;
      if (firstBaseUpdate !== null) {
        // Loop through the updates and clone them.
        let update = firstBaseUpdate;
        do {
          const clone = {
            lane: update.lane,

            tag: update.tag,
            payload: update.payload,
            // When this update is rebased, we should not fire its
            // callback again.
            callback: null,

            next: null,
          };
          if (newLast === null) {
            newFirst = newLast = clone;
          } else {
            newLast.next = clone;
            newLast = clone;
          }
          // $FlowFixMe[incompatible-type] we bail out when we get a null
          update = update.next;
        } while (update !== null);

        // Append the captured update the end of the cloned list.
        if (newLast === null) {
          newFirst = newLast = capturedUpdate;
        } else {
          newLast.next = capturedUpdate;
          newLast = capturedUpdate;
        }
      } else {
        // There are no base updates.
        newFirst = newLast = capturedUpdate;
      }
      queue = {
        baseState: currentQueue.baseState,
        firstBaseUpdate: newFirst,
        lastBaseUpdate: newLast,
        shared: currentQueue.shared,
        callbacks: currentQueue.callbacks,
      };
      workInProgress.updateQueue = queue;
      return;
    }
  }

  // Append the update to the end of the list.
  const lastBaseUpdate = queue.lastBaseUpdate;
  if (lastBaseUpdate === null) {
    queue.firstBaseUpdate = capturedUpdate;
  } else {
    lastBaseUpdate.next = capturedUpdate;
  }
  queue.lastBaseUpdate = capturedUpdate;
}

function getStateFromUpdate(
  workInProgress,
  queue,
  update,
  prevState,
  nextProps,
  instance
) {
  switch (update.tag) {
    case ReplaceState: {
      const payload = update.payload;
      if (typeof payload === "function") {
        // Updater function
        if (__DEV__) {
          enterDisallowedContextReadInDEV();
        }
        const nextState = payload.call(instance, prevState, nextProps);
        if (__DEV__) {
          if (
            debugRenderPhaseSideEffectsForStrictMode &&
            workInProgress.mode & StrictLegacyMode
          ) {
            setIsStrictModeForDevtools(true);
            try {
              payload.call(instance, prevState, nextProps);
            } finally {
              setIsStrictModeForDevtools(false);
            }
          }
          exitDisallowedContextReadInDEV();
        }
        return nextState;
      }
      // State object
      return payload;
    }
    case CaptureUpdate: {
      workInProgress.flags =
        (workInProgress.flags & ~ShouldCapture) | DidCapture;
    }
    // Intentional fallthrough
    case UpdateState: {
      const payload = update.payload;
      let partialState;
      if (typeof payload === "function") {
        // Updater function
        if (__DEV__) {
          enterDisallowedContextReadInDEV();
        }
        partialState = payload.call(instance, prevState, nextProps);
        if (__DEV__) {
          if (
            debugRenderPhaseSideEffectsForStrictMode &&
            workInProgress.mode & StrictLegacyMode
          ) {
            setIsStrictModeForDevtools(true);
            try {
              payload.call(instance, prevState, nextProps);
            } finally {
              setIsStrictModeForDevtools(false);
            }
          }
          exitDisallowedContextReadInDEV();
        }
      } else {
        // Partial state object
        partialState = payload;
      }
      if (partialState === null || partialState === undefined) {
        // Null and undefined are treated as no-ops.
        return prevState;
      }
      // Merge the partial state and the previous state.
      return assign({}, prevState, partialState);
    }
    case ForceUpdate: {
      hasForceUpdate = true;
      return prevState;
    }
  }
  return prevState;
}

// ! 處理pending update，把他們轉移到 baseQueue，計算出最終的 state
export function processUpdateQueue(
  workInProgress,
  props, // 新的 props
  instance, // 實例，給類組件
  renderLanes
) {
  console.log(
    "%c [ processUpdateQueue ]: ",
    "color: #bf2c9f; background: pink; font-size: 13px;",
    ""
  );

  // This is always non-null on a ClassComponent or HostRoot
  const queue = workInProgress.updateQueue;
  hasForceUpdate = false;

  if (__DEV__) {
    currentlyProcessingQueue = queue.shared;
  }

  // ! pending update是單向循環鏈表，firstBaseUpdate, lastBaseUpdate 不是
  let firstBaseUpdate = queue.firstBaseUpdate;
  let lastBaseUpdate = queue.lastBaseUpdate;

  // Check if there are pending updates. If so, transfer them to the base queue.
  // ! 檢查是否有 pending update，如果有，就轉移到 baseQueue 上
  // queue.shared.pending; 只有紀錄尾節點
  let pendingQueue = queue.shared.pending;
  if (pendingQueue !== null) {
    queue.shared.pending = null;

    // The pending queue is circular. Disconnect the pointer between first
    // and last so that it's non-circular.
    // firstBaseUpdate -> ... -> lastBaseUpdate
    const lastPendingUpdate = pendingQueue;
    const firstPendingUpdate = lastPendingUpdate.next;
    // ! 斷開循環鏈表
    lastPendingUpdate.next = null;
    // Append pending updates to base queue
    // 如果尾隊列是空，表示整個隊列都是空的
    if (lastBaseUpdate === null) {
      // firstPendingUpdate 就是頭節點 firstBaseUpdate
      firstBaseUpdate = firstPendingUpdate;
    } else {
      // 否則往尾節點繼續添加 firstPendingUpdate
      lastBaseUpdate.next = firstPendingUpdate;
    }
    // 更新尾節點
    lastBaseUpdate = lastPendingUpdate;

    // If there's a current queue, and it's different from the base queue, then
    // we need to transfer the updates to that queue, too. Because the base
    // queue is a singly-linked list with no cycles, we can append to both
    // lists and take advantage of structural sharing.
    // TODO: Pass `current` as argument
    const current = workInProgress.alternate;
    // 如果有 current queue，並且和 base queue不同
    // 那麼也需要把更新轉移到那個 queue 上
    if (current !== null) {
      // This is always non-null on a ClassComponent or HostRoot
      // 類組件和 HostRoot 的 updateQueue 都初始化過，所以不會是 null
      const currentQueue = current.updateQueue;
      const currentLastBaseUpdate = currentQueue.lastBaseUpdate;
      // 如果當前的樹的更新鏈表最後的節點比對 新的樹的尾節點 不一樣，則將新的鏈表拼接到當前的樹中
      if (currentLastBaseUpdate !== lastBaseUpdate) {
        if (currentLastBaseUpdate === null) {
          currentQueue.firstBaseUpdate = firstPendingUpdate;
        } else {
          currentLastBaseUpdate.next = firstPendingUpdate;
        }
        currentQueue.lastBaseUpdate = lastPendingUpdate;
      }
    }
  }
  // 讓 workInProgress 和 current 的 updateQueue 一致

  // These values may change as we process the queue.
  // ! 接下來要遍歷 queue，根據這些 update 計算出最後的結果
  /**
   * ex:
   * root.render(<ClassComponent/>);
   * root.render(jsx);
   * 最後結果是 jsx，
   *
   * 或是
   * this.setState({count: this.state.count + 1})
   * this.setState({count: this.state.count + 2})
   * 最後結果必須要是 +2
   *
   * 所有的 update 都在
   */
  if (firstBaseUpdate !== null) {
    // Iterate through the list of updates to compute the result.
    let newState = queue.baseState;
    // TODO: Don't need to accumulate this. Instead, we can remove renderLanes
    // from the original lanes.
    let newLanes = NoLanes;

    let newBaseState = null;
    let newFirstBaseUpdate = null;
    let newLastBaseUpdate = null;

    let update = firstBaseUpdate;
    // ! 鏈表的循環處理
    do {
      // !!-------略過此段start----- OffscreenLane還沒完成
      // An extra OffscreenLane bit is added to updates that were made to
      // a hidden tree, so that we can distinguish them from updates that were
      // already there when the tree was hidden.
      const updateLane = removeLanes(update.lane, OffscreenLane);
      const isHiddenUpdate = updateLane !== update.lane;

      // Check if this update was made while the tree was hidden. If so, then
      // it's not a "base" update and we should disregard the extra base lanes
      // that were added to renderLanes when we entered the Offscreen tree.
      // ! 判斷更新對像上的lane 是否存在於renderLanes subtreeRenderLanes 上，
      const shouldSkipUpdate = isHiddenUpdate
        ? !isSubsetOfLanes(getWorkInProgressRootRenderLanes(), updateLane)
        : !isSubsetOfLanes(renderLanes, updateLane);

      if (shouldSkipUpdate) {
        // 判斷當前的 update lane 滿足更新優先級條件嗎？否，則把 update 存起來
        // Priority is insufficient. Skip this update. If this is the first
        // skipped update, the previous update/state is the new base
        // update/state.
        const clone = {
          lane: updateLane,

          tag: update.tag,
          payload: update.payload,
          callback: update.callback,

          next: null,
        };

        if (newLastBaseUpdate === null) {
          newFirstBaseUpdate = newLastBaseUpdate = clone;
          // 有 update 延遲了，把 計算好的 newState 保存起來
          newBaseState = newState;
        } else {
          newLastBaseUpdate = newLastBaseUpdate.next = clone;
        }
        // Update the remaining priority in the queue.
        // ! 更新 lane， 他下次遍歷到時才能執行
        newLanes = mergeLanes(newLanes, updateLane);
      } else {
        // This update does have sufficient priority.
        // 滿足更新的條件
        if (newLastBaseUpdate !== null) {
          // 如果前面有 update 被延遲了，後面所有任務都必須進入到被延遲的隊列中
          const clone = {
            // This update is going to be committed so we never want uncommit
            // it. Using NoLane works because 0 is a subset of all bitmasks, so
            // this will never be skipped by the check above.
            lane: NoLane,

            tag: update.tag,
            payload: update.payload,

            // When this update is rebased, we should not fire its
            // callback again.
            callback: null,

            next: null,
          };
          newLastBaseUpdate = newLastBaseUpdate.next = clone;
        }
        // !! -------略過此段end-----
        // !!----走到此-----
        // console.log("遍歷 queue，根據update計算出最後結果newState");
        // Process this update.
        // 因為 ClassComponent state 可以是函式，所以要計算
        newState = getStateFromUpdate(
          workInProgress,
          queue,
          update,
          newState,
          props,
          instance
        );
        const callback = update.callback;
        if (callback !== null) {
          // 標記當前 fiber 有 callback
          workInProgress.flags |= Callback;
          if (isHiddenUpdate) {
            workInProgress.flags |= Visibility;
          }
          const callbacks = queue.callbacks;
          if (callbacks === null) {
            queue.callbacks = [callback];
          } else {
            callbacks.push(callback);
          }
        }
      }
      // $FlowFixMe[incompatible-type] we bail out when we get a null
      // 下一個 update，在 baseQueue 上
      update = update.next;
      if (update === null) {
        // ! 已經到達尾節點，所有 update 都被處理完畢，暫停循環
        pendingQueue = queue.shared.pending;
        if (pendingQueue === null) {
          break;
        } else {
          // ! 當前的 queue 處理完後，queue.shared.pending 可能會有新的更新
          // ! 如果有就把新的放進來繼續處理
          // An update was scheduled from inside a reducer. Add the new
          // pending updates to the end of the list and keep processing.
          const lastPendingUpdate = pendingQueue;
          // Intentionally unsound. Pending updates form a circular list, but we
          // unravel them when transferring them to the base queue.
          const firstPendingUpdate = lastPendingUpdate.next;
          lastPendingUpdate.next = null;
          update = firstPendingUpdate;
          queue.lastBaseUpdate = lastPendingUpdate;
          queue.shared.pending = null;
        }
      }
    } while (true);

    if (newLastBaseUpdate === null) {
      newBaseState = newState;
    }

    // 保存 newState
    queue.baseState = newBaseState;
    // 保存延遲的 update
    queue.firstBaseUpdate = newFirstBaseUpdate;
    queue.lastBaseUpdate = newLastBaseUpdate;

    if (firstBaseUpdate === null) {
      // ! 當多個 transitions 在同個 queue 中時，只允許最近的一個完成，不應該顯示中間的
      // ! 當 queue 是空的，將 queue.lanes 設置為 0
      // `queue.lanes` is used for entangling transitions. We can set it back to
      // zero once the queue is empty.
      queue.shared.lanes = NoLanes;
    }

    // Set the remaining expiration time to be whatever is remaining in the queue.
    // This should be fine because the only two other things that contribute to
    // expiration time are props and context. We're already in the middle of the
    // begin phase by the time we start processing the queue, so we've already
    // dealt with the props. Context in components that specify
    // shouldComponentUpdate is tricky; but we'll have to account for
    // that regardless.
    // 把跳過的 update 的 lanes 記錄下來
    markSkippedUpdateLanes(newLanes);
    workInProgress.lanes = newLanes;
    // ! 把 newState 掛到 workInProgress.memoizedState
    workInProgress.memoizedState = newState;
  }

  if (__DEV__) {
    currentlyProcessingQueue = null;
  }
}

function callCallback(callback, context) {
  if (typeof callback !== "function") {
    throw new Error(
      "Invalid argument passed as callback. Expected a function. Instead " +
        `received: ${callback}`
    );
  }

  callback.call(context);
}

export function resetHasForceUpdateBeforeProcessing() {
  hasForceUpdate = false;
}

export function checkHasForceUpdateAfterProcessing() {
  return hasForceUpdate;
}

export function deferHiddenCallbacks(updateQueue) {
  // When an update finishes on a hidden component, its callback should not
  // be fired until/unless the component is made visible again. Stash the
  // callback on the shared queue object so it can be fired later.
  const newHiddenCallbacks = updateQueue.callbacks;
  if (newHiddenCallbacks !== null) {
    const existingHiddenCallbacks = updateQueue.shared.hiddenCallbacks;
    if (existingHiddenCallbacks === null) {
      updateQueue.shared.hiddenCallbacks = newHiddenCallbacks;
    } else {
      updateQueue.shared.hiddenCallbacks =
        existingHiddenCallbacks.concat(newHiddenCallbacks);
    }
  }
}

export function commitHiddenCallbacks(updateQueue, context) {
  // This component is switching from hidden -> visible. Commit any callbacks
  // that were previously deferred.
  const hiddenCallbacks = updateQueue.shared.hiddenCallbacks;
  if (hiddenCallbacks !== null) {
    updateQueue.shared.hiddenCallbacks = null;
    for (let i = 0; i < hiddenCallbacks.length; i++) {
      const callback = hiddenCallbacks[i];
      callCallback(callback, context);
    }
  }
}

export function commitCallbacks(updateQueue, context) {
  const callbacks = updateQueue.callbacks;
  if (callbacks !== null) {
    updateQueue.callbacks = null;
    for (let i = 0; i < callbacks.length; i++) {
      const callback = callbacks[i];
      callCallback(callback, context);
    }
  }
}
