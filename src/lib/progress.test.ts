import { describe, expect, it } from "vitest";
import {
  clearAnswers,
  confirmAnswers,
  emptyProgress,
  parseProgress,
  removeUnscorableAnswers,
  score,
  selectAnswer,
  storageKey,
} from "./progress";
import type { Question } from "./exam";

const questions: Question[] = [
  { no: 1, answer: "イ", image: "", explanation: "" },
  { no: 2, answer: "ア", image: "", explanation: "" },
  { no: 3, answer: "エ", image: "", explanation: "" },
];
describe("学習の状態", () => {
  it("確認前は変更でき、確認後は変更できない", () => {
    let p = selectAnswer(emptyProgress(), 1, "ア");
    p = selectAnswer(p, 1, "イ");
    expect(p.answers[1].choice).toBe("イ");
    p = confirmAnswers(p, 1);
    expect(selectAnswer(p, 1, "ウ")).toBe(p);
  });
  it("一括採点は未選択を追加せず、確認済みを保持する", () => {
    let p = confirmAnswers(selectAnswer(emptyProgress(), 1, "イ"), 1);
    p = selectAnswer(p, 2, "ウ");
    p = confirmAnswers(p);
    expect(p.answers).toEqual({
      1: { choice: "イ", confirmed: true },
      2: { choice: "ウ", confirmed: true },
    });
    expect(score(p, questions)).toEqual({ correct: 1, total: 2, percent: 50 });
  });
  it("未確認の選択は正解率の分母に入れない", () => {
    expect(
      score(selectAnswer(emptyProgress(), 1, "イ"), questions).percent,
    ).toBeNull();
  });
  it("出題不備は過去の保存に解答があっても採点から除外する", () => {
    const invalidQuestions: Question[] = [
      ...questions,
      {
        no: 4,
        answer: null,
        invalidReason: "公式の出題不備",
        image: "",
        explanation: "",
      },
    ];
    const p = confirmAnswers(
      selectAnswer(selectAnswer(emptyProgress(), 1, "イ"), 4, "ウ"),
    );
    expect(score(p, invalidQuestions)).toEqual({
      total: 1,
      correct: 1,
      percent: 100,
    });
    expect(
      removeUnscorableAnswers(
        { ...p, currentNo: 4, checked: [4] },
        invalidQuestions,
      ),
    ).toEqual({
      version: 1,
      currentNo: 4,
      checked: [4],
      answers: { 1: { choice: "イ", confirmed: true } },
    });
  });
  it("クリアしてもチェックを残し、問1へ戻る", () => {
    const p = {
      ...selectAnswer(emptyProgress(), 1, "イ"),
      currentNo: 3,
      checked: [2, 3],
    };
    expect(clearAnswers(p)).toEqual({ ...emptyProgress(), checked: [2, 3] });
    expect(p.currentNo).toBe(3);
  });
  it("保存と再読込で未確認・確認済み・現在問・チェックが保たれる", () => {
    let p = confirmAnswers(selectAnswer(emptyProgress(), 1, "イ"), 1);
    p = { ...selectAnswer(p, 2, "ウ"), currentNo: 3, checked: [1, 3] };
    expect(parseProgress(JSON.stringify(p))).toEqual(p);
    expect(storageKey("2025-r07-aki")).not.toBe(storageKey("2024-r06-aki"));
  });
  it("破損値や未知のバージョンで停止しない", () => {
    for (const raw of ["{", "null", "[]", '{"version":2}', null])
      expect(parseProgress(raw)).toEqual(emptyProgress());
    expect(
      parseProgress(
        JSON.stringify({
          version: 1,
          currentNo: 99,
          checked: [1, 1, "2", 26],
          answers: {
            0: { choice: "ア", confirmed: true },
            1: { choice: "オ", confirmed: false },
            2: { choice: "イ", confirmed: true },
            3: null,
          },
        }),
      ),
    ).toEqual({
      ...emptyProgress(),
      checked: [1],
      answers: { 2: { choice: "イ", confirmed: true } },
    });
  });
});
