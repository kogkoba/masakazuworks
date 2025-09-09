// ===================== app.js 完全版 =====================

// === ★設定エリア（必要に応じて調整）======================

// スプレッドシートID（共有の問題リスト）
const SPREADSHEET_ID = "1L3dUsXqIPQSAhZE1VbduKXJeABrx2Ob3w1YfqXG4aA"; // こぐれさんのURLのID

// 科目タブ名 → gid の対応（※各タブのgidを入力してください）
const SUBJECT_GIDS = {
  "国語":   0,     // 例: 2143649641 など実値に置き換えてください
  "算数":   0,
  "理科":   0,
  "社会":   2143649641 // スクショのタブ(gid)がこれっぽいので仮で入れています
};

// GASエンドポイント（G列に TRUE / FALSE を記録）
const GAS_ENDPOINT = "https://script.google.com/macros/s/AKfycbx9PKDGh-a5AkeSz5sPlJlCsJZSZGYa7iqCnIcLaCFAk1iHo0mi7T-RlLbZcTzWf9HBJw/exec";

// 列名の想定（シート1行目の見出しと一致させてください）
const COLS = {
  id: "id",
  week: "week",
  question: "question",
  answer: "answer",
  alt: "alt_answers",
  image: "image_url",
  flag: "enabled" // ← G列に最新正解フラグを格納（TRUE/FALSE/空白）
};

// =======================================================

const view = document.getElementById("view");

// ルータ：科目ボタン
document.querySelector("nav.subjects")?.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-subject]");
  if (!btn) return;
  const key = btn.dataset.subject; // kokugo/sansu/rika/shakai
  const label = { kokugo: "国語", sansu: "算数", rika: "理科", shakai: "社会" }[key] || key;
  renderScopePicker(label);
});

// 出題範囲選択
function renderScopePicker(subjectLabel) {
  view.innerHTML = `
    <div class="card">
      <h2>${subjectLabel}：出題範囲を選択</h2>

      <div class="select-row">
        <label>全期間 or 授業回：
          <select id="rangeMode">
            <option value="all">全期間</option>
            <option value="week">授業回を指定</option>
          </select>
        </label>
        <label>授業回（例：G4-C00）：
          <input id="weekCode" placeholder="例: G4-C00" style="width:160px" />
        </label>
      </div>

      <div class="select-row">
        <label>出題モード：
          <select id="filterMode">
            <option value="all">全問</option>
            <option value="miss">不正解＆未回答のみ</option>
          </select>
        </label>
        <label>出題順：
          <select id="orderMode">
            <option value="seq">上から順に</option>
            <option value="rand">ランダム</option>
          </select>
        </label>
      </div>

      <div class="select-row">
        <button id="startBtn" class="primary">クイズ開始</button>
        <button id="backBtn" class="ghost">戻る</button>
      </div>
      <p style="opacity:.8;margin-top:12px">※ シートが「ウェブに公開（CSV）」になっている必要があります。</p>
    </div>
  `;

  document.getElementById("backBtn").onclick = () => (view.innerHTML = "");
  document.getElementById("startBtn").onclick = async () => {
    const rangeMode = document.getElementById("rangeMode").value;
    const weekCode = document.getElementById("weekCode").value.trim();
    const filterMode = document.getElementById("filterMode").value;
    const orderMode = document.getElementById("orderMode").value;

    const gid = SUBJECT_GIDS[subjectLabel];
    if (!gid || typeof gid !== "number") {
      alert(`「${subjectLabel}」の gid が未設定です。SUBJECT_GIDS を編集してください。`);
      return;
    }

    const csvUrl = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=${gid}`;
    renderLoading(`問題データを読み込み中…`);
    try {
      const rows = await fetchCSV(csvUrl);
      const questions = filterRows(rows, { rangeMode, weekCode, filterMode });
      if (questions.length === 0) {
        view.innerHTML = `<div class="card"><h2>${subjectLabel}</h2><p>条件に合う問題が見つかりませんでした。</p><button class="ghost" id="goBack">戻る</button></div>`;
        document.getElementById("goBack").onclick = () => renderScopePicker(subjectLabel);
        return;
      }
      if (orderMode === "rand") shuffleInPlace(questions);
      startQuiz(subjectLabel, questions);
    } catch (err) {
      view.innerHTML = `<div class="card"><h2>${subjectLabel}</h2><p>読み込みエラー：${escapeHtml(err.message || err)}</p></div>`;
      console.error(err);
    }
  };
}

function renderLoading(text = "Loading…") {
  view.innerHTML = `<div class="card"><p>${text}</p></div>`;
}

// CSV取得＆パース（UTF-8前提）
async function fetchCSV(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  return parseCSV(text);
}

// とてもシンプルなCSVパーサ（カンマ・二重引用符対応）
function parseCSV(text) {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  if (lines.length === 0) return [];
  const header = splitCSVLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cols = splitCSVLine(lines[i]);
    const obj = {};
    header.forEach((h, idx) => (obj[h] = cols[idx] ?? ""));
    rows.push(obj);
  }
  return rows;
}
function splitCSVLine(line) {
  const out = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQ = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === ",") {
        out.push(cur);
        cur = "";
      } else if (ch === '"') {
        inQ = true;
      } else {
        cur += ch;
      }
    }
  }
  out.push(cur);
  return out;
}

// こぐれさんの指定条件で絞り込み
function filterRows(rows, { rangeMode, weekCode, filterMode }) {
  const idK = COLS.id, weekK = COLS.week, qK = COLS.question, aK = COLS.answer, altK = COLS.alt, imgK = COLS.image, flagK = COLS.flag;
  const mapped = rows
    .map(r => ({
      id: r[idK]?.trim(),
      week: r[weekK]?.trim(),
      question: r[qK]?.trim(),
      answer: r[aK]?.trim(),
      alt_answers: r[altK]?.trim(),
      image_url: r[imgK]?.trim(),
      flag: (r[flagK] ?? "").trim().toUpperCase() // ← G列（TRUE/FALSE/空白）
    }))
    .filter(r => r.id && r.question);

  let arr = mapped;
  if (rangeMode === "week" && weekCode) {
    arr = arr.filter(r => r.week === weekCode);
  }
  if (filterMode === "miss") {
    // 不正解(FALSE) or 未回答(空白)のみ
    arr
