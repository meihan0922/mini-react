# mini-react

## 創建 Fiber 和 FiberRoot

> @mono/react-reconciler

### 1. 生成 fiber

根據不同的標籤，生成不同屬性的 fiber，並且掛載到 workInprogress 樹上

> 核心代碼 src/ReactFiber.ts
> 類型主要在 src/ReactInternalTypes.ts

```ts
import { ReactElement, ReactFragment } from "@mono/shared/ReactTypes";
import { REACT_FRAGMENT_TYPE } from "@mono/shared/ReactSymbols";
import { isFn, isStr } from "@mono/shared/utils";
import {
  ClassComponent,
  Fragment,
  FunctionComponent,
  HostComponent,
  HostRoot,
  HostText,
  IndeterminateComponent,
  WorkTag,
} from "./ReactWorkTags";
import { Fiber } from "./ReactInternalTypes";
import { NoFlags } from "./ReactFiberFlags";
import { Lanes, NoLanes } from "./ReactFiberLane";
import { RootTag } from "./ReactFiberRoot";

export function createFiber(
  tag: WorkTag,
  pendingProps: any,
  key: null | string
): Fiber {
  return new FiberNode(tag, pendingProps, key);
}

function FiberNode(tag: WorkTag, pendingProps: unknown, key: string | null) {
  // 1. 基本的屬性
  this.tag = tag;
  this.key = key;
  this.elementType = null;
  this.type = null;
  // 不同組件定義不同 原生標籤-string; 類組件-實例
  this.stateNode = null;

  // 2. fiber 的節點鏈表
  this.return = null;
  this.child = null;
  this.sibling = null;
  // 紀錄節點在兄弟節點中位置下標，用於 diff 時判斷節點是否需要發生位移
  this.index = 0;

  // 3. Effects
  this.flags = NoFlags;
  this.subtreeFlags = NoFlags;
  this.deletions = null;

  // 4. 優先級
  this.lanes = NoLanes;
  this.childLanes = NoLanes;

  // 5. 兩棵樹上的 fiber 節點，指向對應的 fiber 節點
  this.alternate = null;

  this.memoizedProps = null;
  // 不同組件指向不同，函數組件 -> hook0; 類組件 -> state
  this.memoizedState = null;
  this.pendingProps = pendingProps;
}

// 創造新的樹
export function createWorkInProgress(current: Fiber, pendingProps: any): Fiber {
  let workInProgress = current.alternate;

  // 初始化只有一棵樹的時候
  if (workInProgress === null) {
    workInProgress = createFiber(current.tag, pendingProps, current.key);
    workInProgress.elementType = current.elementType;
    workInProgress.type = current.type;
    workInProgress.stateNode = current.stateNode;

    // 把新的樹節點指向到舊的樹的節點上
    workInProgress.alternate = current;
    // 把舊樹節點指向到新的樹的節點上
    current.alternate = workInProgress;
  } else {
    // 已經存在節點了，但有更新！
    // 更新可能是 props, type
    workInProgress.pendingProps = pendingProps;
    workInProgress.type = current.type;

    // 已經有 flags，但這邊給他重置成初始狀態
    workInProgress.flags = NoFlags;

    // 因為有更新，所以子結構也一定有變更 -> 重置成初始狀態，刪除的標籤也重置
    workInProgress.subtreeFlags = NoFlags;
    workInProgress.deletions = null;
  }

  // 重置靜態 effects 以外的所有屬性 轉移到新的樹上
  workInProgress.flags = current.flags;
  workInProgress.childLanes = current.childLanes;
  workInProgress.lanes = current.lanes;

  workInProgress.child = current.child;
  workInProgress.memoizedProps = current.memoizedProps;
  workInProgress.memoizedState = current.memoizedState;
  workInProgress.updateQueue = current.updateQueue;

  workInProgress.sibling = current.sibling;
  workInProgress.index = current.index;

  return workInProgress;
}

// 按照Element 創造出 fiber
export function createFiberFromElement(element: ReactElement) {
  const { type, key } = element;
  const pendingProps = element.props;
  const fiber = createFiberFromTypeAndProps(type, key, pendingProps);
  return fiber;
}

export function createHostRootFiber(tag: RootTag): Fiber {
  return createFiber(HostRoot, null, null);
}

// 按照不同的 type 創造出不同的 fiber
export function createFiberFromTypeAndProps(
  type: any,
  key: null | string,
  pendingProps: any,
  lanes: Lanes = NoLanes
): Fiber {
  // 是組件！
  let fiberTag: WorkTag = IndeterminateComponent;
  if (isFn(type)) {
    // 是 ClassComponent | FunctionComponent
    if (shouldConstruct(type)) {
      fiberTag = ClassComponent;
    } else {
      fiberTag = FunctionComponent;
    }
  } else if (isStr(type)) {
    // 如果是原生標籤
    fiberTag = HostComponent;
  } else if (type === REACT_FRAGMENT_TYPE && lanes) {
    return createFiberFromFragment(pendingProps.children, lanes, key);
  }

  const fiber = createFiber(fiberTag, pendingProps, key);
  fiber.elementType = type;
  fiber.type = type;
  fiber.lanes = lanes;

  return fiber;
}

// 創造Fragment節點的 fiber
export function createFiberFromFragment(
  elements: ReactFragment,
  lanes: Lanes,
  key: null | string
): Fiber {
  const fiber = createFiber(Fragment, elements, key);
  fiber.lanes = lanes;
  return fiber;
}

// 創造文本節點的 fiber
export function createFiberFromText(content: string, lanes: Lanes): Fiber {
  const fiber = createFiber(HostText, content, null);
  fiber.lanes = lanes;
  return fiber;
}

function shouldConstruct(Component: Function) {
  const prototype = Component.prototype;
  return !!(prototype && prototype.isReactComponent);
}
```

