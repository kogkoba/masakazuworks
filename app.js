/***** 設定 *****/
const GAS_URL  = "https://script.google.com/macros/s/AKfycbx9PKDGh-a5AkeSz5sPlJlCsJZSZGYa7iqCnIcLaCFAk1iHo0mi7T-RlLbZcTzWf9HBJw/exec";
const SHEET_ID = "1L3dUsXqIPQSAhZJE1VbduKXJeABrx2Ob3w1YfqXG4aA";

const SUBJECTS = {
  "算数": { sheetName: "算数" },
  "国語": { sheetName: "国語" },
  "理科": { sheetName: "理科" },
  "社会": { sheetName: "社会" },
};

/***** 状態 *****/
const state = {
  subject: null,
  sheetName: null,
  rangeMode: "all",   // all | byWeek
  week: null,         // 例: "g4-s00"
  pool: "all",        // all | wrong_blank
  order: "seq",       // seq | shuffle
  questions: [],
  idx: 0,
  score: 0,
  phase: "answering", // answering | review
  _all: [],
};

/***** ユーティリティ *****/
const $ = (sel) => document.querySelector(sel);
const show = (id) => $(id).classList.remove("hidden");
const hide = (id) => $(id).classList.add("hidden");
const setText = (id, text) => ($(id).textContent = text);

