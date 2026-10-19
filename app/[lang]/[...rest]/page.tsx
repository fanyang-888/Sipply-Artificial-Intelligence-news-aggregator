import { notFound } from "next/navigation";

/** Any other address: the page's language's not-found page (app/[lang]/not-found.tsx). */
export default function UnknownPage() {
  notFound();
}