### 2. 生成 FiberRoot

❌ 注意不是 fiber 類型，只是掛載了整個樹相關的屬性，包含新舊樹等
可以想像是 最外層把一切封裝起來。

> 核心代碼 src/ReactFiberRoot.ts
> 類型主要在 src/ReactInternalTypes.ts

```ts
import { NoLane, NoLanes, createLaneMap, NoTimestamp } from "./ReactFiberLane";
import type { Container, FiberRoot } from "./ReactInternalTypes";
import type { ReactNodeList } from "@mono/shared/ReactTypes";
import { createHostRootFiber } from "./ReactFiber";
import { initializeUpdateQueue } from "./ReactFiberClassUpdateQueue";

export type RootTag = 0 | 1;
// export const LegacyRoot = 0;
export const ConcurrentRoot = 1;

export type RootState = {
  element: any;
};

// 創建 FiberRootNode，掛載整棵樹相關的屬性
export function FiberRootNode(containerInfo, tag) {
  this.tag = tag;
  this.containerInfo = containerInfo;
  this.pendingChildren = null;
  this.current = null;
  this.finishedWork = null;
  this.callbackNode = null;
  this.callbackPriority = NoLane;

  this.eventTimes = createLaneMap(NoLanes);
  this.expirationTimes = createLaneMap(NoTimestamp);

  this.pendingLanes = NoLanes;
  this.finishedLanes = NoLanes;
}

export function createFiberRoot(
  containerInfo: Container, // 就是者 document.getElementById('root')
  tag: RootTag,
  initialChildren: ReactNodeList
): FiberRoot {
  // !注意#root 以containerInfo掛載FiberRoot上，之後commit會用到
  const root: FiberRoot = new FiberRootNode(containerInfo, tag);

  // Cyclic construction. This cheats the type system right now because
  // stateNode is any.
  // 創建 fiber 根節點
  const uninitializedFiber = createHostRootFiber(tag);
  // FiberRootNode 的 current 樹指向 fiber 根節點
  root.current = uninitializedFiber;
  // fiber 的 stateNode 也要指向 FiberRoot
  uninitializedFiber.stateNode = root;

  // ! 初始時，子節點會變成 element 掛載到 memoizedState 上
  const initialState: RootState = {
    element: initialChildren,
  };
  uninitializedFiber.memoizedState = initialState;

  initializeUpdateQueue(uninitializedFiber);

  return root;
}
```

## 實現入口 createRoot

> @mono/react-dom

### 1. 建立 ReactDOMRoot，讓外部調用 createRoot 和 render()

react 的入口點

> 主要在 @mono/react-dom/src/client/ReactDOMRoot.ts