function shuffleInPlace(arr){
  for (let i = arr.length - 1; i > 0; i--){
    const j = (Math.random() * (i + 1)) | 0;
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
const trimLower = (v) => (v ?? "").toString().trim().toLowerCase();

/* 全角英数 → 半角（最低限） */
function toHalfWidth(str){
  return (str ?? "").replace(/[！-～]/g, s =>
    String.fromCharCode(s.charCodeAt(0) - 0xFEE0)
  ).replace(/　/g, " ");
}
/* 比較用の正規化 */
function norm(s){
  return toHalfWidth(String(s ?? ""))
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/* =========================
   データ取得（GViz → CSV フォールバック）
   ========================= */
async function fetchQuestions(subjectKey){
  const sheetName = SUBJECTS[subjectKey].sheetName;

  // 1) GViz(JSON)
  const urlJson =
    `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq` +
    `?tq=${encodeURIComponent("select *")}` +
    `&tqx=out:json&sheet=${encodeURIComponent(sheetName)}`;
  try{
    const r = await fetch(urlJson, { cache: "no-store" });
    const t = await r.text();
    if (r.ok && !t.startsWith("<!DOCTYPE") && !/Sign in|ログイン/i.test(t)) {
      const rows = parseGvizJson(t);
      if (rows.length) return rows;
    }
  }catch(e){
    console.warn("GViz fetch error:", e);
  }

  // 2) CSV（フォールバック）
  const urlCsv =
    `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
  try{
    const r2 = await fetch(urlCsv, { cache: "no-store" });
    if (!r2.ok) throw new Error("CSV fetch failed");
    const csv = await r2.text();
    return parseCSV(csv);
  }catch(e){
    console.error("CSV fallback error:", e);
    return [];
  }
}

/* === GViz JSON → 行配列（ヘッダ欠落にも対応） === */
function parseGvizJson(text){
  const m = text.match(/setResponse\(([\s\S]+)\);/);
  if(!m) return [];
  const data = JSON.parse(m[1]);

  // 1) ラベル（見出し）
  let cols = (data.table.cols || []).map(c => (c.label || "").trim().toLowerCase());

  // 2) もし見出しが空なら rows[0] を見出しとして採用
  if (cols.length === 0 || cols.every(c => c === "")) {
    const first = data.table.rows?.[0];
    if (first && first.c) {
      cols = first.c.map(cell => (cell?.v ?? cell?.f ?? "").toString().trim().toLowerCase());
      data.table.rows.shift();
    }
  }

  // 3) データ行をオブジェクトに
  const out = [];
  for (const r of (data.table.rows || [])){
    const obj = {};
    (r.c || []).forEach((cell, idx) => {
      const key = cols[idx] || `col${idx}`;
      let v = cell?.v ?? cell?.f ?? "";
      obj[key] = String(v).trim();
    });
    if (Object.values(obj).some(v => v !== "")) out.push(obj);
  }
  return out;
}

/* === CSV → 行配列（ヘッダは小文字化） === */
function parseCSV(text){
  text = text.replace(/\r/g, "");
  const rows = [];
  let i = 0, field = "", row = [], inQ = false;
  const pushField = () => { row.push(field); field=""; };
  const pushRow   = () => { rows.push(row); row=[]; };

  while(i < text.length){
    const c = text[i];
    if(inQ){
      if(c === '"'){
        if(text[i+1] === '"'){ field += '"'; i+=2; continue; }
        inQ=false; i++; continue;
      }
      field+=c; i++; continue;
    }
    if(c === '"'){ inQ=true; i++; continue; }
    if(c === ","){ pushField(); i++; continue; }
    if(c === "\n"){ pushField(); pushRow(); i++; continue; }
    field+=c; i++;
  }
  if(field.length || row.length){ pushField(); pushRow(); }
  if(rows.length === 0) return [];

  const header = rows[0].map(s => s.toString().trim().toLowerCase());
  return rows.slice(1)
    .filter(r => r.some(v => v !== ""))
    .map(cols => {
      const obj = {};
      header.forEach((h, idx) => obj[h] = (cols[idx] ?? "").toString().trim());
      return obj;
    });
}

/***** GAS書き込み *****/
async function setFlag({sheetName, id, result}){
  const body = JSON.stringify({ sheetName, id, result });
  const res = await fetch(GAS_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain; charset=utf-8" }, // プリフライト回避
    body
  });
  return res.json(); // {status, sheet, row, col}
}

/***** 採点（alt_answers の | も対応） *****/
function normalizeAnswers(row){
  const base = norm(row.answer);
  const alts = norm(row.alt_answers)
    .split(/[|｜、，,;；\/／\s]+/)   // ← 「|」「｜」も区切りに
    .map(s=>s.trim())
    .filter(Boolean);
  return new Set([base, ...alts]);
}
function matchAnswer(row, userInput){
  return normalizeAnswers(row).has(norm(userInput));
}

/***** week / code / group を大小文字無視で拾う *****/
function getCaseInsensitive(obj, names){
  const map = {};
  Object.keys(obj).forEach(k => map[k.toLowerCase().trim()] = k);
  for (const n of names){
    const key = map[n];
    if (key) return obj[key];
  }
  return "";
}
const codeOf = (r) => trimLower(getCaseInsensitive(r, ["week","code","group","授業回","週","回"]));

/***** 画面遷移 *****/
function go(toId){
  ["#step1","#step2","#step3","#step4","#quiz","#loading"].forEach(hide);
  show(toId);
}

/* =========================
   STEP1 科目選択
   ========================= */
function onClickStep1(ev){
  const btn = ev.target.closest("button[data-subject]");
  if(!btn) return;

  state.subject = btn.dataset.subject;
  state.sheetName = SUBJECTS[state.subject].sheetName;

  go("#loading");

  (async () => {
    const all = await fetchQuestions(state.subject);
    state._all = all;

    // 授業回（code/週）候補（重複除去）
    const weeks = [...new Set(all.map(codeOf).filter(Boolean))].sort();

    const sel = $("#weekSelect");
    if (sel) {
      sel.innerHTML = weeks.map(w => `<option value="${w}">${w}</option>`).join("");
      if (weeks.length === 0) sel.innerHTML = `<option value="" disabled>(授業回なし)</option>`;
    }

    setText("#subjectLabel", state.subject);
    go("#step2");
  })();
}

/* =========================
   STEP2 範囲選択
   ========================= */
function wireRangeRadios(){
  document.querySelectorAll('input[name="range"]').forEach(r=>{
    r.addEventListener("change", ()=>{
      state.rangeMode = r.value;
      if (state.rangeMode === "byWeek") show("#weekPicker");
      else hide("#weekPicker");
    });
  });

  $("#toStep3").addEventListener("click", ()=>{
    state.rangeMode = document.querySelector('input[name="range"]:checked').value;

    if (state.rangeMode === "byWeek") {
      const sel = $("#weekSelect");
      state.week = sel ? sel.value : null;
      setText("#rangeLabel", state.week ? `授業回: ${state.week}` : "授業回を選択");
    } else {
      state.week = null;
      setText("#rangeLabel", "全授業");
    }
    go("#step3");
  });

  document.querySelectorAll('[data-back]').forEach(b=>{
    b.addEventListener("click", ()=> go(b.dataset.back));
  });
}

/* =========================
   STEP3 出題対象 → STEP4 出題順
   ========================= */
function wireStep3and4(){
  $("#toStep4").addEventListener("click", ()=>{
    state.pool = document.querySelector('input[name="pool"]:checked').value; // all | wrong_blank
    go("#step4");
  });

  $("#startQuiz").addEventListener("click", ()=>{
    state.order = document.querySelector('input[name="order"]:checked').value;

    // シート順を保持（seq）—> 並べ替えしない
    let rows = state._all.slice();

    // 授業回で絞り込み（大小文字・余白無視）
    if(state.rangeMode === "byWeek"){
      const target = trimLower(state.week);
      rows = rows.filter(r => codeOf(r) === target);
    }

    // 「正解済みを除く」フィルタ（enabled が TRUE のものを除外）
    if(state.pool === "wrong_blank"){
      rows = rows.filter(r => !(String(r.enabled).toUpperCase() === "TRUE" || r.enabled === true));
    }

    // シャッフル指定時のみランダム化
    if(state.order === "shuffle") shuffleInPlace(rows);

    state.questions = rows;
    state.idx = 0;
    state.score = 0;
    setText("#score", "0");

    if(rows.length === 0){
      alert("出題対象が0件です。条件を変えてください。");
      go("#step3");
      return;
    }

    go("#quiz");
    renderQuestion();
  });
}

/***** 出題・採点 *****/
function current(){ return state.questions[state.idx]; }

function renderQuestion(){
  const row = current();
  state.phase = "answering";

  $("#feedback").innerHTML = "";
  $("#btnNext").classList.add("hidden");
  $("#btnAnswer").classList.remove("hidden");
  $("#btnAnswer").disabled = false;
  $("#answerInput").disabled = false;
  $("#answerInput").value = "";

  // 画像
  if(row.image_url){
    $("#img").src = row.image_url;
    $("#qImage").classList.remove("hidden");
  }else{
    $("#qImage").classList.add("hidden");
  }

  // 問題文
  $("#qText").textContent = row.question ?? "(問題文なし)";
  $("#answerInput").focus();
}

async function handleAnswer(kind){
  if (state.phase !== "answering") return; // 連打防止

  const row = current();
  let resultFlag = "BLANK";
  let feedbackHtml = "";

  if(kind === "skip"){
    resultFlag = "BLANK";
    feedbackHtml = `スキップしました。`;
  }else{
    const user = $("#answerInput").value;
    if(matchAnswer(row, user)){
      resultFlag = "TRUE";
      state.score++;
      setText("#score", String(state.score));
      feedbackHtml = `⭕ 正解！（答え：${row.answer}）`;
    }else{
      resultFlag = "FALSE";
      feedbackHtml = `❌ 不正解…（正答：${row.answer}）`;
    }
  }

  state.phase = "review";
  $("#feedback").innerHTML = feedbackHtml;
  $("#btnAnswer").classList.add("hidden");
  $("#btnAnswer").disabled = true;
  $("#answerInput").disabled = true;
  $("#btnNext").classList.remove("hidden");

  try{
    await setFlag({ sheetName: state.sheetName, id: row.id, result: resultFlag });
  }catch(e){
    console.warn("GAS書き込み失敗", e);
  }
}

function wireQuizButtons(){
  $("#btnAnswer").addEventListener("click", ()=> handleAnswer("answer"));
  $("#btnSkip").addEventListener("click",  ()=> handleAnswer("skip"));

  // Enter：採点 → 次へ、Shift+Enter：スキップ
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;

    if (e.shiftKey && state.phase === "answering") {
      $("#btnSkip").click();
      e.preventDefault();
      return;
    }

    if (state.phase === "answering") {
      $("#btnAnswer").click();     // 採点
    } else if (state.phase === "review") {
      $("#btnNext").click();       // 次の問題へ
    }
    e.preventDefault();
  });

  // 次の問題へ
  $("#btnNext").addEventListener("click", ()=>{
    state.idx++;
    if(state.idx >= state.questions.length){
      alert(`終了！ 正解数：${state.score} / ${state.questions.length}`);
      go("#step1");
    }else{
      renderQuestion();
    }
  });
}

/* ===== 初期化（必ず科目選択に切り替える） ===== */
function init() {
  // まず全画面を非表示にしてから STEP1 を表示
  ["#step1","#step2","#step3","#step4","#quiz","#loading"].forEach(sel=>{
    const n = document.querySelector(sel);
    if (n) n.classList.add("hidden");
  });
  const s1 = document.querySelector("#step1");
  if (s1) s1.classList.remove("hidden");

  // イベント配線（重複登録を避ける）
  $("#step1")?.addEventListener("click", onClickStep1);
  wireRangeRadios();
  wireStep3and4();
  wireQuizButtons();
}

// DOM 構築が終わってからイベント登録＆初期表示
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once:true });
} else {
  init();
}
