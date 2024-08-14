import { describe, expect, it } from "vitest";
import { peek, pop, push, Node, Heap } from "../src/SchedulerMinHeap";

let idCount = 0;
function createNode(val: number): Node {
  return { sortIndex: val, id: idCount++ };
}

describe("test min heap", () => {
  it("empty heap return null", () => {
    const tasks: Heap<Node> = [];
    expect(peek(tasks)).toBe(null);
  });

  it("heap length === 1, peek equal to createNode(1", () => {
    const node = createNode(1);
    const tasks: Heap<Node> = [node];
    expect(peek(tasks)).toEqual(node);
  });

  it("heap length > 1, test push and pop", () => {
    const node1 = createNode(1);
    const node0 = createNode(0);
    const tasks: Heap<Node> = [createNode(2)];
    push(tasks, node1);
    push(tasks, createNode(3));
    expect(peek(tasks)).toEqual(node1);
    push(tasks, node0);
    expect(peek(tasks)).toEqual(node0);
    pop(tasks);
    expect(peek(tasks)).toEqual(node1);
  });
});
