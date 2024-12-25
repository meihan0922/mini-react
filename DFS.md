[TOC]

# 深度優先遍歷

深度優先遍歷是一種用於遍歷樹和圖的算法，針對節點以及子節點遍歷，會有搜索和回朔兩個階段，搜索直到最深的節點，開始回朔，直到所有節點完成。
常見的實現的方式有遞歸和堆棧。

```js
/**
在更新的過程當中，會做三件事：
1. 會有一個指針 `workInProgress` 指向當前正在處理的節點
2. 每個節點會有“是否處理完成”的標記。
3. 有三種指針
   1. `return`: 子節點都會有指針指向父節點
   2. `child`: 父節點的第一個子節點
   3. `sibling`: 子節點的兄弟節點
*/

  A
  |
child
  |
  B   --sibling-->  C  --sibling-->  D
  |                 |
child             child
  |                 |
  E                 F  --sibling-->  G


{
    type: 'A'
    props: {
        children: [{
            type: 'B',
            props: {
                children: [{
                    type: 'e',
                    props: {}
                }]
            }
        }, {
            type: 'C',
            props: {
                children: [{
                    type: 'F',
                    props: {}
                }, {
                    type: 'G',
                    props: {}
                }]
            }
        }, {
            type: 'D',
            props: {}
        }]
    }
}
```

開始處理:

- <font color=#F00><未完成></font>
- <font color=#0000FF><已完成></font>

1. 處理第一層節點: <font color=#F00>A</font>
   1. 標記 `workInProgress`：<font color=#F00>A</font>
2. 處理第二層節點: <font color=#F00>B C D</font>
   1. 指針指向
      1. <font color=#F00>A</font> --child--> <font color=#F00>B</font>
      2. <font color=#F00>B</font> --sibling--> <font color=#F00>C</font> --sibling--> <font color=#F00>D</font>
      3. <font color=#F00>B</font> --return--> <font color=#F00>A</font>
      4. <font color=#F00>C</font> --return--> <font color=#F00>A</font>
      5. <font color=#F00>D</font> --return--> <font color=#F00>A</font>
   2. 標記 `workInProgress`：<font color=#F00>B</font>
      1. 找他的子節點：<font color=#F00>E</font>
3. 處理第三層節點: <font color=#F00>E</font>
   1. 指針指向
      1. <font color=#F00>B</font> --child--> <font color=#F00>E</font>
      2. <font color=#F00>E</font> --return--> <font color=#F00>B</font>
   2. 標記 `workInProgress`：<font color=#F00>E</font>
      1. 找子節點：null， <font color=#0000FF>E</font>
   3. <font color=#0000FF>E</font> --return--> <font color=#F00>B</font>
4. 處理第二層節點: <font color=#F00>B C D</font>
   1. 標記 `workInProgress`：<font color=#F00>B</font>
   2. <font color=#0000FF>B</font>
   3. <font color=#0000FF>B</font> --sibling--> <font color=#F00>C</font>
   4. 標記 `workInProgress`：<font color=#F00>C</font>
      1. 找子節點： <font color=#F00>F, G</font>
5. 處理第三層節點: <font color=#F00>F, G</font>
   1. 指針指向
      1. <font color=#F00>C</font> --child--> <font color=#F00>F</font>
      2. <font color=#F00>F</font> --sibling--> <font color=#F00>G</font>
      3. <font color=#F00>F</font> --return--> <font color=#F00>C</font>
      4. <font color=#F00>G</font> --return--> <font color=#F00>C</font>
   2. 標記 `workInProgress`：<font color=#F00>F</font>
      1. 找子節點：null， <font color=#0000FF>F</font>
   3. <font color=#0000FF>F</font> --sibling--> <font color=#F00>G</font>
      1. 找子節點：null， <font color=#0000FF>G</font>
   4. <font color=#0000FF>G</font> --return--> <font color=#F00>C</font>
6. 處理第二層節點: <font color=#0000FF>B</font><font color=#F00> C D</font>
   1. 標記 `workInProgress`：<font color=#F00>C</font>
   2. <font color=#0000FF>C</font>
   3. <font color=#0000FF>C</font> --sibling--> <font color=#F00>D</font>
   4. 標記 `workInProgress`：<font color=#F00>D</font>
      1. 找子節點： null， <font color=#0000FF>D</font>
   5. <font color=#0000FF>D</font> --return--> <font color=#F00>A</font>
7. 處理第一層節點: <font color=#F00>A</font>
   1. 標記 `workInProgress`：<font color=#F00>A</font>
   2. <font color=#0000FF>A</font>
8. <font color=#0000FF>此時整棵樹已被標記完成</font>

```js
  A
  |
child
  |
  B   --sibling-->  C  --sibling-->  D
  |                 |
child             child
  |                 |
  E                 F  --sibling-->  G
```

```ts
type Node = {
  name: string;
  children: Node[];
} | null;
// 遞歸
function dfs(node: Node) {
  console.log("搜索", node.name);
  if (node.children.length > 0) {
    node.children.forEach((child) => {
      dfs(child);
    });
  }
  console.log("回朔", node.name);
}
```

```ts
type Node = {
  name: string;
  children: Node[];
  isVisited: boolean; // 初始為 false
} | null;

// 堆棧
function dfs(node: Node) {
  const stack = [];

  while ((node = stack.at(-1))) {
    if (node.isVisited) {
      console.log("回朔", node.name);
      stack.pop();
    } else {
      console.log("搜索", node.name);
      node.isVisited = true;
      for (let i = node.children.length - 1; i >= 0; i--) {
        stack.push(node.children[i]);
      }
    }
  }
}
```

## react 當中使用深度優先

React 在調和的過程中，需要比對 current fiber tree 和 workInProgress tree 就是使用深度優先遍歷

[源碼](https://github.com/facebook/react/blob/main/packages/react-reconciler/src/ReactFiberWorkLoop.js)

```js
function workLoopSync() {
  while (workInProgress !== null) {
    performUnitOfWork(workInProgress);
  }
}

function performUnitOfWork(unitOfWork: Fiber): void {
  const current = unitOfWork.alternate;
  // beginWork 是 搜尋階段，內部會創建 fiber 節點，標記節點的增刪改
  // 會回傳第一個子節點child
  let next = beginWork(current, unitOfWork, subtreeRenderLanes);
  // 如果沒有子節點的話
  if (next === null) {
    // 進入回朔
    completeUnitOfWork(unitOfWork);
  } else {
    workInProgress = next;
  }
}

function completeUnitOfWork(unitOfWork: Fiber): void {
  let completedWork = unitOfWork;
  do {
    const current = completedWork.alternate;
    const returnFiber = completedWork.return;
    let next;
    // 處理 fiber 節點，調用渲染器，關聯 fiber 和 dom，回傳子節點
    next = completeWork(current, completedWork, subtreeRenderLanes);
    // 如果在處理的過程中，發現又有子節點產生，就回到 beginWork
    if (next !== null) {
      workInProgress = next;
      return;
    }
    const siblingFiber = completedWork.sibling;
    // 如果還有兄弟節點，則繼續處理兄弟
    if (siblingFiber !== null) {
      workInProgress = siblingFiber;
      return;
    }
    // 沒有兄弟節點，就回到父節點上
    completedWork = returnFiber;
    workInProgress = completedWork;
  } while (completedWork !== null);
}
```

> 學習資料：
> [React 算法之深度优先遍历](https://juejin.cn/post/6912280245055782920)
