import { ConvexError, v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation } from "./_generated/server";
import { authMutation, authQuery, serviceMutation, serviceQuery } from "./auth";

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const DEFAULT_TODOIST_API_BASE_URL = "https://api.todoist.com/api/v1";
const DEFAULT_TODOIST_OAUTH_AUTHORIZE_URL = "https://todoist.com/oauth/authorize";
const DEFAULT_TODOIST_OAUTH_TOKEN_URL = "https://todoist.com/oauth/access_token";

const todoistTaskSummaryValidator = v.object({
  id: v.string(),
  content: v.string(),
  description: v.optional(v.string()),
  url: v.optional(v.string()),
  priority: v.optional(v.number()),
  projectId: v.optional(v.string()),
  sectionId: v.optional(v.string()),
  labels: v.optional(v.array(v.string())),
  dueDate: v.optional(v.string()),
  dueDateTime: v.optional(v.string()),
  dueString: v.optional(v.string()),
});

const todoistConnectionStatusValidator = v.object({
  connected: v.boolean(),
  accountEmail: v.optional(v.string()),
  accountName: v.optional(v.string()),
  scope: v.optional(v.string()),
  updatedAt: v.optional(v.number()),
});

interface TodoistTask {
  id: string;
  content: string;
  description?: string;
  url?: string;
  priority?: number;
  project_id?: string;
  section_id?: string;
  labels?: string[];
  due?: {
    date?: string;
    datetime?: string;
    string?: string;
  };
}

interface TodoistTokenResponse {
  access_token?: string;
  token_type?: string;
  scope?: string;
}

interface TodoistUserResponse {
  email?: string;
  full_name?: string;
  name?: string;
}

type DbCtx = Pick<QueryCtx | MutationCtx, "db">;

function getTodoistApiBaseUrl(): string {
  return process.env.TODOIST_API_BASE_URL ?? DEFAULT_TODOIST_API_BASE_URL;
}

function getOAuthConfig(): {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scope: string;
  authorizeUrl: string;
  tokenUrl: string;
} {
  const clientId = process.env.TODOIST_CLIENT_ID;
  const clientSecret = process.env.TODOIST_CLIENT_SECRET;
  const redirectUri = process.env.TODOIST_OAUTH_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new ConvexError(
      "Todoist OAuth is not configured. Missing TODOIST_CLIENT_ID, TODOIST_CLIENT_SECRET, or TODOIST_OAUTH_REDIRECT_URI.",
    );
  }

  return {
    clientId,
    clientSecret,
    redirectUri,
    scope: process.env.TODOIST_OAUTH_SCOPE ?? "data:read_write",
    authorizeUrl: process.env.TODOIST_OAUTH_AUTHORIZE_URL ?? DEFAULT_TODOIST_OAUTH_AUTHORIZE_URL,
    tokenUrl: process.env.TODOIST_OAUTH_TOKEN_URL ?? DEFAULT_TODOIST_OAUTH_TOKEN_URL,
  };
}

function parseErrorBody(body: string): string {
  if (!body) return "No response body";
  return body.length > 300 ? `${body.slice(0, 300)}...` : body;
}

function mapTodoistTask(task: TodoistTask) {
  return {
    id: task.id,
    content: task.content,
    description: task.description,
    url: task.url,
    priority: task.priority,
    projectId: task.project_id,
    sectionId: task.section_id,
    labels: task.labels,
    dueDate: task.due?.date,
    dueDateTime: task.due?.datetime,
    dueString: task.due?.string,
  };
}

async function requestTodoist<T>(
  accessToken: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);
  headers.set("Accept", "application/json");

  if (init?.body && !headers.has("Content-Type") && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${getTodoistApiBaseUrl()}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    const body = parseErrorBody(await response.text());
    throw new Error(`Todoist request failed (${response.status}): ${body}`);
  }

  if (response.status === 204) {
    return null as T;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return null as T;
  }

  return (await response.json()) as T;
}

async function exchangeOAuthCode(code: string): Promise<TodoistTokenResponse> {
  const config = getOAuthConfig();

  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    redirect_uri: config.redirectUri,
  });

  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorBody = parseErrorBody(await response.text());
    throw new ConvexError(`Failed to exchange Todoist OAuth code: ${errorBody}`);
  }

  return (await response.json()) as TodoistTokenResponse;
}

