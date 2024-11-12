import { Fiber } from "@mono/react-reconciler/src/ReactInternalTypes";

const randomKey = Math.random().toString(36).slice(2);
const internaleInstanceKey = "__reactFiber$" + randomKey;
const internalePropseKey = "__reactPropsr$" + randomKey;

export function precacheFiberNode(hostInst: Fiber, node: Element | Text): void {
  node[internaleInstanceKey] = hostInst;
}

export function getClosestInstanceFromNode(targetNode: Node): null | Fiber {
  let targetInst = targetNode[internaleInstanceKey];
  if (targetInst) {
    return targetInst as Fiber;
  }
  return null;
}

export function getFiberCurrentPropsFromNode(node: Element | Text) {
  return node[internalePropseKey] || null;
}

export function updateFiberProps(node: Element | Text, props: any): void {
  node[internalePropseKey] = props;
}
