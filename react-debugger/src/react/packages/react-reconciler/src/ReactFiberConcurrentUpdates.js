/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 *
 */

import {
  warnAboutUpdateOnNotYetMountedFiberInDEV,
  throwIfInfiniteUpdateLoopDetected,
  getWorkInProgressRoot,
} from "./ReactFiberWorkLoop";
import {
  NoLane,
  NoLanes,
  mergeLanes,
  markHiddenUpdate,
} from "./ReactFiberLane";
import { NoFlags, Placement, Hydrating } from "./ReactFiberFlags";
import { HostRoot, OffscreenComponent } from "./ReactWorkTags";
import { OffscreenVisible } from "./ReactFiberOffscreenComponent";

/**
 * export type ConcurrentUpdate = {
 *  next: ConcurrentUpdate, // 包含了兩種 Update，ClassUpdate | HookUpdate
 *  lane: Lane
 * }
 *
 * type ConcurrentQueue = {
 *  pending: ConcurrentUpdate | null
 * }
 */

// If a render is in progress, and we receive an update from a concurrent event,
// we wait until the current render is over (either finished or interrupted)
// before adding it to the fiber/hook queue. Push to this array so we can
// access the queue, fiber, update, et al later.
/**
 * ! 沒有立刻把 update 放到 fiber 上面，先放到 concurrentQueues，
 * 如果渲染正在進行中，並且收到來自併發事件的更新，
 * 就會等到當前的渲染結束，（不論是完成或是被中斷），
 * 或是 setState 2次 -> 2個update，
 * 重複2次(createUpdate -> enqueueUpdate -> scheduleUpdateOnFiber)
 * 將update推送到這個陣列中，這樣以後就可以訪問 queue, fiber, update 等等
 *
 *
 * 再在 render 後、workLoopSync 前
 * finishQueueingConcurrentUpdates 一次處理，將其添加到 fiber 隊列當中
 */
const concurrentQueues = [];
let concurrentQueuesIndex = 0;

let concurrentlyUpdatedLanes = NoLanes;

/**
 * ! 把 concurrentQueues 的內容添加到 fiber 的 queue 上
 * ! 在 render 階段剛開始時，prepareFreshStack 中
 * ! 在 render 階段結束時，最後再次調用
 */
export function finishQueueingConcurrentUpdates() {
  console.log(
    "%c [ finishQueueingConcurrentUpdates ]: ",
    "color: #bf2c9f; background: pink; font-size: 13px;",
    ""
  );
  const endIndex = concurrentQueuesIndex;
  concurrentQueuesIndex = 0; // reset

  concurrentlyUpdatedLanes = NoLanes; // reset

  let i = 0;
  while (i < endIndex) {
    const fiber = concurrentQueues[i];
    concurrentQueues[i++] = null;
    const queue = concurrentQueues[i];
    concurrentQueues[i++] = null;
    const update = concurrentQueues[i];
    concurrentQueues[i++] = null;
    const lane = concurrentQueues[i];
    concurrentQueues[i++] = null;

    /**
     * 這裡建構完成之後的 fiber.updateQueue.shared.pending 數據類型是 update
     * 但是 fiber.updateQueue.shared.pending 儲存的是單向循環鏈表
     * 所以他其實指向的是最後一個update，他的next指向第一個update
     */
    if (queue !== null && update !== null) {
      const pending = queue.pending; // 單向循環
      if (pending === null) {
        // This is the first update. Create a circular list.
        // 沒有等待的更新，鏈表還是空的，所以自己指向自己
        update.next = update;
      } else {
        // fiber上沒有新的更新，所以插入update進去最後
        update.next = pending.next;
        pending.next = update;
      }
      queue.pending = update;
    }

    if (lane !== NoLane) {
      // ! 自底向上更新整個優先級 fiber.lanes
      // 從當前節點開始，往上找到根節點，更新 childLanes
      markUpdateLaneFromFiberToRoot(fiber, update, lane);
    }
  }
}

