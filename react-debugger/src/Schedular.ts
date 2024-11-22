// TODO: 任務調度器 單線程

import { getCurrentTime } from "react-reconciler/src/ReactFiberWorkLoop";
import { peek, push } from "scheduler/src/SchedulerMinHeap";

let isHostTimeoutScheduled = false;

let taskTimeoutID: any = -1;

function requestHostTimeout(callback, delay) {
  taskTimeoutID = setTimeout(() => {
    callback();
  }, delay);
}

function cancelHostTimeout() {
  clearTimeout(taskTimeoutID);
  taskTimeoutID = -1;
}

// 源碼位置：src/react/packages/scheduler/src/SchedulerPriorities.js
export const NoPriority = 0;
export const ImmediatePriority = 1;
export const UserBlockingPriority = 2;
export const NormalPriority = 3;
export const LowPriority = 4;
export const IdlePriority = 5;

// 有六個等級區別，會依照不同優先級，給予延遲的時間，值越小越高
type PriorityLevel = 0 | 1 | 2 | 3 | 4 | 5;

type Task = {
  id: number;
  callback: any;
  priorityLevel: PriorityLevel;
  startTime: number; // 理論上開始的時間（跟實際開始執行的時間不同
  expirationTime: number; // 開始真正處理的時間
  sortIndex: number; // 任務排序：具體是優先級和到達時間任務時間的計算結果
};
type Callback = any;

// 要對任務進行排序，要進行排序的話要避免時間複雜度高
// 可以先進行分類

// 立即處理的任務
const taskQueue: Array<Task> = [];
// 延後執行的任務
const timerQueue: Array<Task> = [];

function handleTimeout() {
  isHostTimeoutScheduled = false;
}

// 來一個任務就累加
let taskIdCounter = 1;

// 源碼位置：src/react/packages/scheduler/src/forks/Scheduler.js
// Max 31 bit integer. The max integer size in V8 for 32-bit systems.
// Math.pow(2, 30) - 1
// 0b111111111111111111111111111111
var maxSigned31BitInt = 1073741823;

// Times out immediately
var IMMEDIATE_PRIORITY_TIMEOUT = -1;
// Eventually times out
var USER_BLOCKING_PRIORITY_TIMEOUT = 250;
var NORMAL_PRIORITY_TIMEOUT = 5000;
var LOW_PRIORITY_TIMEOUT = 10000;
// Never times out
var IDLE_PRIORITY_TIMEOUT = maxSigned31BitInt;
// 源碼位置：src/react/packages/scheduler/src/forks/Scheduler.js - unstable_scheduleCallback
// 不同的優先級，加上不同的等待時間
function getTimeoutByPriorityLevel(priorityLevel: PriorityLevel) {
  let timeout: number;

  switch (priorityLevel) {
    case ImmediatePriority:
      timeout = IMMEDIATE_PRIORITY_TIMEOUT;
      break;
    case UserBlockingPriority:
      timeout = USER_BLOCKING_PRIORITY_TIMEOUT;
      break;
    case IdlePriority:
      timeout = IDLE_PRIORITY_TIMEOUT;
      break;
    case LowPriority:
      timeout = LOW_PRIORITY_TIMEOUT;
      break;
    case NormalPriority:
    default:
      timeout = NORMAL_PRIORITY_TIMEOUT;
      break;
  }
  return timeout;
}

// 和外界交互，
const scheduleCallback = (
  callback: Callback,
  priorityLevel: PriorityLevel,
  options?: {
    delay: number; // 任務需要延後嗎
  }
) => {
  // 底層是用 performance.now()，一班情況下用 Date.now()
  // performance.now() 不受系統影響 精度比 Date.now() 準
  const currentTime = getCurrentTime();
  let startTime: number;
  let expirationTime: number;

  if (typeof options === "object" && options !== null) {
    if (typeof options.delay === "number" && options.delay > 0) {
      startTime = currentTime + options.delay;
    } else {
      startTime = currentTime;
    }
  } else {
    startTime = currentTime;
  }
  let timeout = getTimeoutByPriorityLevel(priorityLevel);
  expirationTime = startTime + timeout;

  const newTask: Task = {
    id: taskIdCounter++,
    callback,
    startTime,
    expirationTime,
    priorityLevel,
    sortIndex: -1,
  };

  // 表示要延後執行，需要排序！
  // 做偏排序，不用做全排序，用sortIndex 判斷
  // 已經時間到了，應該要被執行了的任務
  if (startTime > currentTime) {
    // 用理論上應該開始的時間做排序
    newTask.sortIndex = startTime;
    // 源碼位置：react-源碼分析/react-debugger/src/react/packages/scheduler/src/SchedulerMinHeap.js
    push(timerQueue, newTask);
    // 取到最小堆
    // 空當前任務隊列，和優先級最高的 timer 任務堆
    if (!peek(taskQueue) && newTask === peek(timerQueue)) {
      // 清除原先的 timer
      if (isHostTimeoutScheduled) {
        cancelHostTimeout();
      } else {
        isHostTimeoutScheduled = true;
      }
      requestHostTimeout(handleTimeout, startTime - currentTime);
    }
  } else {
    // 已經確定會延後執行的
    // 用延後的時間做排序
    newTask.sortIndex = expirationTime;
    push(taskQueue, newTask);
  }
};

export { scheduleCallback };
