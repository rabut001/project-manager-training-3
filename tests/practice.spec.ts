import { test, expect } from "@playwright/test";

// Synthetic questions test the application's state transitions independently of the editorial data.
const fixture = {
  id: "test-exam",
  title: "動作確認用の試験",
  year: 2025,
  sourceUrl: "https://www.ipa.go.jp/",
  answerUrl: "https://www.ipa.go.jp/",
  questions: Array.from({ length: 25 }, (_, i) => ({
    no: i + 1,
    answer: "イ",
    image: "data/test-exam/q.png",
    explanation: "正解はイです。これは動作確認専用の説明です。",
    sourcePage: 1,
  })),
};

test.beforeEach(async ({ page }) => {
  await page.route("**/data/index.json", (route) =>
    route.fulfill({ json: [fixture] }),
  );
  await page.route("**/data/test-exam/exam.json", (route) =>
    route.fulfill({ json: fixture }),
  );
  await page.route("**/data/test-exam/q.png", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="700"><rect width="100%" height="100%" fill="white"/><text x="40" y="70" font-size="28">問1 テスト用の問題画像</text></svg>',
    }),
  );
  await page.goto("/");
  await page.getByRole("link", { name: fixture.title }).click();
  await expect(
    page.getByRole("heading", { name: fixture.title, exact: true }),
  ).toBeVisible();
});

test("解答・チェック・再開・一括採点・クリア", async ({ page }) => {
  await page.getByRole("radio", { name: "イ", exact: true }).check();
  await page.getByRole("button", { name: "結果を確認", exact: true }).click();
  await expect(page.getByRole("heading", { name: "○ 正解です" })).toBeVisible();
  await expect(
    page.getByRole("radio", { name: "ア", exact: true }),
  ).toBeDisabled();
  await page.getByRole("checkbox", { name: "あとで確認" }).check();
  await page.getByRole("button", { name: "次の問題", exact: true }).click();
  await page.getByRole("radio", { name: "ア", exact: true }).check();
  await page.reload();
  await expect(
    page.getByRole("radio", { name: "ア", exact: true }),
  ).toBeChecked();
  await expect(page.locator(".score strong")).toHaveText("100%");
  await page
    .getByRole("button", { name: "一括採点（1問）", exact: true })
    .click();
  await page.getByRole("button", { name: "採点する", exact: true }).click();
  await expect(page.locator(".score strong")).toHaveText("50%");
  await expect(
    page.getByRole("heading", { name: "× 不正解です" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "回答をすべてクリア", exact: true })
    .click();
  await page.getByRole("button", { name: "キャンセル", exact: true }).click();
  await expect(page.locator(".score strong")).toHaveText("50%");
  await page
    .getByRole("button", { name: "回答をすべてクリア", exact: true })
    .click();
  await page.getByRole("button", { name: "解答を消す", exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: "あとで確認" }),
  ).toBeChecked();
  await expect(page.locator(".score strong")).toHaveText("—");
  await expect(
    page.getByRole("button", { name: "結果を確認", exact: true }),
  ).toBeDisabled();
});

test("画像拡大と閉じる操作、横はみ出しなし", async ({ page }) => {
  await page.getByRole("button", { name: "問1の問題画像を拡大" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "200%", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "200%", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("保存が拒否されても演習を継続できる", async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("denied");
    };
  });
  await page.reload();
  await expect(
    page.getByText("進捗を保存できません。", { exact: false }),
  ).toBeVisible();
  await page.getByRole("radio", { name: "イ", exact: true }).check();
  await page.getByRole("button", { name: "結果を確認", exact: true }).click();
  await expect(page.getByRole("heading", { name: "○ 正解です" })).toBeVisible();
});

test("公式出題不備は選択・採点できず、チェックは保存できる", async ({
  page,
}) => {
  const invalidFixture = {
    ...fixture,
    questions: fixture.questions.map((q) =>
      q.no === 2
        ? {
            ...q,
            answer: null,
            invalidReason: "公式の出題不備のため、採点対象外とします。",
          }
        : q,
    ),
  };
  await page.route("**/data/test-exam/exam.json", (route) =>
    route.fulfill({ json: invalidFixture }),
  );
  await page.reload();
  await page.getByRole("radio", { name: "イ", exact: true }).check();
  await page.getByRole("button", { name: "次の問題", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "採点対象外の問題です", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("radio", { name: "ア", exact: true }),
  ).toBeDisabled();
  await page.getByRole("checkbox", { name: "あとで確認" }).check();
  await page
    .getByRole("button", { name: "一括採点（1問）", exact: true })
    .click();
  await page.getByRole("button", { name: "採点する", exact: true }).click();
  await expect(page.locator(".score strong")).toHaveText("100%");
  await expect(page.locator(".score small")).toHaveText("1 / 1 問正解");
  await page.reload();
  await expect(
    page.getByRole("checkbox", { name: "あとで確認" }),
  ).toBeChecked();
  await expect(
    page.getByRole("button", {
      name: "問2、採点対象外、チェック済み",
      exact: true,
    }),
  ).toHaveAttribute("aria-current", "step");
});

test("一覧とブラウザ履歴から同じ問に戻れる", async ({ page }) => {
  await page.getByRole("button", { name: "問10、未選択", exact: true }).click();
  await page.getByRole("radio", { name: "ウ", exact: true }).check();
  await page.getByRole("link", { name: "← 年度一覧", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "年度を選ぶ", exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(
    page.getByRole("button", { name: "問10、選択済み、未確認", exact: true }),
  ).toHaveAttribute("aria-current", "step");
  await expect(
    page.getByRole("radio", { name: "ウ", exact: true }),
  ).toBeChecked();
});