```ts
import type { FiberRoot } from "@mono/react-reconciler/src/ReactInternalTypes";
import type { ReactNodeList } from "@mono/shared/ReactTypes";
import {
  ConcurrentRoot,
  createFiberRoot,
} from "@mono/react-reconciler/src/ReactFiberRoot";
import {
  updateContainer,
  createContainer,
} from "@mono/react-reconciler/src/ReactFiberReconciler";

type RootType = {
  render: (children: ReactNodeList) => void;
  _internalRoot: FiberRoot;
};

// 創造一個類型，掛載 render 和 unmount 的方法，並且創造和 fiber 的連結
// 把 fiber 掛載到 _internalRoot 上面
function ReactDOMRoot(internalRoot: FiberRoot) {
  this._internalRoot = internalRoot;
}

ReactDOMRoot.prototype.render = function (children: ReactNodeList) {
  // 拿到 fiberRoot
  const root = this._internalRoot;
  updateContainer(children, root);
};

function createRoot(
  container: Element | Document | DocumentFragment
): RootType {
  const root = createContainer(container, ConcurrentRoot);

  return new ReactDOMRoot(root);
}

export default { createRoot };
```

### 2. 調用 render，根組件交給 react，react 內部調用 updateContainer，創建 update，啟動調度

> @mono/react-reconciler/src/ReactFiberReconciler.ts

1. 獲取 current, lane
2. 創建 update
3. update 入隊放到暫存區
4. scheduleUpdateOnFiber 啟動調度
5. entangleTranstions

```ts
import { ReactNodeList } from "@mono/shared/ReactTypes";
import type { Container, Fiber, FiberRoot } from "./ReactInternalTypes";
import type { RootTag } from "./ReactFiberRoot";
import { createFiberRoot } from "./ReactFiberRoot";

// 輸出給 react-dom，實現 react 的入口，創造出 fiberRoot, fiber 樹狀結構掛載在實例根節點上
export function createContainer(containerInfo: Container, tag: RootTag) {
  return createFiberRoot(containerInfo, tag);
}

export function updateContainer(element: ReactNodeList, container: FiberRoot) {
  // 組件初次渲染

  // 1. 獲取 current, lane
  const current = container.current;
  // 源碼中，初次渲染 子element 會作為 update.payload
  // const eventTime = getCurrentTime();
  // const update = createUpdate(eventTime, lane);
  // update.payload = { element };
  // 暫時簡寫放到 memoizedState
  current.memoizedState = { element };

  // scheduleUpdateOnFiber(root, current, lane, eventTime);
}
```

## scheduleUpdateOnFiber 調度更新開始

> @mono/react-reconciler/ReactFiberWorkLoop

在 `updateContainer()` 中調度 `scheduleUpdateOnFiber()`，這也是之後頁面觸發渲染都會執行的函式，會將指針指向正在處理的節點

```ts
import { Lane } from "./ReactFiberLane";
import { Fiber, FiberRoot } from "./ReactInternalTypes";

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
```

### ensureRootIsScheduled -> scheduleTaskForRootDuringMicrotask，確保在當次瀏覽器工作循環執行啟動 scheduler 包中的調度

將 FiberRoot 傳入，把調度任務加入微任務， 確保在當次瀏覽器工作循環執行啟動 scheduler 包中的調度，再去執行 react-reconciler 的 workLoop

> @mono/react-reconciler/src/ReactFiberRootScheduler.ts

```ts
import { preformConcurrentWorkOnRoot } from "./ReactFiberWorkLoop";
import { FiberRoot } from "./ReactInternalTypes";
import { scheduleCallback, NormalPriority } from "@mono/scheduler";

export function ensureRootIsScheduled(root: FiberRoot) {
  // window 的方法，加入微任務，會去執行 scheduler包中的調度，確保在當次瀏覽器工作循環執行
  queueMicrotask(() => {
    scheduleTaskForRootDuringMicrotask(root);
  });
}

// 調度
export function scheduleTaskForRootDuringMicrotask(root: FiberRoot) {
  // 準備要調度更新，又分為 render 和 commit 階段
  // 這裡是入口
  scheduleCallback(
    NormalPriority,
    preformConcurrentWorkOnRoot.bind(null, root)
  );
}
```

### react-reconciler workLoop：第一階段 render

入口點，執行 reconciler 兩階段