export function getConcurrentlyUpdatedLanes() {
  return concurrentlyUpdatedLanes;
}

// ! 入隊，進入陣列
function enqueueUpdate(fiber, queue, update, lane) {
  console.log(
    "%c [ enqueueConcurrentClassUpdate ]: ",
    "color: #fff; background: green; font-size: 13px;",
    ""
  );
  // console.log("把fiber,queue,update,lane 放到 concurrentQueues，mergeLanes");
  // Don't update the `childLanes` on the return path yet. If we already in
  // the middle of rendering, wait until after it has completed.
  concurrentQueues[concurrentQueuesIndex++] = fiber;
  concurrentQueues[concurrentQueuesIndex++] = queue;
  concurrentQueues[concurrentQueuesIndex++] = update;
  concurrentQueues[concurrentQueuesIndex++] = lane;
  // debugger;
  // console.log("concurrentQueues", concurrentQueues);
  // ! merge Lane -> Lanes
  concurrentlyUpdatedLanes = mergeLanes(concurrentlyUpdatedLanes, lane);
  // The fiber's `lane` field is used in some places to check if any work is
  // scheduled, to perform an eager bailout, so we need to update it immediately.
  // TODO: We should probably move this to the "shared" queue instead.
  fiber.lanes = mergeLanes(fiber.lanes, lane);

  const alternate = fiber.alternate;
  if (alternate !== null) {
    // 把老節點的lane和新的lane merge 記錄下來
    alternate.lanes = mergeLanes(alternate.lanes, lane);
  }
}

export function enqueueConcurrentHookUpdate(fiber, queue, update, lane) {
  const concurrentQueue = queue;
  const concurrentUpdate = update;
  enqueueUpdate(fiber, concurrentQueue, concurrentUpdate, lane);
  return getRootForUpdatedFiber(fiber);
}

export function enqueueConcurrentHookUpdateAndEagerlyBailout(
  fiber,
  queue,
  update
) {
  // This function is used to queue an update that doesn't need a rerender. The
  // only reason we queue it is in case there's a subsequent higher priority
  // update that causes it to be rebased.
  const lane = NoLane;
  const concurrentQueue = queue;
  const concurrentUpdate = update;
  enqueueUpdate(fiber, concurrentQueue, concurrentUpdate, lane);

  // Usually we can rely on the upcoming render phase to process the concurrent
  // queue. However, since this is a bail out, we're not scheduling any work
  // here. So the update we just queued will leak until something else happens
  // to schedule work (if ever).
  //
  // Check if we're currently in the middle of rendering a tree, and if not,
  // process the queue immediately to prevent a leak.
  const isConcurrentlyRendering = getWorkInProgressRoot() !== null;
  if (!isConcurrentlyRendering) {
    finishQueueingConcurrentUpdates();
  }
}

export function enqueueConcurrentClassUpdate(fiber, queue, update, lane) {
  const concurrentQueue = queue;
  const concurrentUpdate = update;
  // 入隊，進入陣列
  enqueueUpdate(fiber, concurrentQueue, concurrentUpdate, lane);
  // 返回 fiberRoot
  return getRootForUpdatedFiber(fiber);
}

export function enqueueConcurrentRenderForLane(fiber, lane) {
  enqueueUpdate(fiber, null, null, lane);
  return getRootForUpdatedFiber(fiber);
}

// Calling this function outside this module should only be done for backwards
// compatibility and should always be accompanied by a warning.
export function unsafe_markUpdateLaneFromFiberToRoot(sourceFiber, lane) {
  // NOTE: For Hyrum's Law reasons, if an infinite update loop is detected, it
  // should throw before `markUpdateLaneFromFiberToRoot` is called. But this is
  // undefined behavior and we can change it if we need to; it just so happens
  // that, at the time of this writing, there's an internal product test that
  // happens to rely on this.
  const root = getRootForUpdatedFiber(sourceFiber);
  markUpdateLaneFromFiberToRoot(sourceFiber, null, lane);
  return root;
}

