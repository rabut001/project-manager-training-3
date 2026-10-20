import { useEffect, useState } from "react";
import { Practice } from "./components/Practice";
import { loadExam, type Exam, type ExamSummary } from "./lib/exam";

function currentId() {
  const hash = window.location.hash;
  if (hash === "" || hash === "#" || hash === "#/") return null;
  return /^#\/exams\/([a-z0-9-]+)$/.exec(hash)?.[1] ?? "invalid";
}

export function App() {
  const [id, setId] = useState(currentId);
  const [catalog, setCatalog] = useState<ExamSummary[] | null>(null);
  const [exam, setExam] = useState<Exam | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const change = () => {
      setId(currentId());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  useEffect(() => {
    let active = true;
    setError("");
    setExam(null);
    if (id === null) {
      fetch(`${import.meta.env.BASE_URL}data/index.json`)
        .then(async (response) => {
          if (!response.ok) throw new Error("年度一覧を読み込めませんでした。");
          const data = await response.json();
          const list = Array.isArray(data) ? data : data.exams;
          if (
            !Array.isArray(list) ||
            !list.every(
              (item: ExamSummary) =>
                /^[a-z0-9-]+$/.test(item.id) &&
                typeof item.title === "string" &&
                Number.isInteger(item.year),
            )
          ) {
            throw new Error("年度一覧の形式を確認できませんでした。");
          }
          if (active) setCatalog([...list].sort((a, b) => b.year - a.year));
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    } else {
      loadExam(id)
        .then((data) => {
          if (active) setExam(data);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    }
    return () => {
      active = false;
    };
  }, [id, attempt]);
  useEffect(() => {
    document.title = exam
      ? `${exam.title}｜PM 午前Ⅱ 過去問演習`
      : "プロジェクトマネージャ 午前Ⅱ 過去問演習";
  }, [exam]);

  if (error)
    return (
      <main className="status-panel">
        <p className="eyebrow">PM 過去問演習</p>
        <h1>読み込みを確認してください</h1>
        <p role="alert">{error}</p>
        <div className="status-actions">
          <button onClick={() => setAttempt((a) => a + 1)}>再試行</button>
          <a href="#/">年度一覧へ戻る</a>
        </div>
      </main>
    );
  if (id !== null)
    return exam ? (
      <Practice key={exam.id} exam={exam} />
    ) : (
      <main className="status-panel" role="status">
        問題を読み込んでいます…
      </main>
    );
  return (
    <main className="home" id="main-content">
      <header className="home-header">
        <span className="brand-mark" aria-hidden="true">
          PM
        </span>
        <p className="eyebrow">PROJECT MANAGER</p>
        <h1>
          プロジェクトマネージャ<span>午前Ⅱ 過去問演習</span>
        </h1>
        <p className="intro">年度を選んで、1問ずつ。</p>
        <p className="subtitle">
          問題を解き、解説で確かめる。続きはいつでも、このブラウザから。
        </p>
      </header>
      <section aria-labelledby="years-title">
        <div className="list-heading">
          <h2 id="years-title">年度を選ぶ</h2>
          <span>{catalog ? `${catalog.length}回分` : ""}</span>
        </div>
        {catalog ? (
          <nav aria-label="試験の回">
            <ul className="exam-list">
              {catalog.map((item) => (
                <li key={item.id}>
                  <a href={`#/exams/${item.id}`}>
                    <span>{item.title}</span>
                    <span className="arrow" aria-hidden="true">
                      →
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        ) : (
          <p role="status">年度一覧を読み込んでいます…</p>
        )}
      </section>
      <footer className="home-footer">
        <p>2026年度の「科目A-2」に相当する午前Ⅱの過去問です。</p>
        <p>
          解説は独自に作成したもので、IPAの公式解説ではありません。学習記録は端末間で同期されません。ブラウザのデータを削除すると記録も消えます。
        </p>
        <a
          href="https://www.ipa.go.jp/shiken/mondai-kaiotu/"
          target="_blank"
          rel="noreferrer"
        >
          出典：IPAの過去問題 ↗
        </a>
      </footer>
    </main>
  );
}
