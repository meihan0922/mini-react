/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 *
 */

import { ReactDOMClientDispatcher } from "react-dom-bindings/src/client/ReactFiberConfigDOM";
import { queueExplicitHydrationTarget } from "react-dom-bindings/src/events/ReactDOMEventReplaying";
import { REACT_ELEMENT_TYPE } from "shared/ReactSymbols";
import {
  enableFloat,
  enableHostSingletons,
  allowConcurrentByDefault,
  disableCommentsAsDOMContainers,
} from "shared/ReactFeatureFlags";

import ReactDOMSharedInternals from "../ReactDOMSharedInternals";
const { Dispatcher } = ReactDOMSharedInternals;
if (enableFloat && typeof document !== "undefined") {
  // Set the default dispatcher to the client dispatcher
  Dispatcher.current = ReactDOMClientDispatcher;
}

import {
  isContainerMarkedAsRoot,
  markContainerAsRoot,
  unmarkContainerAsRoot,
} from "react-dom-bindings/src/client/ReactDOMComponentTree";
import { listenToAllSupportedEvents } from "react-dom-bindings/src/events/DOMPluginEventSystem";
import {
  ELEMENT_NODE,
  COMMENT_NODE,
  DOCUMENT_NODE,
  DOCUMENT_FRAGMENT_NODE,
} from "react-dom-bindings/src/client/HTMLNodeType";

import {
  createContainer,
  createHydrationContainer,
  updateContainer,
  findHostInstanceWithNoPortals,
  flushSync,
  isAlreadyRendering,
} from "react-reconciler/src/ReactFiberReconciler";
import { ConcurrentRoot } from "react-reconciler/src/ReactRootTags";

/* global reportError */
const defaultOnRecoverableError =
  typeof reportError === "function"
    ? // In modern browsers, reportError will dispatch an error event,
      // emulating an uncaught JavaScript error.
      reportError
    : (error) => {
        // In older browsers and test environments, fallback to console.error.
        // eslint-disable-next-line react-internal/no-production-logging
        console["error"](error);
      };

// $FlowFixMe[missing-this-annot]
function ReactDOMRoot(internalRoot) {
  this._internalRoot = internalRoot;
}

// $FlowFixMe[prop-missing] found when upgrading Flow
// 服務端和客戶端用的 render 是一樣的
ReactDOMHydrationRoot.prototype.render = ReactDOMRoot.prototype.render =
  // $FlowFixMe[missing-this-annot]
  // children 就是我們放入的 <App/>，是 ReactNodeList
  function (children) {
    // root -> FiberRootNode
    const root = this._internalRoot;
    if (root === null) {
      throw new Error("Cannot update an unmounted root.");
    }

    if (__DEV__) {
      if (typeof arguments[1] === "function") {
        console.error(
          "render(...): does not support the second callback argument. " +
            "To execute a side effect after rendering, declare it in a component body with useEffect()."
        );
      } else if (isValidContainer(arguments[1])) {
        console.error(
          "You passed a container to the second argument of root.render(...). " +
            "You don't need to pass it again since you already passed it to create the root."
        );
      } else if (typeof arguments[1] !== "undefined") {
        console.error(
          "You passed a second argument to root.render(...) but it only accepts " +
            "one argument."
        );
      }

      const container = root.containerInfo;

      if (
        !enableFloat &&
        !enableHostSingletons &&
        container.nodeType !== COMMENT_NODE
      ) {
        const hostInstance = findHostInstanceWithNoPortals(root.current);
        if (hostInstance) {
          if (hostInstance.parentNode !== container) {
            console.error(
              "render(...): It looks like the React-rendered content of the " +
                "root container was removed without using React. This is not " +
                "supported and will cause errors. Instead, call " +
                "root.unmount() to empty a root's container."
            );
          }
        }
      }
    }
    updateContainer(children, root, null, null);
  };

// $FlowFixMe[prop-missing] found when upgrading Flow
// react 18 之前是使用 callback
ReactDOMHydrationRoot.prototype.unmount = ReactDOMRoot.prototype.unmount =
  // $FlowFixMe[missing-this-annot]
  function () {
    if (__DEV__) {
      if (typeof arguments[0] === "function") {
        console.error(
          "unmount(...): does not support a callback argument. " +
            "To execute a side effect after rendering, declare it in a component body with useEffect()."
        );
      }
    }
    const root = this._internalRoot;
    if (root !== null) {
      // 卸載
      this._internalRoot = null;
      const container = root.containerInfo;
      if (__DEV__) {
        if (isAlreadyRendering()) {
          console.error(
            "Attempted to synchronously unmount a root while React was already " +
              "rendering. React cannot finish unmounting the root until the " +
              "current render has completed, which may lead to a race condition."
          );
        }
      }
      // ! flushSync 允許你強制 React 在提供的回調函式內同步刷新任何更新
      // ! 這將確保 DOM 立即更新
      // ! https://react.dev.org.tw/reference/react-dom/flushSync
      flushSync(() => {
        // 卸載也一樣調用 updateContainer
        // 沒有 children，第一個參數是 null
        updateContainer(null, root, null, null);
      });
      // 取消 DOM Node 上的標記
      unmarkContainerAsRoot(container);
    }
  };

