import { browseUrl } from "./browse-url";
import { calculate } from "./calculate";
import { currentTime } from "./current-time";
import { dateCalc } from "./date-calc";
import { memorySearch, memoryStore } from "./memory";
import { scheduleTask } from "./schedule";
import {
  todoistCaptureTask,
  todoistCompleteTask,
  todoistListTasks,
  todoistRescheduleTask,
} from "./todoist";

export const tools = {
  get_current_time: currentTime,
  memory_search: memorySearch,
  memory_store: memoryStore,
  schedule_task: scheduleTask,
  browse_url: browseUrl,
  calculate,
  date_calc: dateCalc,
  todoist_capture_task: todoistCaptureTask,
  todoist_list_tasks: todoistListTasks,
  todoist_complete_task: todoistCompleteTask,
  todoist_reschedule_task: todoistRescheduleTask,
};
