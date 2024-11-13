import { getEventPriority } from "../../react-dom-bindings/src/events/ReactDOMEventListener";
import { DefaultEventPriority, EventPriority } from "./ReactEventPriorities";

export function getCurrentEventPriority(): EventPriority {
  const currentEvent = window.event;
  if (currentEvent === undefined) {
    // 初次渲染
    return DefaultEventPriority; // 32
  }
  return getEventPriority(currentEvent.type as any);
}