1. render: 構建 fiber 樹(VDOM)，核心就是調用 renderRootSync，又分為兩階段
   1. beginWork
   2. completeWork
2. commit: VDOM -> DOM

> react-reconciler/src/ReactFiberWorkLoop.ts

```ts
export function preformConcurrentWorkOnRoot(root: FiberRoot) {
  // ! 1. render: 構建 fiber 樹(VDOM)
  renderRootSync(root);
  // ! 2. commit: VDOM -> DOM
}
// 紀錄在哪個階段
let executionContext: ExecutionContext = NoContext;
function renderRootSync(root: FiberRoot) {
  // ! 1. render 階段開始
  // 紀錄之前正處理到哪個階段
  const prevExecutionContext = executionContext;
  // 先 merge 成 Render
  executionContext |= RenderContext;

  // ! 2. 初始化數據，準備好 WorkInProgress 樹
  prepareFreshStack(root);

  // ! 3. 遍歷構建 fiber 樹，深度優先遍歷
  workLoopSync();

  // ! 4. render 結束，把數據還原
  executionContext = prevExecutionContext;
  workInProgressRoot = null;
}

// 準備一顆 WorkInProgress 樹，在初次渲染是沒有的
function prepareFreshStack(root: FiberRoot): Fiber {
  root.finishedWork = null;

  workInProgressRoot = root;
  const rootWorkInprogress = createWorkInProgress(root.current, null);
  workInProgress = rootWorkInprogress;

  return rootWorkInprogress;
}

/** 開始了 fiber 建構的循環 */
function workLoopSync() {
  while (workInProgress !== null) {
    // 處理單一節點
    performUnitOfWork(workInProgress);
  }
}
```

### 第一階段 render -> performUnitOfWork()：兩階段 beginWork, completeUnitWork

1. beginWork
   1. 執行 unitOfWork 的 fiber 創建
   2. 看有沒有要走 diff，比方類組件 shouldComponentUpdate 比較後走到 bailout,
   3. 返回子節點
2. complete

```ts
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
```

#### beginWork - 建立 fiber 結構

> react-reconciler/src/ReactFiberBeginWork.ts

```ts
import { mountChildFibers, reconcileChildFibers } from "./ReactChildFiber";
import type { Fiber } from "./ReactInternalTypes";
import { HostComponent, HostRoot } from "./ReactWorkTags";
import { shouldSetTextContent } from "@mono/react-dom/client/ReactDOMHostConfig";
// 處理當前的節點，因應不同節點做不同的處理
// 返回子節點
export function beginWork(
  current: Fiber | null,
  workInProgress: Fiber
): Fiber | null {
  switch (workInProgress.tag) {
    // 根節點
    case HostRoot:
      return updateHostRoot(current, workInProgress);
    // 原生標籤
    case HostComponent:
      return updateHostComponent(current, workInProgress);
  }
  // TODO:剩餘type
  throw new Error(`beginWork 有標籤沒有處理到 - ${workInProgress.tag}`);
}
// 根 fiber 節點，所需要做的只是，協調子節點
function updateHostRoot(current: Fiber | null, workInProgress: Fiber) {
  const nextChildren = current?.memoizedState.element;
  reconcileChildren(current, workInProgress, nextChildren);
  return workInProgress.child;
}
// 原生標籤，ex: div, span。初次渲染會進入協調，更新則可能是協調或是 bailout
// TODO: 更新
function updateHostComponent(current: Fiber | null, workInProgress: Fiber) {
  const { type, pendingProps } = workInProgress;
  // 如果原生標籤只有一個文本，這個時候文本不會再生成 fiber 節點，而是會變成原生標籤的屬性
  const isDirectTextChild = shouldSetTextContent(type, pendingProps);
  if (isDirectTextChild) {
    return null;
  } else {
    const nextChildren = workInProgress?.pendingProps.children;
    reconcileChildren(current, workInProgress, nextChildren);
    return workInProgress.child;
  }
}

// 協調子節點，構建新的 fiber 樹，
function reconcileChildren(
  current: Fiber | null,
  workInProgress: Fiber,
  nextChildren: any
) {
  // 初次渲染，但根節點#root存在所以不會走到這
  if (current === null) {
    workInProgress.child = mountChildFibers(workInProgress, null, nextChildren);
  } else {
    workInProgress.child = reconcileChildFibers(
      workInProgress,
      current.child,
      nextChildren
    );
  }
}
```

