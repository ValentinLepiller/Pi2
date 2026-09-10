import { QueryClient, queryOptions } from "@tanstack/react-query";
import { request } from "../lib/messages";
import type { Configuration, PublicConnection, SessionSummary } from "../lib/models";
export type AppState = {
  configuration: Configuration;
  connections: PublicConnection[];
  sessions: SessionSummary[];
  shortcutError?: { tabId: number; message: string } | null;
  shortcut: string;
};
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: true },
    mutations: { retry: false },
  },
});
export const stateQuery = () =>
  queryOptions({
    queryKey: ["extension-state"],
    queryFn: () => request<AppState>({ type: "state" }),
    refetchInterval: 3000,
  });
