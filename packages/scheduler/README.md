# 造輪子步驟

1. 建立變數

   1. 有兩個任務池，一個是當前正在執行的 - `currentTask`，一個是排隊中的（最小堆）- `taskQueue`。
   2. `currentPriorityLevel` - 紀錄當前處理的任務優先級，供之後判斷是否優先執行
   3. `isHostCallbackScheduled` - 主線程是否正在調度中
   4. `isPerformingWork` - 是否有任務正在執行
   5. `isMessageLoopRunning` - 是否已經申請過時間切片

2. `scheduleCallback`
   1. 當有新的任務時，會按照優先等級，封裝成 Task 物件，推入最小堆，
   2. 看主線程是否還在忙調度 `isHostCallbackScheduled`?
      1. 沒有，啟動主線程，開始調度 `requestHostCallback`。
      2. `isHostCallbackScheduled`設定為`true`
3. `requestHostCallback`
   1. 詢問時間切片部門是否在忙`isMessageLoopRunning`？
      1. 沒有
         1. 通知申請時間切片的部門，請幫忙申請宏任務 `schedulePerformWorkUntilDeadline`
         2. `isMessageLoopRunning`設定為`true`
4. `schedulePerformWorkUntilDeadline` 透過 `MessageChannel()` 申請宏任務執行`performWorkUntilDeadline`
5. `performWorkUntilDeadline`
   1. 去執行任務池最小堆`flushWork`，
      1. 主線程是否還在忙調度`isHostCallbackScheduled`設定為`false`
      2. 紀錄當前的任務優先級，供任務循環後使用
      3. 是否在執行任務中`isPerformingWork`設定為`true`
      4. 調用工作循環`workLoop`會回傳 最小堆任務池還有剩餘的任務嗎？
         1. `workLoop` 不斷取出最高優先級任務，判斷任務是否過期&是否還在時間切片內（startTime 紀錄時間切片開始時間-當前執行時間，是否小於 5ms `shouldYieldToHost`，如果時間已到，則跳出循環
         2. 執行任務，將是否過期了傳給 callback
         3. 執行完成後就 currentTask.callback 設為空值
         4. 紀錄當前執行完成時間
         5. 紀錄當前執行任務的層級
         6. 如果當前任務的 callback 被取消是空值，就刪除堆頂
         7. 看是否回傳函式
            1. 是，賦值給當前任務的 callback，回傳 `true`
            2. 否，取最小堆頂判斷和當前執行任務是否為同一個
               1. 是就刪除堆頂
         8. 回傳看當前任務堆是否還有值，表示尚未執行完畢但時間已到
      5. 把`當前任務池`設為空，`當前處理的任務優先級`設定為前一個任務優先級
      6. 是否在執行任務中`isPerformingWork`設定為`false`
   2. 之後看`workLoop`回傳的當前任務池執行還有剩餘的任務嗎？
      1. 有: 就回到 2.`schedulePerformWorkUntilDeadline` 申請下一個時間切片。
      2. 沒有: 把時間切片部門設定為閒置：`isMessageLoopRunning  = false`
6. 建立取消正在執行的任務堆的某任務函式 & export
7. 建立取得當前正在執行的任務的優先等級函式 & export
8. 是否要終止任務，把控制權交給主線程函式 & export

### 三把鎖 - 避免重複調度

如果任務一直進來，瘋狂跑 requestHostCallback -> schedulePerformWorkUntilDeadline，才會需要三把鎖`isHostCallbackScheduled` `isPerformingWork` `isMessageLoopRunning`，只有 task queue 被清空了（也就是目前所有的任務有被執行完），scheduler 才會重新發起一次調度請求。

