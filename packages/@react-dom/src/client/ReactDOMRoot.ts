import type { FiberRoot } from "@react-reconciler/src/ReactInternalTypes";
import type { ReactNodeList } from "@shared/ReactTypes";
import {
  ConcurrentRoot,
  createFiberRoot,
} from "@react-reconciler/src/ReactFiberRoot";
import { updateContainer } from "@react-reconciler/src/ReactFiberReconciler";

type RootType = {
  render: (children: ReactNodeList) => void;
  _internalRoot: FiberRoot;
};

// 創造一個類型，掛載 render 和 unmount 的方法，並且創造和 fiber 的連結
// 把 fiber 掛載到 _internalRoot 上面
function ReactDOMRoot(internalRoot: FiberRoot) {
  this._internalRoot = internalRoot;
}

ReactDOMRoot.prototype.render = function (children: ReactNodeList) {
  // 拿到 fiberRoot
  const root = this._internalRoot;
  updateContainer(children, root);
};

function createRoot(
  container: Element | Document | DocumentFragment
): RootType {
  const root = createFiberRoot(container, ConcurrentRoot);

  return new ReactDOMRoot(root);
}

export default { createRoot };