// ! 從 fiber 開始，逐層往上找到根節點，標記 update 更新
function markUpdateLaneFromFiberToRoot(sourceFiber, update, lane) {
  // Update the source fiber's lanes
  // 更新 fiber lanes
  sourceFiber.lanes = mergeLanes(sourceFiber.lanes, lane);
  let alternate = sourceFiber.alternate;
  if (alternate !== null) {
    alternate.lanes = mergeLanes(alternate.lanes, lane);
  }
  // Walk the parent path to the root and update the child lanes.
  let isHidden = false;
  // 從當前節點開始往上找
  let parent = sourceFiber.return;
  let node = sourceFiber;
  while (parent !== null) {
    parent.childLanes = mergeLanes(parent.childLanes, lane);
    alternate = parent.alternate;
    if (alternate !== null) {
      alternate.childLanes = mergeLanes(alternate.childLanes, lane);
    }

    if (parent.tag === OffscreenComponent) {
      // Check if this offscreen boundary is currently hidden.
      //
      // The instance may be null if the Offscreen parent was unmounted. Usually
      // the parent wouldn't be reachable in that case because we disconnect
      // fibers from the tree when they are deleted. However, there's a weird
      // edge case where setState is called on a fiber that was interrupted
      // before it ever mounted. Because it never mounts, it also never gets
      // deleted. Because it never gets deleted, its return pointer never gets
      // disconnected. Which means it may be attached to a deleted Offscreen
      // parent node. (This discovery suggests it may be better for memory usage
      // if we don't attach the `return` pointer until the commit phase, though
      // in order to do that we'd need some other way to track the return
      // pointer during the initial render, like on the stack.)
      //
      // This case is always accompanied by a warning, but we still need to
      // account for it. (There may be other cases that we haven't discovered,
      // too.)
      const offscreenInstance = parent.stateNode;
      if (
        offscreenInstance !== null &&
        !(offscreenInstance._visibility & OffscreenVisible)
      ) {
        isHidden = true;
      }
    }

    node = parent;
    parent = parent.return;
  }

  if (isHidden && update !== null && node.tag === HostRoot) {
    const root = node.stateNode;
    markHiddenUpdate(root, update, lane);
  }
}

function getRootForUpdatedFiber(sourceFiber) {
  // TODO: We will detect and infinite update loop and throw even if this fiber
  // has already unmounted. This isn't really necessary but it happens to be the
  // current behavior we've used for several release cycles. Consider not
  // performing this check if the updated fiber already unmounted, since it's
  // not possible for that to cause an infinite update loop.
  throwIfInfiniteUpdateLoopDetected();

  // When a setState happens, we must ensure the root is scheduled. Because
  // update queues do not have a backpointer to the root, the only way to do
  // this currently is to walk up the return path. This used to not be a big
  // deal because we would have to walk up the return path to set
  // the `childLanes`, anyway, but now those two traversals happen at
  // different times.
  // TODO: Consider adding a `root` backpointer on the update queue.
  detectUpdateOnUnmountedFiber(sourceFiber, sourceFiber);
  let node = sourceFiber;
  let parent = node.return;
  while (parent !== null) {
    detectUpdateOnUnmountedFiber(sourceFiber, node);
    node = parent;
    parent = node.return;
  }
  return node.tag === HostRoot ? node.stateNode : null;
}

function detectUpdateOnUnmountedFiber(sourceFiber, parent) {
  if (__DEV__) {
    const alternate = parent.alternate;
    if (
      alternate === null &&
      (parent.flags & (Placement | Hydrating)) !== NoFlags
    ) {
      warnAboutUpdateOnNotYetMountedFiberInDEV(sourceFiber);
    }
  }
}
