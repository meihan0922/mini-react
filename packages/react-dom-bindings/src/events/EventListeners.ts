export function addEventBubbleListener(
  target: EventTarget,
  eventType: string,
  listener: Function,
  passive: boolean
) {
  target.addEventListener(eventType, listener as any, {
    passive,
    capture: false,
  });
  return listener;
}

export function addEventCaptureListener(
  target: EventTarget,
  eventType: string,
  listener: Function,
  passive: boolean
) {
  target.addEventListener(eventType, listener as any, {
    passive,
    capture: true,
  });
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