- `isHostCallbackScheduled`： 正在等待 callback 被回調；(scheduleCallback 被設成 true，flushwork 被設成 false)
- `isPerformingWork`： callback 被回調了，正在運行 work loop；(flushwork 開始被設成 true，結束 false)
- `isMessageLoopRunning`： 無數個 work loop 之後，task queue 終於被清空。(requestHostCallback 發起調度時間切片 schedulePerformWorkUntilDeadline 前，被設成 true。performWorkUntilDeadline 中，task queue 被清空，所有任務都執行完之後被設定為 false)

### 造任務池，當前任務優先級

```ts
// arg: 是否時間切片到了，過期了嗎？
type Callback = (arg: boolean) => Callback | null | boolean;
// 任務進入 scheduler 後被封裝成 Task
export type Task = {
  id: number;
  // 任務的初始值，意思是時間到了要執行的任務
  callback: Callback | null;
  priorityLevel: PriorityLevel;
  // 任務是什麼時候進來調度器的，時間切片的起始時間
  startTime: number;
  // 過期時間
  expirationTime: number;
  sortIndex: number;
};
/**
 * ! 鎖頭，紀錄是否有work正在執行，避免重複調度
 */
let isPerformingWork = false;
/**
 * ! 主線程是否正在調度中
 */
let isHostCallbackScheduled = false;
/**
 * ! 延遲任務的計時器
 */
let taskTimeoutId = -1;
/**
 * ! 主線程是否正在倒計時調度中
 */
let isHostTimeoutScheduled = false;
/**
 * ! 宏任務不能重複創建
 */
let isMessageLoopRunning = false;
let taskIdCounter = 1;

// * 任務池，最小堆
const taskQueue: Array<Task> = [];
// * 當前任務池
let currentTask: Task | null = null;
// * 延遲任務池
const timerQueue: Array<Task> = [];
let currentPriorityLevel: PriorityLevel = NoPriority;
```

### `scheduleCallback`

1.  當有新的任務時，會按照優先等級，封裝成 Task 物件，推入最小堆，
2.  看主線程是否還在忙調度 `isHostCallbackScheduled`?
    1. 沒有，啟動主線程，開始調度 `requestHostCallback`。
    2. `isHostCallbackScheduled`設定為`true`

```ts
let taskIdCounter = 1;
/**
 * * 任務調度器的入口，某任務進入調度器，等待調度
 * @param priorityLevel
 * @param callback
 */
function scheduleCallback(priorityLevel: PriorityLevel, callback: Callback) {
  const startTime = getCurrentTime();
  // 理論上的過期時間 相當於執行時間，根據不同的優先級，給予不同的過期時間
  let timeout: number;
  switch (priorityLevel) {
    // 立即到期
    case ImmediatePriority:
      timeout = -1;
      break;
    case UserBlockingPriority:
      timeout = userBlockingPriorityTimeout;
      break;
    case NormalPriority:
      timeout = normalPriorityTimeout;
      break;
    case LowPriority:
      timeout = lowPriorityTimeout;
      break;
    case IdlePriority:
      timeout = maxSigned31BitInt;
    case NormalPriority:
    default:
      timeout = frameYieldMs;
      break;
  }
  const expirationTime = startTime + timeout;
  const newTask: Task = {
    id: taskIdCounter++,
    priorityLevel,
    callback,
    startTime,
    expirationTime,
    sortIndex: -1,
  };
  newTask.sortIndex = expirationTime;
  push(taskQueue, newTask);

  // ! 主線程沒有在忙，而且也沒有時間切片在執行
  // 時間切片內正在執行中！
  if (!isHostCallbackScheduled && !isPerformingWork) {
    isHostCallbackScheduled = true;
    requestHostCallback();
  }
}
```

### requestHostCallback

啟動主線程，開始調度

1.  詢問時間切片部門是否在忙`isMessageLoopRunning`？
    1. 沒有，通知申請時間切片的部門，請幫忙申請宏任務 `schedulePerformWorkUntilDeadline`
    2. `isMessageLoopRunning`設定為`true`

