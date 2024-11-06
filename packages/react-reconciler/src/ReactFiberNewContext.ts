import { ReactContext } from "@mono/shared/ReactTypes";
import { createCursor, pop, push, StackCursor } from "./ReactFiberStack";

// 紀錄用 紀錄棧尾元素
const valueCursor: StackCursor<any> = createCursor(null);

// 使用前，在 beginWork 要加入
export function pushProvider<T>(context: ReactContext<T>, nextValue: T): void {
  // 推入棧堆，把紀錄指針指到新值
  push(valueCursor, context._currentValue);
  // 把 context 上的值更新
  context._currentValue = nextValue;
}

// 使用後，在 completeWork 要刪除
export function popProvider<T>(context: ReactContext<T>): void {
  // 紀錄下當前的值到 context 上，但此 context 已經彈出 stack
  const currentValue = valueCursor.current;
  pop(valueCursor);
  // 後續其他相同 context 在讀取時
  context._currentValue = currentValue;
}

// 後代組件消費
export function readProvider<T>(context: ReactContext<T>) {
  return context._currentValue;
}
