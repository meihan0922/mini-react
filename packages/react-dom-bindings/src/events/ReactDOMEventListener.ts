import { DOMEventName } from "./DOMEventNames";
import { EventSystemFlags, IS_CAPTURE_PHASE } from "./EventSystemFlags";
import {
  AnyNativeEvent,
  DispatchListener,
  DispatchQueue,
  extractEvents,
} from "./DOMPluginEventSystem";
import {
  getCurrentPriorityLevel,
  getCurrentPriorityLevel as getCurrentSchedulerPriorityLevel,
  IdlePriority as IdleSchedulerPriority,
  ImmediatePriority as ImmediateSchedulerPriority,
  LowPriority as LowSchedulerPriority,
  NormalPriority as NormalSchedulerPriority,
  UserBlockingPriority as UserBlockingSchedulerPriority,
} from "@mono/scheduler";
import {
  DiscreteEventPriority,
  ContinuousEventPriority,
  DefaultEventPriority,
  IdleEventPriority,
  getCurrentUpdatePriority,
  setCurrentUpdatePriority,
} from "@mono/react-reconciler/src/ReactEventPriorities";
import { getClosestInstanceFromNode } from "../client/ReactDOMComponentTree";
import { invokeGuardedCallbackAndCatchFirstError } from "@mono/shared/invokeGuardedCallbackAndCatchFirstError";
import { ReactSyntheticEvent } from "./ReactSyntheticEventType";
import { Fiber } from "@mono/react-reconciler/src/ReactInternalTypes";

export function createEventListenerWrapperWithPriority(
  target: EventTarget,
  domEventName: DOMEventName,
  eventSystemFlags: EventSystemFlags
) {
  // 根據事件的名稱 獲取優先級
  // 比如 click, input, drop 對應的優先級是 DiscreteEventPriority
  // drag, scroll 對應的是 ContinuousEventPriority
  // message 也許處於 scheduler 當中，根據 getCurrentSchedulerPriorityLevel 獲取優先級
  // 其他事 DefaultEventPriority
  const eventPriority = getEventPriority(domEventName);

  let listenerWrapper;
  switch (eventPriority) {
    case DiscreteEventPriority:
      listenerWrapper = dipatchDiscreteEvent;
      break;
    case ContinuousEventPriority:
      listenerWrapper = dipatchContinuousEvent;
      break;
    case DefaultEventPriority:
    default:
      listenerWrapper = dispatchEvent;
  }
  return listenerWrapper.bind(null, domEventName, eventSystemFlags, target);
}

function dipatchDiscreteEvent(
  domEventName: DOMEventName,
  eventSystemFlags: EventSystemFlags,
  target: EventTarget,
  nativeEvent: AnyNativeEvent
) {
  // 讀取當前事件的優先等級
  const previousPriority = getCurrentUpdatePriority();
  try {
    // 設置為新的優先級 - DiscreteEventPriority
    setCurrentUpdatePriority(DiscreteEventPriority);
    // 調用 dispatchEvent，執行事件
    dispatchEvent(domEventName, eventSystemFlags, target, nativeEvent);
  } finally {
    // 恢復之前的優先級
    setCurrentUpdatePriority(previousPriority);
  }
}

function dipatchContinuousEvent(
  domEventName: DOMEventName,
  eventSystemFlags: EventSystemFlags,
  target: EventTarget,
  nativeEvent: AnyNativeEvent
) {
  const previousPriority = getCurrentUpdatePriority();
  try {
    // 設置為新的優先級 - DiscreteEventPriority
    setCurrentUpdatePriority(ContinuousEventPriority);
    // 調用 dispatchEvent，執行事件
    dispatchEvent(domEventName, eventSystemFlags, target, nativeEvent);
  } finally {
    // 恢復之前的優先級
    setCurrentUpdatePriority(previousPriority);
  }
}

function dispatchEvent(
  domEventName: DOMEventName,
  eventSystemFlags: EventSystemFlags,
  target: EventTarget,
  nativeEvent: AnyNativeEvent
) {
  // 事件觸發的DOM本身
  const nativeEventTarget = nativeEvent.target as Node;

  // 拿到對應的 fiber，要怎麼拿呢？
  const return_targetInst = getClosestInstanceFromNode(nativeEventTarget);

  const dispatchQueue: DispatchQueue = [];

  // 給 dispatchQueue 添加事件
  extractEvents(
    dispatchQueue,
    domEventName,
    return_targetInst,
    nativeEvent,
    nativeEventTarget,
    eventSystemFlags,
    target
  );

  processDispatchQueue(dispatchQueue, eventSystemFlags);
}

