/***** 設定 *****/
const GAS_URL = 'https://script.google.com/macros/s/AKfycbx8QDPVmasQfRcp990Pe-cLsbCPFtgwGfP29NvsTbjCTg5KQCezLdEvxSj8yqdz8PO9Yw/exec';
const SUBJECTS = {
  "算数": { sheetName: "算数" },
  "国語": { sheetName: "国語" },
  "理科": { sheetName: "理科" },
  "社会": { sheetName: "社会" },
};

/***** 状態 *****/
const state = {
  subject: "国語",   // 初期科目（HTMLのdata-subjectと一致させる）
  pool: "all",       // all | wrong_blank（間違い＆未回答のみ）
  order: "seq",      // seq | shuffle
  rows: [],          // 出題データ
  i: 0,              // 現在のインデックス
  todayCount: 0      // 本日ポイント（正解数）
};

/***** ユーティリティ *****/
const norm = s => String(s ?? '').trim().replace(/\s+/g, '');
function parseAlts(s) {
  return String(s ?? '')
    .split(/[\/｜|,，；;]+/)
    .map(x => norm(x))
    .filter(Boolean);
}
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
const todayKey = () => {
  const d = new Date();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `point_${d.getFullYear()}-${m}-${day}`;
};
function loadTodayPoint() {
  const v = Number(localStorage.getItem(todayKey()) || 0);
  state.todayCount = isNaN(v) ? 0 : v;
  document.querySelector('#pointTodayTop')?.textContent = String(state.todayCount);
}
function saveTodayPoint() {
  localStorage.setItem(todayKey(), String(state.todayCount));
}

/***** ステータス表示 *****/
function setStatus(text) {
  const st = document.querySelector('#status');
  if (st) st.textContent = text || '';
}

/***** 出題の取得 *****/
async function loadQuestions() {
  const sheetName = SUBJECTS[state.subject].sheetName;
  const url = `${GAS_URL}?action=get&sheetName=${encodeURIComponent(sheetName)}&pool=${state.pool}`;

  setStatus('読み込み中…');
  try {
    const res = await fetch(url, { method: 'GET' });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || 'fetch_error');

    state.rows = Array.isArray(json.rows) ? json.rows : [];
    if (state.order === 'shuffle') shuffle(state.rows);
    state.i = 0;

    document.querySelector('#total')?.textContent = `全${state.rows.length}問`;

    if (state.rows.length === 0) {
      setStatus('該当の問題がありません（フィルタ設定を見直してね）');
      renderQuestion(null);
      return;
    }
    setStatus('');
    renderQuestion(state.rows[state.i]);
  } catch (e) {
    console.error(e);
    setStatus('読み込みに失敗しました');
  }
}

/***** 1問描画 *****/
function renderQuestion(row) {
  const qEl = document.querySelector('#q');
  const img = document.querySelector('#img');
  const ans = document.querySelector('#ans');

  if (!row) {
    qEl && (qEl.textContent = '問題がありません');
    if (img) { img.removeAttribute('src'); img.style.display = 'none'; }
    if (ans) ans.value = '';
    document.querySelector('#idx')?.textContent = `0 / 0`;
    document.querySelector('#msg') && (document.querySelector('#msg').textContent = '');
    return;
  }

  qEl && (qEl.textContent = row.question);
  if (img) {
    if (row.image_url) { img.src = row.image_url; img.style.display = ''; }
    else { img.removeAttribute('src'); img.style.display = 'none'; }
  }
  if (ans) { ans.value = ''; ans.focus(); }
  document.querySelector('#idx')?.textContent = `${state.i+1} / ${state.rows.length}`;
  document.querySelector('#msg') && (document.querySelector('#msg').textContent = '');
}

/***** 回答処理 → G列ログ（正解→空白 / 不正解→TRUE） *****/
async function submitAnswer() {
  if (state.i >= state.rows.length) return;

  const row = state.rows[state.i];
  const user = norm(document.querySelector('#ans')?.value);

  const corrects = new Set([norm(row.answer), ...parseAlts(row.alt_answers)]);
  const correct = corrects.has(user);

  const msg = document.querySelector('#msg');
  if (msg) msg.textContent = correct ? '正解！' : `不正解… 正：${row.answer}`;

  // GASへ結果送信
  try {
    await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({
        action: 'log',
        sheetName: SUBJECTS[state.subject].sheetName,
        id: row.id,
        correct
      })
    });
  } catch (e) {
    console.error('log failed', e);
  }

  // ポイント加算（正解時）
  if (correct) {
    state.todayCount += 1;
    saveTodayPoint();
    const el = document.querySelector('#pointTodayTop');
    if (el) el.textContent = String(state.todayCount);
  }

  // 次へ
  state.i += 1;
  if (state.i >= state.rows.length) {
    finishSet();
  } else {
    renderQuestion(state.rows[state.i]);
  }
}

/***** セット終了表示 *****/
function finishSet() {
  const qEl = document.querySelector('#q');
  const img = document.querySelector('#img');
  qEl && (qEl.textContent = 'おしまい！おつかれさま 🙌');
  if (img) { img.removeAttribute('src'); img.style.display = 'none'; }
  document.querySelector('#idx')?.textContent = `${state.rows.length} / ${state.rows.length}`;
}

/***** イベント結線（委譲で拾い漏れ防止） *****/
function bindEvents() {
  // 科目切替（data-subject付きボタン）
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-subject]');
    if (!btn) return;
    const sub = btn.dataset.subject;
    if (!SUBJECTS[sub]) return;

    document.querySelectorAll('[data-subject]').forEach(b =>
      b.classList.toggle('primary', b === btn)
    );
    state.subject = sub;
    loadQuestions();
  });

  // フィルタ切替（pool / order）
  document.addEventListener('change', (e) => {
    const p = e.target.closest('input[name="pool"]');
    if (p) { state.pool = p.value; loadQuestions(); return; }
    const o = e.target.closest('input[name="order"]');
    if (o) { state.order = o.value; loadQuestions(); return; }
  });

  // Enterで送信
  document.querySelector('#ans')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') submitAnswer();
  });
  // ボタン送信
  document.querySelector('#submit')?.addEventListener('click', submitAnswer);

  // 本日ポイントリセット
  document.querySelector('#resetTodayTop')?.addEventListener('click', () => {
    state.todayCount = 0;
    saveTodayPoint();
    const el = document.querySelector('#pointTodayTop');
    if (el) el.textContent = '0';
  });
}

/***** 初期化 *****/
window.addEventListener('DOMContentLoaded', async () => {
  bindEvents();
  loadTodayPoint();

  // 初期アクティブ表示同期（国語を既定）
  const firstBtn =
    [...document.querySelectorAll('[data-subject]')]
      .find(b => b.dataset.subject === state.subject) ||
    document.querySelector('[data-subject]');
  if (firstBtn) {
    document.querySelectorAll('[data-subject]').forEach(b =>
      b.classList.toggle('primary', b === firstBtn)
    );
    state.subject = firstBtn.dataset.subject;
  }

  await loadQuestions();
});
