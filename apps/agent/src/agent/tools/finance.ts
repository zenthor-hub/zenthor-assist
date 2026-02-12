/**
 * Zenthor Finance Tools
 *
 * Agent tools for interacting with the Zenthor Finance REST API.
 * These tools allow the agent to read financial data and create/update transactions
 * on behalf of the user via their WhatsApp or web chat.
 */

import { tool } from "ai";
import { z } from "zod";

import { financeGet, financePost, isFinanceConfigured } from "./finance-client";

// --- API response types ---

interface ApiAccount {
  id: string;
  name: string;
  type: string;
  currency: string;
  balance_display: number;
  balance_decimal: string;
  is_active: boolean;
  institution?: string;
}

interface PaginatedData<T> {
  data: T[];
  pagination: { has_more: boolean; next_cursor?: string };
}

interface ApiTransaction {
  id: string;
  type: string;
  status: string;
  description: string;
  display_name?: string;
  currency: string;
  amount_display: number;
  total_amount_display: number;
  fee_amount_display?: number;
  date_time: number;
  account_name?: string;
  to_account_name?: string;
  category_name?: string;
  notes?: string;
}

interface SpendingSummary {
  income: number;
  expenses: number;
  net_income: number;
  transfers: number;
  totals_by_currency: Array<{
    currency: string;
    income: number;
    expenses: number;
    net_income: number;
    transfers: number;
  }>;
  target_currency_totals?: {
    currency: string;
    income: string;
    expenses: string;
    net_income: string;
    transfers: string;
  };
}

interface CategorySpending {
  categories: Array<{
    category_name: string;
    transaction_count: number;
    total_amount: number;
    totals_by_currency: Array<{ currency: string; total: number }>;
  }>;
}

interface AccountsSummary {
  net_worth: number;
  assets: number;
  liabilities: number;
  investments: number;
  totals_by_currency: Array<{
    currency: string;
    net_worth: number;
    assets: number;
    liabilities: number;
    investments: number;
  }>;
  target_currency_totals?: {
    currency: string;
    net_worth: number;
    assets: number;
    liabilities: number;
    investments: number;
  };
}

interface ApiCategory {
  id: string;
  name: string;
  type: string;
  color: string;
  icon: string;
  parent_name?: string;
  is_active: boolean;
}

interface CreateResult {
  id: string;
}

// --- Helpers ---

function formatError(action: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `Failed to ${action}: ${message}`;
}

function notConfiguredMessage(): string {
  return "Zenthor Finance integration is not configured. Missing ZENTHOR_FINANCE_API_URL, ZENTHOR_FINANCE_SERVICE_KEY, or ZENTHOR_FINANCE_ORG_ID.";
}

