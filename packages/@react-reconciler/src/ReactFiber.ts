import { ReactElement, ReactFragment } from "@shared/ReactTypes";
import { REACT_FRAGMENT_TYPE } from "@shared/ReactSymbols";
import { isFn, isStr } from "@shared/utils";
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
