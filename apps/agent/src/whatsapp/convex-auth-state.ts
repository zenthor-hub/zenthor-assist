import { api } from "@gbarros-assistant/backend/convex/_generated/api";
import type { AuthenticationState, SignalDataTypeMap } from "baileys";
import { initAuthCreds } from "baileys";

import { getConvexClient } from "../convex/client";

export async function getConvexAuthState(): Promise<{
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
}> {
  const client = getConvexClient();

  const readData = async (key: string): Promise<string | null> => {
    return await client.query(api.whatsappSession.get, { key });
  };

  const writeData = async (key: string, data: string): Promise<void> => {
    await client.mutation(api.whatsappSession.set, { key, data });
  };

  const removeData = async (key: string): Promise<void> => {
    await client.mutation(api.whatsappSession.remove, { key });
  };

  const credsRaw = await readData("creds");
  const creds = credsRaw ? JSON.parse(credsRaw) : initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async <T extends keyof SignalDataTypeMap>(type: T, ids: string[]) => {
          const data: { [id: string]: SignalDataTypeMap[T] } = {};
          for (const id of ids) {
            const raw = await readData(`${type}-${id}`);
            if (raw) {
              data[id] = JSON.parse(raw);
            }
          }
          return data;
        },
        set: async (data: Record<string, Record<string, unknown>>) => {
          for (const [category, entries] of Object.entries(data)) {
            for (const [id, value] of Object.entries(entries as Record<string, unknown>)) {
              const key = `${category}-${id}`;
              if (value) {
                await writeData(key, JSON.stringify(value));
              } else {
                await removeData(key);
              }
            }
          }
        },
      },
    },
    saveCreds: async () => {
      await writeData("creds", JSON.stringify(creds));
    },
  };
}