> react-reconciler/src/ReactChildFiber.ts

```ts
import {
  REACT_ELEMENT_TYPE,
  REACT_FRAGMENT_TYPE,
} from "@mono/shared/ReactSymbols";
import { ReactElement } from "@mono/shared/ReactTypes";
import { isArray } from "@mono/shared/utils";
import {
  createFiberFromElement,
  createFiberFromFragment,
  createFiberFromText,
} from "./ReactFiber";
// import {updateFragment} from "./ReactFiberBeginWork";
import { ChildDeletion, Forked, Placement, Update } from "./ReactFiberFlags";
import { Lanes } from "./ReactFiberLane";
import { Fiber } from "./ReactInternalTypes";
import { Fragment, HostText } from "./ReactWorkTags";

type ChildReconciler = (
  returnFiber: Fiber,
  currentFirstChild: Fiber | null,
  newChild: any
  //   lanes: Lanes
) => Fiber | null;

export const reconcileChildFibers: ChildReconciler =
  createChildReconciler(true);

export const mountChildFibers: ChildReconciler = createChildReconciler(false);

// 協調子節點
function createChildReconciler(shouldTrackSideEffect: boolean) {
  // 給 fiber 添加標記，flag，這邊會影響到之後 commit
  function placeSingleChild(newFiber: Fiber) {
    if (shouldTrackSideEffect && newFiber.alternate) {
      newFiber.flags |= Placement;
    }
    return newFiber;
  }

  // 只有協調單個子節點，沒有bailout
  function reconcileSingleElement(
    returnFiber: Fiber,
    currentFirstChild: Fiber | null,
    newChild: ReactElement
  ) {
    let createFiber = createFiberFromElement(newChild);
    createFiber.return = returnFiber;
    return createFiber;
  }

  function reconcileChildFibers(
    returnFiber: Fiber,
    currentFirstChild: Fiber | null,
    newChild: any
  ) {
    // 檢查 newChild 類型，有可能是文本 數組
    if (typeof newChild === "object" && newChild !== null) {
      switch (newChild.$$typeof) {
        case REACT_ELEMENT_TYPE: {
          return placeSingleChild(
            reconcileSingleElement(returnFiber, currentFirstChild, newChild)
          );
        }
      }
    }
    // TODO
    return null;
  }
  return reconcileChildFibers;
}
```

#### completeUnitWork - 深度優先遍歷，按照 fiber tag 建立真實 DOM

> react-reconciler/src/ReactFiberWorkLoop.ts

```ts
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
      workInProgress = siblingFiber;
      return;
    }

    // 回到父節點上，如果下次循環，發現是已經完成的節點，會走到兄弟節點上
    completedWork = returnFiber;
    workInProgress = completedWork;
  } while (completedWork !== null);
}
```

> react-reconciler/src/ReactFiberCompleteWork.ts

```ts
import { isNum, isStr } from "@mono/shared/utils";
import { Fiber } from "./ReactInternalTypes";
import { HostComponent, HostRoot } from "./ReactWorkTags";

export function completeWork(
  current: Fiber | null,
  workInProgress: Fiber
): Fiber | null {
  switch (workInProgress.tag) {
    case HostRoot: {
      return null;
    }
    // 原生標籤
    case HostComponent: {
      const { type, pendingProps } = workInProgress;
      // 1. 創建真實dom
      const instance = document.createElement(type);
      // 2. 初始化DOM屬性
      finalizeInitialChildren(instance, pendingProps);
      appendAllChildren(instance, workInProgress);
      workInProgress.stateNode = instance;
      return null;
    }
    // TODO: 其他組件標籤 之後再說
  }
  throw new Error("不知名的 work tag");
}
// 初始化屬性
function finalizeInitialChildren(domElement: Element, props: any) {
  for (const propKey in props) {
    const nextVal = props[propKey];
    if (propKey === "style") {
      // TODO:
    } else if (propKey === "children") {
      // TODO:

      // 是文本節點
      if (isStr(nextVal) || isNum(nextVal)) {
        domElement.textContent = `${nextVal}`;
      }
    } else {
      domElement[propKey] = nextVal;
    }
  }
}

function appendAllChildren(parent: Element, workInProgress: Fiber) {
  let node = workInProgress.child;
  if (node) {
    parent.appendChild(node.stateNode);
  }
}
```

