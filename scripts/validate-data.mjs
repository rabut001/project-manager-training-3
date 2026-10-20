import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

// csv.DictWriter output may contain commas, newlines, and escaped quotes in notes.
function csv(text) {
  const rows = [];
  let row = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && (c === "," || c === "\n")) {
      row.push(cell.replace(/\r$/, ""));
      cell = "";
      if (c === "\n") {
        if (row.some(Boolean)) rows.push(row);
        row = [];
      }
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell.replace(/\r$/, ""));
    rows.push(row);
  }
  if (quoted) throw new Error("閉じていないCSVの引用符");
  const header = rows.shift() || [];
  return rows.map((values) =>
    Object.fromEntries(header.map((h, i) => [h, values[i] || ""])),
  );
}
const errors = [];
function check(condition, message) {
  if (!condition) errors.push(message);
}
function json(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    errors.push(`${file}: 読み込めません`);
    return null;
  }
}
function digest(file) {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}
const text = (value) => typeof value === "string" && value.trim().length > 0;
const ipaUrl = (value) =>
  typeof value === "string" && /^https:\/\/www\.ipa\.go\.jp\//.test(value);
const manifest = json("sources/ipa/manifest.json") || [];
const index = json("public/data/index.json") || [];
check(manifest.length === 17, "初回収録範囲は17回です");
check(
  new Set(manifest.map((e) => e.year)).size === 17 &&
    manifest.every((e) => e.year >= 2009 && e.year <= 2025),
  "収録年度が2009〜2025年度と一致しません",
);
const expectedIndex = manifest
  .map(({ id, title, year }) => ({ id, title, year }))
  .sort((a, b) => b.year - a.year);
check(
  JSON.stringify(index) === JSON.stringify(expectedIndex),
  "年度一覧が原本台帳と一致しません。npm run sync:index を実行してください",
);
const extraction = new Map();
const reviews = new Map();
// A later change can record a fresh review without modifying a completed case.
for (const dir of fs
  .readdirSync("specs")
  .filter((d) => /^\d{4}-/.test(d))
  .sort()) {
  const caseKeys = new Set();
  for (const file of fs.readdirSync(`specs/${dir}`)) {
    if (file !== "extraction-review.csv" && !/^review-.*\.csv$/.test(file))
      continue;
    const target = file === "extraction-review.csv" ? extraction : reviews;
    for (const r of csv(fs.readFileSync(`specs/${dir}/${file}`, "utf8"))) {
      const key = `${r.exam_id}:${r.question}`;
      const typedKey = `${target === extraction ? "image" : "content"}:${key}`;
      check(!caseKeys.has(typedKey), `${dir}: 確認記録が重複: ${key}`);
      caseKeys.add(typedKey);
      target.set(key, r);
    }
  }
}
let count = 0,
  invalidCount = 0;
for (const entry of manifest) {
  for (const source of [entry.questions, entry.answers]) {
    check(ipaUrl(source.url), `${entry.id}: 出典URLがIPAではありません`);
    check(fs.existsSync(source.file), `${entry.id}: 原本PDFがありません`);
    if (fs.existsSync(source.file))
      check(
        digest(source.file) === source.sha256,
        `${entry.id}: 原本PDFのハッシュ不一致`,
      );
  }
  const exam = json(`public/data/${entry.id}/exam.json`);
  if (!exam) continue;
  check(
    exam.id === entry.id &&
      exam.title === entry.title &&
      exam.year === entry.year,
    `${entry.id}: 年度情報不一致`,
  );
  check(
    exam.sourceUrl === entry.questions.url &&
      exam.answerUrl === entry.answers.url,
    `${entry.id}: 原本URL不一致`,
  );
  check(
    Array.isArray(exam.questions) && exam.questions.length === 25,
    `${entry.id}: 問題数は25問必要です`,
  );
  for (const [i, q] of (exam.questions || []).entries()) {
    count++;
    const key = `${entry.id}:${q.no}`;
    check(q.no === i + 1, `${key}: 問番号が連番ではありません`);
    if (q.answer === null) {
      invalidCount++;
      check(
        entry.year === 2016 && q.no === 2 && text(q.invalidReason),
        `${key}: 出題不備の理由または対象が不正です`,
      );
    } else
      check(
        ["ア", "イ", "ウ", "エ"].includes(q.answer),
        `${key}: 正解が不正です`,
      );
    check(text(q.stem), `${key}: 校正済み問題文が空です`);
    check(
      ["ア", "イ", "ウ", "エ"].every((c) => text(q.choices?.[c])),
      `${key}: 校正済み選択肢が不足しています`,
    );
    check(text(q.explanation), `${key}: 解説が空です`);
    check(
      Number.isInteger(q.sourcePage) && q.sourcePage > 0,
      `${key}: 原本ページが不正です`,
    );
    const expectedImage = `data/${entry.id}/q${String(q.no).padStart(2, "0")}.png`;
    check(q.image === expectedImage, `${key}: 画像パス不一致`);
    const imageFile = path.join("public", expectedImage);
    check(fs.existsSync(imageFile), `${key}: 画像がありません`);
    const extractionRow = extraction.get(key);
    check(
      !!extractionRow?.image_review && !!extractionRow?.answer_review,
      `${key}: 原本照合の記録がありません`,
    );
    if (extractionRow && fs.existsSync(imageFile)) {
      check(
        digest(imageFile) === extractionRow.image_sha256,
        `${key}: 確認後に画像が変更されています`,
      );
      check(
        String(q.sourcePage) === extractionRow.source_page,
        `${key}: 確認記録と原本ページが違います`,
      );
      if (q.answer !== null)
        check(
          q.answer === extractionRow.official_answer,
          `${key}: 確認記録と公式正解が違います`,
        );
    }
    const review = reviews.get(key);
    check(
      review?.status === "reviewed" && text(review.review_basis),
      `${key}: 解説の確認記録が未完了です`,
    );
  }
}
check(
  count === 425 && invalidCount === 1,
  `425問（うち採点対象外1問）である必要があります: ${count}/${invalidCount}`,
);
if (errors.length) {
  console.error(errors.slice(0, 30).join("\n"));
  console.error(
    `検証NG: ${errors.length}件。未確認・未作成の教材は公開できません。`,
  );
  process.exitCode = 1;
} else
  console.log(
    `検証OK: ${manifest.length}回 ${count}問、原本・画像・正解・テキスト・解説確認記録。採点対象 ${count - invalidCount}問。`,
  );
