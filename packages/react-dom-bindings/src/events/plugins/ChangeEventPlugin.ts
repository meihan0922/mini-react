import { registerTwoPhaseEvent } from "../EventRegistry";
import { Fiber } from "@mono/react-reconciler/src/ReactInternalTypes";
import { DOMEventName } from "../DOMEventNames";
import {
  registrySimpleEvents,
  topLevelEventsToReactNames,
} from "../DOMEventProperties";
import {
  accumulateSinglePhaseListeners,
  accumulateTwoPhaseListeners,
  type AnyNativeEvent,
  type DispatchQueue,
} from "../DOMPluginEventSystem";
import { EventSystemFlags, IS_CAPTURE_PHASE } from "../EventSystemFlags";
import { SyntheticEvent, SyntheticMouseEvent } from "../SyntheticEvent";
import isTextInputElement from "../isTextInputElement";

function registerEvents() {
  registerTwoPhaseEvent("onChange", [
    "change",
    "click",
    "focusin",
    "focusout",
    "input",
    "keydown",
    "keyup",
    "selectionchange",
  ]);
}
// 給 dispatchQueue 添加事件
function extractEvents(
  dispatchQueue: DispatchQueue,
  domEventName: DOMEventName,
  targetInst: null | Fiber,
  nativeEvent: AnyNativeEvent,
  nativeEventTarget: null | EventTarget,
  eventSystemFlags: EventSystemFlags,
  targetContainer: EventTarget
): void {
  // TODO: 這邊只處理文本類型，其他先不考慮

  const targetNode = targetInst?.stateNode || null;
  if (isTextInputElement(targetNode)) {
    // 因為沒實現blur，會再觸發
    const inst = getInstIfValueChanged(targetInst as Fiber, targetNode);
    if (!inst) return;
    if (domEventName === "input" || domEventName === "change") {
      const listeners = accumulateTwoPhaseListeners(targetInst, "onChange");
      if (listeners.length > 0) {
        const event = new SyntheticEvent(
          "onChange",
          "change",
          null,
          nativeEvent,
          nativeEventTarget
        );

        dispatchQueue.push({ event, listeners });
      }
    }
  }
}

// 源碼當中 實現的複雜很多會再返回 targetInst 再判斷
function getInstIfValueChanged(
  targetInst: null | Fiber,
  targetNode: HTMLInputElement
): boolean {
  const oldValue = targetInst?.pendingProps.value;
  const newValue = targetNode.value;
  return oldValue !== newValue;
}

export { registerEvents, extractEvents };