function formatCurrency(amount: number, currency?: string): string {
  if (currency) {
    return `${currency} ${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// --- Tool schemas ---

const listAccountsSchema = z.object({
  type: z
    .enum(["checking", "savings", "credit_card", "cash", "investment", "loan", "wallet"])
    .optional()
    .describe("Filter by account type"),
});

const accountSummarySchema = z.object({
  target_currency: z
    .string()
    .optional()
    .describe("Convert all totals to this currency (e.g. BRL, USD)"),
});

const listTransactionsSchema = z.object({
  account_id: z.string().optional().describe("Filter by account ID"),
  category_id: z.string().optional().describe("Filter by category ID"),
  type: z.enum(["income", "expense", "transfer"]).optional().describe("Filter by type"),
  status: z.enum(["pending", "cleared", "reconciled"]).optional().describe("Filter by status"),
  date_from: z.string().optional().describe("Start date filter (YYYY-MM-DD)"),
  date_to: z.string().optional().describe("End date filter (YYYY-MM-DD)"),
  search: z.string().optional().describe("Search in description, display name, and notes"),
  limit: z.number().optional().describe("Max results (default 20, max 100)"),
});

const spendingSummarySchema = z.object({
  date_from: z.string().optional().describe("Start date (YYYY-MM-DD)"),
  date_to: z.string().optional().describe("End date (YYYY-MM-DD)"),
  target_currency: z.string().optional().describe("Convert all totals to this currency (e.g. BRL)"),
});

const spendingByCategorySchema = z.object({
  date_from: z.string().optional().describe("Start date (YYYY-MM-DD)"),
  date_to: z.string().optional().describe("End date (YYYY-MM-DD)"),
  target_currency: z.string().optional().describe("Convert all totals to this currency"),
  limit: z.number().optional().describe("Max categories to return (default 20, max 50)"),
});

const listCategoriesSchema = z.object({
  type: z.enum(["income", "expense"]).optional().describe("Filter by income or expense"),
});

const createTransactionSchema = z.object({
  account_id: z.string().describe("Account ID for the transaction"),
  type: z.enum(["income", "expense"]).describe("Transaction type"),
  amount: z.number().describe("Amount in display units (e.g. 10.50 for $10.50, must be positive)"),
  description: z.string().describe("Transaction description"),
  date_time: z
    .number()
    .describe("Transaction timestamp in milliseconds. Use date_calc to resolve dates."),
  timezone: z.string().describe("Timezone (e.g. America/Sao_Paulo)"),
  category_id: z.string().optional().describe("Category ID"),
  display_name: z.string().optional().describe("Display name / payee"),
  fee_amount: z.number().optional().describe("Fee amount in display units"),
  status: z
    .enum(["pending", "cleared", "reconciled"])
    .optional()
    .describe("Status (default: pending)"),
  tags: z.array(z.string()).optional().describe("Tags for categorization"),
  notes: z.string().optional().describe("Additional notes"),
});

const createTransferSchema = z.object({
  from_account_id: z.string().describe("Source account ID"),
  to_account_id: z.string().describe("Destination account ID"),
  amount: z.number().describe("Transfer amount in display units (must be positive)"),
  description: z.string().describe("Transfer description"),
  date_time: z.number().describe("Transaction timestamp in milliseconds"),
  timezone: z.string().describe("Timezone (e.g. America/Sao_Paulo)"),
  display_name: z.string().optional().describe("Display name"),
  status: z
    .enum(["pending", "cleared", "reconciled"])
    .optional()
    .describe("Status (default: pending)"),
  notes: z.string().optional().describe("Additional notes"),
});

// --- Tool definitions ---

export const financeListAccounts = tool({
  description:
    "List the user's bank accounts, credit cards, and financial accounts from Zenthor Finance. Returns account names, types, currencies, and current balances.",
  inputSchema: listAccountsSchema,
  execute: async ({ type }) => {
    if (!isFinanceConfigured()) return notConfiguredMessage();
    try {
      const data = await financeGet<PaginatedData<ApiAccount>>("/api/v1/accounts", {
        type,
        limit: "50",
      });
      const accounts = data.data;
      if (accounts.length === 0) return "No accounts found.";

      return accounts
        .map((a) => {
          const parts = [`${a.name} (${a.type})`];
          parts.push(formatCurrency(a.balance_display, a.currency));
          if (a.institution) parts.push(a.institution);
          parts.push(`id: ${a.id}`);
          return parts.join(" | ");
        })
        .join("\n");
    } catch (error) {
      return formatError("list accounts", error);
    }
  },
});

export const financeAccountSummary = tool({
  description:
    "Get the user's financial summary: net worth, total assets, liabilities, and investments. Can convert all values to a target currency.",
  inputSchema: accountSummarySchema,
  execute: async ({ target_currency }) => {
    if (!isFinanceConfigured()) return notConfiguredMessage();
    try {
      const data = await financeGet<AccountsSummary>("/api/v1/accounts/summary", {
        target_currency,
      });

      const lines: string[] = [];

      if (data.target_currency_totals) {
        const t = data.target_currency_totals;
        lines.push(`Net Worth: ${formatCurrency(t.net_worth, t.currency)}`);
        lines.push(`Assets: ${formatCurrency(t.assets, t.currency)}`);
        lines.push(`Liabilities: ${formatCurrency(t.liabilities, t.currency)}`);
        if (t.investments) lines.push(`Investments: ${formatCurrency(t.investments, t.currency)}`);
      } else if (data.totals_by_currency.length === 1) {
        const t = data.totals_by_currency[0]!;
        lines.push(`Net Worth: ${formatCurrency(t.net_worth, t.currency)}`);
        lines.push(`Assets: ${formatCurrency(t.assets, t.currency)}`);
        lines.push(`Liabilities: ${formatCurrency(t.liabilities, t.currency)}`);
        if (t.investments) lines.push(`Investments: ${formatCurrency(t.investments, t.currency)}`);
      } else {
        for (const t of data.totals_by_currency) {
          lines.push(
            `${t.currency}: Net Worth ${formatCurrency(t.net_worth)} | Assets ${formatCurrency(t.assets)} | Liabilities ${formatCurrency(t.liabilities)}`,
          );
        }
      }

      return lines.join("\n");
    } catch (error) {
      return formatError("get account summary", error);
    }
  },
});

export const financeListTransactions = tool({
  description:
    "List recent financial transactions. Can filter by account, category, type (income/expense/transfer), date range, status, or search text.",
  inputSchema: listTransactionsSchema,
  execute: async ({ account_id, category_id, type, status, date_from, date_to, search, limit }) => {
    if (!isFinanceConfigured()) return notConfiguredMessage();
    try {
      const data = await financeGet<PaginatedData<ApiTransaction>>("/api/v1/transactions", {
        account_id,
        category_id,
        type,
        status,
        date_from,
        date_to,
        search,
        limit: String(limit ?? 20),
      });
      const transactions = data.data;
      if (transactions.length === 0) return "No transactions found.";

      return transactions
        .map((t, i) => {
          const sign = t.type === "income" ? "+" : t.type === "expense" ? "-" : "";
          const parts = [`${i + 1}. ${t.description}`];
          parts.push(`${sign}${formatCurrency(t.total_amount_display, t.currency)}`);
          parts.push(formatDate(t.date_time));
          if (t.category_name) parts.push(t.category_name);
          if (t.account_name) parts.push(t.account_name);
          if (t.type === "transfer" && t.to_account_name) {
            parts.push(`→ ${t.to_account_name}`);
          }
          parts.push(`[${t.status}]`);
          parts.push(`id: ${t.id}`);
          return parts.join(" | ");
        })
        .join("\n");
    } catch (error) {
      return formatError("list transactions", error);
    }
  },
});

export const financeSpendingSummary = tool({
  description:
    "Get a spending summary: total income, expenses, net income, and transfers for a date range. Useful for understanding overall financial health.",
  inputSchema: spendingSummarySchema,
  execute: async ({ date_from, date_to, target_currency }) => {
    if (!isFinanceConfigured()) return notConfiguredMessage();
    try {
      const data = await financeGet<SpendingSummary>("/api/v1/transactions/spending-summary", {
        date_from,
        date_to,
        target_currency,
      });

      const lines: string[] = [];

      if (data.target_currency_totals) {
        const t = data.target_currency_totals;
        lines.push(`Income: ${t.income}`);
        lines.push(`Expenses: ${t.expenses}`);
        lines.push(`Net Income: ${t.net_income}`);
        lines.push(`Transfers: ${t.transfers}`);
      } else if (data.totals_by_currency.length === 1) {
        const t = data.totals_by_currency[0]!;
        lines.push(`Income: ${formatCurrency(t.income, t.currency)}`);
        lines.push(`Expenses: ${formatCurrency(t.expenses, t.currency)}`);
        lines.push(`Net Income: ${formatCurrency(t.net_income, t.currency)}`);
        if (t.transfers) lines.push(`Transfers: ${formatCurrency(t.transfers, t.currency)}`);
      } else {
        for (const t of data.totals_by_currency) {
          lines.push(
            `${t.currency}: Income ${formatCurrency(t.income)} | Expenses ${formatCurrency(t.expenses)} | Net ${formatCurrency(t.net_income)}`,
          );
        }
      }

      if (date_from || date_to) {
        const period = [date_from, date_to].filter(Boolean).join(" to ");
        lines.push(`Period: ${period}`);
      }

      return lines.join("\n");
    } catch (error) {
      return formatError("get spending summary", error);
    }
  },
});

export const financeSpendingByCategory = tool({
  description:
    "Get expense spending broken down by category. Shows each category's total and transaction count. Useful for understanding where money is going.",
  inputSchema: spendingByCategorySchema,
  execute: async ({ date_from, date_to, target_currency, limit }) => {
    if (!isFinanceConfigured()) return notConfiguredMessage();
    try {
      const data = await financeGet<CategorySpending>("/api/v1/transactions/by-category", {
        date_from,
        date_to,
        target_currency,
        limit: limit ? String(limit) : undefined,
      });
      const categories = data.categories;
      if (categories.length === 0) return "No expense data found for this period.";

      return categories
        .map((c, i) => {
          const totals = c.totals_by_currency
            .map((t) => formatCurrency(t.total, t.currency))
            .join(", ");
          return `${i + 1}. ${c.category_name}: ${totals} (${c.transaction_count} txn${c.transaction_count !== 1 ? "s" : ""})`;
        })
        .join("\n");
    } catch (error) {
      return formatError("get spending by category", error);
    }
  },
});

export const financeListCategories = tool({
  description:
    "List available transaction categories. Use this to find category IDs before creating transactions.",
  inputSchema: listCategoriesSchema,
  execute: async ({ type }) => {
    if (!isFinanceConfigured()) return notConfiguredMessage();
    try {
      const data = await financeGet<PaginatedData<ApiCategory>>("/api/v1/categories", {
        type,
        limit: "100",
      });
      const categories = data.data;
      if (categories.length === 0) return "No categories found.";

      return categories
        .map((c) => {
          const parts = [`${c.name} (${c.type})`];
          if (c.parent_name) parts.push(`parent: ${c.parent_name}`);
          parts.push(`id: ${c.id}`);
          return parts.join(" | ");
        })
        .join("\n");
    } catch (error) {
      return formatError("list categories", error);
    }
  },
});

export const financeCreateTransaction = tool({
  description:
    "Create an income or expense transaction in Zenthor Finance. Use finance_list_accounts to find the account_id and finance_list_categories for the category_id first. Use date_calc to resolve dates to timestamps.",
  inputSchema: createTransactionSchema,
  execute: async (input) => {
    if (!isFinanceConfigured()) return notConfiguredMessage();
    try {
      const result = await financePost<CreateResult>("/api/v1/transactions/create", input);
      const typeLabel = input.type === "income" ? "Income" : "Expense";
      return `${typeLabel} transaction created: ${input.description} (${input.amount}) — id: ${result.id}`;
    } catch (error) {
      return formatError("create transaction", error);
    }
  },
});

export const financeCreateTransfer = tool({
  description:
    "Create a transfer between two accounts in Zenthor Finance. Both accounts must use the same currency. Use finance_list_accounts to find account IDs.",
  inputSchema: createTransferSchema,
  execute: async (input) => {
    if (!isFinanceConfigured()) return notConfiguredMessage();
    try {
      const result = await financePost<CreateResult>("/api/v1/transactions/create-transfer", input);
      return `Transfer created: ${input.description} (${input.amount}) — id: ${result.id}`;
    } catch (error) {
      return formatError("create transfer", error);
    }
  },
});
