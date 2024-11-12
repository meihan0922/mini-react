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
  createContext,
  useContext,
} from "@mono/react";
import { Component, Context, memo, ReactNode } from "react";

// 1. 創建 context
const CountContext = createContext(0);
const ColorContext = createContext("red");

const Child = () => {
  // 3-2. 後代組件消費 value
  const count = useContext(CountContext);

  return (
    <div>
      <h1>{count}</h1>
      {/* 3-3. 後代組件消費 */}
      <ColorContext.Consumer>
        {(theme) => (
          <div>
            {theme}
            <CountContext.Consumer>
              {(value) => <p>{value}</p>}
            </CountContext.Consumer>
          </div>
        )}
      </ColorContext.Consumer>
    </div>
  );
};
class ClassChild extends Component {
  // 3-1. 後代組件消費 value，這個名稱不能更 動，只能消費單一的來源
  static contextType = CountContext;
  render() {
    return <div>{this.context as number}</div>;
  }
}

function Comp() {
  // const [count, setCount] = useReducer((x) => x + 1, 1);
  const [text, setText] = useState("");

  return (
    // 2. 創建 Provider 組件，對後代對象組件進行傳遞 value
    <div>
      {/* <button
        onClick={(e) => {
          console.log("event---->", e);
          setCount();
        }}
      >
        add
      </button> */}
      {/*<CountContext.Provider value={count}>
        <ClassChild />
         <ColorContext.Provider value="green">
          <CountContext.Provider value={count + 1}>
            <Child />
          </CountContext.Provider>
        </ColorContext.Provider>
        <Child /> 
      </CountContext.Provider>*/}
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <p>{text}</p>
    </div>
  );
}

createRoot(document.getElementById("root")!).render((<Comp />) as any);
