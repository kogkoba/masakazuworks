/***** 設定 *****/
const GAS_URL = "https://script.google.com/macros/s/AKfycbx9PKDGh-a5AkeSz5sPlJlCsJZSZGYa7iqCnIcLaCFAk1iHo0mi7T-RlLbZcTzWf9HBJw/exec";
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
  week: null,         // 例: "g4-c01"
  pool: "all",        // all | wrong_blank
  order: "seq",       // seq | shuffle
  questions: [],
  idx: 0,
  score: 0,
  phase: "answering", // answering | review
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
  const urlCsv = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
  try{
    const r2 = await fetch(urlCsv, { cache: "no-store" });
    if (!r2.ok) throw new Error("CSV fetch failed");
    const csv = await r2.text();
    const rows = parseCSV(csv);
    return rows;
  }catch(e){
    console.error("CSV fallback error:", e);
    return [];
  }
}

// === GViz JSON → {id, week, question, …} 配列へ変換（列名を強制正規化） ===
function parseGvizJson(text){
  const m = text.match(/setResponse\(([\s\S]+)\);/);
  if(!m) return [];
  const data = JSON.parse(m[1]);

  // もとのラベル配列
  let cols = (data.table.cols || []).map(c => (c.label || ""));

  // ラベル正規化関数：余計な値が混ざっても既知の列名に寄せる
  const norm = (h) => {
    const s = String(h).toLowerCase().trim();

    // まず既知の単語が含まれていたらそれに寄せる
    if (/\bid\b/.test(s)) return "id";
    if (/\bweek\b|授業|週|回/.test(s)) return "week";
    if (/\bquestion\b|問題/.test(s)) return "question";
    if (/\banswer\b|答え|解答?/.test(s)) return "answer";
    if (/alt[_\s-]*answers?/.test(s)) return "alt_answers";
    if (/image[_\s-]*url|画像/.test(s)) return "image_url";
    if (/\benabled\b|結果|フラグ/.test(s)) return "enabled";

    // 空や未知の場合はそのまま返す（後で補完）
    return s || "";
  };

  // ラベルを正規化
  cols = cols.map(norm);

  // 全部空なら既知の列並びを仮定
  if (cols.length === 0 || cols.every(c => c === "")) {
    cols = ["id","week","question","answer","alt_answers","image_url","enabled"];
  }

  // 1行目が“見出し行そのもの”のときは、それを採用
  const first = data.table.rows?.[0];
  if (first && first.c) {
    const guess = first.c.map(cell => (cell?.v ?? cell?.f ?? "")).map(norm);
    // “week/ question など既知のキーを複数含む”ならヘッダとみなし採用
    const hit = guess.filter(k => ["id","week","question","answer","alt_answers","image_url","enabled"].includes(k));
    if (hit.length >= 2) {
      cols = guess;
      data.table.rows.shift();
    }
  }

  // 空の列名は順番で補完
  const fallback = ["id","week","question","answer","alt_answers","image_url","enabled"];
  cols = cols.map((c,i)=> c || fallback[i] || `col${i}`);

  // 行をオブジェクト化
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
/* CSV → 配列（1行目ヘッダを小文字化） */
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
        if(text[i+1] === '"'){ field += '"'; i += 2; continue; }
        inQ = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if(c === '"'){ inQ = true; i++; continue; }
    if(c === ","){ pushField(); i++; continue; }
    if(c === "\n"){ pushField(); pushRow(); i++; continue; }
    field += c; i++;
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
    headers: { "Content-Type": "text/plain; charset=utf-8" },
    body
  });
  return res.json();
}

/***** 採点 *****/
function normalizeAnswers(row){
  const base = (row.answer ?? "").toString().trim();
  const alts = (row.alt_answers ?? "")
    .toString()
    .split(/[、,;\/\s]+/)
    .map(s=>s.trim())
    .filter(Boolean);
  return new Set([base, ...alts]);
}
function matchAnswer(row, userInput){
  return normalizeAnswers(row).has(userInput.trim());
}

// 授業回コード抽出（week / code / group / 和名を広く拾う）
const codeOf = (row) => {
  // すべてのキーを小文字化して検索
  const entries = Object.entries(row).map(([k,v])=>[k.toLowerCase().trim(), v]);
  const prefer = ["week","code","group","授業回","週","回"];

  for (const p of prefer){
    const hit = entries.find(([k]) => k === p || k.includes(p));
    if (hit) return String(hit[1] ?? "").trim().toLowerCase();
  }
  return "";
};

/***** 画面遷移 *****/
function go(toId){
  ["#step1","#step2","#step3","#step4","#quiz","#loading"].forEach(hide);
  show(toId);
}

/* =========================
   STEP1 科目選択
   ========================= */
$("#step1").addEventListener("click", async (ev)=>{
  const btn = ev.target.closest("button[data-subject]");
  if(!btn) return;
  state.subject = btn.dataset.subject;
  state.sheetName = SUBJECTS[state.subject].sheetName;

  go("#loading");

  const all = await fetchQuestions(state.subject);
  state._all = all;

  const weeks = [...new Set(all.map(codeOf).filter(Boolean))]
    .sort((a,b)=> codeKey(a).localeCompare(codeKey(b)));

  const sel = $("#weekSelect");
  if (sel) {
    sel.innerHTML = weeks.map(w => `<option value="${w}">${w}</option>`).join("");
    if (weeks.length === 0) sel.innerHTML = `<option value="" disabled>(授業回なし)</option>`;
  }
  setText("#subjectLabel", state.subject);
  go("#step2");
});

/* =========================
   STEP2 範囲選択
   ========================= */
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

/* =========================
   STEP3 出題対象
   ========================= */
$("#toStep4").addEventListener("click", ()=>{
  state.pool = document.querySelector('input[name="pool"]:checked').value;
  go("#step4");
});

/* =========================
   STEP4 出題順
   ========================= */
$("#startQuiz").addEventListener("click", ()=>{
  state.order = document.querySelector('input[name="order"]:checked').value;

  let rows = state._all.slice();
  if(state.rangeMode === "byWeek"){
    const target = (state.week || "").toLowerCase();
    rows = rows.filter(r => codeOf(r) === target);
  }
  if(state.pool === "wrong_blank"){
    rows = rows.filter(r => !(String(r.enabled).toUpperCase() === "TRUE" || r.enabled === true));
  }
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

  if(row.image_url){
    $("#img").src = row.image_url;
    $("#qImage").classList.remove("hidden");
  }else{
    $("#qImage").classList.add("hidden");
  }

  $("#qText").textContent = row.question ?? "(問題文なし)";
  $("#answerInput").focus();
}

async function handleAnswer(kind){
  if (state.phase !== "answering") return;

  const row = current();
  let resultFlag = "BLANK";
  let feedbackHtml = "";

  if(kind === "skip"){
    resultFlag = "BLANK";
    feedbackHtml = "スキップしました。";
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

$("#btnAnswer").addEventListener("click", ()=> handleAnswer("answer"));
$("#btnSkip").addEventListener("click", ()=> handleAnswer("skip"));

document.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  if (e.shiftKey && state.phase === "answering") { $("#btnSkip").click(); e.preventDefault(); return; }
  if (state.phase === "answering") { $("#btnAnswer").click(); }
  else if (state.phase === "review") { $("#btnNext").click(); }
  e.preventDefault();
});

$("#btnNext").addEventListener("click", ()=>{
  state.idx++;
  if(state.idx >= state.questions.length){
    alert(`終了！ 正解数：${state.score} / ${state.questions.length}`);
    go("#step1");
  }else{
    renderQuestion();
  }
});
