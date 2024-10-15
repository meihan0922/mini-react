import {
  REACT_ELEMENT_TYPE,
  REACT_FRAGMENT_TYPE,
} from "@mono/shared/ReactSymbols";
import type { ReactElement } from "@mono/shared/ReactTypes";
import {
  createFiberFromElement,
  createFiberFromText,
  createWorkInProgress,
} from "./ReactFiber";
import { ChildDeletion, Placement } from "./ReactFiberFlags";
import type { Fiber } from "./ReactInternalTypes";
import { isArray, isStr } from "@mono/shared/utils";
import { HostText } from "./ReactWorkTags";

type ChildReconciler = (
  returnFiber: Fiber,
  currentFirstChild: Fiber | null,
  newChild: any
  //   lanes: Lanes
) => Fiber | null;

export const reconcileChildFibers: ChildReconciler =
  createChildReconciler(true);

export const mountChildFibers: ChildReconciler = createChildReconciler(false);

// 協調子節點，shouldTrackSideEffect：不是初次渲染
function createChildReconciler(shouldTrackSideEffect: boolean) {
  function deleteRemaingChildren(returnFiber: Fiber, currentFirstChild: Fiber) {
    if (!shouldTrackSideEffect) {
      // 初次渲染
      return;
    }
    let childToDelete: Fiber | null = currentFirstChild;
    while (childToDelete !== null) {
      deleteChild(returnFiber, childToDelete);
      childToDelete = childToDelete.sibling;
    }
    return null;
  }
  function deleteChild(returnFiber: Fiber, childToDelete: Fiber) {
    const deletions = returnFiber.deletions;
    if (!shouldTrackSideEffect) {
      // 初次渲染
      return;
    }
    if (!deletions) {
      returnFiber.deletions = [childToDelete];
      returnFiber.flags |= ChildDeletion;
    } else {
      returnFiber.deletions!.push(childToDelete);
    }
  }
  // 給 fiber 添加標記，flag
  function placeSingleChild(newFiber: Fiber) {
    // 給根節點初次渲染添加標記
    if (shouldTrackSideEffect && newFiber.alternate === null) {
      newFiber.flags |= Placement;
    }
    return newFiber;
  }

  function useFiber(fiber: Fiber, pendingProps: any) {
    const clone = createWorkInProgress(fiber, pendingProps);
    clone.index = 0;
    clone.sibling = null;
    return clone;
  }

  // 只有協調單個子節點
  function reconcileSingleElement(
    returnFiber: Fiber,
    currentFirstChild: Fiber | null,
    element: ReactElement
  ) {
    // 節點復用的條件需滿足
    // 1. 同一層級下
    // 2. key 相同
    // 3. type 相同
    const key = element.key;
    let child = currentFirstChild;
    while (child !== null) {
      if (child.key === key) {
        const elementType = element.type;
        if (child.elementType === elementType) {
          // 復用
          const existing = useFiber(child, element.props);
          existing.return = returnFiber;
          return existing;
        } else {
          // 同層級下 key 不應相同，沒一個可以復用，要刪除所有的剩下的child(之前的已經走到下面的 deleteChild)
          deleteRemaingChildren(returnFiber, child);
          break;
        }
      } else {
        // delete 因為是單個節點才會進來這裡
        deleteChild(returnFiber, child);
      }
      child = child.sibling;
    }
    const createFiber = createFiberFromElement(element);
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

  function updateTextNode(
    returnFiber: Fiber,
    current: Fiber | null,
    textContent: string
  ) {
    if (current === null || current.tag !== HostText) {
      // 老節點不是文本節點，但已經確定 key 是一樣的了，直接創建新的
      const created = createFiberFromText(textContent);
      created.return = returnFiber;
      return created;
    } else {
      // 復用
      const existing = useFiber(current, textContent);
      existing.return = returnFiber;
      return existing;
    }
  }

  function updateElement(
    returnFiber: Fiber,
    current: Fiber | null,
    element: any
  ) {
    const elementType = element.type;
    if (current !== null && current.elementType === elementType) {
      // 復用
      const existing = useFiber(current, element.props);
      existing.return = returnFiber;
      return existing;
    }
    const created = createFiberFromElement(element);
    created.return = returnFiber;
    return created;
  }

  function updateSlot(
    returnFiber: Fiber,
    oldFiber: Fiber | null,
    newChild: any
  ) {
    // 判斷節點可以復用嗎
    const key = oldFiber !== null ? oldFiber.key : null;

    // 像是 reconcileChildFibers 也要先處理文字節點，再去判斷，
    if (isText(newChild)) {
      // 如果是文本節點 是沒有key的
      // 新節點是文本，老節點不是
      // 確定完完全全的不同，也有可能之後key和其他老節點可以匹配，所以先跳過
      if (key !== null) {
        return null;
      } else {
        // key 一樣！！
        // 有可能可以復用
        // 所以要馬復用，要馬創建新的，而且確定處理完可以把舊的刪掉
        return updateTextNode(returnFiber, oldFiber, newChild + "");
      }
    }

    if (typeof newChild === "object" && newChild !== null) {
      if (newChild.key === key) {
        return updateElement(returnFiber, oldFiber, newChild);
      } else {
        // 不能復用，之後老節點要刪除，新節點創建
        return null;
      }
    }
  }

  function placeChild(
    newFiber: Fiber,
    lastPlacedIndex: number, // 新fiber 在老 fiber 的位置
    newIndex: number
  ) {
    newFiber.index = newIndex;

    if (!shouldTrackSideEffect) return lastPlacedIndex;

    const current = newFiber.alternate;
    if (current !== null) {
      const oldIndex = current.index;
      if (oldIndex < lastPlacedIndex) {
        newFiber.flags |= Placement;
        return lastPlacedIndex;
      } else {
        // 不需要移動相對位置
        return oldIndex;
      }
    } else {
      newFiber.flags |= Placement;
      return lastPlacedIndex;
    }
  }

  function mapRemainingChildren(oldFiber: Fiber) {
    let existingChildren: Map<string | number, Fiber> = new Map();
    let existingChild: Fiber | null = oldFiber;
    while (existingChild !== null) {
      if (existingChild.key !== null) {
        existingChildren.set(existingChild.key, existingChild);
      } else {
        existingChildren.set(existingChild.index, existingChild);
      }
      existingChild = existingChild.sibling;
    }
    return existingChildren;
  }

  function updateFromMap(
    existingChildren: Map<string | number, Fiber>,
    returnFiber: Fiber,
    newIdx: number,
    newChild: Fiber
  ) {
    if (isText(newChild)) {
      const matchedFiber = existingChildren.get(newIdx) || null;
      return updateTextNode(returnFiber, matchedFiber, "" + newChild);
    } else {
      const matchedFiber =
        existingChildren.get(newChild.key === null ? newIdx : newChild.key) ||
        null;
      return updateElement(returnFiber, matchedFiber, newChild);
    }
  }

  function reconcileChildrenArray(
    returnFiber: Fiber,
    currentFirstChild: Fiber | null,
    newChildren: Array<any>
  ) {
    let newIdx = 0;
    // 頭節點
    let resultFirstChild: Fiber | null = null;
    // 紀錄比對中的老 fiber，初始是頭節點
    let oldFiber = currentFirstChild;
    // 紀錄前 Fiber，後續要將 previousNewFiber sibling 指向 新 fiber
    let previousNewFiber: Fiber | null = null;
    // oldFiber.sibling
    let nextOldFiber = null;
    // 用來記錄最後一個，新節點相對於老節點 不變的位置
    let lastPlacedIndex = 0;
    // old 0 1 2
    // new 0 1 2 3 4

    // 1. 從左邊往右邊遍歷，按照位置比較，如果可以復用，就復用。不能復用就退出當前循環
    // 他的假設前提是，應該會盡可能的和原來的順序一樣
    for (; oldFiber !== null && newIdx < newChildren.length; newIdx++) {
      if (oldFiber.index > newIdx) {
        // ???? 雖然源碼這樣寫，但想不到什麼時候會有這樣的狀況
        // ???? 用於處理現有子組件在新子組件列表中沒有對應位置的情況，為了優化子組件的復用和刪除邏輯
        // ???? 按照位置比，如果舊的已經超前，就跳過
        nextOldFiber = oldFiber;
        // A. 不進行比較了，直接創造新的
        oldFiber = null;
      } else {
        nextOldFiber = oldFiber.sibling;
      }
      const newFiber = updateSlot(returnFiber, oldFiber, newChildren[newIdx]);
      // 沒辦法復用
      if (newFiber === null) {
        // 有可能走到 A.，換下個位置，再去遍歷復用
        if (oldFiber === null) {
          oldFiber = nextOldFiber;
        }
        break;
      }

      // 更新階段，
      if (shouldTrackSideEffect) {
        // 還是沒辦法復用(在比較中 key相同，但 type 不一樣，會立刻創建新的)，這時候可以確定刪掉了
        // 但比較中完全不一樣時，newFiber 是 null，舊的節點後續可能繼續被比較
        if (oldFiber && newFiber?.alternate === null) {
          deleteChild(returnFiber, oldFiber);
        }
      }
      // 判斷節點相對位置是否發生變化，組件更新階段在更新前後的位置是否一樣
      lastPlacedIndex = placeChild(newFiber as Fiber, lastPlacedIndex, newIdx);

      if (previousNewFiber === null) {
        resultFirstChild = newFiber as Fiber;
      } else {
        (previousNewFiber as Fiber).sibling = newFiber as Fiber;
      }
      previousNewFiber = newFiber as Fiber;
      oldFiber = nextOldFiber;
    }

    // 2.1 老節點還有，新節點沒了，刪除剩餘的老節點
    if (newIdx === newChildren.length) {
      deleteRemaingChildren(returnFiber, oldFiber);
      return resultFirstChild;
    }

    // 2.2 新節點還有，老節點沒了，剩下的新增即可，也包含初次渲染
    // 初次渲染的話，或是新節點跑回圈newIdx < newChildren.length; 和 oldFiber = nextOldFiber; // null
    // 表示是新增的節點，會跑到此
    if (oldFiber === null) {
      for (; newIdx < newChildren.length; newIdx++) {
        const newFiber = createChild(returnFiber, newChildren[newIdx]);
        // 沒有有效的創建，就不需要創建fiber
        if (newFiber === null) continue;
        // 更新階段，判斷更新前後位置是否一致，是否要移動位置，因為是鏈表所以要記index
        lastPlacedIndex = placeChild(
          newFiber as Fiber,
          lastPlacedIndex,
          newIdx
        );

        if (previousNewFiber === null) {
          // 紀錄頭節點，不能用 index 判斷，因為有可能 null，null 就不是有效的 fiber
          resultFirstChild = newFiber;
        } else {
          // 把前一個節點的兄弟節點重新指向
          previousNewFiber.sibling = newFiber;
        }
        previousNewFiber = newFiber;
      }
      return resultFirstChild;
    }

    // 2.3 新老節點都還有
    // [0,1,2,3,4] [0,1,2,4]
    // [0,1,2] 已經處理，[3,4] 尚未處理
    const existingChildren = mapRemainingChildren(oldFiber);
    for (; newIdx < newChildren.length; newIdx++) {
      const newFiber = updateFromMap(
        existingChildren,
        returnFiber,
        newIdx,
        newChildren[newIdx]
      );
      // 不管有沒有復用，都應該會有值
      if (newFiber !== null) {
        if (shouldTrackSideEffect) {
          // 更新階段 已經比對過了，所以可以瘦身，減少map的大小
          existingChildren.delete(
            newFiber?.key === null ? newIdx : newFiber!.key
          );
        }
        lastPlacedIndex = placeChild(newFiber, lastPlacedIndex, newIdx);
        if (previousNewFiber === null) {
          // 頭節點
          resultFirstChild = newFiber;
        } else {
          previousNewFiber.sibling = newFiber;
        }
        previousNewFiber = newFiber;
      }
    }

    if (shouldTrackSideEffect) {
      // 新節點已經都完成了，剩下老節點要清除
      // Any existing children that weren't consumed above were deleted. We need
      // to add them to the deletion list.
      existingChildren.forEach((child) => deleteChild(returnFiber, child));
    }

    return resultFirstChild;
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
