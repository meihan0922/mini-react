import {
  REACT_ELEMENT_TYPE,
  REACT_FRAGMENT_TYPE,
} from "@mono/shared/ReactSymbols";
import type { ReactElement } from "@mono/shared/ReactTypes";
import { createFiberFromElement, createFiberFromText } from "./ReactFiber";
import { Placement } from "./ReactFiberFlags";
import type { Fiber } from "./ReactInternalTypes";
import { isArray, isStr } from "@mono/shared/utils";

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
  // 給 fiber 添加標記，flag
  function placeSingleChild(newFiber: Fiber) {
    // 給根節點初次渲染添加標記
    if (shouldTrackSideEffect && newFiber.alternate === null) {
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
    const createFiber = createFiberFromElement(newChild);
    createFiber.return = returnFiber;
    return createFiber;
  }
  // 只有協調單個子節點，沒有bailout
  function reconcileSingleTextNode(
    returnFiber: Fiber,
    currentFirstChild: Fiber | null, // TODO:
    textContent: string | number
  ) {
    // 強制轉型成字串，以防數字
    const created = createFiberFromText(textContent + "");
    created.return = returnFiber;
    return created;
  }

  function createChild(returnFiber: Fiber, newChild: any) {
    if (isText(newChild)) {
      // 強制轉型成字串，以防數字
      const created = createFiberFromText(newChild + "");
      created.return = returnFiber;
      return created;
    }
    if (typeof newChild === "object" && newChild !== null) {
      switch (newChild.$$typeof) {
        case REACT_ELEMENT_TYPE: {
          const created = createFiberFromElement(newChild);
          created.return = returnFiber;
          return created;
        }
      }
    }

    // TODO
    return null;
  }

  function reconcileChildrenArray(
    returnFiber: Fiber,
    currentFirstChild: Fiber | null,
    newChildren: Array<any>
  ) {
    let idx = 0;
    // 頭節點
    let resultFirst: Fiber | null = null;
    // 老 fiber 的頭節點
    let oldFiber = currentFirstChild;
    let previousNewFiber: Fiber | null = null;

    // 初次渲染的話
    if (oldFiber === null) {
      for (; idx < newChildren.length; idx++) {
        const newFiber = createChild(returnFiber, newChildren[idx]);
        // 沒有有效的創建，就不需要創建fiber
        if (newFiber === null) continue;
        // 更新階段，判斷更新前後位置是否一致，是否要移動位置，因為是鏈表所以要記index
        newFiber.index = idx;
        if (previousNewFiber === null) {
          // 紀錄頭節點，不能用 index 判斷，因為有可能 null，null 就不是有效的 fiber
          resultFirst = newFiber;
        } else {
          // 把前一個節點的兄弟節點重新指向
          previousNewFiber.sibling = newFiber;
        }
        previousNewFiber = newFiber;
      }
    }
    return resultFirst;
  }

  function reconcileChildFibers(
    returnFiber: Fiber,
    currentFirstChild: Fiber | null,
    newChild: any
  ) {
    if (isText(newChild)) {
      return placeSingleChild(
        reconcileSingleTextNode(returnFiber, currentFirstChild, newChild)
      );
    }
    // 如果節點是陣列，有多個子節點
    if (isArray(newChild)) {
      return reconcileChildrenArray(returnFiber, currentFirstChild, newChild);
    }
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

function isText(newChild: any) {
  return (
    (typeof newChild === "string" && newChild !== "") ||
    typeof newChild === "number"
  );
}
