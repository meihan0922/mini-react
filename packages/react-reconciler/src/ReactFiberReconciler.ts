import { ReactNodeList } from "@mono/shared/ReactTypes";
import type { Container, Fiber, FiberRoot } from "./ReactInternalTypes";
import type { RootTag } from "./ReactFiberRoot";
import { createFiberRoot } from "./ReactFiberRoot";
import { scheduleUpdateOnFiber } from "./ReactFiberWorkLoop";

// 輸出給 react-dom，實現 react 的入口，創造出 fiberRoot, fiber 樹狀結構掛載在實例根節點上
export function createContainer(containerInfo: Container, tag: RootTag) {
  return createFiberRoot(containerInfo, tag);
}

// 1. 獲取 current, lane
// 2. 創建 update
// 3. update 入隊放到暫存區
// 4. scheduleUpdateOnFiber 啟動調度
// 5. entangleTranstions
export function updateContainer(element: ReactNodeList, container: FiberRoot) {
  // console.log(element);
  // 組件初次渲染

  // 1. 獲取 current, lane
  const current = container.current;
  // 源碼中，初次渲染 子element 會作為 update.payload
  // const eventTime = getCurrentTime();
  // const update = createUpdate(eventTime, lane);
  // update.payload = { element };
  // 暫時簡寫放到 memoizedState
  current.memoizedState = { element };

  scheduleUpdateOnFiber(container, current);
}

export default updateContainer;
