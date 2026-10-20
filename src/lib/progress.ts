import { isChoice, type Choice, type Question } from "./exam";

export type Answer = { choice: Choice; confirmed: boolean };
export type Progress = {
  version: 1;
  currentNo: number;
  answers: Record<number, Answer>;
  checked: number[];
};
export const emptyProgress = (): Progress => ({
  version: 1,
  currentNo: 1,
  answers: {},
  checked: [],
});
export const storageKey = (id: string) => `pm-am2:v1:${id}`;
const validNo = (value: unknown): value is number =>
  Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 25;

export function parseProgress(raw: string | null): Progress {
  const fallback = emptyProgress();
  if (!raw) return fallback;
  try {
    const p = JSON.parse(raw);
    if (!p || p.version !== 1) return fallback;
    const answers: Progress["answers"] = {};
    if (p.answers && typeof p.answers === "object") {
      for (const [key, item] of Object.entries(p.answers)) {
        const a = item as Partial<Answer> | null;
        if (
          validNo(Number(key)) &&
          a &&
          isChoice(a.choice) &&
          typeof a.confirmed === "boolean"
        ) {
          answers[Number(key)] = { choice: a.choice, confirmed: a.confirmed };
        }
      }
    }
    return {
      version: 1,
      currentNo: validNo(p.currentNo) ? p.currentNo : 1,
      answers,
      checked: Array.isArray(p.checked)
        ? [...new Set<number>(p.checked.filter(validNo))].sort((a, b) => a - b)
        : [],
    };
  } catch {
    return fallback;
  }
}
export function selectAnswer(
  p: Progress,
  no: number,
  choice: Choice,
): Progress {
  if (!validNo(no) || p.answers[no]?.confirmed) return p;
  return {
    ...p,
    answers: { ...p.answers, [no]: { choice, confirmed: false } },
  };
}
export function confirmAnswers(p: Progress, only?: number): Progress {
  return {
    ...p,
    answers: Object.fromEntries(
      Object.entries(p.answers).map(([no, a]) => [
        no,
        only === undefined || Number(no) === only
          ? { ...a, confirmed: true }
          : a,
      ]),
    ),
  };
}
export function clearAnswers(p: Progress): Progress {
  return { ...emptyProgress(), checked: [...p.checked] };
}
export function removeUnscorableAnswers(
  p: Progress,
  questions: Question[],
): Progress {
  const scorable = new Set(
    questions.filter((q) => q.answer !== null).map((q) => q.no),
  );
  return {
    ...p,
    answers: Object.fromEntries(
      Object.entries(p.answers).filter(([no]) => scorable.has(Number(no))),
    ),
  };
}
export function score(p: Progress, questions: Question[]) {
  const graded = questions.filter(
    (q) => q.answer !== null && p.answers[q.no]?.confirmed,
  );
  const correct = graded.filter(
    (q) => p.answers[q.no].choice === q.answer,
  ).length;
  return {
    total: graded.length,
    correct,
    percent: graded.length ? Math.round((correct / graded.length) * 100) : null,
  };
}
