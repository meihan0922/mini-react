import {
  frameYieldMs,
  lowPriorityTimeout,
  normalPriorityTimeout,
  userBlockingPriorityTimeout,
  maxSigned31BitInt,
} from "./SchedulerFeatureFlags";
import { peek, pop, push } from "./SchedulerMinHeap";
import {
  NoPriority,
  IdlePriority,
  ImmediatePriority,
  UserBlockingPriority,
  NormalPriority,
  LowPriority,
  PriorityLevel,
} from "./SchedulerPriorities";
import { getCurrentTime, isFn } from "@mono/shared/utils";

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
  // 過期時間: 起始時間加上 按照任務優先級計算的 delay 時間
  expirationTime: number;
  sortIndex: number;
};

/**
 * 三把鎖 - 避免重複調度
 * 簡單來說 scheduler 有兩個循環迴圈，
 * 第一個是 和瀏覽器申請非同步(MessageChannel)的回調，他會在任務堆沒有完全清空之前持續申請時間切片
 * 第二個是 workLoop，在時間切片內，處理任務堆
 *
 * 如果任務一直進來，不能瘋狂申請時間切片 requestHostCallback -> schedulePerformWorkUntilDeadline，
 * 才需要鎖，只有 task queue 被清空了（也就是目前所有的任務有被執行完），scheduler 才會重新發起一次調度請求。
 * - `isHostCallbackScheduled`： 主線程是否在忙第一個循環調度呢？目的是確定第一個循環調度開始；(scheduleCallback 被設成 true，flushwork 被設成 false)
 * - `isPerformingWork`： 第二個循環調度在進行嗎，目的是紀錄時間切片內，正在運行的 work loop；(flushwork 開始被設成 true，結束 false)
 * - `isMessageLoopRunning`： 紀錄的是第一個循環調度是否結束，無數個 申請時間切片和workLoop 之後，task queue 終於被清空。
 * (requestHostCallback 發起調度時間切片 schedulePerformWorkUntilDeadline 前，被設成 true。performWorkUntilDeadline 中，task queue 被清空，所有任務都執行完之後被設定為 false)
 */

/** 建立三把鎖 */
/** 1. 紀錄 主線程處理時間切片調度確定已經開始 */
let isHostCallbackScheduled = false;
/** 2. 紀錄 時間切片調度確定已經完整結束 */
let isMessageLoopRunning = false;
/** 3. 紀錄 workLoop 循環調度是否結束 */
let isPerformingWork = false;

/** 任務相關變數 */
/** 任務 id 累加紀錄 */
let taskIdCounter = 1;
/** 任務池，最小堆 **/
const taskQueue: Array<Task> = [];
/** 指向當前正在執行的 **/
let currentTask: Task | null = null;
/** 紀錄當前處理的任務優先級，供之後判斷是否優先執行 */
let currentPriorityLevel: PriorityLevel = NoPriority;
// 主線程是否正在倒計時調度中
let isHostTimeoutScheduled = false;
// 時間切片的起始，時間戳
let startTime = -1;
// 時間切片，這是個時間段
let frameInterval = frameYieldMs; //5

/** 延遲相關 */
// * 延遲任務池
const timerQueue: Array<Task> = [];
// 延遲任務的計時器
let taskTimeoutId = -1;

/**
 * * 任務調度器的入口，某任務進入調度器，等待調度
 * @param priorityLevel
 * @param callback
 * @param options - {delay: 延遲任務}
 */
