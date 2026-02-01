"use client";

import type { Id } from "@zenthor-assist/backend/convex/_generated/dataModel";
import { createContext, useContext } from "react";

type AppContextType = {
  userId: Id<"users">;
};

export const AppContext = createContext<AppContextType | null>(null);

export function useAppContext() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppContext must be used within AppLayout");
  return ctx;
}
