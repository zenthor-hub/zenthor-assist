import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    AXIOM_TOKEN: z.string().min(1).optional(),
    AXIOM_DATASET: z.string().min(1).optional(),
    OBS_ENABLED: z
      .enum(["true", "false"])
      .optional()
      .transform((value) => value !== "false"),
    OBS_SAMPLE_RATE: z.coerce.number().min(0).max(1).optional().default(1),
    OBS_LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).optional().default("info"),
    OBS_INCLUDE_CONTENT: z
      .enum(["true", "false"])
      .optional()
      .transform((value) => value === "true"),
  },
  client: {
    NEXT_PUBLIC_CONVEX_URL: z.url(),
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1),
  },
  runtimeEnv: {
    AXIOM_TOKEN: process.env.AXIOM_TOKEN,
    AXIOM_DATASET: process.env.AXIOM_DATASET,
    OBS_ENABLED: process.env.OBS_ENABLED,
    OBS_SAMPLE_RATE: process.env.OBS_SAMPLE_RATE,
    OBS_LOG_LEVEL: process.env.OBS_LOG_LEVEL,
    OBS_INCLUDE_CONTENT: process.env.OBS_INCLUDE_CONTENT,
    NEXT_PUBLIC_CONVEX_URL: process.env.NEXT_PUBLIC_CONVEX_URL,
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  },
  emptyStringAsUndefined: true,
});