function scheduleCallback(
  priorityLevel: PriorityLevel,
  callback: Callback,
  options?: { delay: number }
) {
  const currentTime = getCurrentTime();
  let startTime: number = currentTime;
  if (typeof options === "object" && options !== null) {
    let delay = options.delay;
    if (typeof delay === "number" && delay > 0) {
      startTime = currentTime + delay;
    }
  }

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
    case LowPriority:
      timeout = lowPriorityTimeout;
      break;
    case IdlePriority:
      timeout = maxSigned31BitInt;
      break;
    case NormalPriority:
    default:
      timeout = normalPriorityTimeout;
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

  // 判斷是否是延遲任務
  if (startTime > currentTime) {
    newTask.sortIndex = startTime;
    push(timerQueue, newTask);

    // 如果沒有等待進行的任務並且這個延遲任務又是最優先的
    if (peek(taskQueue) === null && newTask === peek(timerQueue)) {
      // 如果主線程正在忙調度
      if (isHostCallbackScheduled) {
        // newTask 才是堆頂任務，應該會最先到達執行時間，但目前其他延遲任務正在倒計時，說明有問題！！
        cancelHostTimeout();
      } else {
        isHostTimeoutScheduled = true;
      }
      // 啟動計時器！同時間的計時器只會有一個
      requestHostTimeout(handleTimeout, startTime - currentTime);
    }
  } else {
    newTask.sortIndex = expirationTime;
    push(taskQueue, newTask);
    // ! 主線程沒有在忙，而且也沒有時間切片在執行
    // 時間切片內正在執行中！
    if (!isHostCallbackScheduled && !isPerformingWork) {
      isHostCallbackScheduled = true;
      // 調度主要的任務堆
      requestHostCallback();
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

function handleTimeout(currentTime: number) {
  // 主線程是否在進行計時器調度
  isHostTimeoutScheduled = false;
  // 如果 timerQueue中 "有效"任務到達執行時間，就放到 taskQueue 中
  advanceTimers(currentTime);

  // 主線程是否在調度中
  if (!isHostCallbackScheduled) {
    // 主任務堆不為空
    if (peek(taskQueue) !== null) {
      isHostCallbackScheduled = true;
      // 調度主要的任務堆
      requestHostCallback();
    } else {
      // 處理延時任務堆
      const firstTimer = peek(timerQueue);
      if (firstTimer !== null) {
        // 啟動計時器
        requestHostTimeout(handleTimeout, firstTimer.startTime - currentTime);
      }
    }
  }
}

function requestHostTimeout(
  callback: (currentTime: number) => void,
  ms: number
) {
  taskTimeoutId = window.setTimeout(() => {
    callback(getCurrentTime());
  }, ms);
}

function cancelHostTimeout() {
  clearTimeout(taskTimeoutId);
  taskTimeoutId = -1;
}

// 主線程開始處理 callback，發起調度
function requestHostCallback() {
  // ! 主線程沒有在忙，而且也沒有時間切片在執行
  if (!isMessageLoopRunning) {
    isMessageLoopRunning = true;
    schedulePerformWorkUntilDeadline();
  }
}

const channel = new MessageChannel();
const port2 = channel.port2;
channel.port1.onmessage = performWorkUntilDeadline;

// 申請時間切片
// 固定的時間切片內，執行任務們，直到時間切片到點為止
function schedulePerformWorkUntilDeadline() {
  port2.postMessage(null);
}

function performWorkUntilDeadline() {
  if (isMessageLoopRunning) {
    const currentTime = getCurrentTime();
    // ! 注意 這裏是紀錄時間切片的起始點，shouldYieldToHost 會扣除執行後當下的時間看是不是大於 5ms
    startTime = currentTime;
    let hasMoreWork = true;

    try {
      // 還有任務還沒執行完成嗎
      hasMoreWork = flushWork(currentTime);
    } finally {
      if (hasMoreWork) {
        // 任務堆都被清空了，可以再發起調度了
        schedulePerformWorkUntilDeadline();
      } else {
        isMessageLoopRunning = false;
      }
    }
  }
}

function flushWork(initialTime: number): boolean {
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
 * * 取消某個任務，由於已經放進任務池了，加上最小堆沒辦法直接刪，只能初步把 task.callback = null
 * 調度過程中，當這個任務至於堆頂時，刪掉
 */
function cancelCallback() {
  currentTask!.callback = null;
}

/**
 * * 獲取當前正在執行任務的優先級
 * @returns
 */
function getCurrentPriorityLevel(): PriorityLevel {
  return currentTask?.priorityLevel ?? currentPriorityLevel;
}

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

/**
 * 有很多的 Task，都包含要執行的 callback
 * 在時間切片內執行多個 task callback，循環執行 loop
 * 直到時間切片結束為止
 * @param initialTime 執行時間
 * @returns boolean 是否還有任務沒有執行完畢，還要繼續執行
 */
function workLoop(initialTime: number): boolean {
  // 主線程是否在進行計時器調度
  let currentTime = initialTime;
  // 進入整個延遲任務堆處理
  // 如果 timerQueue中 "有效"任務到達執行時間，就放到 taskQueue 中
  advanceTimers(currentTime);
  // 取出優先級最高的任務
  currentTask = peek(taskQueue);
  while (currentTask !== null) {
    // 如果當前的任務沒有過期，但時間已經到了，應該要跳出回圈
    // 如果，如果當前時間戳大於expirationTime的值（也就是說十分緊急！），也就無法跳出while(){}循環，只能去執行這個過期任務。
    // 同時，scheduler 還有透過didUserCallbackTimeout來把「任務過期了」這個訊息告知呼叫方，讓呼叫方自己看著辦。
    // 就react 這個呼叫方而言，它將會用「同步不可中斷」的方式去這個任務。
    // scheduler 只是負責告知呼叫方目前這個任務已經過期了。
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
      currentTime = getCurrentTime();
      currentPriorityLevel = currentTask.priorityLevel;
      if (isFn(continuationCallback)) {
        currentTask.callback = continuationCallback;
        advanceTimers(currentTime);
        return true;
      } else {
        // 因為 taskQueue 是動態的，在執行 callback 期間可能又有其他任務被調度進去
        // 檢查下，如果是一樣的，就可以刪除
        if (peek(taskQueue) === currentTask) {
          pop(taskQueue);
        }
      }

      advanceTimers(currentTime);
    } else {
      pop(taskQueue);
    }

    currentTask = peek(taskQueue);
  }

  if (currentTask !== null) {
    return true;
  } else {
    const firstTimer = peek(timerQueue);
    if (firstTimer !== null) {
      requestHostTimeout(handleTimeout, firstTimer.startTime - currentTime);
    }
    return false;
  }
}

export {
  NoPriority,
  IdlePriority,
  ImmediatePriority,
  UserBlockingPriority,
  NormalPriority,
  LowPriority,
  getCurrentPriorityLevel,
  cancelCallback,
  scheduleCallback,
  shouldYieldToHost as shouldYield,
};
