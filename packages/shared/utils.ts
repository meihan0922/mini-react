export function getCurrentTime(): number {
  return performance.now();
}

export function isArray(sth: any): sth is Array<any> {
  return Array.isArray(sth);
}

export function isNum(sth: any): sth is number {
  return typeof sth === "number";
}

export function isObject(sth: any): sth is object {
  return typeof sth === "object";
}

export function isFn(sth: any): sth is Function {
  return typeof sth === "function";
}

export function isStr(sth: any): sth is string {
  return typeof sth === "string";
}
