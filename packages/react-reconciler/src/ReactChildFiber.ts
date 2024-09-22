import { REACT_ELEMENT_TYPE } from "@mono/shared/ReactSymbols";
import { ReactElement } from "@mono/shared/ReactTypes";
import { createFiberFromElement } from "./ReactFiber";
import { Placement } from "./ReactFiberFlags";
import { Fiber } from "./ReactInternalTypes";

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
