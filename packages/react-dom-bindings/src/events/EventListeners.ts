export function addEventBubbleListener(
  target: EventTarget,
  eventType: string,
  listener: Function
) {
  target.addEventListener(eventType, listener as any, false);
  return listener;
}

export function addEventCaptureListener(
  target: EventTarget,
  eventType: string,
  listener: Function
) {
  target.addEventListener(eventType, listener as any, true);
  return listener;
}

export function removeEventCaptureListener(
  target: EventTarget,
  eventType: string,
  listener: Function,
  capture: boolean
) {
  target.removeEventListener(eventType, listener as any, capture);
}
