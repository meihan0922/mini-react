[TOC]

# React 18

## 🌟 新特性

### 正式支持 Concurrent 併發

根據 react 官方在 react@18 的 blog 提到 Concurrent rendering，
可以知道基本上是指

- 可以在同個時間段接受並處理多個介面更新請求
- 一個介面更新請求就是一個 task，可以先暫停再會恢復執行，或是執行一半拋棄，高優先權的任務可中斷低的，介面的渲染不會阻塞介面的交互

==最主要特點是 **渲染是可中斷的** ， 主要是基於 **fiber 鏈表的結構（指針可以指向別處，加個屬性即可）、scheduler 調度系統、優先權的系統**。可中斷讓更新可以依照**優先級**渲染，或是遺棄某些渲染。== 也是大部分新特性的實現基礎，包含 Suspense、transitions、流式服務端渲染等等。

- 關於遺棄 🌰：在用戶交互的過程中，由 A -> D，中間可能會經過 B、C，像是搜尋的 input 框和下方的提示搜尋選單，渲染的優先級應是 input 大於選單，選單的提示只是過渡，高機率不會馬上切中用戶想要的搜尋內容，這中間的 B、C 相關的 UI 就可以被當作 transition。
- 關於狀態的複用：offScreen(最新文章說被改名為 Activity)，可緩存狀態，但還在研發階段。

---

### [react-dom/client 中的 createRoot 取代以前的 ReactDOM.render?](https://zh-hans.react.dev/reference/react-dom/client/createRoot#ive-created-a-root-but-nothing-is-displayed)

原先的調用方式，在第二個參數，是要生成一個節點對象的。如果之後要渲染第二個頁面，也要用到同一個根節點，就要再重新生成一次。為了複用，改成 createRoot 再 render。
ssr 中的 ReactDOM.hydrate 也改成 hydrateRoot。

```javascript
// 之前callback會在render完成後調用
// ReactDOM.render(<App/>, document.getElementById("root"), callback);
// v18改成自行在useEffect操作即可
const root = createRoot(document.getElementById("root")); // 複用
root.render(<App />);
root.render(<App1 />);
```

---

### [自動批量處理，setState 是同步還是異步？](https://zh-hans.react.dev/blog/2022/03/29/react-v18#new-feature-automatic-batching)

原先是可同步可異步，在原生事件的異步 API 中，是同步的，其他時候會搜集起來批量處理。
但批量處理依賴於合成事件，（可批次處理用戶多次觸發事件回調），在異步 API 中，已經脫離生命週期，所以直接調用渲染。
<u>v18 後，批量更新不再與合成事件掛鉤，自動批量處理。</u>

```javascript
// 以前渲染兩次，v18一次
setTimeout(() => {
  setCount((c) => c + 1);
  setFlag((f) => !f);
}, 3000);
// 如果在v18想要同步處理
setTimeout(() => {
  flushSync(() => {
    setCount((c) => c + 1);
    setFlag((f) => !f);
  });
}, 3000);
```

---

### Suspense

