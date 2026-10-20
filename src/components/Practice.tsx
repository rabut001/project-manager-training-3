import { useEffect, useRef, useState } from "react";
import { assetUrl, CHOICES, type Exam } from "../lib/exam";
import {
  clearAnswers,
  confirmAnswers,
  emptyProgress,
  parseProgress,
  removeUnscorableAnswers,
  score,
  selectAnswer,
  storageKey,
  type Progress,
} from "../lib/progress";
import { Modal } from "./Modal";

export function Practice({ exam }: { exam: Exam }) {
  const [storageError, setStorageError] = useState(false);
  const [progress, setProgress] = useState<Progress>(() => {
    try {
      return removeUnscorableAnswers(
        parseProgress(localStorage.getItem(storageKey(exam.id))),
        exam.questions,
      );
    } catch {
      return emptyProgress();
    }
  });
  const [modal, setModal] = useState<"grade" | "clear" | "image" | null>(null);
  const [zoom, setZoom] = useState(1);
  const [imageFailed, setImageFailed] = useState(false);
  const result = useRef<HTMLElement>(null);
  const questionTitle = useRef<HTMLHeadingElement>(null);
  const dock = useRef<HTMLDivElement>(null);
  const main = useRef<HTMLDivElement>(null);
  const question = exam.questions[progress.currentNo - 1];
  const answer = progress.answers[question.no];
  const confirmed = !!answer?.confirmed;
  const invalid = question.answer === null;
  const checked = progress.checked.includes(question.no);
  const tally = score(progress, exam.questions);
  const pending = Object.values(progress.answers).filter(
    (a) => !a.confirmed,
  ).length;

  useEffect(() => {
    try {
      localStorage.setItem(storageKey(exam.id), JSON.stringify(progress));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [progress, exam.id]);

  // Reserve the actual toolbar height, including text zoom and mobile safe areas.
  useEffect(() => {
    const element = dock.current!;
    const update = () =>
      main.current?.style.setProperty(
        "--dock-height",
        `${element.getBoundingClientRect().height}px`,
      );
    const observer = new ResizeObserver(update);
    observer.observe(element);
    update();
    return () => observer.disconnect();
  }, []);

  function move(no: number) {
    if (no < 1 || no > 25 || no === question.no) return;
    setProgress((p) => ({ ...p, currentNo: no }));
    setImageFailed(false);
    requestAnimationFrame(() => {
      questionTitle.current?.focus({ preventScroll: true });
      questionTitle.current?.scrollIntoView({
        block: "start",
        behavior: "instant",
      });
    });
  }
  function confirm() {
    if (!answer || confirmed || invalid) return;
    setProgress((p) => confirmAnswers(p, question.no));
    requestAnimationFrame(() =>
      result.current?.focus({ preventScroll: false }),
    );
  }
  function toggleCheck() {
    setProgress((p) => ({
      ...p,
      checked: checked
        ? p.checked.filter((n) => n !== question.no)
        : [...p.checked, question.no].sort((a, b) => a - b),
    }));
  }
  function gradeAll() {
    setProgress((p) => confirmAnswers(p));
    setModal(null);
    if (answer && !confirmed)
      requestAnimationFrame(() => result.current?.focus());
  }
  return (
    <div className="practice" ref={main}>
      <header className="practice-header">
        <a className="back-link" href="#/">
          ← 年度一覧
        </a>
        <div className="exam-heading">
          <div>
            <p className="eyebrow">プロジェクトマネージャ · 午前Ⅱ</p>
            <h1>{exam.title}</h1>
          </div>
          <div className="score">
            <span>確認済みの正解率</span>
            <strong>
              {tally.percent === null ? "—" : `${tally.percent}%`}
            </strong>
            <small>
              {tally.correct} / {tally.total} 問正解
            </small>
          </div>
        </div>
        <nav className="question-numbers" aria-label="問題番号">
          {exam.questions.map((q) => {
            const a = progress.answers[q.no];
            const state = a?.confirmed
              ? a.choice === q.answer
                ? "correct"
                : "incorrect"
              : a
                ? "draft"
                : "";
            const flag = progress.checked.includes(q.no);
            const stateLabel =
              q.answer === null
                ? "採点対象外"
                : state === "correct"
                  ? "正解"
                  : state === "incorrect"
                    ? "誤答"
                    : state === "draft"
                      ? "選択済み、未確認"
                      : "未選択";
            return (
              <button
                key={q.no}
                className={`number ${state} ${q.no === question.no ? "current" : ""}`}
                aria-current={q.no === question.no ? "step" : undefined}
                aria-label={`問${q.no}、${stateLabel}${flag ? "、チェック済み" : ""}`}
                onClick={() => move(q.no)}
              >
                <span>{q.no}</span>
                <span className="marks" aria-hidden="true">
                  {q.answer === null
                    ? "—"
                    : a?.confirmed
                      ? state === "correct"
                        ? "○"
                        : "×"
                      : ""}
                  {flag ? " ✓" : ""}
                </span>
              </button>
            );
          })}
        </nav>
        <p className="number-legend">
          <span>○ 正解</span>
          <span>× 誤答</span>
          <span>✓ チェック</span>
          <span className="draft-legend">金枠：未確認</span>
        </p>
      </header>

      {storageError && (
        <p className="notice" role="status">
          進捗を保存できません。このまま演習できますが、画面を閉じると記録が失われます。
        </p>
      )}
      <main id="main-content">
        <section className="question-section" aria-labelledby="question-title">
          <div className="question-heading">
            <h2 id="question-title" tabIndex={-1} ref={questionTitle}>
              問{question.no}
              <span> / 25</span>
            </h2>
            <label className={`check-label ${checked ? "is-checked" : ""}`}>
              <input type="checkbox" checked={checked} onChange={toggleCheck} />
              あとで確認
            </label>
          </div>
          <button
            className="question-image"
            onClick={() => {
              setZoom(1);
              setModal("image");
            }}
            aria-label={`問${question.no}の問題画像を拡大`}
          >
            {imageFailed ? (
              <span className="image-error">
                画像を読み込めませんでした。原本PDFをご確認ください。
              </span>
            ) : (
              <img
                key={question.image}
                src={assetUrl(question.image)}
                alt={`${exam.title} 問${question.no}の問題文・選択肢`}
                onError={() => setImageFailed(true)}
              />
            )}
          </button>
          <p className="image-hint">画像をタップして拡大できます</p>
        </section>

        {(confirmed || invalid) && (
          <section
            className="result"
            ref={result}
            tabIndex={-1}
            aria-labelledby="result-title"
          >
            <div
              className={`result-heading ${invalid ? "unscorable" : answer?.choice === question.answer ? "correct" : "incorrect"}`}
            >
              <h2 id="result-title">
                {invalid
                  ? "採点対象外の問題です"
                  : answer?.choice === question.answer
                    ? "○ 正解です"
                    : "× 不正解です"}
              </h2>
              {invalid ? (
                <p>{question.invalidReason}</p>
              ) : (
                <p>
                  正解 <strong>{question.answer}</strong>
                  <span>あなたの解答：{answer?.choice}</span>
                </p>
              )}
            </div>
            <div className="explanation">
              <h3>解説</h3>
              {question.explanation
                .split(/\n+/)
                .filter(Boolean)
                .map((paragraph, i) => (
                  <p key={i}>{paragraph}</p>
                ))}
              <p className="official-note">
                この解説は学習用に作成したもので、IPAの公式解説ではありません。
              </p>
            </div>
          </section>
        )}

        <section className="session-actions" aria-label="この回の操作">
          <button onClick={() => setModal("grade")} disabled={pending === 0}>
            一括採点{pending > 0 ? `（${pending}問）` : ""}
          </button>
          <button className="text-button" onClick={() => setModal("clear")}>
            回答をすべてクリア
          </button>
        </section>
        <footer className="exam-source">
          <p>
            出典：{exam.title} プロジェクトマネージャ試験 午前Ⅱ 問{question.no}
          </p>
          <a
            href={`${exam.sourceUrl}${question.sourcePage ? `#page=${question.sourcePage}` : ""}`}
            target="_blank"
            rel="noreferrer"
          >
            問題冊子（IPA・PDF） ↗
          </a>
          <span aria-hidden="true"> · </span>
          <a href={exam.answerUrl} target="_blank" rel="noreferrer">
            公式正解（PDF） ↗
          </a>
          <p>進捗はこのブラウザに保存されます。</p>
        </footer>
      </main>

      <div className="answer-dock" ref={dock}>
        <div className="answer-dock-inner">
          <fieldset className="choices" disabled={confirmed || invalid}>
            <legend className="sr-only">問{question.no}の解答</legend>
            {CHOICES.map((choice) => (
              <label
                key={choice}
                className={`choice ${answer?.choice === choice ? "selected" : ""} ${confirmed || invalid ? "locked" : ""}`}
              >
                <input
                  type="radio"
                  name={`answer-${question.no}`}
                  value={choice}
                  checked={answer?.choice === choice}
                  onChange={() =>
                    setProgress((p) => selectAnswer(p, question.no, choice))
                  }
                />
                <span>{choice}</span>
              </label>
            ))}
          </fieldset>
          <div className="answer-controls">
            <button
              aria-label="前の問題"
              onClick={() => move(question.no - 1)}
              disabled={question.no === 1}
            >
              ← 前へ
            </button>
            <button
              className="primary"
              onClick={confirm}
              disabled={!answer || confirmed || invalid}
            >
              {invalid ? "採点対象外" : confirmed ? "確認済み" : "結果を確認"}
            </button>
            <button
              aria-label="次の問題"
              onClick={() => move(question.no + 1)}
              disabled={question.no === 25}
            >
              次へ →
            </button>
          </div>
        </div>
      </div>

      {modal === "grade" && (
        <Modal
          title="選択済みの問題を採点します"
          onClose={() => setModal(null)}
        >
          <p>
            選択済み・未確認の{pending}
            問を採点します。採点後は解答を変更できません。未選択の問題とチェックはそのまま残します。
          </p>
          <div className="modal-actions">
            <button onClick={() => setModal(null)}>キャンセル</button>
            <button className="primary" onClick={gradeAll}>
              採点する
            </button>
          </div>
        </Modal>
      )}
      {modal === "clear" && (
        <Modal title="この回の解答を消します" onClose={() => setModal(null)}>
          <p>
            {exam.title}
            の確認済みの解答と、まだ確認していない選択を消して、問1に戻ります。チェックは残します。他の回には影響しません。
          </p>
          <div className="modal-actions">
            <button onClick={() => setModal(null)}>キャンセル</button>
            <button
              className="danger"
              onClick={() => {
                setProgress((p) => clearAnswers(p));
                setImageFailed(false);
                setModal(null);
                window.scrollTo({ top: 0 });
              }}
            >
              解答を消す
            </button>
          </div>
        </Modal>
      )}
      {modal === "image" && (
        <Modal
          title={`問${question.no}の問題画像`}
          wide
          onClose={() => setModal(null)}
        >
          <div className="zoom-controls" aria-label="画像の表示倍率">
            {[1, 1.5, 2].map((value) => (
              <button
                key={value}
                aria-pressed={zoom === value}
                onClick={() => setZoom(value)}
              >
                {value === 1 ? "全体" : `${value * 100}%`}
              </button>
            ))}
          </div>
          <div
            className="zoom-scroll"
            tabIndex={0}
            role="region"
            aria-label="拡大した問題画像。スクロールして全体を確認できます。"
          >
            <img
              src={assetUrl(question.image)}
              alt={`${exam.title} 問${question.no}の問題文・選択肢`}
              style={{ width: `${zoom * 100}%` }}
            />
          </div>
        </Modal>
      )}
    </div>
  );
}
