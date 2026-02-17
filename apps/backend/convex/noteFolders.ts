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
  parentId: v.optional(v.id("noteFolders")),
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

/** Walk ancestors to check if `candidateAncestor` is an ancestor of `folderId` (or is `folderId` itself). */
async function isAncestor(
  ctx: NoteFolderMutationCtx,
  folderId: Id<"noteFolders">,
  candidateAncestor: Id<"noteFolders">,
): Promise<boolean> {
  let current: Id<"noteFolders"> | undefined = folderId;
  const visited = new Set<string>();
  while (current) {
    if (current === candidateAncestor) return true;
    if (visited.has(current)) break; // safety: stop on cycle
    visited.add(current);
    const doc: { parentId?: Id<"noteFolders"> } | null = await ctx.db.get(current);
    current = doc?.parentId;
  }
  return false;
}

/** Count siblings that share the same parentId for this user. */
async function countSiblings(
  ctx: NoteFolderMutationCtx,
  parentId: Id<"noteFolders"> | undefined,
): Promise<number> {
  if (parentId !== undefined) {
    return (
      await ctx.db
        .query("noteFolders")
        .withIndex("by_parentId", (q) => q.eq("parentId", parentId))
        .collect()
    ).filter((f) => f.userId === ctx.auth.user._id).length;
  }
  // Root-level: folders with no parentId owned by this user
  return (
    await ctx.db
      .query("noteFolders")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.auth.user._id))
      .collect()
  ).filter((f) => f.parentId === undefined).length;
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
    parentId: v.optional(v.id("noteFolders")),
  },
  returns: v.id("noteFolders"),
  handler: async (ctx, args) => {
    const now = Date.now();

    // Validate parent ownership if provided
    if (args.parentId) {
      const parent = await getFolderIfOwnedByUser(ctx, args.parentId);
      if (!parent) throw new ConvexError("Parent folder not found");
    }

    const nextPosition = args.position ?? (await countSiblings(ctx, args.parentId));

    return await ctx.db.insert("noteFolders", {
      userId: ctx.auth.user._id,
      parentId: args.parentId,
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
    parentId: v.optional(v.id("noteFolders")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const folder = await getFolderIfOwnedByUser(ctx, args.id);
    if (!folder) return null;

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.name !== undefined) patch.name = args.name;
    if (args.color !== undefined) patch.color = args.color;
    if (args.position !== undefined) patch.position = args.position;
    if (args.parentId !== undefined) patch.parentId = args.parentId;
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

    // Reparent child folders to the deleted folder's parent (Obsidian behavior)
    const children = await ctx.db
      .query("noteFolders")
      .withIndex("by_parentId", (q) => q.eq("parentId", args.id))
      .collect();

    for (const child of children) {
      await ctx.db.patch(child._id, { parentId: folder.parentId });
    }

    // Unfile notes in this folder
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

export const moveFolder = authMutation({
  args: {
    id: v.id("noteFolders"),
    parentId: v.optional(v.id("noteFolders")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const folder = await getFolderIfOwnedByUser(ctx, args.id);
    if (!folder) throw new ConvexError("Folder not found");

    // Validate target parent ownership
    if (args.parentId) {
      const parent = await getFolderIfOwnedByUser(ctx, args.parentId);
      if (!parent) throw new ConvexError("Target folder not found");

      // Cycle detection: ensure we're not moving a folder into its own subtree
      if (await isAncestor(ctx, args.parentId, args.id)) {
        throw new ConvexError("Cannot move a folder into its own subtree");
      }
    }

    // Auto-position at end of target parent's children
    const position = await countSiblings(ctx, args.parentId);

    await ctx.db.patch(folder._id, {
      parentId: args.parentId,
      position,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const reorder = authMutation({
  args: {
    orderedFolderIds: v.array(v.id("noteFolders")),
    parentId: v.optional(v.id("noteFolders")),
  },
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
