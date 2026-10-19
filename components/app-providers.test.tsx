import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AppProviders } from "./app-providers";

describe("AppProviders", () => {
  it("keeps the page visible in the server HTML, so it shows before scripts run and without them", () => {
    const html = renderToString(
      <AppProviders lang="en">
        <main>Today in AI</main>
      </AppProviders>,
    );
    const wrappers = html.slice(0, html.indexOf("<main>"));
    expect(wrappers).not.toMatch(/opacity-0|invisible|visibility:\s*hidden|display:\s*none|hidden=""/);
  });
});
