// ===================== js/app.js（STEP2 完成版） =====================
const CFG = window.APP_CONFIG;
const view = document.getElementById("view");

// === ルータ：科目クリック ===
document.querySelector("nav.subjects")?.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-subject]");
  if (!btn) return;
  const key = btn.dataset.subject;
  const subject = { kokugo: "国語", sansu: "算数", rika: "理科", shakai: "社会" }[key] || key;
  renderSubjectTop(subject);
});

// === 科目トップ（タブ：全授業 / 授業を選ぶ） ===
function renderSubjectTop(subject) {
  view.innerHTML = `
    <div class="card">
      <h2 style="margin-top:0">${subject}</h2>

      <div class="tabbar" style="display:flex;gap:8px;margin:8px 0 12px 0">
        <button class="tab active" data-tab="all">全授業</button>
        <button class="tab" data-tab="pick">授業を選ぶ</button>
      </div>

      <div id="tabContent"></div>

      <div class="select-row" style="margin-top:12px">
        <button id="backBtn">戻る</button>
      </div>
    </div>
  `;
  document.getElementById("backBtn").onclick = () => (view.innerHTML = "");

  renderAllLessonsPane(subject);

  view.querySelectorAll(".tabbar .tab").forEach((b) => {
    b.onclick = () => {
      view.querySelectorAll(".tabbar .tab").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      if (b.dataset.tab === "all") renderAllLessonsPane(subject);
      else renderPickLessonPane(subject);
    };
  });
}

// === 全授業タブ ===
function renderAllLessonsPane(subject) {
  const box = document.getElementById("tabContent");
  box.innerHTML = `
    <div class="pane">
      <div class="select-row">
        <label>出題モード：
          <select id="filter_all">
            <option value="all">全問</option>
            <option value="miss">不正解＆未回答のみ</option>
          </select>
        </label>
        <label>出題順：
          <select id="order_all">
            <option value="seq">上から順に</option>
            <option value="rand">ランダム</option>
          </select>
        </label>
      </div>
      <div class="select-row">
        <button id="play_all">プレイする</button>
      </div>
    </div>
  `;

  document.getElementById("play_all").onclick = async () => {
    const filterMode = document.getElementById("filter_all").value;
    const orderMode = document.getElementById("order_all").value;

    const gid = CFG.SUBJECT_GIDS[subject];
    if (!Number.isInteger(gid)) return alert(`「${subject}」の gid が未設定です。config.js を編集してください。`);

    renderLoading("全授業から読み込み中…");
    try {
      const rows = await getRowsForSubject(subject, csvUrlFor(gid)); // キャッシュあり
      const questions = filterRows(rows, { rangeMode: "all", weekCode: "", filterMode });
      if (questions.length === 0) return showEmpty(subject);
      if (orderMode === "rand") shuffleInPlace(questions);
      startQuiz(subject, questions);
    } catch (err) {
      showError(subject, err);
    }
  };
}

// === 授業を選ぶタブ ===
async function renderPickLessonPane(subject) {
  const box = document.getElementById("tabContent");
  box.innerHTML = `
    <div class="pane">
      <div class="select-row">
        <label>授業回（week）：
          <select id="week_pick"><option>読み込み中…</option></select>
        </label>
        <label>出題モード：
          <select id="filter_pick">
            <option value="all">全問</option>
            <option value="miss">不正解＆未回答のみ</option>
          </select>
        </label>
        <label>出題順：
          <select id="order_pick">
            <option value="seq">上から順に</option>
            <option value="rand">ランダム</option>
          </select>
        </label>
      </div>
      <div class="select-row">
        <button id="play_pick">プレイする</button>
      </div>
    </div>
  `;

  const gid = CFG.SUBJECT_GIDS[subject];
  if (!Number.isInteger(gid)) return alert(`「${subject}」の gid が未設定です。config.js を編集してください。`);

  try {
    const rows = await getRowsForSubject(subject, csvUrlFor(gid)); // キャッシュあり
    const weeks = Array.from(
      new Set(rows.map((r) => String(r[CFG.COLS.week] || "").trim()).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b, "ja"));

    const sel = document.getElementById("week_pick");
    sel.innerHTML = weeks.length
      ? weeks.map((w) => `<option value="${escapeAttr(w)}">${escapeHtml(w)}</option>`).join("")
      : `<option value="">（授業回が見つかりません）</option>`;

    document.getElementById("play_pick").onclick = () => {
      const weekCode = sel.value.trim();
      if (!weekCode) return alert("授業回が選ばれていません");

      const filterMode = document.getElementById("filter_pick").value;
      const orderMode = document.getElementById("order_pick").value;

      const questions = filterRows(rows, { rangeMode: "week", weekCode, filterMode });
      if (questions.length === 0) return showEmpty(subject);
      if (orderMode === "rand") shuffleInPlace(questions);
      startQuiz(subject, questions);
    };
  } catch (err) {
    showError(subject, err);
  }
}

