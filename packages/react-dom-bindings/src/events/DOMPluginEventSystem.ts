// 不適合事件委託的文件
import * as SimpleEventPlugin from "./plugins/SimpleEventPlugin";
import type { DOMEventName } from "./DOMEventNames";
import { allNativeEvents } from "./EventRegistry";
import { EventSystemFlags, IS_CAPTURE_PHASE } from "./EventSystemFlags";
import { createEventListenerWrapperWithPriority } from "./ReactDOMEventListener";
import {
  addEventBubbleListener,
  addEventCaptureListener,
} from "./EventListeners";
import { Fiber } from "@mono/react-reconciler/src/ReactInternalTypes";
import { HostComponent } from "@mono/react-reconciler/src/ReactWorkTags";
import getListener from "./getListener";
import { ReactSyntheticEvent } from "./ReactSyntheticEventType";

export type AnyNativeEvent = Event | KeyboardEvent | MouseEvent | TouchEvent;
export type DispatchListener = {
  instance: null | Fiber;
  listener: Function;
  currentTarget: EventTarget;
};

type DispatchEntry = {
  event: ReactSyntheticEvent; // TODO: 實現合成事件
  listeners: Array<DispatchListener>;
};

export type DispatchQueue = Array<DispatchEntry>;

// List of events that need to be individually attached to media elements.
// 需要分別附加到媒體元素的事件列表
export const mediaEventTypes: Array<DOMEventName> = [
  "abort",
  "canplay",
  "canplaythrough",
  "durationchange",
  "emptied",
  "encrypted",
  "ended",
  "error",
  "loadeddata",
  "loadedmetadata",
  "loadstart",
  "pause",
  "play",
  "playing",
  "progress",
  "ratechange",
  "resize",
  "seeked",
  "seeking",
  "stalled",
  "suspend",
  "timeupdate",
  "volumechange",
  "waiting",
];

// We should not delegate these events to the container, but rather
// set them on the actual target element itself. This is primarily
// because these events do not consistently bubble in the DOM.
// 我們不應該將事件委託給容器，應該直接在實際的目標元素上設置他們。
// 主要是因為這些事件在 DOM 的冒泡行為不一致
export const nonDelegatedEvents: Set<DOMEventName> = new Set([
  "beforetoggle",
  "cancel",
  "close",
  "invalid",
  "load",
  "scroll",
  "scrollend",
  "toggle",
  // In order to reduce bytes, we insert the above array of media events
  // into this Set. Note: the "error" event isn't an exclusive media event,
  // and can occur on other elements too. Rather than duplicate that event,
  // we just take it from the media events array.
  ...mediaEventTypes,
]);

// 不同類型的事件註冊
SimpleEventPlugin.registerEvents();
// EnterEventPlugin.registerEvents();
// ChangeEventPlugin.registerEvents();
// SelectEventPlugin.registerEvents();
// BeforeEventPlugin.registerEvents();

export function extractEvents(
  dispatchQueue: DispatchQueue,
  domEventName: DOMEventName,
  targetInst: null | Fiber,
  nativeEvent: AnyNativeEvent,
  nativeEventTarget: null | EventTarget,
  eventSystemFlags: EventSystemFlags,
  targetContainer: EventTarget
) {
  SimpleEventPlugin.extractEvents(
    dispatchQueue,
    domEventName,
    targetInst,
    nativeEvent,
    nativeEventTarget,
    eventSystemFlags,
    targetContainer
  );

  // TODO: 其他事件類型，這次就不實作了
}

// TODO: 事件綁定
const listeningMarker = "_reactListening" + Math.random().toString(36).slice(2);
export function listenToAllSupportedEvents(rootContainerElement: EventTarget) {
  // 防止重複綁定
  if (!rootContainerElement[listeningMarker]) {
    rootContainerElement[listeningMarker] = true;
    allNativeEvents.forEach((domEventName) => {
      // 特殊處理 selectionchange
      if (domEventName !== "selectionchange") {
        // 捕獲階段 冒泡階段
        // 有些事件在 DOM 上冒泡行為不一致，就不做事件委託
        if (!nonDelegatedEvents.has(domEventName)) {
          // 第二個參數是事件類型
          listenToNativeEvent(domEventName, false, rootContainerElement);
        }
        listenToNativeEvent(domEventName, true, rootContainerElement);
      }
    });
  }
}

function listenToNativeEvent(
  domEventName: DOMEventName,
  isCapturePhaseListener: boolean,
  target: EventTarget
) {
  let eventSystemFlags = 0;
  if (isCapturePhaseListener) {
    // 標記是不是捕獲階段
    eventSystemFlags |= IS_CAPTURE_PHASE;
  }
  addTrappedEventListener(
    target,
    domEventName,
    eventSystemFlags,
    isCapturePhaseListener
  );
}

function addTrappedEventListener(
  target: EventTarget,
  domEventName: DOMEventName,
  eventSystemFlags: EventSystemFlags,
  isCapturePhaseListener: boolean
) {
  // ! 1. 獲取對應事件，事件定義在 ReactDOMEventListener.js 當中
  // 獲取不同的優先級，定義不同的派發方法
  // 如 DiscreteEventPriority 對應 dispatchDiscreteEvent,
  let listener = createEventListenerWrapperWithPriority(
    target,
    domEventName,
    eventSystemFlags
  );

  // ! 2. 綁定事件
  if (isCapturePhaseListener) {
    addEventCaptureListener(target, domEventName, listener);
  } else {
    addEventBubbleListener(target, domEventName, listener);
  }
}

export function accumulateSinglePhaseListeners(
  targetFiber: null | Fiber,
  reactName: string | null,
  type: string,
  inCapturePhase: boolean,
  accumulateTargetOnly: boolean,
  nativeEvent: AnyNativeEvent
): Array<DispatchListener> {
  const captureName = reactName !== null ? reactName + "Capture" : null;
  const reactEventName = inCapturePhase ? captureName : reactName;
  let listeners: Array<DispatchListener> = [];

  let instance = targetFiber;
  let lastHostComponent = null;

  // 通過 target => root 累積所有的 fiber 和 listeners
  while (instance !== null) {
    const { stateNode, tag } = instance;
    // 處理 HostComponents 原生標籤上的 listeners;
    if (tag === HostComponent) {
      lastHostComponent = stateNode;

      if (reactEventName !== null) {
        const listener = getListener(instance, reactEventName);

        if (listener !== null) {
          listeners.push({
            instance,
            listener,
            currentTarget: stateNode,
          });
        }
      }
    }
    // 如果只是為了 target 累積事件，那麼我們就不會繼續通過 React Fiber 樹傳播以查找其他的 listeners
    // 比如是 scroll 就不需要在往上傳播
    if (accumulateTargetOnly) {
      break;
    }
    instance = instance.return;
  }
  return listeners;
}