```ts
// 主線程開始處理 callback，發起調度
function requestHostCallback() {
  // 上個任務池結束，沒有在調度中，可以發起調度
  if (!isMessageLoopRunning) {
    isMessageLoopRunning = true;
    schedulePerformWorkUntilDeadline();
  }
}
```

### schedulePerformWorkUntilDeadline

申請時間切片，申請宏任務

```ts
const channel = new MessageChannel();
const port2 = channel.port2;
channel.port1.onmessage = performWorkUntilDeadline;

// 申請時間切片
// 固定的時間切片內，執行任務們，直到時間切片到點為止
function schedulePerformWorkUntilDeadline() {
  port2.postMessage(null);
}
```

### performWorkUntilDeadline

1. 去執行任務池最小堆`flushWork`，
   1. 主線程是否還在忙調度`isHostCallbackScheduled`設定為`false`
   2. 紀錄當前處理的任務優先級
   3. 是否在執行任務中`isPerformingWork`設定為`true`
   4. 調用工作循環`workLoop`會回傳 最小堆任務池還有剩餘的任務嗎？
      1. `workLoop` 不斷取出最高優先級任務，判斷任務是否過期&是否小於 5ms 終止任務
      2. 紀錄當前執行任務的層級
      3. 如果當前任務的 callback 被取消是空值，就刪除堆頂
      4. 執行完成後，把當前任務堆的 callback 設為空值
      5. 看是否回傳函式
         1. 是，賦值給當前任務的 callback，回傳 `true`
         2. 否，取最小堆頂判斷和當前執行任務是否為同一個
            1. 是就刪除堆頂
      6. 回傳看當前任務堆是否還有值，表示尚未執行完畢但時間已到
   5. 把`當前任務池`設為空，`當前處理的任務優先級`設定為前一個任務優先級
   6. 是否在執行任務中`isPerformingWork`設定為`false`
   7. 之後看`workLoop`回傳的當前任務池執行還有剩餘的任務嗎？
      1. 有: 就回到 2.`schedulePerformWorkUntilDeadline` 申請下一個時間切片。
      2. 沒有: 把時間切片部門設定為閒置：`isMessageLoopRunning  = false`
2. 之後看`workLoop`回傳的當前任務池執行還有剩餘的任務嗎？
   1. 有: 就回到 2.`schedulePerformWorkUntilDeadline` 申請下一個時間切片。
   2. 沒有: 把時間切片部門設定為閒置：`isMessageLoopRunning  = false`

