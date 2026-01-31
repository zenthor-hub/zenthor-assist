import { createClerkClient } from "@clerk/backend";

import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";

export const syncAllUsers = internalAction({
  args: {},
  handler: async (ctx) => {
    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!secretKey) {
      throw new Error("CLERK_SECRET_KEY is not set");
    }

    const clerk = createClerkClient({ secretKey });

    let synced = 0;
    let created = 0;
    let updated = 0;
    let offset = 0;
    const limit = 100;

    while (true) {
      const { data: users, totalCount } = await clerk.users.getUserList({
        limit,
        offset,
      });

      if (users.length === 0) break;

      for (const user of users) {
        const primaryEmail = user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId);
        const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || "User";

        const result = await ctx.runMutation(internal.clerk.webhooks.handleUserCreated, {
          externalId: user.id,
          name,
          email: primaryEmail?.emailAddress ?? "",
          image: user.imageUrl,
        });

        if (result.created) {
          created++;
        } else {
          updated++;
        }
        synced++;
      }

      console.info(`[clerk sync] Processed ${synced}/${totalCount} users...`);
      offset += limit;

      if (offset >= totalCount) break;
    }

    console.info(
      `[clerk sync] Done. Synced ${synced} users (${created} created, ${updated} updated)`,
    );
    return { synced, created, updated };
  },
});