/**
 * ! 創造根節點容器
 * @param {*} container: Element | Document | DocumentFragment 渲染的容器 必須要是 dom element
 * @param {*} options?
 *   可選： onRecoverableError - 回調函式，在 react 從異常錯誤中恢復時調用
 *   可選： identifierPrefix - react 用來配合 useId 生成 id 的字符串前綴，在同個頁面下使用多個根節點時，可以避免衝突
 * @returns: RootType: 返回 React.DOMRoot 實例，上面有 render, unmount, _internalRoot 三個屬性
 *
 * 1. 檢查 container 是 DOM 嗎？看是否要報錯。
 * 2. 檢查 options
 * ! 3. createContainer 創建 FiberRoot，即源碼裡面的 root，也就是根節點
 * 4. 返回 React.DOMRoot 實例
 */
export function createRoot(container, options) {
  // 判斷是否符合容器的規範，會檢查 nodeType
  // 可以是元素節點、document節點、註釋節點（會渲染到註釋之前）
  if (!isValidContainer(container)) {
    throw new Error("createRoot(...): Target container is not a DOM element.");
  }

  // 如果傳入 body 或是已經使用的元素，會發出警告
  warnIfReactDOMContainerInDEV(container);

  let isStrictMode = false;
  let concurrentUpdatesByDefaultOverride = false; // 設置更新模式
  let identifierPrefix = ""; // 前綴
  let onRecoverableError = defaultOnRecoverableError; // 可恢復的錯誤處理方法
  let transitionCallbacks = null; // 過度調度

  if (options !== null && options !== undefined) {
    if (__DEV__) {
      if (options.hydrate) {
        console.warn(
          "hydrate through createRoot is deprecated. Use ReactDOMClient.hydrateRoot(container, <App />) instead."
        );
      } else {
        if (
          typeof options === "object" &&
          options !== null &&
          options.$$typeof === REACT_ELEMENT_TYPE
        ) {
          console.error(
            "You passed a JSX element to createRoot. You probably meant to " +
              "call root.render instead. " +
              "Example usage:\n\n" +
              "  let root = createRoot(domContainer);\n" +
              "  root.render(<App />);"
          );
        }
      }
    }
    // 設置嚴格模式
    if (options.unstable_strictMode === true) {
      isStrictMode = true;
    }
    // 設置模式
    if (
      allowConcurrentByDefault &&
      options.unstable_concurrentUpdatesByDefault === true
    ) {
      concurrentUpdatesByDefaultOverride = true;
    }
    // 設置前綴
    if (options.identifierPrefix !== undefined) {
      identifierPrefix = options.identifierPrefix;
    }
    // 設置可恢復的錯誤處理回調
    if (options.onRecoverableError !== undefined) {
      onRecoverableError = options.onRecoverableError;
    }
    // 設置過度回調
    if (options.unstable_transitionCallbacks !== undefined) {
      transitionCallbacks = options.unstable_transitionCallbacks;
    }
  }

  // ! 創建 rootFiber 和 fiberRoot，把他們關聯起來，循環構造，最後返回 FiberRoot
  // FiberRoot.current = rootFiber;
  // rootFiber.stateNode = FiberRoot;
  const root = createContainer(
    container,
    /**
     * 放好是 concurrent（1)，
     * 在 createHostRootFiber 會根據這個 tag 指定模式
     * 在 updateContainer 中，requestUpdateLane 會依照
     * 是否是過度更新 或是 是內部更新 （比如 flushSync | setState
     * 或是外部的更新 （比如 根據事件
     *
     * root.render(<App/>);
     * 是從外部發起的，所以調用
     */
    ConcurrentRoot,
    null,
    isStrictMode,
    concurrentUpdatesByDefaultOverride,
    identifierPrefix,
    onRecoverableError,
    transitionCallbacks
  );

  /**
   * ! 將 root 掛載到 DOM 上
   * 紀錄 containerNode （ex: div#root）是根 Fiber
   * containerNode['__reactContainer$' + randomKey] = root.current // rootFiber
   * 後續用於 getClosestInstanceFromNode 和 getInstanceFromNode 中，用於根據根 DOM 取 Fiber 值
   */
  markContainerAsRoot(root.current, container);
  Dispatcher.current = ReactDOMClientDispatcher;

  // 看是不是註釋節點，只是為了兼容 FB 的老代碼
  const rootContainerElement =
    container.nodeType === COMMENT_NODE ? container.parentNode : container;
  // ! 事件代理，在 container 綁定所有原生事件，通過事件冒泡捕捉具體內容
  listenToAllSupportedEvents(rootContainerElement);

  /** 實例化！上面有 render, unmount 方法
   * type RootType ={
   *    render(children: ReactNodeList): void,
   *    unmount(): void,
   *    _internalRoot: FiberRoot | null,
   * }
   */
  // this._internalRoot = internalRoot

  // console.log(
  //   "----%creact-debugger/src/react/packages/react-dom/src/client/ReactDOMRoot.js:251 root",
  //   "color: #007acc;",
  //   root
  // );
  // ! 初始化 ReactDOMRoot
  return new ReactDOMRoot(root);
}

