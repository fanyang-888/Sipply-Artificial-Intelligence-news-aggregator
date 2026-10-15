import type { Metadata } from "next";
import { GapsClient } from "./gaps-client";

export const metadata: Metadata = { title: "Content gaps · Admin" };

export default function GapsPage() {
  return <GapsClient />;
}
