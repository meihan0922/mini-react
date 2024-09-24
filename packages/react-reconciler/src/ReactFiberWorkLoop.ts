import { createWorkInProgress } from "./ReactFiber";
import { beginWork } from "./ReactFiberBeginWork";
import { commitMutationEffects } from "./ReactFiberCommitWork";
import { completeWork } from "./ReactFiberCompleteWork";
import { ensureRootIsScheduled } from "./ReactFiberRootScheduler";
import type { Fiber, FiberRoot } from "./ReactInternalTypes";

type ExecutionContext = number;

export const NoContext = 0b000;
const BatchedContext = 0b001;
export const RenderContext = 0b010;
export const CommitContext = 0b100;
// 紀錄在哪個階段
let executionContext: ExecutionContext = NoContext;

// 創建指針，指向正在處理的節點
let workInProgress: Fiber | null = null;
let workInProgressRoot: FiberRoot | null = null;

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

  workInProgressRoot = root;
  workInProgress = fiber;

  ensureRootIsScheduled(root);
}

export function preformConcurrentWorkOnRoot(root: FiberRoot) {
  // ! 1. render: 構建 fiber 樹(VDOM)
  renderRootSync(root);
  // 新的根fiber
  const finishedWork = root.current.alternate;
  root.finishedWork = finishedWork;
  // ! 2. commit: VDOM -> DOM
  commitRoot(root);
}

function commitRoot(root: FiberRoot) {
  // ! 1. commit 階段開始
  const prevExecutionContext = executionContext;
  executionContext |= CommitContext;
  // ! 2. mutation 階段，渲染 DOM 樹
  commitMutationEffects(root, root.finishedWork);

  // ! 4. commit 結束，把數據還原
  executionContext = prevExecutionContext;
  workInProgressRoot = null;
}

function renderRootSync(root: FiberRoot) {
  // ! 1. render 階段開始
  const prevExecutionContext = executionContext;
  executionContext |= RenderContext;

  // ! 2. 初始化數據，準備好 WorkInProgress 樹
  prepareFreshStack(root);

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
  const rootWorkInprogress = createWorkInProgress(root.current, null);
  workInProgress = rootWorkInprogress;

  return rootWorkInprogress;
}

function workLoopSync() {
  while (workInProgress !== null) {
    // 處理單一節點
    performUnitOfWork(workInProgress);
  }
}

/**
 * 1. beginWork
 *    a. 執行 unitOfWork 的 fiber 創建
 *    b. 看有沒有要走diff，比方類組件 shouldComponentUpdate 比較後走到 bailout,
 *    c. 返回子節點
 * 2. complete
 * */
function performUnitOfWork(unitOfWork: Fiber) {
  // 對應的 老的 current 節點
  const current = unitOfWork.alternate;
  // 1. beginWork，返回子節點
  let next = beginWork(current, unitOfWork);

  // 沒有子節點了
  if (next === null) {
    completeUnitWork(unitOfWork);
  } else {
    workInProgress = next;
  }
}

// 深度優先遍歷，子節點、兄弟節點、叔叔節點、爺爺節點....
function completeUnitWork(unitOfWork: Fiber) {
  let completedWork: Fiber | null = unitOfWork;

  do {
    const current = completedWork.alternate;
    const returnFiber = completedWork.return;

    // 依照不同的節點 tag 生成節點，如果是函式組件也可能 還有子節點等等
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
