import { api } from "@zenthor-assist/backend/convex/_generated/api";
import { env } from "@zenthor-assist/env/agent";
import { BufferJSON, initAuthCreds, proto } from "baileys";
import type { AuthenticationState, SignalDataSet, SignalDataTypeMap } from "baileys";

import { getConvexClient } from "../convex/client";

/**
 * Convex-backed auth state adapter for Baileys.
 * Mirrors the contract of `useMultiFileAuthState` but persists
 * credentials and Signal keys in the `whatsappSession` table.
 */
export async function createConvexAuthState(): Promise<{
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
}> {
  const client = getConvexClient();

  const readData = async (key: string) => {
    const raw = await client.query(api.whatsappSession.get, {
      serviceKey: env.AGENT_SECRET,
      key,
    });
    if (!raw) return null;
    return JSON.parse(raw, BufferJSON.reviver);
  };

  const writeData = async (key: string, value: unknown) => {
    const data = JSON.stringify(value, BufferJSON.replacer);
    await client.mutation(api.whatsappSession.set, {
      serviceKey: env.AGENT_SECRET,
      key,
      data,
    });
  };

  const removeData = async (key: string) => {
    await client.mutation(api.whatsappSession.remove, {
      serviceKey: env.AGENT_SECRET,
      key,
    });
  };

  const creds = (await readData("creds")) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async <T extends keyof SignalDataTypeMap>(type: T, ids: string[]) => {
          const data: { [id: string]: SignalDataTypeMap[T] } = {};
          await Promise.all(
            ids.map(async (id) => {
              let value = await readData(`${type}-${id}`);
              if (type === "app-state-sync-key" && value) {
                value = proto.Message.AppStateSyncKeyData.fromObject(value);
              }
              data[id] = value;
            }),
          );
          return data;
        },
        set: async (data: SignalDataSet) => {
          const tasks: Promise<void>[] = [];
          for (const category of Object.keys(data) as (keyof SignalDataSet)[]) {
            const entries = data[category];
            if (!entries) continue;
            for (const id of Object.keys(entries)) {
              const value = entries[id];
              const key = `${category}-${id}`;
              tasks.push(value ? writeData(key, value) : removeData(key));
            }
          }
          await Promise.all(tasks);
        },
      },
    },
    saveCreds: () => writeData("creds", creds),
  };
}
