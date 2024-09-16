import { describe, expect, it } from "vitest";
import { peek, pop, push, Node, Heap } from "../src/SchedulerMinHeap";

function createNode(val: number): Node {
  return { sortIndex: val, id: val };
}

describe("test min heap", () => {
  it("empty heap return null", () => {
    const tasks: Heap<Node> = [];
    expect(peek(tasks)).toBe(null);
  });

  it("heap length === 1, peek equal to createNode(1", () => {
    const tasks: Heap<Node> = [createNode(1)];
    expect(peek(tasks)).toEqual(createNode(1));
  });

  it("heap length > 1, test push and pop", () => {
    const tasks: Heap<Node> = [createNode(2)];
    push(tasks, createNode(1));
    push(tasks, createNode(3));
    expect(peek(tasks)).toEqual(createNode(1));
    push(tasks, createNode(0));
    expect(peek(tasks)).toEqual(createNode(0));
    pop(tasks);
    expect(peek(tasks)).toEqual(createNode(1));
  });
});
