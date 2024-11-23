import React from "react";
import { useState } from "react";
import * as ReactDOM from "react-dom/client";

function Count({ initCount }: { initCount: number }) {
  const [c, setC] = useState(initCount);
  return (
    <div>
      {c}
      <button onClick={() => setC((prev: number) => prev++)}>add</button>
    </div>
  );
}

function App() {
  return (
    <div>
      <Count initCount={1} />
      <Count initCount={12} />
    </div>
  );
}

export default App;
