import * as ynab from "ynab";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

function ok(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
  };
}

function err(message: string) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: message }],
  };
}

export function registerTools(server: McpServer, api: ynab.API): void {
  server.registerTool(
    "list_budgets",
    {
      title: "List Budgets",
      description: "List all YNAB budgets accessible to the authenticated user.",
      inputSchema: {},
    },
    async () => {
      const res = await api.budgets.getBudgets();
      return ok(res.data.budgets);
    }
  );

  server.registerTool(
    "get_budget",
    {
      title: "Get Budget",
      description:
        "Get a single budget including accounts, categories, and recent transactions.",
      inputSchema: {
        budget_id: z
          .string()
          .describe("YNAB budget id, or 'last-used' / 'default'"),
      },
    },
    async ({ budget_id }) => {
      const res = await api.budgets.getBudgetById(budget_id);
      return ok(res.data.budget);
    }
  );

  server.registerTool(
    "get_budget_settings",
    {
      title: "Get Budget Settings",
      description:
        "Get a budget's currency and date formatting settings. Use this to correctly format amounts and dates: YNAB amounts are integers in 'milliunits' (1/1000 of the currency unit), so an amount of 1234560 means 1234.56 in the budget's currency.",
      inputSchema: {
        budget_id: z
          .string()
          .describe("YNAB budget id, or 'last-used' / 'default'"),
      },
    },
    async ({ budget_id }) => {
      const res = await api.budgets.getBudgetSettingsById(budget_id);
      return ok(res.data.settings);
    }
  );

  server.registerTool(
    "list_accounts",
    {
      title: "List Accounts",
      description: "List all accounts in a budget.",
      inputSchema: { budget_id: z.string() },
    },
    async ({ budget_id }) => {
      const res = await api.accounts.getAccounts(budget_id);
      return ok(res.data.accounts);
    }
  );

  server.registerTool(
    "get_account",
    {
      title: "Get Account",
      description: "Get a single account by id.",
      inputSchema: { budget_id: z.string(), account_id: z.string() },
    },
    async ({ budget_id, account_id }) => {
      const res = await api.accounts.getAccountById(budget_id, account_id);
      return ok(res.data.account);
    }
  );

  server.registerTool(
    "list_categories",
    {
      title: "List Categories",
      description: "List all category groups and categories in a budget.",
      inputSchema: { budget_id: z.string() },
    },
    async ({ budget_id }) => {
      const res = await api.categories.getCategories(budget_id);
      return ok(res.data.category_groups);
    }
  );

  server.registerTool(
    "get_category",
    {
      title: "Get Category",
      description: "Get a single category by id.",
      inputSchema: { budget_id: z.string(), category_id: z.string() },
    },
    async ({ budget_id, category_id }) => {
      const res = await api.categories.getCategoryById(budget_id, category_id);
      return ok(res.data.category);
    }
  );

  server.registerTool(
    "list_payees",
    {
      title: "List Payees",
      description: "List all payees in a budget.",
      inputSchema: { budget_id: z.string() },
    },
    async ({ budget_id }) => {
      const res = await api.payees.getPayees(budget_id);
      return ok(res.data.payees);
    }
  );

  server.registerTool(
    "list_transactions",
    {
      title: "List Transactions",
      description:
        "List transactions in a budget, optionally filtered by account, category, payee, since_date, or type.",
      inputSchema: {
        budget_id: z.string(),
        account_id: z
          .string()
          .optional()
          .describe("If set, only list transactions in this account"),
        category_id: z
          .string()
          .optional()
          .describe("If set, only list transactions in this category"),
        payee_id: z
          .string()
          .optional()
          .describe("If set, only list transactions for this payee"),
        since_date: z
          .string()
          .optional()
          .describe("ISO date (YYYY-MM-DD) — only return transactions on/after this date"),
        type: z
          .enum(["uncategorized", "unapproved"])
          .optional()
          .describe("Optional filter by transaction type"),
      },
    },
    async ({ budget_id, account_id, category_id, payee_id, since_date, type }) => {
      let data;
      if (account_id) {
        const res = await api.transactions.getTransactionsByAccount(
          budget_id,
          account_id,
          since_date,
          type
        );
        data = res.data.transactions;
      } else if (category_id) {
        const res = await api.transactions.getTransactionsByCategory(
          budget_id,
          category_id,
          since_date,
          type
        );
        data = res.data.transactions;
      } else if (payee_id) {
        const res = await api.transactions.getTransactionsByPayee(
          budget_id,
          payee_id,
          since_date,
          type
        );
        data = res.data.transactions;
      } else {
        const res = await api.transactions.getTransactions(
          budget_id,
          since_date,
          type
        );
        data = res.data.transactions;
      }
      return ok(data);
    }
  );

  server.registerTool(
    "get_transaction",
    {
      title: "Get Transaction",
      description: "Get a single transaction by id.",
      inputSchema: { budget_id: z.string(), transaction_id: z.string() },
    },
    async ({ budget_id, transaction_id }) => {
      const res = await api.transactions.getTransactionById(
        budget_id,
        transaction_id
      );
      return ok(res.data.transaction);
    }
  );

  server.registerTool(
    "update_transaction",
    {
      title: "Update Transaction",
      description:
        "Update an existing transaction's memo, category, and/or flag color. Only the provided fields are changed; omitted fields are left as-is. Pass category_id: null to clear (uncategorize) a transaction. Pass flag_color: null to remove the flag.",
      inputSchema: {
        budget_id: z.string(),
        transaction_id: z.string(),
        memo: z
          .string()
          .nullable()
          .optional()
          .describe("New memo text. Pass null or empty string to clear the memo."),
        category_id: z
          .string()
          .nullable()
          .optional()
          .describe(
            "New category id. Pass null to uncategorize the transaction."
          ),
        flag_color: z
          .enum(["red", "orange", "yellow", "green", "blue", "purple"])
          .nullable()
          .optional()
          .describe(
            "New flag color. One of red, orange, yellow, green, blue, purple. Pass null to remove the flag."
          ),
      },
    },
    async ({ budget_id, transaction_id, memo, category_id, flag_color }) => {
      if (
        memo === undefined &&
        category_id === undefined &&
        flag_color === undefined
      ) {
        return err(
          "Provide at least one of memo, category_id, or flag_color to update."
        );
      }
      const transaction: ynab.ExistingTransaction = {};
      if (memo !== undefined) transaction.memo = memo;
      if (category_id !== undefined) transaction.category_id = category_id;
      if (flag_color !== undefined)
        transaction.flag_color =
          flag_color as ynab.TransactionFlagColor | null;

      const res = await api.transactions.updateTransaction(
        budget_id,
        transaction_id,
        { transaction }
      );
      return ok(res.data.transaction);
    }
  );

  server.registerTool(
    "bulk_update_transactions",
    {
      title: "Bulk Update Transactions",
      description:
        "Update many transactions in a single request. Each item must include the transaction id plus the fields to change; only provided fields are changed, omitted fields are left as-is. Common uses: approve a batch of imported transactions, categorize or flag several at once, or mark them cleared. Pass category_id: null to uncategorize and flag_color: null to remove a flag.",
      inputSchema: {
        budget_id: z.string(),
        transactions: z
          .array(
            z.object({
              id: z.string().describe("The id of the transaction to update."),
              memo: z
                .string()
                .nullable()
                .optional()
                .describe("New memo text. Pass null or empty string to clear."),
              category_id: z
                .string()
                .nullable()
                .optional()
                .describe("New category id. Pass null to uncategorize."),
              flag_color: z
                .enum(["red", "orange", "yellow", "green", "blue", "purple"])
                .nullable()
                .optional()
                .describe("New flag color. Pass null to remove the flag."),
              approved: z
                .boolean()
                .optional()
                .describe("Set true to approve the transaction."),
              cleared: z
                .enum(["cleared", "uncleared", "reconciled"])
                .optional()
                .describe("New cleared status."),
            })
          )
          .min(1)
          .describe("List of transactions to update (each keyed by id)."),
      },
    },
    async ({ budget_id, transactions }) => {
      const payload: ynab.SaveTransactionWithIdOrImportId[] = transactions.map(
        (t) => {
          const out: ynab.SaveTransactionWithIdOrImportId = { id: t.id };
          if (t.memo !== undefined) out.memo = t.memo;
          if (t.category_id !== undefined) out.category_id = t.category_id;
          if (t.flag_color !== undefined)
            out.flag_color = t.flag_color as ynab.TransactionFlagColor | null;
          if (t.approved !== undefined) out.approved = t.approved;
          if (t.cleared !== undefined)
            out.cleared = t.cleared as ynab.TransactionClearedStatus;
          return out;
        }
      );

      const res = await api.transactions.updateTransactions(budget_id, {
        transactions: payload,
      });
      return ok(res.data);
    }
  );

  server.registerTool(
    "list_scheduled_transactions",
    {
      title: "List Scheduled Transactions",
      description: "List all scheduled (recurring) transactions in a budget.",
      inputSchema: { budget_id: z.string() },
    },
    async ({ budget_id }) => {
      const res = await api.scheduledTransactions.getScheduledTransactions(
        budget_id
      );
      return ok(res.data.scheduled_transactions);
    }
  );

  server.registerTool(
    "list_months",
    {
      title: "List Months",
      description: "List monthly budget summaries.",
      inputSchema: { budget_id: z.string() },
    },
    async ({ budget_id }) => {
      const res = await api.months.getBudgetMonths(budget_id);
      return ok(res.data.months);
    }
  );

  server.registerTool(
    "get_month",
    {
      title: "Get Month",
      description:
        "Get a single budget month, including category balances and goals.",
      inputSchema: {
        budget_id: z.string(),
        month: z
          .string()
          .describe("YYYY-MM-DD (first of month) or 'current'"),
      },
    },
    async ({ budget_id, month }) => {
      const res = await api.months.getBudgetMonth(budget_id, month);
      return ok(res.data.month);
    }
  );

  server.registerTool(
    "get_user",
    {
      title: "Get User",
      description: "Get authenticated user info.",
      inputSchema: {},
    },
    async () => {
      const res = await api.user.getUser();
      return ok(res.data.user);
    }
  );
}
