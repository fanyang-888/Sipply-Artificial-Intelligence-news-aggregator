import type { Metadata } from "next";
import { AiCitationsClient } from "./ai-citations-client";

export const metadata: Metadata = { title: "AI citations · Admin" };

export default function AiCitationsPage() {
  return <AiCitationsClient />;
}
