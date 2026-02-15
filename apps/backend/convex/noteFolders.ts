import { ConvexError, v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { authMutation, authQuery } from "./auth";

type NoteFolderMutationCtx = Pick<MutationCtx, "db"> & {
  readonly auth: {
    readonly user: {
      readonly _id: Id<"users">;
    };
  };
};

const folderDoc = v.object({
  _id: v.id("noteFolders"),
  _creationTime: v.number(),
  userId: v.id("users"),
  name: v.string(),
  color: v.string(),
  position: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
});

async function getFolderIfOwnedByUser(ctx: NoteFolderMutationCtx, folderId: Id<"noteFolders">) {
  const folder = await ctx.db.get(folderId);
  if (!folder || folder.userId !== ctx.auth.user._id) return null;
  return folder;
}

export const list = authQuery({
  args: {},
  returns: v.array(folderDoc),
  handler: async (ctx) => {
    return await ctx.db
      .query("noteFolders")
      .withIndex("by_userId_position", (q) => q.eq("userId", ctx.auth.user._id))
      .collect();
  },
});

export const create = authMutation({
  args: {
    name: v.string(),
    color: v.string(),
    position: v.optional(v.number()),
  },
  returns: v.id("noteFolders"),
  handler: async (ctx, args) => {
    const now = Date.now();

    const nextPosition =
      args.position ??
      (
        await ctx.db
          .query("noteFolders")
          .withIndex("by_userId", (q) => q.eq("userId", ctx.auth.user._id))
          .collect()
      ).length;

    return await ctx.db.insert("noteFolders", {
      userId: ctx.auth.user._id,
      name: args.name,
      color: args.color,
      position: nextPosition,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = authMutation({
  args: {
    id: v.id("noteFolders"),
    name: v.optional(v.string()),
    color: v.optional(v.string()),
    position: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const folder = await getFolderIfOwnedByUser(ctx, args.id);
    if (!folder) return null;

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.name !== undefined) patch.name = args.name;
    if (args.color !== undefined) patch.color = args.color;
    if (args.position !== undefined) patch.position = args.position;
    await ctx.db.patch(folder._id, patch);
    return null;
  },
});

export const remove = authMutation({
  args: { id: v.id("noteFolders") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const folder = await getFolderIfOwnedByUser(ctx, args.id);
    if (!folder) return null;

    const notes = await ctx.db
      .query("notes")
      .withIndex("by_folderId", (q) => q.eq("folderId", args.id))
      .collect();

    for (const note of notes) {
      await ctx.db.patch(note._id, { folderId: undefined });
    }

    await ctx.db.delete(folder._id);
    return null;
  },
});

export const reorder = authMutation({
  args: { orderedFolderIds: v.array(v.id("noteFolders")) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();

    for (const [position, id] of args.orderedFolderIds.entries()) {
      const folder = await getFolderIfOwnedByUser(ctx, id);
      if (!folder) throw new ConvexError("Folder not found");
      await ctx.db.patch(folder._id, { position, updatedAt: now });
    }

    return null;
  },
});
