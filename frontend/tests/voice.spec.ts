import { expect, test, type Page } from "@playwright/test";
import { expectClean, gotoHome, watch } from "./fixtures";

// Persona: hands-busy student driving the app by commands.
// Typed commands stand in for speech (pipeline verified separately).
// Measures intent-hit rate: first-try lands vs fallbacks.

async function ask(page: Page, text: string) {
  await page.getByRole("textbox", { name: "Ask the assistant" }).fill(text);
  await page.getByRole("button", { name: "Send" }).click();
}

test("voice student drives the app by command", async ({ page }) => {
  const log = watch(page);
  await gotoHome(page);
  // Open a session first so commands have context.
  await page.getByRole("button", { name: "Open" }).nth(1).click();
  await expect(page.getByRole("heading", { name: "What the exam will cover." })).toBeVisible({ timeout: 90_000 });

  await page.getByRole("button", { name: "Open assistant" }).click();
  await expect(page.getByText("Systems online")).toBeVisible();

  await ask(page, "open pages");
  await expect(page.getByText("Opening your pages.")).toBeVisible();
  await expect(page.getByText("General Study Notes").first()).toBeVisible({ timeout: 10_000 });

  await ask(page, "show planner");
  await expect(page.getByText("Opening the revision planner.")).toBeVisible();

  await ask(page, "note down spaced repetition beats cramming");
  await expect(page.getByText(/Noted:/)).toBeVisible();

  await ask(page, "open raft");
  await expect(page.getByText(/Opening CS 451/)).toBeVisible();

  expectClean(log);
});
