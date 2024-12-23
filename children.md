# children

> 原文：[The mystery of React Element, children, parents and re-renders
> ](https://www.developerway.com/posts/react-elements-children-parents)

要非常小心 React 元素的不可變性（immutability），以及 元素重新創建 與 組件重新渲染 之間的關係。

## 問題一：為什麼以 {props.children} 傳入父組件就不會重新渲染了？

當 mouseMove 時，一定會讓子組件重新渲染，除非我們提取出子組件，

```tsx
const MovingComponent = () => {
  const [state, setState] = useState({ x: 100, y: 100 });

  return (
    <div
      onMouseMove={(e) => setState({ x: e.clientX - 20, y: e.clientY - 20 })}
      style={{ left: state.x, top: state.y }}
    >
      <ChildComponent />
    </div>
  );
};
```

一旦我們使用 children 以 props 的形式放入父組件，子組件就不會重新渲染了也不再被影響了，這是為什麼呢？

```tsx
const MovingComponent = ({ children }) => {
  const [state, setState] = useState({ x: 100, y: 100 });

  return (
    <div
      onMouseMove={(e) => setState({ x: e.clientX - 20, y: e.clientY - 20 })}
      style={{ left: state.x, top: state.y }}
    >
      {children}
    </div>
  );
};

const SomeOutsideComponent = () => {
  return (
    <MovingComponent>
      <ChildComponent />
    </MovingComponent>
  );
};
```

因為，子組件是由 `SomeOutsideComponent` 所創建的，對於 `MovingComponent` 來說，props 都一樣，並沒有重新創建！
都是同一個物件，所以不會重新渲染。

## 問題二：如果以 {children()} 作為子組件呼叫，又會重新渲染，是怎麼回事？

```tsx
const MovingComponent = ({ children }) => {
  const [state, setState] = useState({ x: 100, y: 100 });
  return (
    <div
      onMouseMove={(e) => setState({ x: e.clientX - 20, y: e.clientY - 20 })}
      style={{ left: state.x, top: state.y }}
    >
      // 傳一些無關乎狀態的數據下去，也會重新渲染，會重新執行！
      {children({ data: "something" })}
    </div>
  );
};

const SomeOutsideComponent = () => {
  return (
    <MovingComponent>
      // 只要父組件渲染，子組件就會跟著渲染，就算不傳任何的參數進去
      {() => <ChildComponent />}
    </MovingComponent>
  );
};
```

因為 `MovingComponent` 重新執行後，子組件也跟著重新執行，所以會重新渲染。

## 問題三：使用 useCallback 包住子組件呼叫，還是會重新渲染

```tsx
const SomeOutsideComponent = () => {
  // trigger re-renders here with state
  const [state, setState] = useState();

  // trying to prevent ChildComponent from re-rendering by memoising render function. Won't work!
  const child = useCallback(() => <ChildComponent />, []);

  return (
    <MovingComponent>
      {/* 一點作用也沒有 */}
      {child}
    </MovingComponent>
  );
};
```

useCallback 只是儲存了函式，而不是儲存執行的結果，所以在 return 時，協調是無法比對是否相同，一定要執行！
只能使用 memo 去包裹，讓子節點執行結果被緩存。

```ts
const ChildComponent = React.memo(() => {
  console.log("ChildComponent rendered");
  return <div>Child</div>;
});

const SomeOutsideComponent = () => {
  const [state, setState] = useState();

  return <MovingComponent children={<ChildComponent />} />;
};
```

或是

```ts
const Parent = () => {
  const child = useMemo(() => <Child />, []); // 緩存執行結果
  return <div>{child}</div>;
};
```

## composition：context 就可以做類似的優化

setCount 會導致整個 Parent 都重新渲染，就算 Wrapper 包裹 memo 也一樣，因為對於 Wrapper 來說，props.children 每次都不一樣。有什麼辦法可以略過 Wrapper? 只讓 Counter 做更新呢？

```tsx
export function Parent() {
  const [count, setCount] = useState(0);

  return (
    <div>
      <CounterProvider value={data}>
        <Wrapper>
          <Counter />
        </Wrapper>
      </CounterProvider>
    </div>
  );
}

export function CounterProvider({ value, children }: ICounterProviderProps) {
  return (
    <CounterContext.Provider value={value}>{children}</CounterContext.Provider>
  );
}
```

把 Provider 另外封裝，利用 props.children 的特性，沒改變就不會重新渲染的特性，就可以略過沒有訂閱的中間層。

```tsx
const CounterContext = createContext(undefined);

// children 一直都不變，所以子節點不會重新渲染
export function CounterProvider({ defaultCount = 0, children }) {
  // 將資料放在 Provider，而不是放在使用 Provider 的元件才透過 "value" 傳進來
  // 其他的部分把 children 當成 props 傳進來
  // 如此可以確保在資料改變時，只有使用到此資料的 Consumer 元件會 re-render
  const [count, setCount] = useState(defaultCount); // 也可以使用 useReducer，都一樣

  const addCount = useCallback(() => {
    setCount((prevCount) => prevCount + 1);
  }, []);

  // 如果沒有把它 memo 起來，一旦 CounterProvider re-render，其所有的
  // consumer 都會 re-render（即使 counter 沒有改變）
  const counterContextData: ICounterContextData = useMemo(() => {
    return {
      addCount,
      count,
    };
  }, [addCount, count]);

  return (
    <CounterContext.Provider value={counterContextData}>
      {/* 這裡用到 component composition 的優化技巧 */}
      {children}
    </CounterContext.Provider>
  );
}

export function useCounter() {
  const counterContextData = useContext(CounterContext);
  return counterContextData;
}
```

Counter 又可以訂閱到 context，完成它自己的更新。

### 補充 context 優化：也可把 setter 和 getter 拆分

```tsx
import { createContext, useState, useContext } from "react";

// 分別創建兩個 Context
export const ItemsStateContext = createContext();
export const ItemsDispatchContext = createContext();

const ItemsProvider = ({ children }) => {
  const [items, setItems] = useState(() => getInitialItems());

  return (
    <ItemsStateContext.Provider value={items}>
      <ItemsDispatchContext.Provider value={setItems}>
        {children}
      </ItemsDispatchContext.Provider>
    </ItemsStateContext.Provider>
  );
};

export default ItemsProvider;

// 自定義 hooks，方便使用
export const useItems = () => {
  const context = useContext(ItemsStateContext);
  if (context === undefined) {
    throw new Error("useItems must be used within an ItemsProvider");
  }
  return context;
};

export const useSetItems = () => {
  const context = useContext(ItemsDispatchContext);
  if (context === undefined) {
    throw new Error("useSetItems must be used within an ItemsProvider");
  }
  return context;
};
```

## 小補充

這兩種方式有什麼區別嗎？

A.

```tsx
<ButtonWithIconComponent Icon={AccessAlarmIconGoogle}>
  button here
</ButtonWithIconComponent>
```

B.

```tsx
<ButtonWithIconElement icon={<AccessAlarmIconGoogle />}>
  button here
</ButtonWithIconElement>
```

A.

1. 性能較好，因為父組件渲染時，對於子組件來說 props 引用是一樣的
2. 靈活度高，可以針對所有的 icon 統一顏色和調整大小，但同時和 ButtonWithIconElement 耦合度高
3. 可以使用 lazyload 來處理延遲渲染

缺點是：只能接受一個組件類型，無法處理嵌套結構。無法自定義他的渲染方式，寫死了

B.

1. 自由傳入不同的組件，可自定義 props
2. 即時渲染，沒有額外的渲染過程，流程簡單
3. 不依賴內部邏輯

缺點是：父組件重新渲染時，都會跟著重新創建; 當多個地方使用時，會導致代碼重複。
