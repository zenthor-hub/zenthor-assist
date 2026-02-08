import type { useUser } from "@clerk/nextjs";

/**
 * Clerk user type extracted from the useUser hook return type.
 * Used across profile settings components.
 */
export type ClerkUser = NonNullable<ReturnType<typeof useUser>["user"]>;
