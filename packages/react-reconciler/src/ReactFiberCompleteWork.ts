import { isNum, isStr } from "@mono/shared/utils";
import type { Fiber } from "./ReactInternalTypes";
import {
  ClassComponent,
  ContextConsumer,
  ContextProvider,
  Fragment,
  FunctionComponent,
  HostComponent,
  HostRoot,
  HostText,
  SimpleMemoComponent,
} from "./ReactWorkTags";
import { popProvider } from "./ReactFiberNewContext";
import {
  precacheFiberNode,
  updateFiberProps,
} from "../../react-dom-bindings/src/client/ReactDOMComponentTree";
import { registrationNameDependencies } from "../../react-dom-bindings/src/events/EventRegistry";

// 針對 workInProgress 創建真實 DOM
export function completeWork(
  current: Fiber | null,
  workInProgress: Fiber
): Fiber | null {
  const { type, pendingProps } = workInProgress;

  switch (workInProgress.tag) {
    case HostRoot:
    case Fragment:
    case ClassComponent:
    case SimpleMemoComponent:
    case FunctionComponent:
    case ContextConsumer: {
      return null;
    }
    case ContextProvider: {
      popProvider(workInProgress.type._context);
      return null;
    }
    // 原生標籤
    case HostComponent: {
      // 這邊也要進行復用條件判斷<如果已經有實例了，不需要再次創建
      if (current !== null && workInProgress.stateNode !== null) {
        updateHostComponent(current, workInProgress, type, pendingProps);
      } else {
        // 1. 創建真實dom
        const instance = document.createElement(type);

        // 2. 初始化DOM屬性
        finalizeInitialChildren(instance, null, pendingProps);
        appendAllChildren(instance, workInProgress);
        workInProgress.stateNode = instance;
      }
      // 存 key 值在 dom 身上，方便合成事件尋找 fiber 本身
      precacheFiberNode(workInProgress, workInProgress.stateNode as Element);
      updateFiberProps(workInProgress.stateNode, pendingProps);
      return null;
    }
    case HostText: {
      workInProgress.stateNode = document.createTextNode(pendingProps);
      // 存 key 值在 dom 身上，方便合成事件尋找 fiber 本身
      precacheFiberNode(workInProgress, workInProgress.stateNode as Element);
      updateFiberProps(workInProgress.stateNode, pendingProps);
      return null;
    }
    // TODO: 其他組件標籤 之後再說
  }
  throw new Error(`不知名的 work tag - ${workInProgress.tag}`);
}

function updateHostComponent(
  current: Fiber | null,
  workInProgress: Fiber,
  type: string,
  newProps: any
) {
  if (current?.memoizedProps === newProps) {
    return;
  } else {
    // 比較和更新屬性
    finalizeInitialChildren(
      workInProgress.stateNode,
      current?.memoizedProps,
      newProps
    );
  }
}
// 初始化屬性 || 更新屬性，prevProps 和 nextProps 的dom指向一樣的
// 兩次迴圈，先處理 prevProps 賦值和移除
// 再處理 nextProps 賦值
function finalizeInitialChildren(
  domElement: Element,
  prevProps: any,
  nextProps: any
) {
  for (const propKey in prevProps) {
    const prevProp = prevProps[propKey];
    if (propKey === "style") {
      // TODO:
    } else if (propKey === "children") {
      // TODO:

      // 是文本節點
      if (isStr(prevProp) || isNum(prevProp)) {
        domElement.textContent = "";
      }
    } else {
      // 處理事件，如果是合成事件就略過
      if (registrationNameDependencies[propKey]) {
        // 移除舊的click事件
        // domElement.removeEventListener("click", prevProp);
      } else {
        // 如果新的props沒有，把他設置成空
        if (!(prevProp in nextProps)) {
          domElement[propKey] = "";
        }
      }
    }
  }
  for (const propKey in nextProps) {
    const nextProp = nextProps[propKey];
    if (propKey === "style") {
      // TODO:
    } else if (propKey === "children") {
      // TODO:

      // 是文本節點
      if (isStr(nextProp) || isNum(nextProp)) {
        domElement.textContent = `${nextProp}`;
      }
    } else {
      // 處理事件，如果是合成事件就略過
      if (registrationNameDependencies[propKey]) {
        // domElement.addEventListener("click", nextProp);
      } else {
        domElement[propKey] = nextProp;
      }
    }
  }
}

// 要把整個子節點添加到 workInProgress.stateNode 上
// 源碼中，這裡也會處理 isHidden
function appendAllChildren(parent: Element, workInProgress: Fiber) {
  // debugger;
  let node = workInProgress.child;
  while (node !== null) {
    if (isHost(node)) {
      // 如果子節點是 Fragment，就沒有 node.stateNode
      parent.appendChild(node.stateNode); // node.stateNode 是 DOM 節點
      // 向下找直到小孩是有 stateNode
    } else if (node.child !== null) {
      node = node.child;
      continue;
    }
    if (node === workInProgress) return;

    // 子節點的同層級結束，子節點已經沒有後面的兄弟節點了
    while (node.sibling === null) {
      // 如果是根節點，或是已經處理完整個子樹了
      if (node.return === null || node.return === workInProgress) {
        return;
      }
      node = node.return;
    }
    node = node.sibling;
  }
}

export function isHost(fiber: Fiber) {
  return (
    fiber.tag === HostComponent ||
    fiber.tag === HostRoot ||
    fiber.tag === HostText
  );
}
