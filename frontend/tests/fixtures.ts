import { expect, type Page } from "@playwright/test";

// Shared harness for student journeys: every test starts clean and ends
// asserting zero console errors and zero failed API calls.

export type JourneyLog = {
  errors: string[];
  failedRequests: string[];
};

export function watch(page: Page): JourneyLog {
  const log: JourneyLog = { errors: [], failedRequests: [] };
  page.on("console", (msg) => {
    if (msg.type() === "error") log.errors.push(msg.text().slice(0, 200));
  });
  page.on("pageerror", (err) => log.errors.push(String(err).slice(0, 200)));
  page.on("response", (res) => {
    if (res.url().includes("/api/") && res.status() >= 400) {
      log.failedRequests.push(`${res.status()} ${res.url().split("/api/")[1]}`);
    }
  });
  return log;
}

export function expectClean(log: JourneyLog) {
  expect(log.errors, `console errors: ${log.errors.join(" | ")}`).toEqual([]);
  expect(log.failedRequests, `failed API: ${log.failedRequests.join(" | ")}`).toEqual([]);
}

export async function gotoHome(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "New session" })).toBeVisible();
}

// Open the Pages view for the nth session card's "Pages" button.
export async function openPagesFor(page: Page, index: number) {
  await page.getByRole("button", { name: "Pages" }).nth(index).click();
  await expect(page.getByText("General Study Notes").first()).toBeVisible({ timeout: 15000 });
}

// Type into a React-controlled input (bypasses the need for native setters).
export async function reactFill(page: Page, selector: string, value: string) {
  await page.evaluate(
    ([sel, val]) => {
      const el = document.querySelector(sel) as HTMLInputElement | HTMLTextAreaElement | null;
      if (!el) throw new Error(`missing ${sel}`);
      const desc = Object.getOwnPropertyDescriptor(el.constructor.prototype, "value");
      desc?.set?.call(el, val);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    },
    [selector, value],
  );
}
