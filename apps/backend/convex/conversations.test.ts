import { describe, expect, it } from "vitest";

import { InMemoryConvexDb } from "../tests/_test-fakes";
import { runMutation } from "../tests/_test-run";
import * as conversations from "./conversations";

describe("conversations.getOrCreate", () => {
  it("returns the newest active whatsapp conversation and archives older duplicates", async () => {
    const db = new InMemoryConvexDb();
    const contactIdA = "contact_1";
    const contactIdB = "contact_2";

    const olderConversation = await db.insert("conversations", {
      contactId: contactIdA,
      channel: "whatsapp",
      accountId: "default",
      status: "active",
    });

    const newerConversation = await db.insert("conversations", {
      contactId: contactIdB,
      channel: "whatsapp",
      accountId: "default",
      status: "active",
    });

    const selectedConversation = await runMutation<
      {
        contactId: string;
        channel: "whatsapp" | "telegram";
        accountId?: string;
      },
      string
    >(
      conversations.getOrCreate,
      { db },
      {
        contactId: contactIdA,
        channel: "whatsapp",
        accountId: "default",
      },
    );

    expect(selectedConversation).toBe(newerConversation);

    const archivedConversation = await db.get(olderConversation);
    const activeConversation = await db.get(newerConversation);

    expect(archivedConversation?.status).toBe("archived");
    expect(activeConversation?.status).toBe("active");
  });

  it("creates a new whatsapp conversation when no active one exists", async () => {
    const db = new InMemoryConvexDb();
    const contactId = "contact_3";

    await db.insert("conversations", {
      contactId,
      channel: "whatsapp",
      accountId: "default",
      status: "archived",
    });

    const selectedConversation = await runMutation<
      {
        contactId: string;
        channel: "whatsapp" | "telegram";
        accountId?: string;
      },
      string
    >(
      conversations.getOrCreate,
      { db },
      {
        contactId,
        channel: "whatsapp",
        accountId: "cloud-api",
      },
    );

    const selected = await db.get(selectedConversation);

    expect(selected).not.toBeNull();
    expect(selected?.status).toBe("active");
    expect(selected?.channel).toBe("whatsapp");
  });
});
