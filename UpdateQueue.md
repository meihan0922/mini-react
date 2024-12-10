- [ClassComponent 和 HostRoot 的 UpdateQueue](#classcomponent---hostroot---updatequeue)
  - [updateQueue 的結構和初始化創建 - initializeUpdateQueue](#updatequeue-------------initializeupdatequeue)
  - [創建 update - createUpdate](#---update---createupdate)
  - [update 入隊](#update---)
  - [管理 concurrentQueues 掛上 UpdateQueue - finishQueueingConcurrentUpdates](#---concurrentqueues----updatequeue---finishqueueingconcurrentupdates)
  - [處理 UpdateQueue - processUpdateQueue](#---updatequeue---processupdatequeue)
  - [總結](#--)
  - [所以， setState 為什麼是異步的？](#----setstate---------)

# ClassComponent 和 HostRoot 的 UpdateQueue

react 節點狀態儲存在 `fiber.memorizedState` 上，老節點到新節點的更新儲存在 `fiber.updateQueue` 上。不同類型節點對應的 `updateQueue` 儲存的內容格式不同。

- class 組件處理 state 更新，和 hostRoot 處理 render
- 函式組件處理 effect

## updateQueue 的結構和初始化創建 - initializeUpdateQueue

- 初始化 fiber.updateQueue，在初次渲染 `createRoot` 和類組件初次掛載 `mountClassInstance` 的時候都會調用

- 在 `beginWork` 階段， `updateHostRoot` 中使用 `processUpdateQueue` 再具體賦值

- `BaseUpdate`: 每次調度時都會判斷當前任務是否有足夠的優先級來執行，如果優先級不夠，就要重新儲存回鏈表中，下次渲染時重新調度，所以在新一次的調度時，需要優先處理遺留的任務，再開始新的任務

> react-debugger/src/react/packages/react-reconciler/src/ReactFiberClassUpdateQueue.js

```ts
export function initializeUpdateQueue(fiber) {
  console.log(
    "%c [ initializeUpdateQueue ]: ",
    "color: #fff;background: #a0a; font-size: 13px;",
    ""
  );
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
```

## 創建 update - createUpdate

在 `updateContainer` 中，會創建新的 `update`。
類組件 `setState`, `forceUpdate` 和 `createRoot(domNode).render()` 都會產生的 `update`

```ts
const update = createUpdate(lane);
```

比方去釣魚，一個 `update` 就是一隻魚，會搜集起來放進籃子中，再一起賣掉。

> react-debugger/src/react/packages/react-reconciler/src/ReactFiberClassUpdateQueue.js

```ts
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
```

## update 入隊

不會立刻把 `update` 放到 fiber 上面，先放到 `concurrentQueues` ，如果渲染正在進行中，並且收到來自併發事件的更新，就會等到當前的渲染結束，（不論是完成或是被中斷）。
如果 `setState` 2 次 -> 2 個 `update` ，重複 2 次(`createUpdate` -> `enqueueUpdate` -> `scheduleUpdateOnFiber`)，將 update 推送到 `concurrentQueues` 陣列中，這樣以後就可以訪問 queue, fiber, update 等等。
再在 render 後、workLoopSync 前， `finishQueueingConcurrentUpdates` 一次處理，將其添加到 `queue.shared.pending;` 隊列當中

值得注意的是，hooks 當中也會調用
hooks 的 update 和 queue:

```ts
// 存在在 fiber 的 memoizedState 上
const hookUpdate = {
  memoizedState: null,
  baseState: null,
  baseQueue: null,
  queue: {
    pending: null,
    lanes: NoLanes,
    dispatch: null,
    lastRenderedReducer: reducer,
    lastRenderedState: initialState,
  },
  next: null,
};
```

class component 的 update:

```ts
const classComponentUpdate = {
  lane, // Lane
  tag: UpdateState, //  1 | 2 | 3 | 4
  payload: null, // 像是 setState 會有參數，forceUpdate 就沒有
  callback: null, // 以前 render 可以加上 callback
  next: null, // Update<State> 多次調用會組成鏈表，供後續批量處理
};

// 存在在 fiber 的 updateQueue 上
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
```

> react-debugger/src/react/packages/react-reconciler/src/ReactFiberClassUpdateQueue.js

```ts
export function enqueueConcurrentClassUpdate(fiber, queue, update, lane) {
  const concurrentQueue = queue;
  const concurrentUpdate = update;
  // 入隊，進入陣列
  enqueueUpdate(fiber, concurrentQueue, concurrentUpdate, lane);
  // 返回 fiberRoot
  return getRootForUpdatedFiber(fiber);
}
```

> react-debugger/src/react/packages/react-reconciler/src/ReactFiberConcurrentUpdates.js

```ts
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
```

## 管理 concurrentQueues 掛上 UpdateQueue - finishQueueingConcurrentUpdates

`scheduleUpdateOnFiber` -> 調度更新開始之前（render 剛開始） `prepareFreshStack` ， 執行 `finishQueueingConcurrentUpdates`，調度更新結束時，再次調用。更新時也會調用。

把 concurrentQueues 的內容添加到 fiber 的 queue 上

```ts
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
```

## 處理 UpdateQueue - processUpdateQueue

走到 `beginWork`，tag 分類走到 `updateHostRoot` || `updateClassComponent`，如果需要處理 fiber 上的 `updateQueue` 就會調用 `processUpdateQueue`

中間會遍歷隊列，判斷出每個 update 的 lane 是否滿足更新隊列的優先級，
如果不滿足，就把它存起來。
如果滿足，先判斷前面如果出現過有 update 被推遲，那後面所有的任務都必須進入到被延遲的隊列中，因為前一個任務可能會影響到後面一個。並且被推遲的 update lane 會被設成 NoLane 等級，在接下來的優先級檢測中，都會被判定可運行，這樣下次遍歷到時就可以執行。
計算新的 state 後，放入 queue.baseState，

> react-debugger/src/react/packages/react-reconciler/src/ReactFiberClassUpdateQueue.js

```ts
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
      // An extra OffscreenLane bit is added to updates that were made to
      // a hidden tree, so that we can distinguish them from updates that were
      // already there when the tree was hidden.
      const updateLane = removeLanes(update.lane, OffscreenLane);
      const isHiddenUpdate = updateLane !== update.lane;

      // Check if this update was made while the tree was hidden. If so, then
      // it's not a "base" update and we should disregard the extra base lanes
      // that were added to renderLanes when we entered the Offscreen tree.
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
        // 更新 lane， 他下次遍歷到時才能執行
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
        // console.log("遍歷 queue，根據update計算出最後結果newState");
        // Process this update.
        // 因為 ClassComponent state 可以是函式，所以要計算
        // 根據更新設置的 tag 判斷需要的模式
        // ReplaceState -> 捨棄就狀態，直接用新的
        // UpdateState -> 新就合併
        // ForceUpdate -> 返回舊的狀態，把 hasForceUpdate 修改成 true，在後續會判定修改
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
      // 下一個 update
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
}
```

## 總結

使用 updateQueue 儲存更新，其中存儲了每個更新，更新是從 `setState`,`replaceState`,`forceUpdate` 等函式調用 `enqueueUpdate` 創建的。

對於優先級不夠的任務，暫時儲存起來，下次調度。
足夠的就通過 `getStateFromUpdate` 獲得更新後的數據和調用的模式，決定 state 是要合併還是替換。如果是 `forceUpdate` 就做標記，之後在 render 階段再進行更新。

只有全部任務更新完畢，沒有延遲任務時，才會更新 state。不然就會儲存更新結果，但不更新。

## 所以， setState 為什麼是異步的？

不是每次創建一個更新就執行，而且每次更新是批量處理一批，所以他是異步的，不一定會立刻獲得響應。
想要同步，可以使用 forceUpdate。
