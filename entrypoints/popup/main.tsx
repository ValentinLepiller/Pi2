import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import "../../src/lib/i18n";
import "../../src/app/styles.css";
import { App } from "../../src/app/App";
import { queryClient } from "../../src/app/client";
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>,
);
