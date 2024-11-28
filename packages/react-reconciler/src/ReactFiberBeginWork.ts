import { mountChildFibers, reconcileChildFibers } from "./ReactChildFiber";
import { renderWithHook } from "./ReactFiberHooks";
import type { Fiber } from "./ReactInternalTypes";
import {
  HostComponent,
  HostRoot,
  HostText,
  Fragment,
  ClassComponent,
  FunctionComponent,
  ContextProvider,
  ContextConsumer,
  MemoComponent,
  SimpleMemoComponent,
} from "./ReactWorkTags";
import shallowEqual from "@mono/shared/shallowEqual";
import { pushProvider, readContext } from "./ReactFiberNewContext";
import { shouldSetTextContent } from "@mono/react-dom/client/ReactDOMHostConfig";
import {
  createFiberFromTypeAndProps,
  createWorkInProgress,
  isSimpleFunctionComponent,
} from "./ReactFiber";
// 處理當前的節點，因應不同節點做不同的處理
// 返回子節點
export function beginWork(
  current: Fiber | null,
  workInProgress: Fiber
): Fiber | null {
  switch (workInProgress.tag) {
    case HostRoot:
      return updateHostRoot(current, workInProgress);
    // 原生標籤
    case HostComponent:
      return updateHostComponent(current, workInProgress);
    case HostText:
      return updateHostText();
    case Fragment:
      return updateHostFragment(current, workInProgress);
    case ClassComponent:
      return updateClassComponent(current, workInProgress);
    case FunctionComponent:
      return updateFunctionComponent(current, workInProgress);
    case ContextProvider:
      return updateContextProvider(current, workInProgress);
    case ContextConsumer:
      return updateContextConsumer(current, workInProgress);
    case MemoComponent:
      return updateMemoComponent(current, workInProgress);
    case SimpleMemoComponent:
      return updateSimpleMemoComponent(current, workInProgress);
  }
  // TODO:
  throw new Error(`beginWork 有標籤沒有處理到 - ${workInProgress.tag}`);
}

function updateMemoComponent(current: Fiber | null, workInProgress: Fiber) {
  const Component = workInProgress.type;
  const type = Component.type;
  // 組件是不是初次渲染？
  if (current === null) {
    // 是最簡單的 memo 的函式組件，因為 memo 可以包裹 forwardRef 等的組件
    if (
      isSimpleFunctionComponent(type) &&
      Component.compare === null &&
      Component.defaultProps === undefined
    ) {
      workInProgress.type = type;
      workInProgress.tag = SimpleMemoComponent;
      return updateSimpleMemoComponent(current, workInProgress);
    }

    const child = createFiberFromTypeAndProps(
      type,
      null,
      workInProgress.pendingProps
    );
    child.return = workInProgress;
    workInProgress.child = child;
    return child;
  }
  let compare = Component.compare;
  compare = compare !== null ? compare : shallowEqual;
  if (shallowEqual(current?.memoizedProps, workInProgress.pendingProps)) {
    return bailoutOnAlreadyFinishedWork();
  }
  const newChild = createWorkInProgress(
    current.child as Fiber,
    workInProgress.pendingProps
  );
  newChild.return = workInProgress;
  workInProgress.child = newChild;
  return newChild;
}

function updateSimpleMemoComponent(
  current: Fiber | null,
  workInProgress: Fiber
) {
  if (current !== null) {
    if (shallowEqual(current?.memoizedProps, workInProgress.pendingProps)) {
      // 退出渲染，復用
      return bailoutOnAlreadyFinishedWork();
    }
  }
  return updateFunctionComponent(current, workInProgress);
}

function bailoutOnAlreadyFinishedWork() {
  return null;
}

function updateContextConsumer(current: Fiber | null, workInProgress: Fiber) {
  const context = workInProgress.type;
  const newValue = readContext(context);
  const render = workInProgress.pendingProps.children;
  const newChildren = render(newValue);

  reconcileChildren(current, workInProgress, newChildren);

  return workInProgress.child;
}

function updateContextProvider(current: Fiber | null, workInProgress: Fiber) {
  // 需要紀錄context, value 讓後代可以消費
  // 用 stack 結構儲存，因為有先進後出的特點
  // 只能在棧頂操作，比方[0,100,200]，對200操作是效能比較好的
  // 1. 先記錄，push到棧堆當中
  // 2. 後代組件消費
  // 3. 消費完要出棧，避免取到一樣的值
  /**
   * ex:
   *  <CountContext.Provider value={count}>
   *    <CountContext.Provider value={count + 1}>
   *       ! 使用前，在 beginWork 要加入 [countContext, count+1Context]
   *       <Child />
   *       ! 使用後，使用完，在 completeWork 要刪除 [countContext]
   *    </CountContext.Provider>
   *     <Child /> // 處理到他的時候，應該要只剩下 [countContext]
   *  </CountContext.Provider>
   */
  const context = workInProgress.type._context;
  const value = workInProgress.pendingProps.value;
  pushProvider(context, value);

  // 源碼當中會再判斷 value 跟 children 是否相同，再去進行 reconcile協調，就比較省效能
  // 如果 bailout return null 就不用再進行子標籤遍歷了
  reconcileChildren(
    current,
    workInProgress,
    workInProgress.pendingProps.children
  );

  return workInProgress.child;
}

function updateClassComponent(current: Fiber | null, workInProgress: Fiber) {
  // 實例在 type 上
  const { type, pendingProps } = workInProgress;
  const context = type.contextType;
  const newValue = readContext(context);
  let instance = current?.stateNode;
  if (current === null) {
    // 實例在 type 上
    instance = new type(pendingProps, context);
    workInProgress.stateNode = instance;
  }
  instance.context = newValue;
  // 調用 render 創造節點
  const children = instance.render();
  reconcileChildren(current, workInProgress, children);
  return workInProgress.child;
}

function updateFunctionComponent(current: Fiber | null, workInProgress: Fiber) {
  const { type, pendingProps } = workInProgress;
  // 調用 render 創造節點
  const children = renderWithHook(current, workInProgress, type, pendingProps);
  reconcileChildren(current, workInProgress, children);
  return workInProgress.child;
}

function updateHostFragment(current: Fiber | null, workInProgress: Fiber) {
  const nextChildren = workInProgress?.pendingProps.children;
  reconcileChildren(current, workInProgress, nextChildren);
  return workInProgress.child;
}

function updateHostText() {
  return null;
}
// 根 fiber 節點，所需要做的只是，協調子節點
function updateHostRoot(current: Fiber | null, workInProgress: Fiber) {
  const nextChildren = current?.memoizedState.element;
  console.log(
    "%c [ nextChildren ]: ",
    "color: #bf2c9f; background: pink; font-size: 13px;",
    nextChildren
  );
  debugger;
  reconcileChildren(current, workInProgress, nextChildren);
  // 如果是更新階段，走到此，表示整棵樹都要更新，
  // 協調子節點完成後，舊的子節點，更新成新的子節點
  if (current) {
    current.child = workInProgress.child;
  }
  return workInProgress.child;
}
// 原生標籤，ex: div, span。初次渲染會進入協調，更新則可能是協調或是 bailout
// TODO: 更新 之後要寫 props 比對
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
  console.log(
    "%c [ current ]: ",
    "color: #bf2c9f; background: pink; font-size: 13px;",
    current
  );
  // 初次渲染
  if (current === null) {
    workInProgress.child = mountChildFibers(workInProgress, null, nextChildren);
  } else {
    // 初次渲染根節點會走到這裡
    workInProgress.child = reconcileChildFibers(
      workInProgress,
      current.child,
      nextChildren
    );
  }
}
