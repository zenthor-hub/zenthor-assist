import { browseUrl } from "./browse-url";
import { calculate } from "./calculate";
import { currentTime } from "./current-time";
import { dateCalc } from "./date-calc";
import { memorySearch, memoryStore } from "./memory";
import { scheduleTask } from "./schedule";

export const tools = {
  get_current_time: currentTime,
  memory_search: memorySearch,
  memory_store: memoryStore,
  schedule_task: scheduleTask,
  browse_url: browseUrl,
  calculate,
  date_calc: dateCalc,
};
