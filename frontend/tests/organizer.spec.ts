import { expect, test } from "@playwright/test";
import { expectClean, gotoHome, openPagesFor, reactFill, watch } from "./fixtures";

// Persona: steady reviser building a study system, never sits an exam.
// Proves every pages feature; counts steps (friction = steps per task).

test("organizer builds and keeps a study system", async ({ page }) => {
  const log = watch(page);
  await gotoHome(page);
  await openPagesFor(page, 1);

  // 1. Template page from the sidebar.
  await page.getByRole("button", { name: "New page" }).click();
  await page.getByRole("button", { name: /Misconception card/ }).click();
  await expect(page.locator("#page-title")).toHaveValue("Untitled trap", { timeout: 10_000 });

  // 2. Tracker: add a row, set status, persists across reload.
  await page.getByRole("button", { name: /Misconceptions/ }).first().click();
  await page.getByRole("button", { name: "Add row" }).click();
  const topics = page.getByRole("textbox", { name: /Topic row \d+/ });
  const before = await topics.count();
  await topics.last().fill("Follower commits on vote request");
  await page.getByRole("textbox", { name: /Trap row \d+/ }).last().fill("thought followers decide");
  await page.getByRole("combobox", { name: /Status row \d+/ }).last().selectOption("Learning");
  await expect(page.getByText("Saved")).toBeVisible({ timeout: 10_000 });
  expect(before).toBeGreaterThan(0);

  await page.reload();
  await gotoHome(page);
  await openPagesFor(page, 1);
  await page.getByRole("button", { name: /Misconceptions/ }).first().click();
  await expect(page.getByRole("textbox", { name: /Topic row \d+/ }).last()).toHaveValue("Follower commits on vote request", { timeout: 10_000 });

  // 3. Board view groups the card and remembers the view.
  await page.getByRole("tab", { name: "Board" }).click();
  await expect(page.getByLabel(/Learning: \d+ cards?/)).toBeVisible();
  await page.reload();
  await gotoHome(page);
  await openPagesFor(page, 1);
  await page.getByRole("button", { name: /Misconceptions/ }).first().click();
  await expect(page.getByRole("tab", { name: "Board", selected: true })).toBeVisible({ timeout: 10_000 });

  // 4. Wikilink round-trip: notes -> tracker -> back via "Linked from".
  await page.getByRole("tab", { name: "Table" }).click();
  await page.getByRole("button", { name: /General Study Notes/ }).first().click();
  const current = await page.locator("#page-content").inputValue();
  await reactFill(page, "#page-content", `${current}\n\nSee also [[Misconceptions & Traps Tracker]].`);
  await expect(page.getByText("Saved")).toBeVisible({ timeout: 10_000 });
  const linkBtn = page.locator('[aria-label="Outgoing page links"] button').first();
  await expect(linkBtn).toBeVisible();
  await linkBtn.click();
  await expect(page.getByText("Linked from:")).toBeVisible();

  // 5. Pin reorders the sidebar; search narrows it.
  await reactFill(page, "#page-search", "");
  const pinBtn = page.getByRole("button", { name: /pin Misconceptions/i }).first();
  await expect(pinBtn).toBeVisible({ timeout: 10_000 });
  if ((await pinBtn.getAttribute("aria-label"))?.startsWith("Pin ")) await pinBtn.click();
  await expect.poll(async () => page.locator(".page-item .t").first().textContent(), { timeout: 10_000 }).toContain("Misconceptions");
  await reactFill(page, "#page-search", "trap tracker");
  await expect(page.locator(".page-item")).toHaveCount(1);

  expectClean(log);
});
