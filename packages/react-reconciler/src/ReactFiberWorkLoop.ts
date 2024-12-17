import {
  getCurrentPriorityLevel,
  NormalPriority,
  scheduleCallback,
} from "@mono/scheduler/src/Scheduler";
import { createWorkInProgress } from "./ReactFiber";
import { beginWork } from "./ReactFiberBeginWork";
import {
  commitMutationEffects,
  flushPassiveEffect,
} from "./ReactFiberCommitWork";
import { completeWork } from "./ReactFiberCompleteWork";
import { ensureRootIsScheduled } from "./ReactFiberRootScheduler";
import type { Fiber, FiberRoot } from "./ReactInternalTypes";
import { claimNextTransitionLane, Lane, NoLane } from "./ReactFiberLane";
import { getCurrentUpdatePriority } from "./ReactEventPriorities";
import { getCurrentEventPriority } from "./ReactFiberConfigDOM";

type ExecutionContext = number;

export const NoContext = 0b000;
const BatchedContext = 0b001;
export const RenderContext = 0b010;
export const CommitContext = 0b100;
// 紀錄在哪個階段
let executionContext: ExecutionContext = NoContext;

// 創建指針，指向正在處理的節點
let workInProgress: Fiber | null = null;
/**
 * ?? 為什麼要紀錄 workInProgressRoot？
 * A:
 * 1. 在併發模式下，workLoop render 是有可能被中斷的！如果被中斷，且root保持一致，就可以正確的恢復，從中斷的地方開始構建樹
 * 2. 任務中斷後，用戶觸發了更高優先級的更新，原先的 root 會被丟棄，用於處理高優先級的更新
 *    那原先低優先級的fiber樹已經部分構建或是高優先級的任務修改根節點，但這棵樹不再適合繼續使用，狀態會不一致
 * 3. 用戶調度了 createRoot 或是 render，改了樹
 */
let workInProgressRoot: FiberRoot | null = null;
let workInProgressDeferredLane: Lane = NoLane;

// 頁面初次渲染、類組件 setState/forceUpdate、函數組件 setState 都會走到此
export function scheduleUpdateOnFiber(root: FiberRoot, fiber: Fiber) {
  /**
   * 源碼核心:
   * 1. markRootUpdated: 標記根節點有一個 pending update
   * 2. ensureRootIsScheduled：主要是創建微任務去啟動 scheduler 調度器，調度器再去執行 react-reconciler 的 workLoop
   *    a. scheduleImmediateTask
   *    b. processRootScheduleInMicroTask
   *
   * 但因為目前還沒處理 lane 先忽略掉 1.
   **/

  // workInProgress = fiber;
  // TODO: setState 應該要走別的邏輯，暫時走這
  ensureRootIsScheduled(root);
}

export function performConcurrentWorkOnRoot(root: FiberRoot) {
  // ! 1. render: 構建 fiber 樹(VDOM)
  renderRootSync(root);
  // 新的根fiber
  const finishedWork = root.current.alternate;

  root.finishedWork = finishedWork;
  debugger;
  // console.log("finishedWork", finishedWork);
  // ! 2. commit: VDOM -> DOM
  commitRoot(root);
}

function commitRoot(root: FiberRoot) {
  // ! 1. commit 階段開始
  const prevExecutionContext = executionContext;
  executionContext |= CommitContext;
  // ! 2.1 mutation 階段，遍歷 fiber，渲染 DOM 樹
  commitMutationEffects(root, root.finishedWork as Fiber);
  // 源碼中 有另外處理 commitLayoutEffects，useLayoutEffect 也應當在這個階段2.1.1後執行
  // ! 2.2 passive effect 階段，執行 passive effect 階段
  // 這也是為什麼 useEffect 延遲調用的原因
  scheduleCallback(NormalPriority, () => {
    flushPassiveEffect(root.finishedWork as Fiber);
  });
  // ! 2.1.1 將完成的新樹賦值成為當前樹
  root.current = root.finishedWork as Fiber;
  // ! 3. commit 結束，把數據還原
  executionContext = prevExecutionContext;
  workInProgressRoot = null;
}