// === CSV/キャッシュ周り ===
function csvUrlFor(gid) {
  return `https://docs.google.com/spreadsheets/d/${CFG.SPREADSHEET_ID}/export?format=csv&gid=${gid}`;
}
const SUBJECT_CACHE = new Map(); // subject -> rows
async function getRowsForSubject(subject, csvUrl) {
  if (SUBJECT_CACHE.has(subject)) return SUBJECT_CACHE.get(subject);
  const rows = await fetchCSV(csvUrl);
  SUBJECT_CACHE.set(subject, rows);
  return rows;
}
async function fetchCSV(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  return parseCSV(text);
}
function parseCSV(text) {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  if (lines.length === 0) return [];
  const header = splitCSVLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw || !raw.trim()) continue;
    const cols = splitCSVLine(raw);
    const obj = {};
    header.forEach((h, idx) => (obj[h] = cols[idx] ?? ""));
    rows.push(obj);
  }
  return rows;
}
function splitCSVLine(line) {
  const out = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else { inQ = false; }
      } else cur += ch;
    } else {
      if (ch === ",") { out.push(cur); cur = ""; }
      else if (ch === '"') { inQ = true; }
      else cur += ch;
    }
  }
  out.push(cur);
  return out;
}

// === 絞り込み ===
function filterRows(rows, { rangeMode, weekCode, filterMode }) {
  const K = CFG.COLS;
  const mapped = rows
    .map((r) => ({
      id: (r[K.id] ?? "").trim(),
      week: (r[K.week] ?? "").trim(),
      question: (r[K.question] ?? "").trim(),
      answer: (r[K.answer] ?? "").trim(),
      alt_answers: (r[K.alt] ?? "").trim(),
      image_url: (r[K.image] ?? "").trim(),
      flag: String(r[K.flag] ?? "").trim().toUpperCase(), // TRUE / FALSE / ""
    }))
    .filter((r) => r.id && r.question);

  let arr = mapped;
  if (rangeMode === "week" && weekCode) arr = arr.filter((r) => r.week === weekCode);
  if (filterMode === "miss") arr = arr.filter((r) => r.flag === "" || r.flag === "FALSE");
  return arr;
}

// === 出題 ===
function startQuiz(subject, questions) {
  const state = { subject, list: questions, idx: 0, correct: 0, total: questions.length };
  renderQuestion(state);
}

function renderQuestion(state) {
  const q = state.list[state.idx];
  const remain = `${state.idx + 1} / ${state.total}`;
  const hasImg = !!q.image_url;

  view.innerHTML = `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
        <h2 style="margin:0">出題：${state.subject}</h2>
        <div>進捗：${remain}　正解：<span id="sc">${state.correct}</span></div>
      </div>

      <p style="margin:.5rem 0 .6rem 0;opacity:.9">[${escapeHtml(q.id)}] ${escapeHtml(q.week)}</p>
      ${hasImg ? `<div style="margin:8px 0"><img src="${escapeAttr(q.image_url)}" alt="" style="max-width:100%;border-radius:10px"></div>` : ""}

      <div style="white-space:pre-wrap;font-size:18px;margin:8px 0 12px 0">${escapeHtml(q.question)}</div>

      <label style="display:block;margin-top:6px">解答（タイピング）</label>
      <input id="answerInput" type="text" inputmode="text" autocomplete="off" autocorrect="off" autocapitalize="none"
             style="width:100%;padding:12px;border-radius:10px;border:1px solid #3a4a7a;background:#0f1730;color:#fff;font-size:18px">

      <div class="select-row">
        <button id="submitBtn" class="primary">解答する（Enter）</button>
        <button id="skipBtn" class="ghost">スキップ</button>
      </div>

      <div id="judgeArea" style="min-height:38px;margin-top:8px"></div>
      <div style="height:140px"></div> <!-- IME候補退避 -->
    </div>
  `;

  const input = document.getElementById("answerInput");
  setTimeout(() => {
    input.focus();
    input.scrollIntoView({ block: "center", behavior: "smooth" });
  }, 50);

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onSubmit(state);
    }
  });
  document.getElementById("submitBtn").onclick = () => onSubmit(state);
  document.getElementById("skipBtn").onclick = () => nextQuestion(state); // 未回答は記録しない（要件通り）
}

