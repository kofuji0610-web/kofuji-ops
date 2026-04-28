import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { trpc } from "./lib/trpc";
import { ThemeProvider } from "./contexts/ThemeContext";
import { Toaster } from "./components/ui/sonner";
import App from "./App";
import "./index.css";
import superjson from "superjson";

// ─── QueryClient ───────────────────────────────────────────────────────────────
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

// 401 エラー時にログインページへリダイレクト
const UNAUTHORIZED_MESSAGE = "Please login (10001)";

const handleError = (error: unknown) => {
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    (error as { message: string }).message === UNAUTHORIZED_MESSAGE
  ) {
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
      window.location.href = "/login";
    }
  }
};

queryClient.getQueryCache().subscribe((event) => {
  if (event.type === "updated" && event.action.type === "error") {
    handleError(event.query.state.error);
    console.error("[API Query Error]", event.query.state.error);
  }
});

queryClient.getMutationCache().subscribe((event) => {
  if (event.type === "updated" && event.action.type === "error") {
    handleError(event.mutation.state.error);
    console.error("[API Mutation Error]", event.mutation.state.error);
  }
});

// ─── tRPC Client ───────────────────────────────────────────────────────────────
const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      fetch(url, options) {
        return globalThis.fetch(url, {
          ...(options ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

// ─── Root ──────────────────────────────────────────────────────────────────────
ReactDOM.createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="light">
        <Toaster />
        <App />
      </ThemeProvider>
    </QueryClientProvider>
  </trpc.Provider>
);
