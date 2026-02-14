/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agent from "../agent.js";
import type * as agent_queue_helpers from "../agent_queue_helpers.js";
import type * as agents from "../agents.js";
import type * as auth_helpers from "../auth/helpers.js";
import type * as auth_index from "../auth/index.js";
import type * as auth_wrappers from "../auth/wrappers.js";
import type * as clerk_http from "../clerk/http.js";
import type * as clerk_sync from "../clerk/sync.js";
import type * as clerk_webhooks from "../clerk/webhooks.js";
import type * as contacts from "../contacts.js";
import type * as conversations from "../conversations.js";
import type * as crons from "../crons.js";
import type * as delivery from "../delivery.js";
import type * as healthCheck from "../healthCheck.js";
import type * as http from "../http.js";
import type * as inboundDedupe from "../inboundDedupe.js";
import type * as lib_approvalKeywords from "../lib/approvalKeywords.js";
import type * as lib_auth from "../lib/auth.js";
import type * as memories from "../memories.js";
import type * as messages from "../messages.js";
import type * as migrations from "../migrations.js";
import type * as onboarding from "../onboarding.js";
import type * as phoneVerification from "../phoneVerification.js";
import type * as plugins from "../plugins.js";
import type * as privateData from "../privateData.js";
import type * as providerCredentials from "../providerCredentials.js";
import type * as scheduledTasks from "../scheduledTasks.js";
import type * as skills from "../skills.js";
import type * as taskProjects from "../taskProjects.js";
import type * as tasks from "../tasks.js";
import type * as todoist from "../todoist.js";
import type * as toolApprovals from "../toolApprovals.js";
import type * as userPreferences from "../userPreferences.js";
import type * as users from "../users.js";
import type * as whatsappCloud_mutations from "../whatsappCloud/mutations.js";
import type * as whatsappCloud_webhook from "../whatsappCloud/webhook.js";
import type * as whatsappLeases from "../whatsappLeases.js";
import type * as whatsappSession from "../whatsappSession.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  agent: typeof agent;
  agent_queue_helpers: typeof agent_queue_helpers;
  agents: typeof agents;
  "auth/helpers": typeof auth_helpers;
  "auth/index": typeof auth_index;
  "auth/wrappers": typeof auth_wrappers;
  "clerk/http": typeof clerk_http;
  "clerk/sync": typeof clerk_sync;
  "clerk/webhooks": typeof clerk_webhooks;
  contacts: typeof contacts;
  conversations: typeof conversations;
  crons: typeof crons;
  delivery: typeof delivery;
  healthCheck: typeof healthCheck;
  http: typeof http;
  inboundDedupe: typeof inboundDedupe;
  "lib/approvalKeywords": typeof lib_approvalKeywords;
  "lib/auth": typeof lib_auth;
  memories: typeof memories;
  messages: typeof messages;
  migrations: typeof migrations;
  onboarding: typeof onboarding;
  phoneVerification: typeof phoneVerification;
  plugins: typeof plugins;
  privateData: typeof privateData;
  providerCredentials: typeof providerCredentials;
  scheduledTasks: typeof scheduledTasks;
  skills: typeof skills;
  taskProjects: typeof taskProjects;
  tasks: typeof tasks;
  todoist: typeof todoist;
  toolApprovals: typeof toolApprovals;
  userPreferences: typeof userPreferences;
  users: typeof users;
  "whatsappCloud/mutations": typeof whatsappCloud_mutations;
  "whatsappCloud/webhook": typeof whatsappCloud_webhook;
  whatsappLeases: typeof whatsappLeases;
  whatsappSession: typeof whatsappSession;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
