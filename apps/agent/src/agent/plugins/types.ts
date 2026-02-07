import type { Tool } from "ai";

export interface RuntimePlugin {
  name: string;
  version: string;
  source: string;
  tools: Record<string, Tool>;
}

export interface ResolvedPluginTools {
  tools: Record<string, Tool>;
  policy?: {
    allow?: string[];
    deny?: string[];
  };
}
