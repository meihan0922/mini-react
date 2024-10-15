// import { createRoot } from "react-dom/client";
import { createRoot } from "@mono/react-dom/client";
import { Fragment, Component, useReducer } from "@mono/react";

function Comp() {
  const [count, setC] = useReducer((x) => x + 1, 0);
  const arr = count % 2 === 0 ? [0, 1, 2, 3] : [0, 2, 1, 3];
  return (
    <div>
      <button
        onClick={() => {
          setC();
        }}
      >
        {count}
      </button>
      <ul>
        {arr.map((i) => {
          return <li key={`li` + i}>{i}</li>;
        })}
      </ul>
    </div>
  );
}

createRoot(document.getElementById("root")!).render((<Comp />) as any);
