import { ReactElement } from "@mono/shared/ReactTypes";
import { REACT_ELEMENT_TYPE } from "@mono/shared/ReactSymbols";

/**
 * 使用時
 * function App() {
 *    return <h1>Hello World</h1>;
 * }
 *
 * 被 babel 調用，children 會以 第二個參數出現在後方
 * function App() {
 *     return _jsx('div', { children: 'Hello world!' });
 * }
 *
 * 最後要變成這樣的結構
 * const element = {
 *  $$typeof: REACT_ELEMENT_TYPE,
 *  type,
 *  key,
 *  ref,
 *  props,
 * };
 */

const ReactElement = function (type, key, ref, props) {
  const element: ReactElement = {
    $$typeof: REACT_ELEMENT_TYPE,
    type,
    key,
    ref,
    props,
  };
  return element;
};

export const jsx: ReactElement = (type, config, ...children) => {
  let key: string | null = null;
  let ref = null;

  const props: any = {};

  for (const prop in config) {
    const val = config[prop];
    if (prop === "key") {
      if (val !== undefined) {
        key = "" + val;
      }
      continue;
    }
    if (prop === "ref") {
      if (val !== undefined) {
        ref = val;
      }
      continue;
    }
    if (Object.hasOwn.call(config, prop)) {
      props[prop] = val;
    }

    const childrenLength = children.length;
    if (childrenLength) {
      if (childrenLength === 1) {
        props.children = children[0];
      } else {
        props.children = children;
      }
    }
  }
  return ReactElement(type, key, ref, props);
};