async function getConversationOwnerUserId(
  ctx: DbCtx,
  conversationId: Id<"conversations">,
): Promise<Id<"users"> | null> {
  const conversation = await ctx.db.get(conversationId);
  if (!conversation) return null;
  if (conversation.userId) return conversation.userId;
  if (!conversation.contactId) return null;

  const contact = await ctx.db.get(conversation.contactId);
  return contact?.userId ?? null;
}

export const getConnectionStatus = authQuery({
  args: {},
  returns: todoistConnectionStatusValidator,
  handler: async (ctx) => {
    const connection = await ctx.db
      .query("todoistConnections")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.auth.user._id))
      .first();

    if (!connection) {
      return {
        connected: false,
      };
    }

    return {
      connected: true,
      accountEmail: connection.accountEmail,
      accountName: connection.accountName,
      scope: connection.scope,
      updatedAt: connection.updatedAt,
    };
  },
});

export const startOAuth = authMutation({
  args: {},
  returns: v.object({
    authorizationUrl: v.string(),
    expiresAt: v.number(),
  }),
  handler: async (ctx) => {
    const config = getOAuthConfig();

    const existing = await ctx.db
      .query("todoistOauthStates")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.auth.user._id))
      .collect();

    for (const record of existing) {
      await ctx.db.delete(record._id);
    }

    const state = `todoist_${crypto.randomUUID()}`;
    const now = Date.now();
    const expiresAt = now + OAUTH_STATE_TTL_MS;

    await ctx.db.insert("todoistOauthStates", {
      userId: ctx.auth.user._id,
      state,
      createdAt: now,
      expiresAt,
    });

    const authorizationUrl = new URL(config.authorizeUrl);
    authorizationUrl.searchParams.set("client_id", config.clientId);
    authorizationUrl.searchParams.set("scope", config.scope);
    authorizationUrl.searchParams.set("state", state);
    authorizationUrl.searchParams.set("redirect_uri", config.redirectUri);

    return {
      authorizationUrl: authorizationUrl.toString(),
      expiresAt,
    };
  },
});

export const completeOAuth = authMutation({
  args: {
    code: v.string(),
    state: v.string(),
  },
  returns: todoistConnectionStatusValidator,
  handler: async (ctx, args) => {
    const stateRecord = await ctx.db
      .query("todoistOauthStates")
      .withIndex("by_state", (q) => q.eq("state", args.state))
      .first();

    if (!stateRecord || stateRecord.userId !== ctx.auth.user._id) {
      throw new ConvexError("Invalid Todoist OAuth state.");
    }

    await ctx.db.delete(stateRecord._id);

    if (stateRecord.expiresAt < Date.now()) {
      throw new ConvexError("Todoist OAuth state expired. Please try connecting again.");
    }

    const token = await exchangeOAuthCode(args.code);
    if (!token.access_token) {
      throw new ConvexError("Todoist OAuth did not return an access token.");
    }

    let accountEmail: string | undefined;
    let accountName: string | undefined;

    try {
      const user = await requestTodoist<TodoistUserResponse>(token.access_token, "/user", {
        method: "GET",
      });
      accountEmail = user.email;
      accountName = user.full_name ?? user.name;
    } catch (error) {
      console.warn(
        "[todoist] Connected, but failed to fetch Todoist user profile:",
        error instanceof Error ? error.message : String(error),
      );
    }

    const now = Date.now();
    const existing = await ctx.db
      .query("todoistConnections")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.auth.user._id))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        accessToken: token.access_token,
        tokenType: token.token_type,
        scope: token.scope,
        accountEmail,
        accountName,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("todoistConnections", {
        userId: ctx.auth.user._id,
        accessToken: token.access_token,
        tokenType: token.token_type,
        scope: token.scope,
        accountEmail,
        accountName,
        createdAt: now,
        updatedAt: now,
      });
    }

    return {
      connected: true,
      accountEmail,
      accountName,
      scope: token.scope,
      updatedAt: now,
    };
  },
});

export const disconnect = authMutation({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    const connection = await ctx.db
      .query("todoistConnections")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.auth.user._id))
      .first();

    if (!connection) return false;

    await ctx.db.delete(connection._id);
    return true;
  },
});

