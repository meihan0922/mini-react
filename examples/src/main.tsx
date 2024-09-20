// import { createRoot } from "react-dom/client";
import { createRoot } from "@mono/react-dom/client";

const jsx = (
  <div className="border">
    <h1 className="h1Border">react</h1>
  </div>
);
{
  {
    /* <a href="https://github.com/bubucuo/mini-react">mini react</a> */
  }
  /* <FunctionComponent name="函数组件" /> */
}
{
  /* <ClassComponent name="类组件" /> */
}
{
  /* <FragmentComponent /> */
}

createRoot(document.getElementById("root")!).render(jsx);
