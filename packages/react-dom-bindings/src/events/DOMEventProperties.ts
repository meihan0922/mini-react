import type { DOMEventName } from "./DOMEventNames";
import { registerTwoPhaseEvent } from "./EventRegistry";

export const topLevelEventsToReactNames: Map<DOMEventName, string | null> =
  new Map();

const simpleEventPluginEvents = [
  "abort",
  "auxClick",
  "beforeToggle",
  "cancel",
  "canPlay",
  "canPlayThrough",
  "click",
  "close",
  "contextMenu",
  "copy",
  "cut",
  "drag",
  "dragEnd",
  "dragEnter",
  "dragExit",
  "dragLeave",
  "dragOver",
  "dragStart",
  "drop",
  "durationChange",
  "emptied",
  "encrypted",
  "ended",
  "error",
  "gotPointerCapture",
  "input",
  "invalid",
  "keyDown",
  "keyPress",
  "keyUp",
  "load",
  "loadedData",
  "loadedMetadata",
  "loadStart",
  "lostPointerCapture",
  "mouseDown",
  "mouseMove",
  "mouseOut",
  "mouseOver",
  "mouseUp",
  "paste",
  "pause",
  "play",
  "playing",
  "pointerCancel",
  "pointerDown",
  "pointerMove",
  "pointerOut",
  "pointerOver",
  "pointerUp",
  "progress",
  "rateChange",
  "reset",
  "resize",
  "seeked",
  "seeking",
  "stalled",
  "submit",
  "suspend",
  "timeUpdate",
  "touchCancel",
  "touchEnd",
  "touchStart",
  "volumeChange",
  "scroll",
  "scrollEnd",
  "toggle",
  "touchMove",
  "waiting",
  "wheel",
];

function registrySimpleEvent(domEventName: DOMEventName, reactName: string) {
  topLevelEventsToReactNames.set(domEventName, reactName);
  // 註冊冒泡和捕獲階段
  registerTwoPhaseEvent(reactName, [domEventName]);
}

// 註冊
export function registrySimpleEvents() {
  for (let i = 0; i < simpleEventPluginEvents.length; i++) {
    const eventName = simpleEventPluginEvents[i];
    const domEventName = eventName.toLowerCase() as DOMEventName;
    const capitalizedEvent = eventName[0].toUpperCase() + eventName.slice(1);
    registrySimpleEvent(domEventName, "on" + capitalizedEvent);
  }

  registrySimpleEvent("dblclick", "onDoubleClick");
  registrySimpleEvent("focusin", "onFocus");
  registrySimpleEvent("focusout", "obBlur");
}