- 底層原理：子組件 throw Promise，react 捕獲後送給最近的 [Suspense](https://react.dev/reference/react/Suspense) 處理，狀態改變前渲染 `fallback` ，一旦改變狀態就渲染組件。
- React 只會在非緊急更新期間阻止不必要的後備方案。

#### 為什麼我們需要 Suspense？

在子组件完成＋載前顯示後備的方案

改善 react 中抓數據顯示的缺點：
目標==render-as-you-fetch：儘早開始取得數據 / 更直覺的載入狀態 / 避免競態條件 / 更加整合的錯誤處理。==

1. Fetch-on-render：只有當元件渲染的時候才開始加載數據，（在 `useEffect` 中），會瀑布式的阻塞元件渲染。

   ```jsx
   function ComponentA() {
     const [data, setData] = useState(null);

     useEffect(() => {
       // 阻塞 ComponentB
       fetchAwesomeData().then((data) => setData(data));
     }, []);

     if (user === null) {
       return <p>Loading data...</p>;
     }

     return (
       <>
         <h1>{data.title}</h1>
         <ComponentB />
       </>
     );
   }

   function ComponentB() {
     const [data, setData] = useState(null);

     useEffect(() => {
       fetchGreatData().then((data) => setData(data));
     }, []);

     return data === null ? (
       <h2>Loading data...</h2>
     ) : (
       <SomeComponent data={data} />
     );
   }
   ```

2. Fetch-then-render：在樹開始渲染之前就啟動所有請求，必須等待所有資料請求完成後才能為使用者渲染任何內容。

- 數據獲取的底層原理：子組件 throw Promise，react 捕獲後送給最近的 Suspense 處理，狀態改變前渲染 fallback，一旦改變狀態就渲染組件。
- 想要使用在數據獲取的使用前提：
  - 無法檢測 `useEffect` 的獲取數據情況
  - 支持 Suspense 的框架如 Relay 和 Next.js。
  - 使用 lazy 懶加載。
  - 使用 use 讀取 Promise 的值。（還在實驗性 api 當中，內部在判斷 promise 的狀態改變回傳不同的 value|reason 給 Suspense）

#### 搭配 transition

可以避免顯示 fallback，會將整個都標記為延遲，而顯示舊的值。
transition 並不會等待所有內容載入完成。它只會等待足夠長的時間，以避免隱藏已經顯示的內容。
嵌套的 Supsense 依然會顯示，只有第一層會被替換。

---

#### [如何實現錯誤處理邊界？](https://zh-hans.react.dev/blog/2022/03/29/react-v18#new-feature-transitions)

想要在發生錯誤的時候渲染設定的元件，但 `try...catch...` 並不管用。

- 底層原理：子組件 throw Error，react 捕獲後，渲染替代的組件。

```jsx
const Child = () => {
  useEffect(() => {
    throw new Error("拋出錯誤！");
  }, []);
  return <>This is Child!</>;
};

const Component = () => {
  try {
    return <Child />;
  } catch (e) {
    // 這邊無法捕捉到錯誤，不只是 useEffect 的錯誤！
    // 這邊也無法 setState 會造成無窮迴圈
    // 要另外設定一個 const [error, setError] = useState(false); 在 useEffect 中 setState
  }
};
```

react 還沒提供一個 hooks 組件去解決錯誤處理，必須使用舊的 class 組件內部的生命週期 `componentDidCatch`、`getDerivedStateFromError`

- `getDerivedStateFromError`: 修改 state 觸發重新渲染
- `componentDidCatch`: 拿到錯誤信息，打印日誌

```jsx
// react-error-boundary 包已經實作，不用自己寫。
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error) {
    // 更新状态，以便下一次渲染将显示后备 UI。
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    logErrorToMyService(error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      // 你可以渲染任何自定义后备 UI
      return this.props.fallback;
    }

    return this.props.children;
  }
}
```

```jsx
<ErrorBoundary fallback={<p>Something went wrong</p>}>
  <Profile />
</ErrorBoundary>
```

---

### transition

react 把 [transition](https://zh-hans.react.dev/blog/2022/03/29/react-v18#new-feature-transitions) 分兩種

- `urgent updates`: 緊急更新
- `transiotn updates`: 過渡更新 (🌰-UI 從一個畫面過渡到另一個畫面中間的過程，使用者並不在乎，他們只想要"最新"的）

#### startTransition

- 包裹在內的函式會被處理為過渡更新
- 如果有緊急更新就會打斷過渡更新，且直接拋棄未完成的渲染結果，僅渲染最新的內容

> ❌ 不應將受控組件標記為 transition

#### useTransition

```jsx
import { useTransition } from "react";

function TabContainer() {
  const [isPending, startTransition] = useTransition();
  // isPending - 是否存在待處理的 transition
  // startTransition - 包裹在內的函式會被處理為過渡更新
}
```

```jsx
console.log(1);
startTransition(() => {
  console.log(2);
  setPage("/about");
});
console.log(3);
/**
 * 答案還是 1, 2, 3，可以理解為，
 * 有一個全域變數（假設是let isInsideTransition = false;）
 * startTransition 調用後會去標記 isInsideTransition = true;
 * setState內部會去取 isInsideTransition 再去安排緩更新
 *
 * // React 运行的简易版本
 * let isInsideTransition = false;
 *
 * function startTransition(scope) {
 *   isInsideTransition = true;
 *   scope();
 *   isInsideTransition = false;
 * }
 *
 * function setState() {
 *   if (isInsideTransition) {
 *     // ……安排 Transition 状态更新……
 *   } else {
 *     // ……安排紧急状态更新……
 *   }
 * }
 *  */
```

- 使用場景：
- 🌰：
  比方 tab 切換，tab B 內容異步需要抓大量的數據，setTab 會導致 tab 卡頓無法交互，且使用者快速切換到 tab C 時，應立即拋棄 tab B 的執行

  ```jsx
  // APP.js
  export default function TabContainer() {
    const [tab, setTab] = useState("A");
    return (
      <>
        <TabButton isActive={tab === "A"} onClick={() => setTab("A")}>
          About
        </TabButton>
        <TabButton isActive={tab === "B"} onClick={() => setTab("B")}>
          B (slow)
        </TabButton>
        <TabButton isActive={tab === "C"} onClick={() => setTab("C")}>
          Contact
        </TabButton>
        <hr />
        {tab === "A" && <A />}
        {tab === "B" && <B />}
        {tab === "C" && <C />}
      </>
    );
  }
  ```

  ```jsx
  // TabButton.js
  export default function TabButton({ children, isActive, onClick }) {
    const [isPending, startTransition] = useTransition();
    if (isActive) {
      return <b>{children}</b>;
    }
    if (isPending) {
      // 這裏可以檢測是否在緩更新
      return <b className="pending">{children}</b>;
    }
    return (
      <button
        onClick={() => {
          startTransition(() => {
            onClick();
          });
        }}
      >
        {children}
      </button>
    );
  }
  ```

#### react 不會將 await 之後的狀態更新視為 Transition

```ts
startTransition(async () => {
  await someAsyncFunction();
  // ✅ 在 startTransition **之后** 再 await
  startTransition(() => {
    setPage("/about");
  });
});
```

這是因為 如果是一起處理，react 會丟失 async 上下文的紀錄。
`startTransition` 不會延遲處理 api ，延遲處理的地方是回傳的結果。
與瀏覽器的 setTimeout 不同，它不會延遲執行回呼。 React 會立即執行你的函數，但在它運行的同時安排的任何狀態更新都被標記為 transition。

```ts
// 他是同步的執行。 1 2 3
console.log(1);
startTransition(() => {
  console.log(2);
  setPage("/about");
});
console.log(3);
```

```ts
// React 运行的简易版本

let isInsideTransition = false;

function startTransition(scope) {
  isInsideTransition = true;
  scope();
  isInsideTransition = false;
}

function setState() {
  if (isInsideTransition) {
    // ……安排 Transition 状态更新……
  } else {
    // ……安排紧急状态更新……
  }
}
```

🌟 react 沒辦法控制 api 執行的順序，所以要是使用者多次觸發，並且沒有按照順序回傳結果，那 react 延遲執行的結果也就不能肯定。
必須改用 v19 的 `useActionStateand` 或是 `<form> actions`！

##### ❌ 不應將異步的 api 包進 transition

這也是因為 react 無法控制 setPage 延遲，已經丟失了上下文的環境了！

```ts
startTransition(() => {
  // ❌ 在调用 startTransition 后更新状态
  setTimeout(() => {
    setPage("/about");
  }, 1000);
});
setTimeout(() => {
  startTransition(() => {
    // ✅ 在调用 startTransition 中更新状态
    setPage("/about");
  });
}, 1000);
```

### useDeferredValue

[官網](https://zh-hans.react.dev/reference/react/useDeferredValue)

在接收到不同值的時候，會在背後建立起一個渲染任務，而且是可中斷的。
如果值的持續觸發更新的速度大於接收延遲值的 UI 重新渲染速度還要快，就會一直延後遺棄任務。
與 Suspense 組合使用，使用者不會看到 fallback，會看到舊的延遲的值，值到載入完成。
只有在真的要渲染到 ui 上時，才會觸發相關的 effect。

```ts
useDeferredValue(value:any, initialValue?:any)
```

- `value`: 原始值（如字串和數字）或是在渲染之外建立的物件。不然會在每次渲染時都創建新對象，導致不必要的渲染成本。
- `initialValue`: 元件初始渲染時使用的值。如果省略此選項， `useDeferredValue` 在初始渲染期間不會延遲，因為沒有先前的版本可以渲染。

- 使用場景：
  - 新內容＋載期間顯示就內容
  - 表示內容已過時
  - 延遲渲染某些部分

#### 和防抖節流有什麼不同？

防手震是指在使用者停止輸入一段時間（例如一秒鐘）之後再更新清單。
節流是指每隔一段時間（例如最多每秒一次）更新清單。

- 不需要選擇固定的延遲時間，和用戶本身的設備性能相關
- useDeferredValue {延遲重新渲染}是可中斷的、可放棄渲染。但防抖節流只是將事件觸發時延遲函數的執行，可能渲染時仍然會阻塞。
- 如果你要優化的工作不是在渲染期間發生的，那麼防手震和節流仍然非常有用。例如，它們可以讓你減少網路請求的次數。
- 🌰 將 cpu 性能降為 4 倍慢，可看到延遲列表渲染 [CodeSandBox](https://codesandbox.io/p/sandbox/react-18-transition-test-2dvytz?layout=%257B%2522sidebarPanel%2522%253A%2522EXPLORER%2522%252C%2522rootPanelGroup%2522%253A%257B%2522direction%2522%253A%2522horizontal%2522%252C%2522contentType%2522%253A%2522UNKNOWN%2522%252C%2522type%2522%253A%2522PANEL_GROUP%2522%252C%2522id%2522%253A%2522ROOT_LAYOUT%2522%252C%2522panels%2522%253A%255B%257B%2522type%2522%253A%2522PANEL_GROUP%2522%252C%2522contentType%2522%253A%2522UNKNOWN%2522%252C%2522direction%2522%253A%2522vertical%2522%252C%2522id%2522%253A%2522clynu2f3n00063b6lnlziqeno%2522%252C%2522sizes%2522%253A%255B100%252C0%255D%252C%2522panels%2522%253A%255B%257B%2522type%2522%253A%2522PANEL_GROUP%2522%252C%2522contentType%2522%253A%2522EDITOR%2522%252C%2522direction%2522%253A%2522horizontal%2522%252C%2522id%2522%253A%2522EDITOR%2522%252C%2522panels%2522%253A%255B%257B%2522type%2522%253A%2522PANEL%2522%252C%2522contentType%2522%253A%2522EDITOR%2522%252C%2522id%2522%253A%2522clynu2f3n00023b6lxpy9xey2%2522%257D%255D%257D%252C%257B%2522type%2522%253A%2522PANEL_GROUP%2522%252C%2522contentType%2522%253A%2522SHELLS%2522%252C%2522direction%2522%253A%2522horizontal%2522%252C%2522id%2522%253A%2522SHELLS%2522%252C%2522panels%2522%253A%255B%257B%2522type%2522%253A%2522PANEL%2522%252C%2522contentType%2522%253A%2522SHELLS%2522%252C%2522id%2522%253A%2522clynu2f3n00033b6l7nin3pgn%2522%257D%255D%252C%2522sizes%2522%253A%255B100%255D%257D%255D%257D%252C%257B%2522type%2522%253A%2522PANEL_GROUP%2522%252C%2522contentType%2522%253A%2522DEVTOOLS%2522%252C%2522direction%2522%253A%2522vertical%2522%252C%2522id%2522%253A%2522DEVTOOLS%2522%252C%2522panels%2522%253A%255B%257B%2522type%2522%253A%2522PANEL%2522%252C%2522contentType%2522%253A%2522DEVTOOLS%2522%252C%2522id%2522%253A%2522clynu2f3n00053b6ldlqr9pgt%2522%257D%255D%252C%2522sizes%2522%253A%255B100%255D%257D%255D%252C%2522sizes%2522%253A%255B46.9120973063947%252C53.0879026936053%255D%257D%252C%2522tabbedPanels%2522%253A%257B%2522clynu2f3n00023b6lxpy9xey2%2522%253A%257B%2522tabs%2522%253A%255B%257B%2522id%2522%253A%2522clynu2f3m00013b6lj7durrv6%2522%252C%2522mode%2522%253A%2522permanent%2522%252C%2522type%2522%253A%2522FILE%2522%252C%2522filepath%2522%253A%2522%252Fsrc%252Findex.tsx%2522%257D%255D%252C%2522id%2522%253A%2522clynu2f3n00023b6lxpy9xey2%2522%252C%2522activeTabId%2522%253A%2522clynu2f3m00013b6lj7durrv6%2522%257D%252C%2522clynu2f3n00053b6ldlqr9pgt%2522%253A%257B%2522tabs%2522%253A%255B%257B%2522id%2522%253A%2522clynu2f3n00043b6l1xp9wxvm%2522%252C%2522mode%2522%253A%2522permanent%2522%252C%2522type%2522%253A%2522UNASSIGNED_PORT%2522%252C%2522port%2522%253A0%252C%2522path%2522%253A%2522%252F%2522%257D%255D%252C%2522id%2522%253A%2522clynu2f3n00053b6ldlqr9pgt%2522%252C%2522activeTabId%2522%253A%2522clynu2f3n00043b6l1xp9wxvm%2522%257D%252C%2522clynu2f3n00033b6l7nin3pgn%2522%253A%257B%2522tabs%2522%253A%255B%255D%252C%2522id%2522%253A%2522clynu2f3n00033b6l7nin3pgn%2522%257D%257D%252C%2522showDevtools%2522%253Atrue%252C%2522showShells%2522%253Afalse%252C%2522showSidebar%2522%253Atrue%252C%2522sidebarPanelSize%2522%253A15%257D)：

  ```jsx
  const dummyProducts = Array.from(
    { length: 10000 },
    (n, idx) => `index: ${idx}`
  );

  function filterProducts(filterText: string | undefined) {
    return filterText
      ? dummyProducts.filter((p) => p.includes(filterText))
      : dummyProducts;
  }

  // memo 是為了確保 deferredText 保持舊的值，
  // 讓 List 可以跳過渲染
  const List = memo(function List({ text }: { text: string | undefined }) {
    const afterFilterProducts = filterProducts(text);
    return (
      <ul>
        {afterFilterProducts.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    );
  });

  export default function App() {
    const [isPending, startTransition] = useTransition();
    const [filterText, setFilterText] = useState<string>();
    const deferredText = useDeferredValue(filterText);

    // 如果 filterText 更新的速度 > deferredList 更新的速度!
    // 那只會在用戶停止更新 filterText 後，重新渲染 deferredList
    function onChange({
      target: { value },
    }: React.ChangeEvent<HTMLInputElement>) {
      // setFilterText(value);
      // 優先渲染 filterText，間接優化了afterFilterProducts
      startTransition(() => {
        setFilterText(value);
      });
    }

    return (
      <div className="App">
        <input type="text" onChange={onChange} />
        {isPending && <p>Updating list..</p>}
        <Suspense fallback={<h2>Loading...</h2>}>
          {/* 如果 suspense 的children 尚未加載完成，react 會放棄渲染，
              用戶會一直看到舊值，直到數據加載完成
          */}
          <List text={deferredText} />
        </Suspense>
      </div>
    );
  }

  ```

### useId

用於生成唯一的 ID

- 使用時機：
  - 比方有個帶有 id 的小元件，在複用的情況下，會導致 id 不是唯一。
  - 使用服務端渲染時，要確保客戶端和服務端的組件樹上的 id 一致。

### library hooks

開發者需要搭配某些套件使用，主要用湖深度融合 套件開發。

#### [useSyncExternalStore(subscribe, getSnapshot,getServerSnapshot?): store Snapshot](https://zh-hans.react.dev/reference/react/useSyncExternalStore)

解決的是元件如何同步地從外部儲存（第三方狀態庫中）獲取資料，並同步更新 UI。
在 zustand 當中就有用到！

```ts
// 可以把 `getSnapshot` 想成 getState。
const state = useSyncExternalStore(store.subscribe, store.getState);

// 原先要這樣寫(簡化)，有了 useSyncExternalStore 就可以省略了
const state = store.getState();
const [, forceUpdate] = useReducer((x) => x + 1, 0);
useEffect(() => {
  store.subscribe(() => {
    forceUpdate();
  });
}, []);
```

- `subscribe`: 自定義的監聽器，接收一個 callback，當 store 發生變化時，會回調這個 callback，回傳的 listener 是 react 發現值改變渲染，可以把它當作 setState。也就是 ==callback 訂閱 store 的變更，讓組件重新渲染。== 回傳清除訂閱的函式。
- `getSnapshot`: 接收一個 callback，返回組件需要的 store 的快照。用 `Object.is()` 比較，如果 store 不變，則回傳一樣的值。
  - 對應到 zustand 的 getState
- `getServerSnapshot`: 用在服務端渲染和客戶端 hydration 時用到，返回數據快照，這個快照必須在客戶端與服務端相同。

```js
const Test(){
  const width = useSyncExternalStore((listener)=>{
    // resize 就回調渲染
    window.addEventListener("resize", listener)
    return ()=> window.removeEventListener("resize", listener)
  }, ()=> window.innerWidth)

  return <p>Size: {width}</p>
}
```

自定義 store 的寫法

```js
let listeners = [];
export const todosStore = {
  addTodo() {
    todos = [...todos, { id: nextId++, text: "Todo #" + nextId }];
    emitChange();
  },
  subscribe(listener) {
    // 這邊
    listeners = [...listeners, listener];
    return () => {
      listeners = listeners.filter((l) => l !== listener);
    };
  },
  getSnapshot() {
    return todos;
  },
};

function emitChange() {
  for (let listener of listeners) {
    listener();
  }
}
```

#### useInsertionEffect - CSS-in-JS

為了 CSS-in-JS 特意打造，可以在佈局副作用觸發之前 將元素插入到 DOM 中
在 DOM 變更前同步觸發，往 DOM 中動態注入 `<style>` 或是 SVG `<defs>`。
因為執行時機，不可讀取 refs(還沒被賦予 dom)。

---

> 參考文章：
>
> [React v18.0](https://zh-hans.react.dev/blog/2022/03/29/react-v18)
>
> [React 的 Suspense 和 ErrorBoundary 还有这种关系？](https://cloud.tencent.com/developer/article/2376172)
>
> [React18 正式版源码级剖析](https://juejin.cn/post/7080854114141208612)
