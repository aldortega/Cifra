import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";

import "./index.css";
import { JobPage } from "./pages/JobPage";
import { UploadPage } from "./pages/UploadPage";

const queryClient = new QueryClient();

const root = document.getElementById("root");
if (!root) throw new Error("No se encontró el elemento #root");

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<UploadPage />} />
          <Route path="/trabajos/:id" element={<JobPage />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
