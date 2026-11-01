import { expect, test } from "@playwright/test";
import { expectClean, gotoHome, watch } from "./fixtures";

// Persona: exam tomorrow, needs a grade fast.
// Proves the whole loop; records stage timings (the behavior datum).

test(
  "crammer completes the full exam loop",
  { tag: "@model" },
  async ({ page }) => {
    test.setTimeout(420_000);
    const log = watch(page);
    const t = { start: Date.now(), blueprint: 0, generated: 0, graded: 0 };

    await gotoHome(page);
    await page.getByRole("button", { name: "New session" }).click();
    await page.getByRole("button", { name: /Raft consensus/ }).click();
    await expect(
      page.getByRole("heading", { name: "What the exam will cover." }),
    ).toBeVisible({ timeout: 90_000 });
    t.blueprint = Date.now();

    await page.getByRole("button", { name: "Generate the diagnostic exam" }).click();
    // Generation can fail at the model/verification layer — surface the app's
    // own error text instead of timing out blindly. The exam pager (not the
    // Submit button, which only appears on the last question) proves load.
    await Promise.race([
      expect(page.getByText(/Diagnostic exam · question 1 of/)).toBeVisible({ timeout: 180_000 }),
      expect(page.getByRole("alert")).toBeVisible({ timeout: 180_000 }),
    ]);
    const alert = await page.getByRole("alert").count();
    if (alert > 0) {
      const text = await page.getByRole("alert").first().textContent();
      throw new Error(`generation failed in-app: ${text}`);
    }
    t.generated = Date.now();

    // Answer everything; alternate confidence to exercise both diagnostic paths.
    // The pager shows Next on all but the last question, where Submit appears.
    for (let qi = 0; qi < 8; qi++) {
      await page.locator("button.option").first().click();
      await page.getByRole("button", { name: qi % 2 === 0 ? "Confident" : "Guessing", exact: true }).click();
      const next = page.getByRole("button", { name: "Next question" });
      if ((await next.count()) === 0) break;
      await next.click();
    }
    await page.getByRole("button", { name: "Submit exam" }).click();
    await expect(
      page.getByRole("heading", { name: "The exam knew which kind of wrong you were." }),
    ).toBeVisible({ timeout: 60_000 });
    t.graded = Date.now();

    console.log(
      JSON.stringify({
        persona: "crammer",
        ms_to_blueprint: t.blueprint - t.start,
        ms_to_generate: t.generated - t.blueprint,
        ms_to_grade: t.graded - t.generated,
      }),
    );

    // Remediation only unlocks with weak topics; don't force it.
    const buildBtn = page.getByRole("button", { name: "Build remediation and retest" });
    if (await buildBtn.isEnabled()) {
      await buildBtn.click();
      await expect(
        page.getByRole("heading", { name: "Target the misconception, not the topic." }),
      ).toBeVisible({ timeout: 60_000 });
      for (const name of [/true principle/, /source quote/]) {
        for (const box of await page.getByRole("checkbox", { name }).all()) {
          await box.check();
        }
      }
      await page.getByRole("button", { name: "Start targeted retest" }).click();
      await expect(page.getByRole("button", { name: "Submit exam" })).toBeVisible({ timeout: 120_000 });
    }

    expectClean(log);
  },
);
