import type { Fiber } from "./ReactInternalTypes";
import type {
  SharedQueue as ClassQueue,
  Update as ClassUpdate,
} from "./ReactFiberClassUpdateQueue";
import type { Lane, Lanes } from "./ReactFiberLane";
import { mergeLanes, NoLanes } from "./ReactFiberLane";
import type { FiberRoot } from "./ReactInternalTypes";
import { HostRoot } from "./ReactWorkTags";

export type ConcurrentUpdate = {
  next: ConcurrentUpdate;
  lane: Lane;
};

type ConcurrentQueue = {
  pending: ConcurrentUpdate | null;
};

// 在 render 正在執行中，但過程中又接到 concurrent 的更新，
// 必須要等到 render 完成後或被中斷，再把新的 concurrent 事件加入到 fiber/hook queue中
// 先暫存在這裡
const concurrentQueues: Array<any> = [];
let concurrentQueuesIndex = 0;

let concurrentlyUpdatedLanes: Lanes = NoLanes;

function enqueueUpdate(
  fiber: Fiber,
  queue: ConcurrentQueue | null,
  update: ConcurrentUpdate | null,
  lane: Lane
) {
  // 這裡的結構很特別！是用 index 處理的！
  concurrentQueues[concurrentQueuesIndex++] = fiber;
  concurrentQueues[concurrentQueuesIndex++] = queue;
  concurrentQueues[concurrentQueuesIndex++] = update;
  concurrentQueues[concurrentQueuesIndex++] = lane;

  // 把待處理的優先級更新上去
  concurrentlyUpdatedLanes = mergeLanes(concurrentlyUpdatedLanes, lane);

  // 更新節點的優先等級
  fiber.lanes = mergeLanes(fiber.lanes, lane);

  const alternate = fiber.alternate;

  if (alternate != null) {
    // 新的優先級，掛載到新的樹上
    alternate.lanes = mergeLanes(alternate.lanes, lane);
  }
}

export function enqueueConcurrentClassUpdate<State>(
  fiber: Fiber,
  queue: ClassQueue<State>,
  update: ClassQueue<State>,
  lane: Lane
): FiberRoot | null {
  const concurrentQueue = queue;
  const concurrentUpdate = update;
  enqueueUpdate(fiber, concurrentQueue, concurrentUpdate, lane);
  return getRootForUpdateFiber(fiber);
}

// 找到根節點，返回根節點的實例
function getRootForUpdateFiber(sourceFiber: Fiber): FiberRoot | null {
  let node = sourceFiber;

  let parent = node.return;

  while (parent !== null) {
    node = parent;
    parent = node.return;
  }

  return node.tag === HostRoot ? node.stateNode : null;
}
