import type { WebhookEvent } from "@clerk/backend";
import { Webhook } from "svix";

import { internal } from "../_generated/api";
import { httpAction } from "../_generated/server";

export const webhook = httpAction(async (ctx, request) => {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[clerk webhook] CLERK_WEBHOOK_SECRET not set");
    return new Response("Server configuration error", { status: 500 });
  }

  const svixId = request.headers.get("svix-id");
  const svixTimestamp = request.headers.get("svix-timestamp");
  const svixSignature = request.headers.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return new Response("Missing svix headers", { status: 400 });
  }

  const body = await request.text();

  let evt: WebhookEvent;
  try {
    const wh = new Webhook(secret);
    evt = wh.verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as WebhookEvent;
  } catch (err) {
    console.error("[clerk webhook] Verification failed:", err);
    return new Response("Invalid signature", { status: 400 });
  }

  const eventType = evt.type;
  console.info(`[clerk webhook] Received event: ${eventType}`);

  try {
    switch (eventType) {
      case "user.created":
      case "user.updated": {
        const { id, first_name, last_name, email_addresses, image_url } = evt.data;
        const primaryEmail = email_addresses?.find(
          (e) => e.id === evt.data.primary_email_address_id,
        );
        const name = [first_name, last_name].filter(Boolean).join(" ") || "User";
        const email = primaryEmail?.email_address ?? "";

        const handler =
          eventType === "user.created"
            ? internal.clerk.webhooks.handleUserCreated
            : internal.clerk.webhooks.handleUserUpdated;

        await ctx.runMutation(handler, {
          externalId: id,
          name,
          email,
          image: image_url,
        });
        break;
      }

      case "user.deleted": {
        if (evt.data.id) {
          await ctx.runMutation(internal.clerk.webhooks.handleUserDeleted, {
            externalId: evt.data.id,
          });
        }
        break;
      }

      default:
        console.info(`[clerk webhook] Unhandled event type: ${eventType}`);
    }
  } catch (err) {
    console.error(`[clerk webhook] Error handling ${eventType}:`, err);
    return new Response("Internal error", { status: 500 });
  }

  return new Response("OK", { status: 200 });
});
