// import { createRoot } from "react-dom/client";
import { createRoot } from "@mono/react-dom/client";
import {
  useReducer,
  useState,
  useMemo,
  useCallback,
  useRef,
  useEffect,
  useLayoutEffect,
} from "@mono/react";
import {
  Component,
  Context,
  createContext,
  memo,
  ReactNode,
  useContext,
} from "react";

// 1. 創建 context
const CountContext = createContext(0);

const Child = () => {
  console.log("child");
  // 3-2. 後代組件消費 value
  const count = useContext(CountContext);
  return (
    <div>
      <h1>{count}</h1>
      {/* 3-3. 後代組件消費 */}
      <CountContext.Consumer>{(value) => <p>{value}</p>}</CountContext.Consumer>
    </div>
  );
};
class ClassChild extends Component {
  // 3-1. 後代組件消費 value，這個名稱不能更動，只能消費單一的來源
  static contextType = CountContext;
  render() {
    return <div>類組件{this.context as number}</div>;
  }
}

function Comp() {
  const [count, setCount] = useReducer((x) => x + 1, 0);
  useEffect(() => {
    console.log("useEffect");
  }, []);

  useLayoutEffect(() => {
    console.log("useLayoutEffect");
  }, [count]);

  return (
    // 2. 創建 Provider 組件，對後代對象組件進行傳遞 value
    <CountContext.Provider value={count}>
      <button
        onClick={() => {
          setCount();
        }}
      >
        {count}
      </button>
      <Child />
      <ClassChild />
    </CountContext.Provider>
  );
}

createRoot(document.getElementById("root")!).render((<Comp />) as any);