##### 看 fiber 建立的結果

> 終端下 `pnpm run dev`，此時，如果 examples 專案的 `main.jsx` 的結構是長這樣(目前只有單純寫純標籤節點)

```tsx
// import { createRoot } from "react-dom/client";
// 開啟手寫的 react
import { createRoot } from "@mono/react-dom/client";

const jsx = (
  <div className="border">
    <h1 className="h1Border">react</h1>
  </div>
);

createRoot(document.getElementById("root")!).render(jsx);
```

會建立起這樣的 FiberRootNode 結構

```ts
// FiberRootNode
{
  // ...省略
  current: { // FiberNode
    alternate: {
      child: {
        // ...省略
        stateNode: div.border, // 已經建立 instance 了
        child:{
          // ...省略
          stateNode: h1.h1Border, // 已經建立 instance 了
          child: null
        }
      } // FiberNode
    },
    containerInfo: div#root // 已經建立 instance 了
  }
}
```

### 第二階段 commit: VDOM -> DOM

> react-reconciler/src/ReactFiberWorkLoop.ts

```ts
export function preformConcurrentWorkOnRoot(root: FiberRoot) {
  // ! 1. render: 構建 fiber 樹(VDOM)
  renderRootSync(root);
  // ! 2. commit: VDOM -> DOM
  // 新的根fiber
  const finishedWork = root.current.alternate;
  root.finishedWork = finishedWork;
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
```

創建完 VDOM 要想辦法渲染在真實的 DOM 上，要逐一遍歷，使用遞迴

> react-reconciler/src/ReactFiberCommitWork.ts

```ts
// finishedWork 是 HostRoot 類型的 fiber，要把子節點渲染到 root 裡面，root 是 #root
export function commitMutationEffects(root: FiberRoot, finishedWork: Fiber) {
  // 遍歷子節點和兄弟節點
  recursivelyTraverseMutationEffects(root, finishedWork);
  // 根據flags做相對應的操作，比方在父節點 appendChild
  commitReconciliationEffects(finishedWork);
}

// 遍歷 finishedWork
function recursivelyTraverseMutationEffects(root, parentFiber: Fiber) {
  // 單鏈表
  let child = parentFiber.child;
  while (child !== null) {
    // 再次遞迴，每個子節點都一一提交，包含同級的兄弟節點
    commitMutationEffects(root, child);
    child = child.sibling;
  }
}
// 提交協調中產生的effects，比如flags標記 Placement, Update, ChildDeletion
function commitReconciliationEffects(finishedWork: Fiber) {
  // TODO 只先完成 Placement
  const flags = finishedWork.flags;
  if (flags & Placement) {
    // 頁面初次渲染，新增插入 appendChild
    commitPlacement(finishedWork);
    // 把 Placement 從 flags 移除
    finishedWork.flags &= ~Placement;
  }
}

function commitPlacement(finishedWork: Fiber) {
  // 目前先把 HostComponent 渲染上去，之後再處理其他組件的情況
  if (finishedWork.stateNode && finishedWork.tag === HostComponent) {
    const domNode = finishedWork.stateNode;
    const parentFiber = getHostParentFiber(finishedWork);
    // 要找到最接近的祖先節點 是 Host 的 fiber，再把他塞進去
    // Host 節點有三種 HostRoot, HostComponent, HostText(不能有子節點)
    let parentDOM = parentFiber.stateNode;
    // HostRoot 的實例存在 containerInfo 中
    if (parentDOM.containerInfo) parentDOM = parentDOM.containerInfo;
    parentDOM.appendChild(domNode);
  }
}

function getHostParentFiber(fiber: Fiber) {
  let parentFiber = fiber.return;
  while (parentFiber !== null) {
    if (isHostParent(parentFiber)) {
      return parentFiber;
    }
    parentFiber = parentFiber.return;
  }
  throw Error("Expected to find a host parent.");
}

function isHostParent(fiber: Fiber) {
  return fiber.tag === HostComponent || fiber.tag === HostRoot;
}
```

看 react 建立的結果，此時最簡單的 jsx 已經出現在畫面上了。