// $FlowFixMe[missing-this-annot]
function ReactDOMHydrationRoot(internalRoot) {
  this._internalRoot = internalRoot;
}
function scheduleHydration(target) {
  if (target) {
    queueExplicitHydrationTarget(target);
  }
}
// $FlowFixMe[prop-missing] found when upgrading Flow
ReactDOMHydrationRoot.prototype.unstable_scheduleHydration = scheduleHydration;

export function hydrateRoot(container, initialChildren, options) {
  if (!isValidContainer(container)) {
    throw new Error("hydrateRoot(...): Target container is not a DOM element.");
  }

  warnIfReactDOMContainerInDEV(container);

  if (__DEV__) {
    if (initialChildren === undefined) {
      console.error(
        "Must provide initial children as second argument to hydrateRoot. " +
          "Example usage: hydrateRoot(domContainer, <App />)"
      );
    }
  }

  // For now we reuse the whole bag of options since they contain
  // the hydration callbacks.
  const hydrationCallbacks = options != null ? options : null;

  let isStrictMode = false;
  let concurrentUpdatesByDefaultOverride = false;
  let identifierPrefix = "";
  let onRecoverableError = defaultOnRecoverableError;
  let transitionCallbacks = null;
  if (options !== null && options !== undefined) {
    if (options.unstable_strictMode === true) {
      isStrictMode = true;
    }
    if (
      allowConcurrentByDefault &&
      options.unstable_concurrentUpdatesByDefault === true
    ) {
      concurrentUpdatesByDefaultOverride = true;
    }
    if (options.identifierPrefix !== undefined) {
      identifierPrefix = options.identifierPrefix;
    }
    if (options.onRecoverableError !== undefined) {
      onRecoverableError = options.onRecoverableError;
    }
    if (options.unstable_transitionCallbacks !== undefined) {
      transitionCallbacks = options.unstable_transitionCallbacks;
    }
  }

  const root = createHydrationContainer(
    initialChildren,
    null,
    container,
    ConcurrentRoot,
    hydrationCallbacks,
    isStrictMode,
    concurrentUpdatesByDefaultOverride,
    identifierPrefix,
    onRecoverableError,
    transitionCallbacks
  );
  markContainerAsRoot(root.current, container);
  Dispatcher.current = ReactDOMClientDispatcher;
  // This can't be a comment node since hydration doesn't work on comment nodes anyway.
  listenToAllSupportedEvents(container);

  // $FlowFixMe[invalid-constructor] Flow no longer supports calling new on functions
  return new ReactDOMHydrationRoot(root);
}

export function isValidContainer(node) {
  return !!(
    node &&
    (node.nodeType === ELEMENT_NODE ||
      node.nodeType === DOCUMENT_NODE ||
      node.nodeType === DOCUMENT_FRAGMENT_NODE ||
      (!disableCommentsAsDOMContainers &&
        node.nodeType === COMMENT_NODE &&
        node.nodeValue === " react-mount-point-unstable "))
  );
}

// TODO: Remove this function which also includes comment nodes.
// We only use it in places that are currently more relaxed.
export function isValidContainerLegacy(node) {
  return !!(
    node &&
    (node.nodeType === ELEMENT_NODE ||
      node.nodeType === DOCUMENT_NODE ||
      node.nodeType === DOCUMENT_FRAGMENT_NODE ||
      (node.nodeType === COMMENT_NODE &&
        node.nodeValue === " react-mount-point-unstable "))
  );
}

function warnIfReactDOMContainerInDEV(container) {
  if (__DEV__) {
    if (
      !enableHostSingletons &&
      container.nodeType === ELEMENT_NODE &&
      container.tagName &&
      container.tagName.toUpperCase() === "BODY"
    ) {
      console.error(
        "createRoot(): Creating roots directly with document.body is " +
          "discouraged, since its children are often manipulated by third-party " +
          "scripts and browser extensions. This may lead to subtle " +
          "reconciliation issues. Try using a container element created " +
          "for your app."
      );
    }
    if (isContainerMarkedAsRoot(container)) {
      if (container._reactRootContainer) {
        console.error(
          "You are calling ReactDOMClient.createRoot() on a container that was previously " +
            "passed to ReactDOM.render(). This is not supported."
        );
      } else {
        console.error(
          "You are calling ReactDOMClient.createRoot() on a container that " +
            "has already been passed to createRoot() before. Instead, call " +
            "root.render() on the existing root instead if you want to update it."
        );
      }
    }
  }
}
