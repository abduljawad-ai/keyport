// Application routes (spec Part 4 §6).

import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppShell } from "@/app/App";
import { PublicOnly, RequireAuth } from "@/app/RouteGuards";
import { AuthPage } from "@/pages/AuthPage";
import { ChatPage } from "@/pages/ChatPage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { UsagePage } from "@/pages/UsagePage";
import { AccountSettings } from "@/features/settings/ui/AccountSettings";
import { AppearanceSettings } from "@/features/settings/ui/AppearanceSettings";
import { ProviderSettings } from "@/features/settings/ui/ProviderSettings";

export const router = createBrowserRouter([
  {
    path: "/auth",
    element: (
      <PublicOnly>
        <AuthPage />
      </PublicOnly>
    ),
  },
  {
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [
      { path: "/chat", element: <ChatPage /> },
      { path: "/chat/:conversationId", element: <ChatPage /> },
      {
        path: "/settings",
        element: <SettingsPage />,
        children: [
          { index: true, element: <Navigate to="providers" replace /> },
          { path: "providers", element: <ProviderSettings /> },
          { path: "account", element: <AccountSettings /> },
          { path: "appearance", element: <AppearanceSettings /> },
        ],
      },
      { path: "/usage", element: <UsagePage /> },
    ],
  },
  { path: "/", element: <Navigate to="/chat" replace /> },
  { path: "*", element: <NotFoundPage /> },
]);
