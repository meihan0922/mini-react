import { createRoot } from "./react/packages/react-dom/client";
import App from "./App";

const root = createRoot(document.getElementById("root"));

root.render(<App />);
