import { describe, expect, it } from "vitest";

import { InMemoryConvexDb } from "../tests/_test-fakes";
import { runMutation } from "../tests/_test-run";
import * as conversations from "./conversations";

describe("conversations.getOrCreate", () => {
  it("returns the newest active whatsapp conversation and archives older duplicates", async () => {
    const db = new InMemoryConvexDb();
    const contactId = "contact_1";

    const olderConversation = await db.insert("conversations", {
      contactId,
      channel: "whatsapp",
      accountId: "cloud-api",
      status: "active",
    });

    const newerConversation = await db.insert("conversations", {
      contactId,
      channel: "whatsapp",
      accountId: "cloud-api",
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
        contactId,
        channel: "whatsapp",
        accountId: "cloud-api",
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
    const contactId = "contact_2";

    await db.insert("conversations", {
      contactId,
      channel: "whatsapp",
      accountId: "cloud-api",
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
