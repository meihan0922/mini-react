import { isHost } from "./ReactFiberCompleteWork";
import { ChildDeletion, Placement } from "./ReactFiberFlags";
import type { Fiber, FiberRoot } from "./ReactInternalTypes";
import { HostComponent, HostRoot, HostText } from "./ReactWorkTags";

// finishedWork 是 HostRoot 類型的 fiber，要把子節點渲染到 root 裡面，root 是 #root
export function commitMutationEffects(root: FiberRoot, finishedWork: Fiber) {
  recursivelyTraverseMutationEffects(root, finishedWork);
  commitReconciliationEffects(finishedWork);
}
// 遍歷 finishedWork
function recursivelyTraverseMutationEffects(root, parentFiber: Fiber) {
  // 單鏈表
  let child = parentFiber.child;
  while (child !== null) {
    // 每個子節點都一一提交，包含同級的兄弟節點，逐一往上
    commitMutationEffects(root, child);
    child = child.sibling;
  }
}
// 提交協調中產生的effects，比如flags標記 Placement, Update, ChildDeletion
function commitReconciliationEffects(finishedWork: Fiber) {
  // TODO 只先完成 Placement ChildDeletion
  const flags = finishedWork.flags;

  if (flags & Placement) {
    // 頁面初次渲染，新增插入 appendChild
    commitPlacement(finishedWork);
    // 把 Placement 從 flags 移除
    finishedWork.flags &= ~Placement;
  } else if (flags & ChildDeletion) {
    // 找到 原生的祖先節點（網上找，直到找到為止
    const parentFiber = isHostParent(finishedWork)
      ? finishedWork
      : getHostParentFiber(finishedWork);
    const parentDOM = parentFiber.stateNode;

    commitDeletions(finishedWork.deletions, parentDOM);

    // 把 ChildDeletion 從 flags 移除
    finishedWork.flags &= ~ChildDeletion;
    finishedWork.deletions = null;
  }
}

function getStateNode(deletion: Fiber) {
  let node: Fiber = deletion;
  // 一直找到是Host類型的node為止，不是的話略過
  while (true) {
    if (isHost(node) && node.stateNode) {
      return node.stateNode;
    }
    node = node.child as Fiber;
  }
}

// 根據fiber 刪除 DOM 節點（包含父子
function commitDeletions(
  deletions: Fiber["deletions"],
  parentFiberDOM: Element | Document | DocumentFragment
) {
  deletions?.forEach((deletion) => {
    parentFiberDOM.removeChild(getStateNode(deletion));
  });
}

function commitPlacement(finishedWork: Fiber) {
  // 目前先把 HostComponent 渲染上去，之後再處理其他組件的情況
  if (finishedWork.stateNode && isHost(finishedWork)) {
    const domNode = finishedWork.stateNode;
    const parentFiber = getHostParentFiber(finishedWork);
    // 要找到最接近的祖先節點 是 Host 的 fiber，再把他塞進去
    // Host 節點有三種 HostRoot, HostComponent, HostText(不能有子節點)
    let parentDOM = parentFiber.stateNode;
    // HostRoot 的實例存在 containerInfo 中
    if (parentDOM.containerInfo) {
      parentDOM = parentDOM.containerInfo;
    }

    // 遍歷 fiber 尋找 finishedWork 兄弟節點，並且 這個 sibling 有 dom 節點，且是更新的節點
    // 在本輪不發生移動
    const before = getHostSibling(finishedWork);
    insertOrAppendPlacementNode(finishedWork, before, parentDOM);
  } else {
    // 要是根節點是 Fragment，會沒有stateNode
    let child = finishedWork.child;
    while (child !== null) {
      commitPlacement(child);
      child = child.sibling;
    }
  }
}

function getHostSibling(fiber: Fiber) {
  let node = fiber;
  siblings: while (1) {
    // 往上找，找到有兄弟節點的節點
    while (node.sibling === null) {
      if (node.return === null || isHostParent(node.return)) {
        return null;
      }
      node = node.return;
    }
    // 改到兄弟節點上
    node = node.sibling;
    // 往下找，找到是 tag 是 Host 節點
    // 而且不能是本次更新中
    // ❌ 被標記更新的節點
    // ❌ 沒有子節點的節點
    while (!isHost(node)) {
      // 要馬是初次渲染，新增插入或是移動位置
      if (node.flags & Placement) {
        continue siblings;
      }
      // 沒有子節點
      if (node.child === null) {
        continue siblings;
      } else {
        node = node.child;
      }
    }
    // 找到沒有位移的節點
    // 有 stateNode ，是HostComponent | HostText
    if (!(node.flags & Placement)) {
      return node.stateNode;
    }
  }
}

function insertOrAppendPlacementNode(
  node: Fiber,
  before: Element,
  parent: Element
) {
  if (before) {
    // insertBefore(newNode, referenceNode)
    parent.insertBefore(getStateNode(node), before);
  } else {
    parent.appendChild(getStateNode(node));
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
