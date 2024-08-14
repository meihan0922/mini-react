import { describe, expect, it } from "vitest";
import {
  NoPriority,
  IdlePriority,
  ImmediatePriority,
  UserBlockingPriority,
  NormalPriority,
  LowPriority,
  scheduleCallback,
} from "../src/Scheduler";

describe("任務調度測試", () => {
  it("2個相同優先級的任務，應該兩者都進入任務池", () => {
    let eventTasks: string[] = [];

    scheduleCallback(NormalPriority, () => {
      eventTasks.push("task1");
      expect(eventTasks).toEqual(["task1"]);
      return null;
    });
    scheduleCallback(NormalPriority, () => {
      eventTasks.push("task2");
      expect(eventTasks).toEqual(["task1", "task2"]);
      return null;
    });
  });
  it("3個不同優先級的任務，高優先級，應最先被推入隊列，並且先執行", () => {
    let eventTasks: string[] = [];

    scheduleCallback(NormalPriority, () => {
      eventTasks.push("task1");
      expect(eventTasks).toEqual(["task3", "task2", "task1"]);
      return true;
    });
    scheduleCallback(UserBlockingPriority, () => {
      eventTasks.push("task2");
      expect(eventTasks).toEqual(["task3", "task2"]);
      return true;
    });
    scheduleCallback(ImmediatePriority, () => {
      eventTasks.push("task3");
      expect(eventTasks).toEqual(["task3"]);
      return true;
    });
  });
  it("4個不同優先級的任務", () => {
    let eventTasks: string[] = [];

    scheduleCallback(NormalPriority, () => {
      eventTasks.push("task1");
      expect(eventTasks).toEqual(["task3", "task2", "task1"]);
      return true;
    });
    scheduleCallback(UserBlockingPriority, () => {
      eventTasks.push("task2");
      expect(eventTasks).toEqual(["task3", "task2"]);
      return true;
    });
    scheduleCallback(ImmediatePriority, () => {
      eventTasks.push("task3");
      expect(eventTasks).toEqual(["task3"]);
      return true;
    });
    scheduleCallback(NormalPriority, () => {
      eventTasks.push("task4");
      expect(eventTasks).toEqual(["task3", "task2", "task1", "task4"]);
      return true;
    });
  });
});
