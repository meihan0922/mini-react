# react 面試寶典

## Hooks 篇

### Hooks 解決了什麼問題？

hooks 是 v16.8 引入的，以前只是單純的靜態組件。
class 組件主要有以下缺點

1. class 組件沒有辦法將重複的邏輯附加到組件上的方法，只能用 render props 或是要用高階組件(HOC)解決，容易形成嵌套地獄，或是 props 覆蓋，或是不容易找到錯誤來源
2. class 組件內部生命週期限制，導致邏輯分散，難以復用
3. class 組件一定要繼承 react 內部的類，不好壓縮，熱加載不穩定
4. class 組件的 this 讓人難以理解

Hooks 解決以上問題，最重要的是可以“復用狀態邏輯”（本題的重點 keyword)。

### 自定義 hooks 是什麼？

以 use 開頭 + 大寫首字母的命名定義。
將邏輯封裝成一個 hook，內容包含 react 原有的 hooks api。可以重複使用。
[可以練習的阿里做的自定義 hooks 套件 - ahooks](https://ahooks.js.org/hooks/use-request/index)

### 為什麼 hook 出現之後，函式組件就可以定義 state，是保存在哪裡？

hook 出現之前，內部無法定義 state ，主要在於每次重新更新，沒有地方可以保留狀態。
hook 出現之後，每個 hook 都有對應的 hook 對象，以鏈表的結構，放在 fiber 上，而 fiber 是 react 的虛擬 DOM ，存在在內存之中。
hook 數據內紀錄當前的 state、reducer，在每次渲染組件時，可以使用計算最新的狀態值。

### useState 和 useReducer 的區別？

都是在處理內部狀態的。基本上 在更新時， `useState` 的 `updateState` ，也是執行 `reducer` 的函式，走同個邏輯。如果狀態值遇到複雜的修改邏輯，需要抽離或是復用邏輯，就可以選 `useReducer。`

```tsx
const [state, setState] = useState(initialState);
const [state, dispatch] = useState(reducer, initialArg, init);
```

區別是:

1.  `useReducer` 必須要自定義 `reducer` (`state` 的修改邏輯執行的函式)`，useState` 是使用內建的。

    ```ts
    // const [state, dispatch] = useState({ count: 0 }); 基本等價於
    const [state, dispatch] = useReducer(
      function basicStateReducer(state, action) {
        return typeof action === "function" ? action(state) : action;
      },
      { count: 0 }
    );
    ```

2.  在使用 `useState` 時，如果狀態不變，則會提早 bailout。
    但 `useReducer` 不管狀態是否一樣，都會重新渲染！

        ```tsx
        function reducer(state, action) {
          switch (action.type) {
            case "increment":
              // return state + 1;
              return state; // 返回相同引用
            default:
              return state;
          }
        }

        export default function App() {
          const [first, setFirst] = useState(0);
          // dispatch 還是會觸發渲染
          const [count, dispatch] = useReducer(reducer, 0);
          console.log("render");

          return (
            <div>
              <button onClick={() => setFirst(0)}>{first}</button>
              <button onClick={() => dispatch({ type: "increment" })}>
                {count}
              </button>
            </div>
          );
        }
        ```

    這是為什麼呢！？要提到源碼對 `setState` 的優化
    `useState` 在 `setState` 不變的值時流程時這樣：

    ```rust
        用戶事件 (例如 onClick)
        |
        回調 dispatchSetState
        |
        判斷狀態更新一樣，調度一個不會觸發重新渲染的更新
        enqueueConcurrentHookUpdateAndEagerlyBailout
        |
        finishQueueingConcurrentUpdates 完成任務
    ```

    但在 `useReducer` 時，流程是長這樣：

    ```rust
        用戶事件 (例如 onClick)
        |
        執行回調 -> 呼叫 useReducer 的狀態更新函數 -> 觸發 dispatchReducerAction
        |
        創建 update
        |
        scheduleUpdateOnFiber ：通知 React 有新的更新需要處理。
        |
        finishQueueingConcurrentUpdates：將 update 從臨時內存隊列轉移到 fiber 的 queue.pending，並掛載到對應的 fiber 上。
        |
        進入 render 階段，執行組件函式和 updateReducerImpl
        |
        判斷狀態更新是否一樣，不一樣則標記更新
        |
        finishQueueingConcurrentUpdates 完成任務
        |
        commit

    ```

### useRef 和 useState 的區別？

`useRef` 並不會觸發更新，它是用來儲存永久保留的值，或是保存 DOM 節點，在組件卸載前都是指向同個對象。這個值紀錄在 `hook.memoizedState` 上。
`useState` 觸發後，會調用 schdeuleUpdateOnFiber，創建更新任務掛載到 fiber 身上，依照優先級調度更新。這個值也是紀錄在 `hook.memoizedState` 上。

### useLayout 和 useEffect 的區別？useLayout 和 useEffect 中的延遲和同步是什麼意思？（關於任務調度）

- 執行時機：
  - useLayout:
    在 Layout 階段同步執行 clearup 和 setup，此時已經可以操作 更新後的 DOM 節點了。
  - useEffect:
    在 Commit 階段結束後執行，異步執行。
- 特性：
  - useLayout:
    同步執行，因為跟渲染是在同個調度任務內，會阻塞渲染，可同步操作 DOM。
  - useEffect:
    異步，在 commit 階段剛開始就已經申請好任務調度，會在在下一個空閑時執行任務，在瀏覽器繪製後執行。不會阻塞到瀏覽器渲染。
- 使用場景：
  - useLayout:
    計算佈局、測量尺寸、同步樣式等。
  - useEffect:
    訂閱、網路請求、日誌紀錄等。

### 為什麼不能在條件或循環或嵌套中調用 hook?

因為 hooks 在組件初始渲染時，就會建立 hooks 鏈表，掛載在 fiber.memoizedState 上，透過後續的更新，來找到執行改變的對象。
鏈表本身是沒有 key 也沒有名字，能夠記錄他們的唯一性的只剩下順序，而在執行過程中，也會判定是否要復用原先的 hook，所以不能夠改變順序。嵌套則是因為無法保證他執行的時機。

### useState 和 useReducer 的原理？

- 初始創建時
  - 在 fiber 上建立 hooks 鏈表，在 `hook.memoizedState` 上紀錄當前狀態。
  - 初始化更新隊列，定義 dispatch 事件，存儲到 `hook.queue` 中。(`useState` 的 `dispatch` 有經過優化，如果狀態沒有變動，bailout，不會發起調度更新; `useReducer` 則是不管狀態是否改變，都會發起調度更新)
  - 返回 `[hook.memoizedState, dispatch]`。
- 用戶觸發更新時
  - 把 update 儲存在內存當中，後續批量更新到 fiber 的 `hook.pending` 上，發起調度 scheduleUpdateOnFiber。
  - 檢查是否有上次尚未處理的更新任務，拼接再一起，變成單向循環鏈表。
  - 循環處理計算新的狀態。
  - 返回 `[hook.memoizedState, dispatch]`。

### useImperativeHandle 的使用場景？

把一個變量當作 ref 暴露出來，v19 之前經常搭配 `forwardRef` 一起使用（因為普通的函式組件是沒辦法直接處理 ref 的）。（v19 之後廢棄 `forwardRef` 了）

```ts
import { useRef, useImperativeHandle } from "react";

function MyInput({ ref }) {
  const inputRef = useRef(null);

  useImperativeHandle(
    ref, // 把第二個參數的執行內容，賦予給此 ref
    () => {
      return {
        focus() {
          inputRef.current.focus();
        },
        scrollIntoView() {
          inputRef.current.scrollIntoView();
        },
      };
    },
    []
  );

  return <input ref={inputRef} />;
}
```

### 類組件的 componentDidMount 和 useLayout 和 useEffect 的對比？

`componentDidMount` 其實和 useLayout 比較相似，不但執行時間差不多，而且都是同步執行。
useEffect 是延遲執行。

// TODO: 待舉例。

## 狀態管理篇

### 如何理解 react 中的 state 和 props?

### 如何修改組件屬性 props?

### 函式組件中如何使用狀態

#### 內部

#### 外部

### 描述 redux 工作原理

### 描述 redux toolkit

### 描述 redux、mobX、recoil 解決什麼問題？

#### 設計原理

#### 優勢

#### 差異

### 比較函式組件和類組件的狀態

#### 什麼時候使用類組件比較好

錯誤邊界和生命週期

## 路由篇

### 簡述前端路由和解決了什麼問題

### 前端路由如何切換頁面

### Router 中 history, hash 路由差異

### react-router6 實現原理

## react 18 特性篇

### 正式支持的併發模式

### 為什麼要這樣修改？ react-dom/client 中的 createRoot 取代之前的 ReactDOM.render?

### 自動批量處理 Automatic Batching/ setState 是同步還異步

### Suspense

### 如何實現錯誤邊界

### SuspenseList

### transition

### 18 新的 API

#### startTransition

#### useTransition

#### useDeferredValue

#### useId

#### useSyncExternalStore

#### useInsertionEffect

## react19 新特性

### 19 新的 API
