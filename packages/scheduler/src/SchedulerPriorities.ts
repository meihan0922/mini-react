/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 *       strict
 */
// *  有六個等級區別，會依照不同優先級，給予延遲的時間，值越小越高
export type PriorityLevel = 0 | 1 | 2 | 3 | 4 | 5;

// !
export const NoPriority = 0;
// !
export const ImmediatePriority = 1;
// !
export const UserBlockingPriority = 2;
// !
export const NormalPriority = 3;
// !
export const LowPriority = 4;
// !
export const IdlePriority = 5;
