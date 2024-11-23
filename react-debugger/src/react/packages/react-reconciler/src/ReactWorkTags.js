/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

// export type WorkTag =
//   | 0
//   | 1
//   | 2
//   | 3
//   | 4
//   | 5
//   | 6
//   | 7
//   | 8
//   | 9
//   | 10
//   | 11
//   | 12
//   | 13
//   | 14
//   | 15
//   | 16
//   | 17
//   | 18
//   | 19
//   | 20
//   | 21
//   | 22
//   | 23
//   | 24
//   | 25;

// Host: 是和 DOM 節點相關連的
export const FunctionComponent = 0;
export const ClassComponent = 1;
export const IndeterminateComponent = 2; // Before we know whether it is function or class
// createRoot 後面的原生節點，根節點
export const HostRoot = 3; // Root of a host tree. Could be nested inside another node.
export const HostPortal = 4; // A subtree. Could be an entry point to a different renderer.
export const HostComponent = 5;
// 文本節點
/**
 * <div>
 *  <h1>123</h1> -> 屬於 h1標籤，如果內容只有文本，文本會被作為屬性掛載 h1上
 *  123 -> 如果父節點有多個子節點的話，這個才是文本節點
 * </div>
 */
export const HostText = 6;
export const Fragment = 7;
export const Mode = 8;
export const ContextConsumer = 9;
export const ContextProvider = 10;
export const ForwardRef = 11;
export const Profiler = 12;
export const SuspenseComponent = 13;
export const MemoComponent = 14;
/**
 * 如同字面意思上，是比較簡單的memo組件，沒有compare函式
 */
export const SimpleMemoComponent = 15;
export const LazyComponent = 16;
export const IncompleteClassComponent = 17;
export const DehydratedFragment = 18;
export const SuspenseListComponent = 19;
export const ScopeComponent = 21;
export const OffscreenComponent = 22;
export const LegacyHiddenComponent = 23;
export const CacheComponent = 24;
export const TracingMarkerComponent = 25;
export const HostHoistable = 26;
export const HostSingleton = 27;
