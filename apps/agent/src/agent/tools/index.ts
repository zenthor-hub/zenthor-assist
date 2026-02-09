import { browseUrl } from "./browse-url";
import { calculate } from "./calculate";
import { currentTime } from "./current-time";
import { dateCalc } from "./date-calc";
import {
  financeAccountSummary,
  financeCreateTransaction,
  financeCreateTransfer,
  financeListAccounts,
  financeListCategories,
  financeListTransactions,
  financeSpendingByCategory,
  financeSpendingSummary,
} from "./finance";
import { memorySearch, memoryStore } from "./memory";
import { scheduleTask } from "./schedule";
import { taskComplete, taskCreate, taskDelete, taskList, taskUpdate } from "./tasks";

export const tools = {
  get_current_time: currentTime,
  memory_search: memorySearch,
  memory_store: memoryStore,
  schedule_task: scheduleTask,
  browse_url: browseUrl,
  calculate,
  date_calc: dateCalc,
  task_create: taskCreate,
  task_list: taskList,
  task_update: taskUpdate,
  task_complete: taskComplete,
  task_delete: taskDelete,
  finance_list_accounts: financeListAccounts,
  finance_account_summary: financeAccountSummary,
  finance_list_transactions: financeListTransactions,
  finance_spending_summary: financeSpendingSummary,
  finance_spending_by_category: financeSpendingByCategory,
  finance_list_categories: financeListCategories,
  finance_create_transaction: financeCreateTransaction,
  finance_create_transfer: financeCreateTransfer,
};
