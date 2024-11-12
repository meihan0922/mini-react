import { Fiber } from "@mono/react-reconciler/src/ReactInternalTypes";
import { getFiberCurrentPropsFromNode } from "../client/ReactDOMComponentTree";

function isInteractive(tag) {
  return (
    tag === "button" ||
    tag === "input" ||
    tag === "select" ||
    tag === "textarea"
  );
}

function shouldPreventMouseEvent(
  name: string,
  type: string,
  props: any
): boolean {
  switch (name) {
    case "onClick":
    case "onClickCapture":
    case "onDoubleClick":
    case "onDoubleClickCapture":
    case "onMouseDown":
    case "onMouseDownCapture":
    case "onMouseMove":
    case "onMouseMoveCapture":
    case "onMouseUp":
    case "onMouseUpCapture":
    case "onMouseEnter":
      return !!(props.disabled && isInteractive(type));
    default:
      return false;
  }
}

export default function getListener(
  inst: Fiber,
  registrationName: string
): Function | null {
  const stateNode = inst.stateNode;
  if (stateNode === null) return null;

  const props = getFiberCurrentPropsFromNode(stateNode);
  if (props === null) return null;

  const listener = props[registrationName];
  if (shouldPreventMouseEvent(registrationName, inst.type, props)) {
    return null;
  }
  if (listener && typeof listener !== "function") {
    throw new Error(
      `expected ${registrationName} listener to be a function, instead got a value of ${typeof listener}`
    );
  }

  return listener;
}
