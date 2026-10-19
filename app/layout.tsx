import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./style.css";

export const metadata: Metadata = {
  title: "TasteGate AI · The cultural quality gate for AI agents",
  description: "Audit, repair and verify AI-generated recommendations with evidence-backed Qloo cultural data.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1 };
export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
