import { test, expect } from "@playwright/test";

test("公開ビルドの全年度と画像・解説を読み込める", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("./");
  await expect(page.locator(".exam-list a")).toHaveCount(17);
  const links = await page
    .locator(".exam-list a")
    .evaluateAll((elements) =>
      elements.map((e) => ({
        href: e.getAttribute("href")!,
        title: e.textContent!.replace("→", "").trim(),
      })),
    );
  expect(links).toHaveLength(17);
  for (const link of links) {
    await page.goto(`./${link.href}`);
    await expect(
      page.getByRole("heading", { name: link.title, exact: true }),
    ).toBeVisible();
    await expect(page.locator(".question-numbers button")).toHaveCount(25);
    await expect
      .poll(() =>
        page
          .locator(".question-image img")
          .evaluate(
            (image: HTMLImageElement) =>
              image.complete && image.naturalWidth > 0,
          ),
      )
      .toBe(true);
    await page.getByRole("radio", { name: "ア", exact: true }).check();
    await page.getByRole("button", { name: "結果を確認", exact: true }).click();
    await expect(page.locator(".explanation")).toContainText(
      "IPAの公式解説ではありません",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  expect(errors).toEqual([]);
});

test("長い図表問題と2016年の出題不備を実データで表示できる", async ({
  page,
}) => {
  await page.goto("./#/exams/2025-r07-aki");
  await page.getByRole("button", { name: "問7、未選択", exact: true }).click();
  await page.getByRole("button", { name: "問7の問題画像を拡大" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "200%", exact: true }).click();
  await expect(page.locator(".zoom-scroll img")).toBeVisible();
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await page.goto("./#/exams/2016-h28-haru");
  await page
    .getByRole("button", { name: "問2、採点対象外", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "採点対象外の問題です" }),
  ).toBeVisible();
  await expect(
    page.getByRole("radio", { name: "ア", exact: true }),
  ).toBeDisabled();
});
