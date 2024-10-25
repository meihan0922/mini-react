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
import { memo } from "react";

const Child = memo(({ addClick }: { addClick: () => number }) => {
  console.log("child");
  return (
    <div>
      <h1>child</h1>
      <button onClick={addClick}>addClick</button>
    </div>
  );
});

function Comp() {
  const [count, setCount] = useReducer((x) => x + 1, 0);
  useEffect(() => {
    console.log("useEffect");
  }, []);

  useLayoutEffect(() => {
    console.log("useLayoutEffect");
  }, [count]);

  return (
    <div>
      <button
        onClick={() => {
          setCount();
        }}
      >
        {count}
      </button>
    </div>
  );
}

createRoot(document.getElementById("root")!).render((<Comp />) as any);