export const createTaskForConversation = serviceMutation({
  args: {
    conversationId: v.id("conversations"),
    content: v.string(),
    description: v.optional(v.string()),
    projectId: v.optional(v.string()),
    sectionId: v.optional(v.string()),
    labels: v.optional(v.array(v.string())),
    priority: v.optional(v.number()),
    dueString: v.optional(v.string()),
    dueDateTime: v.optional(v.string()),
  },
  returns: v.union(todoistTaskSummaryValidator, v.null()),
  handler: async (ctx, args) => {
    const ownerUserId = await getConversationOwnerUserId(ctx, args.conversationId);
    if (!ownerUserId) return null;

    const connection = await ctx.db
      .query("todoistConnections")
      .withIndex("by_userId", (q) => q.eq("userId", ownerUserId))
      .first();
    if (!connection) return null;

    const payload: Record<string, unknown> = {
      content: args.content,
      ...(args.description ? { description: args.description } : {}),
      ...(args.projectId ? { project_id: args.projectId } : {}),
      ...(args.sectionId ? { section_id: args.sectionId } : {}),
      ...(args.labels ? { labels: args.labels } : {}),
      ...(args.priority ? { priority: args.priority } : {}),
      ...(args.dueString ? { due_string: args.dueString, due_lang: "en" } : {}),
      ...(args.dueDateTime ? { due_datetime: args.dueDateTime } : {}),
    };

    const task = await requestTodoist<TodoistTask>(connection.accessToken, "/tasks", {
      method: "POST",
      headers: {
        "X-Request-Id": crypto.randomUUID(),
      },
      body: JSON.stringify(payload),
    });

    return mapTodoistTask(task);
  },
});

export const listTasksForConversation = serviceQuery({
  args: {
    conversationId: v.id("conversations"),
    filter: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.union(v.array(todoistTaskSummaryValidator), v.null()),
  handler: async (ctx, args) => {
    const ownerUserId = await getConversationOwnerUserId(ctx, args.conversationId);
    if (!ownerUserId) return null;

    const connection = await ctx.db
      .query("todoistConnections")
      .withIndex("by_userId", (q) => q.eq("userId", ownerUserId))
      .first();
    if (!connection) return null;

    const query = new URLSearchParams();
    if (args.filter) query.set("filter", args.filter);

    const path = query.toString() ? `/tasks?${query.toString()}` : "/tasks";
    const tasks = await requestTodoist<TodoistTask[]>(connection.accessToken, path, {
      method: "GET",
    });

    const limit = args.limit && args.limit > 0 ? args.limit : 20;
    return tasks.slice(0, limit).map(mapTodoistTask);
  },
});

export const completeTaskForConversation = serviceMutation({
  args: {
    conversationId: v.id("conversations"),
    taskId: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const ownerUserId = await getConversationOwnerUserId(ctx, args.conversationId);
    if (!ownerUserId) return false;

    const connection = await ctx.db
      .query("todoistConnections")
      .withIndex("by_userId", (q) => q.eq("userId", ownerUserId))
      .first();
    if (!connection) return false;

    await requestTodoist<null>(connection.accessToken, `/tasks/${args.taskId}/close`, {
      method: "POST",
      headers: {
        "X-Request-Id": crypto.randomUUID(),
      },
    });

    return true;
  },
});

export const rescheduleTaskForConversation = serviceMutation({
  args: {
    conversationId: v.id("conversations"),
    taskId: v.string(),
    dueString: v.optional(v.string()),
    dueDateTime: v.optional(v.string()),
  },
  returns: v.union(todoistTaskSummaryValidator, v.null()),
  handler: async (ctx, args) => {
    if (!args.dueString && !args.dueDateTime) {
      throw new ConvexError("Either dueString or dueDateTime is required.");
    }

    const ownerUserId = await getConversationOwnerUserId(ctx, args.conversationId);
    if (!ownerUserId) return null;

    const connection = await ctx.db
      .query("todoistConnections")
      .withIndex("by_userId", (q) => q.eq("userId", ownerUserId))
      .first();
    if (!connection) return null;

    const payload: Record<string, unknown> = {
      ...(args.dueString ? { due_string: args.dueString, due_lang: "en" } : {}),
      ...(args.dueDateTime ? { due_datetime: args.dueDateTime } : {}),
    };

    const task = await requestTodoist<TodoistTask>(
      connection.accessToken,
      `/tasks/${args.taskId}`,
      {
        method: "POST",
        headers: {
          "X-Request-Id": crypto.randomUUID(),
        },
        body: JSON.stringify(payload),
      },
    );

    return mapTodoistTask(task);
  },
});

export const cleanupExpiredOauthStates = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const now = Date.now();
    const states = await ctx.db.query("todoistOauthStates").collect();

    let deleted = 0;
    for (const state of states) {
      if (state.expiresAt >= now) continue;
      await ctx.db.delete(state._id);
      deleted += 1;
    }

    return deleted;
  },
});
