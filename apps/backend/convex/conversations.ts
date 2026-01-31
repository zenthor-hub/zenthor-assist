import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const getOrCreate = mutation({
  args: {
    contactId: v.id("contacts"),
    channel: v.union(v.literal("whatsapp"), v.literal("web")),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("conversations")
      .withIndex("by_contactId", (q) => q.eq("contactId", args.contactId))
      .filter((q) => q.eq(q.field("channel"), args.channel))
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();

    if (existing) return existing._id;

    return await ctx.db.insert("conversations", {
      contactId: args.contactId,
      channel: args.channel,
      status: "active",
    });
  },
});

export const listByContact = query({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("conversations")
      .withIndex("by_contactId", (q) => q.eq("contactId", args.contactId))
      .collect();
  },
});

export const get = query({
  args: { id: v.id("conversations") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});
