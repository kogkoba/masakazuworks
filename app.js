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
  subject: "国語",          // 初期科目（UIで切替）
  pool: "all",              // all | wrong_blank（間違い＆未回答のみ）
  order: "seq",             // seq | shuffle
  rows: [],                 // 取得した出題
  i: 0,                     // 現在のインデックス
  todayCount: 0             // 本日ポイント（正解数）
};

/***** ユーティリティ *****/
const norm = s => String(s ?? '').trim().replace(/\s+/g, '');
function parseAlts(s) {
  // / ｜ | , ； ; など区切りを許可
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
  const el = document.querySelector('#pointTodayTop');
  if (el) el.textContent = String(state.todayCount);
}
function saveTodayPoint() {
  localStorage.setItem(todayKey(), String(state.todayCount));
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

    const totalEl = document.querySelector('#total');
    if (totalEl) totalEl.textContent = `全${state.rows.length}問`;

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
    if (qEl) qEl.textContent = '問題がありません';
    if (img) { img.removeAttribute('src'); img.style.display = 'none'; }
    if (ans) ans.value = '';
    return;
  }

  if (qEl) qEl.textContent = row.question;
  if (img) {
    if (row.image_url) { img.src = row.image_url; img.style.display = ''; }
    else { img.removeAttribute('src'); img.style.display = 'none'; }
  }
  if (ans) { ans.value = ''; ans.focus(); }

  const idxEl = document.querySelector('#idx');
  if (idxEl) idxEl.textContent = `${state.i+1} / ${state.rows.length}`;
  const msg = document.querySelector('#msg');
  if (msg) msg.textContent = '';
}

/***** ステータスメッセージ *****/
function setStatus(text) {
  const st = document.querySelector('#status');
  if (st) st.textContent = text || '';
}

/***** 回答処理 → G列ログ *****/
async function submitAnswer() {
  if (state.i >= state.rows.length) return;

  const row = state.rows[state.i];
  const user = norm(document.querySelector('#ans')?.value);

  // 正解集合（answer + alt_answers）
  const corrects = new Set([norm(row.answer), ...parseAlts(row.alt_answers)]);
  const correct = corrects.has(user);

  const msg = document.querySelector('#msg');
  if (msg) msg.textContent = correct ? '正解！' : `不正解… 正：${row.answer}`;

  // GASへ結果送信（G列：正解→空白 / 不正解→TRUE）
  try {
    await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

  // 本日ポイント（正解時のみ加算）
  if (correct) {
    state.todayCount += 1;
    saveTodayPoint();
    const el = document.querySelector('#pointTodayTop');
    if (el) el.textContent = String(state.todayCount);
  }

  // 次の問題
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
  if (qEl) qEl.textContent = 'おしまい！おつかれさま 🙌';
  if (img) { img.removeAttribute('src'); img.style.display = 'none'; }
  const idxEl = document.querySelector('#idx');
  if (idxEl) idxEl.textContent = `${state.rows.length} / ${state.rows.length}`;
}

/***** イベント結線 *****/
function bindEvents() {
  // Enterで回答
  const input = document.querySelector('#ans');
  if (input) input.addEventListener('keydown', e => {
    if (e.key === 'Enter') submitAnswer();
  });

  // 送信ボタン
  document.querySelector('#submit')?.addEventListener('click', submitAnswer);

  // 本日ポイントリセット
  document.querySelector('#resetTodayTop')?.addEventListener('click', () => {
    state.todayCount = 0;
    saveTodayPoint();
    const el = document.querySelector('#pointTodayTop');
    if (el) el.textContent = '0';
  });

  // 科目タブ（data-subject="国語" などのボタン想定）
  document.querySelectorAll('[data-subject]').forEach(btn => {
    btn.addEventListener('click', () => {
      const sub = btn.getAttribute('data-subject');
      if (!SUBJECTS[sub]) return;
      state.subject = sub;
      // 選択中UIのクラス切替（任意）
      document.querySelectorAll('[data-subject]').forEach(b => b.classList.toggle('primary', b===btn));
      loadQuestions();
    });
  });

  // プール切替（name="pool" のラジオ: value=all|wrong_blank）
  document.querySelectorAll('input[name="pool"]').forEach(r => {
    r.addEventListener('change', () => {
      state.pool = r.value;
      loadQuestions();
    });
  });

  // 出題順切替（name="order" のラジオ: value=seq|shuffle）
  document.querySelectorAll('input[name="order"]').forEach(r => {
    r.addEventListener('change', () => {
      state.order = r.value;
      loadQuestions();
    });
  });
}

/***** 初期化 *****/
window.addEventListener('DOMContentLoaded', async () => {
  bindEvents();
  loadTodayPoint();
  await loadQuestions();
});
