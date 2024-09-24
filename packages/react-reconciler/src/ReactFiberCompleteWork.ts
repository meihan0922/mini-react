import { isNum, isStr } from "@mono/shared/utils";
import type { Fiber } from "./ReactInternalTypes";
import { HostComponent, HostRoot, HostText } from "./ReactWorkTags";

export function completeWork(
  current: Fiber | null,
  workInProgress: Fiber
): Fiber | null {
  const { type, pendingProps } = workInProgress;

  switch (workInProgress.tag) {
    case HostRoot: {
      return null;
    }
    // 原生標籤
    case HostComponent: {
      // 1. 創建真實dom
      const instance = document.createElement(type);
      // 2. 初始化DOM屬性
      finalizeInitialChildren(instance, pendingProps);
      appendAllChildren(instance, workInProgress);
      workInProgress.stateNode = instance;
      return null;
    }
    case HostText: {
      workInProgress.stateNode = document.createTextNode(pendingProps);
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
  while (node !== null) {
    parent.appendChild(node.stateNode);
    node = node.sibling;
  }
}