```ts
function performWorkUntilDeadline() {
  if (isMessageLoopRunning) {
    const currentTime = getCurrentTime();
    startTime = currentTime;
    let hasMoreWork = true;

    try {
      // 還有任務還沒執行完成嗎
      hasMoreWork = flushWork(currentTime);
    } finally {
      if (hasMoreWork) {
        // 還有就申請下一個時間切片
        schedulePerformWorkUntilDeadline();
      } else {
        // 任務堆都被清空了，可以再發起調度了
        isMessageLoopRunning = false;
      }
    }
  }
}

function flushWork(initialTime: number) {
  isHostCallbackScheduled = false;
  isPerformingWork = true;
  let previousPriorityLevel = currentPriorityLevel;
  try {
    return workLoop(initialTime);
  } finally {
    currentTask = null;
    currentPriorityLevel = previousPriorityLevel;
    isPerformingWork = false;
  }
}

/**
 * 有很多的 Task，都包含要執行的 callback
 * 在時間切片內執行多個 task callback，循環執行 loop
 * 直到時間切片結束為止
 * @param initialTime 執行時間
 * @returns boolean 是否還有任務沒有執行完畢，還要繼續執行
 */
function workLoop(initialTime: number): boolean {
  let currentTime = initialTime;
  // 取出優先級最高的任務
  currentTask = peek(taskQueue);
  while (currentTask !== null) {
    // 如果當前的任務沒有過期，但時間已經到了，應該要跳出回圈
    // 如果，如果當前時間戳大於expirationTime的值（也就是說十分緊急！），也就無法跳出while(){}循環，只能去執行這個過期任務。同時，scheduler 還有透過didUserCallbackTimeout來把「任務過期了」這個訊息告知呼叫方，讓呼叫方自己看著辦。就react 這個呼叫方而言，它將會用「同步不可中斷」的方式去這個任務。 scheduler 只是負責告知呼叫方目前這個任務已經過期了。
    // time slicing 並不是總是能奏效的。它能奏效的前提是在一個時間片的時間內所執行的任務沒有過期任務。
    if (currentTask.expirationTime > currentTime && shouldYieldToHost()) {
      break;
    }
    const callback = currentTask.callback;
    if (isFn(callback)) {
      // 是否過期了？
      const didUserCallbackTimeout = currentTask.expirationTime <= currentTime;
      // 說不定執行完 callback 後，還回傳 callback
      const continuationCallback = callback(didUserCallbackTimeout);
      currentTask.callback = null;
      currentPriorityLevel = currentTask.priorityLevel;
      if (isFn(continuationCallback)) {
        currentTask.callback = continuationCallback;
        return true;
      } else {
        // 因為 taskQueue 是動態的，在執行 callback 期間可能又有其他任務被調度進去
        // 檢查下，如果是一樣的，就可以刪除
        if (peek(taskQueue) === currentTask) {
          pop(taskQueue);
        }
      }
    } else {
      pop(taskQueue);
    }

    currentTask = peek(taskQueue);
  }

  if (currentTask !== null) {
    return true;
  } else {
    return false;
  }
}
```

### 建立取消正在執行的任務堆的某任務函式 & export

```ts
/**
 * * 取消某個任務，由於已經放進任務池了，加上最小堆沒辦法直接刪，只能初步把 task.callback = null
 * 調度過程中，當這個任務至於堆頂時，刪掉
 */
function cancelCallback() {
  currentTask!.callback = null;
}
```

### 建立取得當前正在執行的任務的優先等級函式 & export

```ts
/**
 * * 獲取當前正在執行任務的優先級
 * @returns
 */
function getCurrentPriorityLevel(): PriorityLevel {
  return currentTask?.priorityLevel ?? currentPriorityLevel;
}
```

### 是否要終止任務，把控制權交給主線程函式 & export

```ts
/**
 * * 是否要終止執行，把控制權交還給主線程
 */
function shouldYieldToHost() {
  const timeElapsed = getCurrentTime() - startTime;

  if (timeElapsed < frameInterval) {
    return false;
  }
  return true;
}
```

### 調度延遲任務

`scheduler` 當中有延遲任務的代碼邏輯，但是這塊代碼在 react v18.2 中沒有用到。
延遲任務在到執行時間之前有自己的任務池！`timeQueue`
在`scheduleCallback`當中會把有延遲的任務塞入延遲任務池當中。

1. `scheduleCallback`
   1. 新增參數`options:{delay:number}`，延後執行的時間，把它加進開始時間`startTime`裡面。
   2. 一樣跑建立任務物件的流程，之後判斷是否是延遲任務
      1. 是，`sortIndex = startTime`，用開始時間來決定最小堆的排序，越小表示越先開始。
      2. 把他放入延遲的任務堆裡。
      3. 如果沒有等待進行的任務並且這個延遲任務又是最優先的
         1. 主線程正在忙調度嗎？
            1. 是，newTask 才是堆頂任務，應該會最先到達執行時間，但目前其他延遲任務正在倒計時，說明有問題！！
            2. 否，主線程是否在進行計時器調度 `isHostTimeoutScheduled = true;`
         2. 不管怎樣，開啟計時器 `requestHostTimeout`
