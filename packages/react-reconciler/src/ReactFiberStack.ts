export type StackCursor<T> = { current: T };

const valueStack: Array<any> = [];
let index = -1;

export function createCursor<T>(defaultValue: T): StackCursor<T> {
  return { current: defaultValue };
}

export function push<T>(cursor: StackCursor<T>, value: T): void {
  index++;
  // 紀錄上一個棧尾元素
  valueStack[index] = cursor.current;
  // cursor.current 紀錄棧尾元素
  cursor.current = value;
}

export function pop<T>(cursor: StackCursor<T>): void {
  debugger;
  if (index < 0) return;
  // cursor.current 紀錄上一個棧尾元素
  cursor.current = valueStack[index];
  // 上一個棧尾元素 = null
  valueStack[index] = null;
  index--;
}