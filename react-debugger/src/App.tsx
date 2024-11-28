import React, { Component } from "react";
import { useEffect } from "react";
import { useState } from "react";
import * as ReactDOM from "react-dom/client";

function Count({ initCount }: { initCount: number }) {
  const [c, setC] = useState(initCount);
  useEffect(() => {
    console.log("count=======");
  }, []);

  return (
    <div>
      {c}
      <button onClick={() => setC((prev: number) => prev++)}>add</button>
    </div>
  );
}

class TestFn extends Component {
  state = { count: 0 };

  render() {
    return (
      <div>
        <button
          onClick={() => {
            this.setState({ count: this.state.count + 1 });
            this.setState({ count: this.state.count + 2 });
          }}
        >
          {this.state.count}
        </button>
      </div>
    );
  }
}

function App() {
  return (
    <div>
      {/* <TestFn /> */}
      <Count initCount={1} />
      {/*<Count initCount={12} /> */}
    </div>
  );
}

export default App;