2. 開啟計時器 `requestHostTimeout`，時間到執行 `handleTimeout`
   1. 主線程是否在進行計時器調度 `isHostTimeoutScheduled = false;`
   2. 進入整個延遲任務堆處理`advanceTimers`
      1. 把任務取出，，while 取堆頂，判斷任務是否有效
         1. `timer.sortIndex = timer.expirationTime;`，把他推進任務池當中
         2. 是執行時間還沒到？還是真的無效任務？要馬刪除要麻跳過循環
   3. `isHostCallbackScheduled` 主線程是否在調度中
      1. 否，任務堆頂是否有任務？
         1. 是，則開始調度
         2. 否，則延遲任務堆頂是否有任務？
            1. 否，則開啟計時器
3. `workLoop`，一開始必須先整個延遲任務堆處理，並且在 while 迴圈處理任務當中，每處理完一個任務，都應該要去驗證延遲任務堆是否到期，重新放入任務堆。
4. 如果當前任務執行完畢，檢查延遲任務堆，如果不為空，要發起計時器。

### 延時任務轉普通任務的時機?

- 1. 開始 task queue 的 work loop 之前
- 2. 在 work loop 的每一個迭代中，當執行完一次任務後
- 3. 當 work loop 中斷後且 task queue 已經清空，scheduler 就會嘗試去檢查 timer queue，看看是否有延遲到期的任務可以轉移到 task queue 中去

### `scheduleCallback` 加入延遲任務參數

1. 新增參數`options:{delay:number}`，延後執行的時間，把它加進開始時間`startTime`裡面。
2. 一樣跑建立任務物件的流程
3. 之後判斷是否是延遲任務
   1. 是，`sortIndex = startTime`，用開始時間來決定最小堆的排序，越小表示越先開始。
   2. 把他放入延遲的任務堆裡。
   3. 如果沒有等待進行的任務並且這個延遲任務又是最優先的
      1. 主線程正在忙調度嗎？
         1. 是，newTask 才是堆頂任務，應該會最先到達執行時間，但目前其他延遲任務正在倒計時，說明有問題！！
         2. 否，主線程是否在進行計時器調度 `isHostTimeoutScheduled = true;`
      2. 不管怎樣，開啟計時器 `requestHostTimeout`

```ts
/**
 * ! 延遲任務的計時器
 */
let taskTimeoutId = -1;
/**
 * ! 主線程是否正在倒計時調度中
 */
let isHostTimeoutScheduled = false;

function scheduleCallback(
  priorityLevel: PriorityLevel,
  callback: Callback,
  // 1. 新增參數`options:{delay:number}`，延後執行的時間
  options?: { delay: number }
) {
  const currentTime = getCurrentTime();
  let startTime: number = currentTime;
  // 2. 把它加進開始時間`startTime`裡面。
  if (typeof options === "object" && options !== null) {
    let delay = options.delay;
    if (typeof delay === "number" && delay > 0) {
      startTime = currentTime + delay;
    }
  }

  // ...中間建立任務物件和判斷優先級省略

  // 3. 判斷是否是延遲任務
  if (startTime > currentTime) {
    // 3-1. 用開始時間來決定最小堆的排序，越小表示越先開始。
    newTask.sortIndex = startTime;
    // 3-2. 把他放入延遲的任務堆裡。
    push(timerQueue, newTask);

    // 3.3 如果沒有等待進行的任務並且這個延遲任務又是最優先的
    if (peek(taskQueue) === null && newTask === peek(timerQueue)) {
      // 3-1-1. 如果主線程正在忙調度
      if (isHostCallbackScheduled) {
        // newTask 才是堆頂任務，應該會最先到達執行時間，但目前其他延遲任務正在倒計時，說明有問題！！
        cancelHostTimeout();
      } else {
        isHostTimeoutScheduled = true;
      }
    }
    // 3-1-2. 啟動計時器！同時間的計時器只會有一個
    requestHostTimeout(handleTimeout, startTime - currentTime);
  } else {
    push(taskQueue, newTask);
    newTask.sortIndex = expirationTime;
    // ! 主線程沒有在忙，而且也沒有時間切片在執行
    if (!isHostCallbackScheduled && !isPerformingWork) {
      isHostCallbackScheduled = true;
      requestHostCallback();
    }
  }
}
```

