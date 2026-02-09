import { ConvexError, v } from "convex/values";

import { internalMutation } from "./_generated/server";
import { authMutation, authQuery } from "./auth";

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const DEFAULT_TODOIST_API_BASE_URL = "https://api.todoist.com/api/v1";
const DEFAULT_TODOIST_OAUTH_AUTHORIZE_URL = "https://todoist.com/oauth/authorize";
const DEFAULT_TODOIST_OAUTH_TOKEN_URL = "https://todoist.com/oauth/access_token";

const todoistConnectionStatusValidator = v.object({
  connected: v.boolean(),
  accountEmail: v.optional(v.string()),
  accountName: v.optional(v.string()),
  scope: v.optional(v.string()),
  updatedAt: v.optional(v.number()),
});

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
