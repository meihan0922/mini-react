export type Heap<T extends Node> = Array<T>;
export type Node = {
  id: number;
  sortIndex: number;
};

/**
 * ! 取堆頂
 * @param heap 堆
 * @returns 堆頂 | null
 */
export function peek<T extends Node>(heap: Heap<T>): T | null {
  return heap.length === 0 ? null : heap[0];
}

/**
 * ! 添加元素進堆
 * @param heap 堆
 * @param node
 */
export function push<T extends Node>(heap: Heap<T>, node: T): void {
  const index = heap.length;
  // 1. 放到最後
  heap.push(node);
  // 2. 調整最小堆，由下往上，上浮調整
  siftUp(heap, node, index);
}

/**
 * ! 刪除堆頂元素
 * @param heap 堆
 * @returns
 */
export function pop<T extends Node>(heap: Heap<T>): T | null {
  if (heap.length === 0) {
    return null;
  } else {
    const first = heap[0];
    const last = heap.pop()!;
    if (last !== first) {
      // 堆中有多個元素
      heap[0] = last;
      siftDown(heap, last, 0);
    }
    return first;
  }
}

/**
 * ! 比較兩者的 sortIndex，如果相等就比較 id
 * @param a Node
 * @param b Node
 * @returns number
 */
function compare(a: Node, b: Node) {
  const diff = a.sortIndex - b.sortIndex;
  return diff !== 0 ? diff : a.id - b.id;
}

/**
 * ! 調整最小堆，由下往上堆化，如果小於父節點就交換
 * @param heap 堆
 * @param node 要往上浮的節點
 * @param index 要往上浮的節點的索引
 */
function siftUp<T extends Node>(heap: Heap<T>, node: T, i: number): void {
  let index = i;

  while (index > 0) {
    // * 源碼：(index - 1) >>> 1，相當于 Math.floor((index - 1) / 2)
    // const parentIndex = Math.floor((index - 1) / 2);
    const parentIndex = (index - 1) >>> 1;
    const parent = heap[parentIndex];
    if (compare(parent, node) > 0) {
      // [heap[parentIndex], heap[index]] = [heap[index], heap[parentIndex]];
      // * 交換位置
      heap[parentIndex] = node;
      heap[index] = parent;
      index = parentIndex;
    } else {
      // The parent is smaller. Exit.
      return;
    }
  }
}
/**
 * ! 調整最小堆，提取根節點後，最末節點取代根，由上往下堆化
 * @param heap 堆
 * @param node 要往下沈的節點
 * @param i 要往下沈的節點的索引
 */
function siftDown<T extends Node>(heap: Heap<T>, node: T, i: number): void {
  // 先左右比較，和小的交換，記下新的位置
  // 直到沒有子節點為止，並且可優化，直接比最後一個非葉子節點大即可
  // const halfIndex = Math.floor((index - 1) / 2);
  const length = heap.length;
  // 這相當於除二取整數
  const halfLength = length >>> 1;
  let index = i;

  // 三者比較，，左邊再和右邊比，選小的交換
  while (index < halfLength) {
    const leftIndex = 2 * index + 1;
    const left = heap[leftIndex];
    const rightIndex = 2 * index + 2;
    const right = heap[rightIndex];

    // 左邊 < node
    if (compare(left, node) < 0) {
      // 右邊 < 左邊
      if (rightIndex < length && compare(right, left) < 0) {
        // ? 源碼是這樣寫，但其實判斷過 index < halfLength 本來就成真 rightIndex < length，應該可以省略
        // ?if (compare(right, left) < 0) {

        // [heap[rightIndex], heap[index]] = [heap[index], heap[rightIndex]];
        // * 交換位置
        heap[index] = right;
        heap[rightIndex] = node;
        index = rightIndex;
      } else {
        // 右邊 > 左邊
        // [heap[leftIndex], heap[index]] = [heap[index], heap[leftIndex]];
        // * 交換位置
        heap[index] = left;
        heap[leftIndex] = node;
        index = leftIndex;
      }
    } else if (rightIndex < length && compare(right, node) < 0) {
      // ? 源碼是這樣寫，但其實判斷過 index < halfLength 本來就成真 rightIndex < length，應該可以省略
      // ? if (compare(right, node) < 0) {

      // 右邊 < node
      heap[index] = right;
      heap[rightIndex] = node;
      index = rightIndex;
    } else {
      // 左邊右邊都 > node
      return;
    }
  }
}
