import { DOMEventName } from "./DOMEventNames";

export const allNativeEvents: Set<DOMEventName> = new Set();
export const registrationNameDependencies: {
  [registrationName: string]: Array<DOMEventName>;
} = {};

// 事件註冊
export function registerTwoPhaseEvent(
  registrationName: string, // reactName onClick
  dependencies: Array<DOMEventName> // click
) {
  registerDirectEvent(registrationName, dependencies);
  registerDirectEvent(registrationName + "Capture", dependencies);
}

export function registerDirectEvent(
  registrationName: string,
  dependencies: Array<DOMEventName>
) {
  registrationNameDependencies[registrationName] = dependencies;
  for (let i = 0; i < dependencies.length; i++) {
    allNativeEvents.add(dependencies[i]);
  }
}