function onSubmit(state) {
  const q = state.list[state.idx];
  const user = normalize(document.getElementById("answerInput").value);
  const ans = normalize(q.answer);
  const alts = splitAlt(q.alt_answers).map(normalize);

  const isCorrect = user !== "" && (user === ans || alts.includes(user));

  // ★ G列（TRUE/FALSE）へ最新状態を記録（GAS経由）
  recordResult(q.id, isCorrect, state.subject);

  const judge = document.getElementById("judgeArea");
  if (isCorrect) {
    state.correct++;
    judge.innerHTML = `<div style="padding:10px;border-radius:10px;background:#143b22">✅ 正解！　解答：<b>${escapeHtml(q.answer)}</b></div>`;
  } else {
    judge.innerHTML = `<div style="padding:10px;border-radius:10px;background:#3b1420">❌ 不正解…　正解：<b>${escapeHtml(q.answer)}</b></div>`;
  }
  setTimeout(() => nextQuestion(state), 700);
}

function nextQuestion(state) {
  state.idx++;
  if (state.idx >= state.total) return renderResult(state);
  renderQuestion(state);
}

function renderResult(state) {
  view.innerHTML = `
    <div class="card">
      <h2>結果：${state.subject}</h2>
      <p>正解 ${state.correct} / ${state.total}</p>
      <div class="select-row">
        <button class="primary" id="retry">もう一度</button>
        <button class="ghost" id="back">科目トップへ</button>
      </div>
    </div>
  `;
  document.getElementById("retry").onclick = () => renderSubjectTop(state.subject);
  document.getElementById("back").onclick = () => (view.innerHTML = "");
}

// === GAS記録 ===
async function recordResult(id, isCorrect, subject) {
  const payload = { id, result: isCorrect ? "TRUE" : "FALSE", sheetName: subject };
  try {
    const res = await fetch(CFG.GAS_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    await res.json().catch(() => ({}));
  } catch (err) {
    console.error("記録失敗:", err);
  }
}

// === ユーティリティ ===
function renderLoading(text = "Loading…") { view.innerHTML = `<div class="card"><p>${text}</p></div>`; }
function showEmpty(subject) {
  view.innerHTML = `<div class="card"><h2>${subject}</h2><p>条件に合う問題が見つかりませんでした。</p><button class="ghost" id="goBack">戻る</button></div>`;
  document.getElementById("goBack").onclick = () => renderSubjectTop(subject);
}
function showError(subject, err) {
  view.innerHTML = `<div class="card"><h2>${subject}</h2><p>読み込みエラー：${escapeHtml(err.message || err)}</p></div>`;
  console.error(err);
}
function splitAlt(s) { return s ? String(s).split(/[,\u3001，/／\s]+/).filter(Boolean) : []; }
function normalize(s) {
  if (s == null) return "";
  s = String(s).trim();
  s = zenkakuToHankaku(s);
  s = kanaToHiragana(s);
  return s;
}
function zenkakuToHankaku(str){ return str.replace(/[！-～]/g, c => String.fromCharCode(c.charCodeAt(0)-0xFEE0)).replace(/　/g," "); }
function kanaToHiragana(str){ return str.replace(/[ァ-ン]/g, c => String.fromCharCode(c.charCodeAt(0)-0x60)); }
function shuffleInPlace(a){ for(let i=a.length-1;i>0;i--){ const j=(Math.random()*(i+1))|0; [a[i],a[j]]=[a[j],a[i]]; } }
function escapeHtml(s){ return String(s).replace(/[&<>"']/g,m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m])); }
function escapeAttr(s){ return escapeHtml(s).replace(/"/g,"&quot;"); }
// ===============================================================
