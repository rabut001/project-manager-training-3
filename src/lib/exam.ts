export const CHOICES = ["ア", "イ", "ウ", "エ"] as const;
export type Choice = (typeof CHOICES)[number];
export type ExamSummary = { id: string; title: string; year: number };
export type Question = {
  no: number;
  answer: Choice | null;
  invalidReason?: string;
  image: string;
  stem?: string;
  choices?: Record<string, string>;
  explanation: string;
  sourcePage?: number;
};
export type Exam = ExamSummary & {
  sourceUrl: string;
  answerUrl: string;
  questions: Question[];
};
export function isChoice(value: unknown): value is Choice {
  return CHOICES.includes(value as Choice);
}
export function assetUrl(path: string): string {
  if (!/^data\/[a-zA-Z0-9_./-]+$/.test(path) || path.includes(".."))
    throw new Error("画像のパスが不正です。");
  return `${import.meta.env.BASE_URL}${path}`;
}
const cache = new Map<string, Exam>();
export async function loadExam(id: string): Promise<Exam> {
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error("この回はありません。");
  if (cache.has(id)) return cache.get(id)!;
  const response = await fetch(
    `${import.meta.env.BASE_URL}data/${id}/exam.json`,
  );
  if (!response.ok)
    throw new Error("問題を読み込めませんでした。通信状態をご確認ください。");
  const data: Exam = await response.json();
  if (
    !data ||
    data.id !== id ||
    !Array.isArray(data.questions) ||
    data.questions.length !== 25 ||
    data.questions.some(
      (q, i) =>
        !q ||
        q.no !== i + 1 ||
        !(
          isChoice(q.answer) ||
          (q.answer === null &&
            typeof q.invalidReason === "string" &&
            q.invalidReason.trim())
        ) ||
        typeof q.image !== "string" ||
        !q.image ||
        typeof q.explanation !== "string" ||
        !q.explanation.trim(),
    )
  ) {
    throw new Error("この回の問題データを確認できませんでした。");
  }
  cache.set(id, data);
  return data;
}
