// import { createRoot } from "react-dom/client";
import { createRoot } from "@mono/react-dom/client";
import { Fragment, Component, useReducer } from "@mono/react";

function Comp() {
  const [count, setC] = useReducer((x) => {
    return x + 1;
  }, 0);

  return (
    <button
      onClick={() => {
        console.log("??????click");
        setC();
      }}
    >
      {count}
    </button>
  );
}

createRoot(document.getElementById("root")!).render(
  <div>
    <Comp name="mmmmm" />
  </div>
);
