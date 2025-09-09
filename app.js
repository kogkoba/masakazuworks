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
  week: null,         // 例: "g4-s00"
  pool: "all",        // all | wrong_blank
  order: "seq",       // seq | shuffle
  questions: [],
  idx: 0,
  score: 0,
  phase: "answering",
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
   データ取得
   ========================= */
async function fetchQuestions(subjectKey){
  const sheetName = SUBJECTS[subjectKey].sheetName;
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

  // CSVフォールバック
  const urlCsv = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
  try{
    const r2 = await fetch(urlCsv, { cache: "no-store" });
    const csv = await r2.text();
    return parseCSV(csv);
  }catch(e){
    console.error("CSV fallback error:", e);
    return [];
  }
}

function parseGvizJson(text){
  const m = text.match(/setResponse\(([\s\S]+)\);/);
  if(!m) return [];
  const data = JSON.parse(m[1]);

  let cols = (data.table.cols || []).map(c => (c.label || "").trim().toLowerCase());

  // ヘッダが完全に空のときだけ rows[0] を見出し扱いに
  if (cols.every(c => c === "")) {
    const first = data.table.rows?.[0];
    if (first && first.c) {
      cols = first.c.map(cell => (cell?.v ?? cell?.f ?? "").toString().trim().toLowerCase());
      data.table.rows.shift();
    }
  }

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
  if(rows.length===0) return [];

  const header = rows[0].map(s=>s.toString().trim().toLowerCase());
  return rows.slice(1)
    .filter(r => r.some(v => v!==""))
    .map(cols=>{
      const obj={};
      header.forEach((h,idx)=> obj[h]=(cols[idx]??"").toString().trim());
      return obj;
    });
}

/***** 採点 *****/
function normalizeAnswers(row){
  const base = (row.answer ?? "").toString().trim();
  const alts = (row.alt_answers ?? "")
    .toString()
    .split(/[、,;\/\s|]+/)   // ← 「|」も追加
    .map(s=>s.trim())
    .filter(Boolean);
  return new Set([base, ...alts]);
}
function matchAnswer(row, userInput){
  return normalizeAnswers(row).has(userInput.trim());
}

/***** 授業回コード抽出 *****/
const codeOf = (r) => {
  const keys = Object.keys(r).map(k => k.toLowerCase().trim());
  if (keys.includes("week")) return (r["week"] || "").toString().trim().toLowerCase();
  if (keys.includes("code")) return (r["code"] || "").toString().trim().toLowerCase();
  if (keys.includes("group")) return (r["group"] || "").toString().trim().toLowerCase();
  return "";
};
const codeKey = (c) => {
  const m = c.match(/^g(\d+)-([a-z])(\d{1,2})$/i);
  if(!m) return c;
  return `${m[1].padStart(2,"0")}-${m[2]}-${m[3].padStart(2,"0")}`;
};

/***** 画面遷移など（省略：前回と同じ） *****/
// ... 以下 STEP1〜renderQuestion, handleAnswer, etc はそのまま ...