function renderRootSync(root: FiberRoot) {
  // ! 1. render 階段開始
  const prevExecutionContext = executionContext;
  executionContext |= RenderContext;

  // ! 2. 初始化數據，準備好 WorkInProgress 樹
  // 源碼還有判斷 lanes 優先級的改變
  // react-debugger/src/react/packages/react-reconciler/src/ReactFiberWorkLoop.js
  // if (workInProgressRoot !== root || workInProgressRootRenderLanes !== lanes) {
  // root 改變時，才會建立一顆新的 workInProgress 樹
  // 用戶觸發了更高優先級的更新，原先的 root 會被丟棄 或是 用戶調度了 createRoot 或是 render，改了樹
  if (workInProgressRoot !== root) {
    prepareFreshStack(root);
  }
  // ! 3. 遍歷構建 fiber 樹，深度優先遍歷
  workLoopSync();

  // ! 4. render 結束，把數據還原
  executionContext = prevExecutionContext;
  workInProgressRoot = null;
}

// 準備一顆 WorkInProgress 樹
function prepareFreshStack(root: FiberRoot): Fiber {
  root.finishedWork = null;

  workInProgressRoot = root;

  const rootWorkInProgress = createWorkInProgress(root.current, null);
  workInProgress = rootWorkInProgress;

  return rootWorkInProgress;
}

function workLoopSync() {
  while (workInProgress !== null) {
    // 處理單一節點
    performUnitOfWork(workInProgress);
  }
}

/**
 * 1. beginWork: 執行子節點的 fiber 創建
 *    a. 執行 unitOfWork 的 fiber 創建
 *    b. 看有沒有要走diff，比方類組件 shouldComponentUpdate 比較後走到 bailout,
 *    c. 返回子節點
 * 2. complete
 * */
function performUnitOfWork(unitOfWork: Fiber) {
  // 對應的 老的 current 節點
  const current = unitOfWork.alternate;
  // beginWork，返回子節點
  let next = beginWork(current, unitOfWork);
  // 把新的props更新到舊的上
  unitOfWork.memoizedProps = unitOfWork.pendingProps;
  // 沒有子節點了
  if (next === null) {
    completeUnitOfWork(unitOfWork);
  } else {
    workInProgress = next;
  }
}

// 深度優先遍歷，轉移workInProgress，子節點、兄弟節點、叔叔節點、爺爺節點....
function completeUnitOfWork(unitOfWork: Fiber) {
  let completedWork: Fiber | null = unitOfWork;

  do {
    const current = completedWork.alternate;
    const returnFiber = completedWork.return;

    // 依照不同的節點 tag 生成節點
    // 如果自身處理完成，返回null
    // 並且看有沒有兄弟節點，沒有則返回父節點，再處理父節點的兄弟節點
    let next = completeWork(current, completedWork);
    // 如果有下個 work 的話，next可能指向 child 或是 標記 next 是
    if (next !== null) {
      workInProgress = next;
      return;
    }

    const siblingFiber = completedWork.sibling;
    if (siblingFiber !== null) {
      // 跳出回圈 回到 workLoopSync 處理下個兄弟節點
      workInProgress = siblingFiber;
      return;
    }

    // 回到父節點上，處理父節點本身
    completedWork = returnFiber;
    workInProgress = completedWork;
  } while (completedWork !== null);
}

// 獲取本次的update對應的優先級<
// 應該會在 dipatchSetState 等地方被調用，這邊沒有實現
export function requestUpdateLane(): Lane {
  // 當前優先級，
  const updateLane = getCurrentUpdatePriority();
  if (updateLane !== NoLane) {
    return updateLane;
  }
  // 初次渲染會走到這
  const eventLane: Lane = getCurrentEventPriority();
  return eventLane;
}

// 在 useDeferredValue 被調用
export function requestDeferredLane(): Lane {
  // 如果其他地方都沒有用到的話
  if (workInProgressDeferredLane === NoLane) {
    // 因為 TransitionLane 有很多條，循環遍歷 lanes 將每個新的 transition 分配到下一個 lane
    // 在大多數情況下，這意味著每個 transition 都有自己的 lane，值到用完所有 lanes 並循環回到開頭
    workInProgressDeferredLane = claimNextTransitionLane();
  }

  return workInProgressDeferredLane;
}