### 建立計時器

```ts
function requestHostTimeout(
  callback: (currentTime: number) => void,
  ms: number
) {
  taskTimeoutId = setTimeout(() => {
    callback(getCurrentTime());
  }, ms);
}

function cancelHostTimeout() {
  clearTimeout(taskTimeoutId);
  taskTimeoutId = -1;
}
```

### handleTimeout 時間到的 callback，調用 advanceTimers

1.  主線程是否在進行計時器調度 `isHostTimeoutScheduled = false;`
2.  進入整個延遲任務堆處理`advanceTimers`
    1. 把任務取出，，while 取堆頂，判斷任務是否有效
       1. `timer.sortIndex = timer.expirationTime;`，把他推進任務池當中
       2. 是執行時間還沒到？還是真的無效任務？要馬刪除要麻跳過循環
3.  `isHostCallbackScheduled` 主線程是否在調度中
    1. 否，主任務堆頂是否有任務？
       1. 是，則開始調度主任務堆
       2. 否，則延遲任務堆頂是否有任務？
          1. 否，則開啟計時器

```ts
function handleTimeout(currentTime: number) {
  // 1. 主線程是否在進行計時器調度
  isHostTimeoutScheduled = false;
  // 2. 進入整個延遲任務堆處理
  advanceTimers(currentTime);

  // 3. 主線程是否在調度中
  if (!isHostCallbackScheduled) {
    // 3-1. 主任務堆不為空
    if (peek(taskQueue) !== null) {
      isHostCallbackScheduled = true;
      // 3-1-1. 調度主要的任務堆
      requestHostCallback();
    } else {
      // 3-1-2. 處理延時任務堆
      const firstTimer = peek(timerQueue);
      if (firstTimer !== null) {
        // 啟動計時器
        requestHostTimeout(handleTimeout, firstTimer.startTime - currentTime);
      }
    }
  }
}

// 處理延時堆
function advanceTimers(currentTime: number) {
  let timer = peek(timerQueue);
  while (timer !== null) {
    if (timer.callback === null) {
      // 無效任務
      pop(timerQueue);
    } else if (timer.startTime <= currentTime) {
      // 已經到達開始時間應該要被推入
      pop(timerQueue);
      timer.sortIndex = timer.expirationTime;
      push(taskQueue, timer);
    } else {
      // 有效任務
      break;
    }
  }
}
```

### 實現真正的 time slicing

task queue 有三個任務，第一個用時 3ms，第二個用時 4ms，第三個用時 5ms，那麼這個 work loop 就會佔用主執行緒 7ms 才會退出。 scheduler ，對 work loop 佔用時間的檢查只會發生在「任務執行之前」。
所以單靠 scheduler 會是 `[[3ms, 4ms], [5ms]]` ，第一個時間片就執行了 7ms!
只能靠 react 從 callback 內部去結束呼叫。 `performConcurrentWorkOnRoot()` 呼叫堆疊上的 `workLoopConcurrent()` 函數也有一個時間片檢查的原因：因為它需要配合 scheduler 一起來完成 time slicing 的能力：

```js
function workLoopConcurrent() {
  // Perform work until Scheduler asks us to yield
  while (workInProgress !== null && !shouldYield()) {
    performUnitOfWork(workInProgress);
  }
}
```

在 react 端也執行檢查，react fiber 的 work loop 在對下一個 fiber node 執行 work 之前。（當然如果 fiber node 執行時間超過 5ms 就是另一回事了。)

---

學習資料：

> (2023 年，你是時候要掌握 react 的並發渲染了(2) - scheduler)[https://juejin.cn/post/7278597256957935628#heading-24]
> (bubucuo React18 底层源码深入剖析)[https://github.com/bubucuo/mini-react]
