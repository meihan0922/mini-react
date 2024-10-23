// import { createRoot } from "react-dom/client";
import { createRoot } from "@mono/react-dom/client";
import {
  Fragment,
  Component,
  useReducer,
  useState,
  useMemo,
} from "@mono/react";

function Comp() {
  const [count, setCount] = useReducer((x) => x + 1, 0);
  const [count1, setCount1] = useState(1);
  const arr = count % 2 === 0 ? [0, 1, 2, 3] : [0, 2, 1, 3];

  const calcVal = useMemo(() => {
    console.log("useMemo");
    let sum = 0;
    for (let i = 0; i < count1; i++) {
      sum += 1;
    }
    return sum;
  }, [count1]);

  return (
    <div>
      <button
        onClick={() => {
          setCount();
        }}
      >
        {count}
      </button>
      <ul>
        {arr.map((i) => {
          return <li key={`li` + i}>{i}</li>;
        })}
      </ul>
      <button
        onClick={() => {
          setCount1(count1 + 1);
        }}
      >
        {count1}
      </button>
      <p>{calcVal}</p>
      {count1 % 2 === 0 ? <h1>null</h1> : null}
      {count1 % 2 === 0 ? <h1>undefined</h1> : undefined}
      {count1 % 2 === 0 && <h1>boolean</h1>}
    </div>
  );
}

createRoot(document.getElementById("root")!).render((<Comp />) as any);