export function processDispatchQueue(
  dispatchQueue: DispatchQueue,
  eventSystemFlags: EventSystemFlags
) {
  // 是捕獲階段嗎
  const inCapturePhase = (eventSystemFlags & IS_CAPTURE_PHASE) !== 0;
  for (let i = 0; i < dispatchQueue.length; i++) {
    const { event, listeners } = dispatchQueue[i];
    processDispatchQueueItemsInOrder(event, listeners, inCapturePhase);
  }
}

function processDispatchQueueItemsInOrder(
  event: ReactSyntheticEvent,
  dispatchListeners: Array<DispatchListener>,
  inCapturePhase: boolean
) {
  let preInstance: Fiber | null = null;
  if (inCapturePhase) {
    // 捕獲階段，由上往下執行
    for (let i = dispatchListeners.length - 1; i >= 0; i--) {
      const { instance, listener, currentTarget } = dispatchListeners[i];
      // 如果禁止冒泡傳播的話，要阻止
      if (preInstance !== instance && event.isPropagationStopped()) {
        return;
      }
      executeDispatch(event, listener, currentTarget);
      preInstance = instance;
    }
  } else {
    // 冒泡階段，由下往上執行
    for (let i = 0; i < dispatchListeners.length; i++) {
      const { instance, listener, currentTarget } = dispatchListeners[i];
      // 如果禁止冒泡傳播的話，要阻止
      if (preInstance !== instance && event.isPropagationStopped()) {
        return;
      }
      executeDispatch(event, listener, currentTarget);
      preInstance = instance;
    }
  }
}

function executeDispatch(
  event: ReactSyntheticEvent,
  listener: Function,
  currentTarget: EventTarget
) {
  const type = event.type || "unknown-event";
  invokeGuardedCallbackAndCatchFirstError(type, listener, undefined, event);
}

// 不同事件對應不同的優先級
export function getEventPriority(domEventName: DOMEventName) {
  switch (domEventName) {
    // Used by SimpleEventPlugin:
    case "cancel":
    case "click":
    case "close":
    case "contextmenu":
    case "copy":
    case "cut":
    case "auxclick":
    case "dblclick":
    case "dragend":
    case "dragstart":
    case "drop":
    case "focusin":
    case "focusout":
    case "input":
    case "invalid":
    case "keydown":
    case "keypress":
    case "keyup":
    case "mousedown":
    case "mouseup":
    case "paste":
    case "pause":
    case "play":
    case "pointercancel":
    case "pointerdown":
    case "pointerup":
    case "ratechange":
    case "reset":
    case "resize":
    case "seeked":
    case "submit":
    case "touchcancel":
    case "touchend":
    case "touchstart":
    case "volumechange":
    // Used by polyfills: (fall through)
    case "change":
    case "selectionchange":
    case "textInput":
    case "compositionstart":
    case "compositionend":
    case "compositionupdate":
    // Only enableCreateEventHandleAPI: (fall through)
    case "beforeblur":
    case "afterblur":
    // Not used by React but could be by user code: (fall through)
    case "beforeinput":
    case "blur":
    case "fullscreenchange":
    case "focus":
    case "hashchange":
    case "popstate":
    case "select":
    case "selectstart":
      return DiscreteEventPriority;
    case "drag":
    case "dragenter":
    case "dragexit":
    case "dragleave":
    case "dragover":
    case "mousemove":
    case "mouseout":
    case "mouseover":
    case "pointermove":
    case "pointerout":
    case "pointerover":
    case "scroll":
    case "toggle":
    case "touchmove":
    case "wheel":
    // Not used by React but could be by user code: (fall through)
    case "mouseenter":
    case "mouseleave":
    case "pointerenter":
    case "pointerleave":
      return ContinuousEventPriority;
    case "message": {
      // 可能在調度器回調中，最終，這種機制將被替換為檢查本機調度器上的當前優先級
      // We might be in the Scheduler callback.
      // Eventually this mechanism will be replaced by a check
      // of the current priority on the native scheduler.
      const schedulerPriority = getCurrentSchedulerPriorityLevel();
      switch (schedulerPriority) {
        case ImmediateSchedulerPriority:
          return DiscreteEventPriority;
        case UserBlockingSchedulerPriority:
          return ContinuousEventPriority;
        case NormalSchedulerPriority:
        case LowSchedulerPriority:
          // TODO: Handle LowSchedulerPriority, somehow. Maybe the same lane as hydration.
          return DefaultEventPriority;
        case IdleSchedulerPriority:
          return IdleEventPriority;
        default:
          return DefaultEventPriority;
      }
    }
    default:
      return DefaultEventPriority;
  }
}
