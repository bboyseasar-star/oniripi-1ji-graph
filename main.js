// main.js

// ─── Canvas 定数 ──────────────────────────────────────────────────
const CANVAS_SIZE  = 480;
const GRID_RANGE   = 6;                          // -6 〜 6 を表示
const UNIT         = CANVAS_SIZE / (GRID_RANGE * 2); // 40px / unit
const OX           = CANVAS_SIZE / 2;            // 原点 x = 240
const OY           = CANVAS_SIZE / 2;            // 原点 y = 240
const PT_RADIUS    = 13;
const SNAP_MAX     = GRID_RANGE - 1;             // 点は -5〜5 に制限

// ─── アプリ状態 ───────────────────────────────────────────────────
const S = {
  questions:    [],
  idx:          0,
  score:        0,
  answers:      [],
  pts:          [{ x: -2, y: 0 }, { x: 2, y: 0 }],
  dragging:     null,   // 0 or 1
  submitted:    false,
  correct:      false,
  hintLevel:    0,      // 0〜3
  highScore:    0,
  history:      [],
};

const LS_HIST = 'oniripi_graph_history';
const LS_HIGH = 'oniripi_graph_highscore';

let canvas, ctx;

// ─── 座標変換 ──────────────────────────────────────────────────────
function g2c(gx, gy) {
  return { x: OX + gx * UNIT, y: OY - gy * UNIT };
}
function c2gSnap(cx, cy) {
  const gx = Math.max(-SNAP_MAX, Math.min(SNAP_MAX, Math.round((cx - OX) / UNIT)));
  const gy = Math.max(-SNAP_MAX, Math.min(SNAP_MAX, Math.round((OY - cy) / UNIT)));
  return { x: gx, y: gy };
}

// ─── 描画 ──────────────────────────────────────────────────────────
function drawGrid() {
  ctx.fillStyle = '#fbfcff';
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  for (let g = -GRID_RANGE; g <= GRID_RANGE; g++) {
    if (g === 0) continue;
    const { x: lx } = g2c(g, 0);
    const { y: ly } = g2c(0, g);
    // 端（±5）だけ少し濃い副目盛り
    const major = Math.abs(g) === GRID_RANGE - 1;
    ctx.strokeStyle = major ? '#cdd6ee' : '#e9eefb';
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.moveTo(lx, 0); ctx.lineTo(lx, CANVAS_SIZE); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0,  ly); ctx.lineTo(CANVAS_SIZE, ly); ctx.stroke();
  }

  // 軸（太め・端を丸く・上質なグレー）
  ctx.strokeStyle = '#4a5365'; ctx.lineWidth = 2; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, OY); ctx.lineTo(CANVAS_SIZE - 4, OY); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(OX, CANVAS_SIZE); ctx.lineTo(OX, 4); ctx.stroke();

  ctx.fillStyle = '#4a5365';
  // x 矢印
  ctx.beginPath();
  ctx.moveTo(CANVAS_SIZE - 4, OY);
  ctx.lineTo(CANVAS_SIZE - 13, OY - 5);
  ctx.lineTo(CANVAS_SIZE - 13, OY + 5);
  ctx.fill();
  // y 矢印
  ctx.beginPath();
  ctx.moveTo(OX, 4);
  ctx.lineTo(OX - 5, 13);
  ctx.lineTo(OX + 5, 13);
  ctx.fill();

  // 軸ラベル
  ctx.font = 'italic 700 14px Outfit, sans-serif';
  ctx.fillStyle = '#3a4252';
  ctx.textAlign = 'left'; ctx.fillText('x', CANVAS_SIZE - 11, OY - 7);
  ctx.textAlign = 'center'; ctx.fillText('y', OX + 12, 15);

  // 目盛り数字
  ctx.font = '600 11px Outfit, sans-serif'; ctx.fillStyle = '#7a8398';
  for (let g = -(GRID_RANGE - 1); g <= GRID_RANGE - 1; g++) {
    if (g === 0) continue;
    const { x: cx } = g2c(g, 0);
    const { y: cy } = g2c(0, g);
    ctx.textAlign = 'center'; ctx.fillText(g, cx, OY + 16);
    ctx.textAlign = 'right';  ctx.fillText(g, OX - 6, cy + 4);
  }
  ctx.textAlign = 'right'; ctx.fillText('O', OX - 6, OY + 16);
}

function lineEndpoints(slope, intercept) {
  const R = GRID_RANGE;
  const pts = [];

  const yL = slope * (-R) + intercept;
  const yR = slope * R + intercept;
  if (yL >= -R && yL <= R) pts.push({ x: -R, y: yL });
  if (yR >= -R && yR <= R) pts.push({ x:  R, y: yR });

  if (Math.abs(slope) > 0.001) {
    const xT = (R  - intercept) / slope;
    const xB = (-R - intercept) / slope;
    if (xT > -R && xT < R) pts.push({ x: xT, y:  R });
    if (xB > -R && xB < R) pts.push({ x: xB, y: -R });
  }
  return pts.slice(0, 2);
}

function drawLine(slope, intercept, color, width, dashed = false) {
  const pts = lineEndpoints(slope, intercept);
  if (pts.length < 2) return;
  const c1 = g2c(pts[0].x, pts[0].y);
  const c2 = g2c(pts[1].x, pts[1].y);
  ctx.save();
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round';
  if (dashed) ctx.setLineDash([8, 6]);
  ctx.beginPath(); ctx.moveTo(c1.x, c1.y); ctx.lineTo(c2.x, c2.y); ctx.stroke();
  ctx.restore();
}

function drawStudentLine() {
  const [p1, p2] = S.pts;
  if (p1.x === p2.x) return; // 縦線は描けない
  const slope     = (p2.y - p1.y) / (p2.x - p1.x);
  const intercept = p1.y - slope * p1.x;
  const color = S.submitted ? (S.correct ? '#10b981' : '#f0625e') : '#6366f1';
  const w = (S.linePulse || 3.5);
  drawLine(slope, intercept, color, w);
}

function drawControlPoints() {
  const colors  = ['#2f7ff0', '#8b5cf6'];
  const halos   = ['rgba(47,127,240,.16)', 'rgba(139,92,246,.16)'];
  const labels  = ['A', 'B'];
  S.pts.forEach((p, i) => {
    const { x: cx, y: cy } = g2c(p.x, p.y);
    const scale = (S.pulse && S.pulse.idx === i) ? S.pulse.s : 1;
    const r = PT_RADIUS * scale;
    // 淡いハロー
    ctx.fillStyle = halos[i];
    ctx.beginPath(); ctx.arc(cx, cy, r + 7, 0, Math.PI * 2); ctx.fill();
    // 実体
    ctx.fillStyle = colors[i];
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'white'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'white'; ctx.font = 'bold 12px Outfit, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(labels[i], cx, cy);
    ctx.textBaseline = 'alphabetic';

    // 座標ラベル
    const lx = cx + (p.x >= 0 ? 18 : -18);
    const ly = cy - 18;
    ctx.fillStyle = colors[i]; ctx.font = 'bold 10px Outfit, sans-serif';
    ctx.textAlign = p.x >= 0 ? 'left' : 'right';
    ctx.fillText(`(${p.x}, ${p.y})`, lx, ly);
  });
}

function drawHintDot(gx, gy, label) {
  const { x, y } = g2c(gx, gy);
  ctx.fillStyle = 'rgba(245,158,11,.18)';
  ctx.beginPath(); ctx.arc(x, y, 15, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f59e0b'; ctx.strokeStyle = 'white'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#b45309'; ctx.font = '700 11px Outfit, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(label, x, y - 18);
}

function render() {
  ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  drawGrid();

  const q = S.questions[S.idx];

  // ヒント1: y切片点
  if (S.hintLevel >= 1) {
    drawHintDot(0, q.intercept, `(0, ${q.intercept})`);
  }
  // ヒント2: 傾きに従って「分母ぶん進んだ」もう1つの格子点
  if (S.hintLevel >= 2) {
    const f = toSimpleFraction(q.slope);
    const d = f ? f[1] : 1;                 // 分母（整数傾きなら1）
    const n = f ? f[0] : q.slope;           // 分子
    let gx = d, gy = q.intercept + n;       // (0,b) から右にd・上にn
    if (gy < -(GRID_RANGE - 1) || gy > GRID_RANGE - 1) { gx = -d; gy = q.intercept - n; }
    drawHintDot(gx, gy, `(${gx}, ${gy})`);
  }
  // ヒント3 or 提出後不正解: 正解ライン
  if (S.hintLevel >= 3 || (S.submitted && !S.correct)) {
    drawLine(q.slope, q.intercept, '#10b981', 3, true);
  }

  drawStudentLine();
  drawControlPoints();
}

// ─── イベント ─────────────────────────────────────────────────────
function getPos(e) {
  const r = canvas.getBoundingClientRect();
  // 描画座標系は CSS ピクセル基準（ctx.scale済み）なので CANVAS_SIZE で割る
  const sx = CANVAS_SIZE / r.width;
  const sy = CANVAS_SIZE / r.height;
  const cl = e.touches ? e.touches[0] : e;
  return { x: (cl.clientX - r.left) * sx, y: (cl.clientY - r.top) * sy };
}

function hitTest(cx, cy) {
  for (let i = 0; i < S.pts.length; i++) {
    const { x, y } = g2c(S.pts[i].x, S.pts[i].y);
    if (Math.hypot(cx - x, cy - y) <= PT_RADIUS + 8) return i;
  }
  return -1;
}

function onDown(e) {
  if (S.submitted) return;
  e.preventDefault();
  const { x, y } = getPos(e);
  const h = hitTest(x, y);
  if (h >= 0) { S.dragging = h; canvas.style.cursor = 'grabbing'; }
}

function onMove(e) {
  const { x, y } = getPos(e);
  if (S.dragging !== null) {
    e.preventDefault();
    const sg = c2gSnap(x, y);
    const ot = S.pts[1 - S.dragging];
    const cur = S.pts[S.dragging];
    if (!(sg.x === ot.x && sg.y === ot.y) && !(sg.x === cur.x && sg.y === cur.y)) {
      S.pts[S.dragging] = sg;
      updateLineInfo();
      pulsePoint(S.dragging);   // スナップの手応え
    }
  } else if (!S.submitted) {
    canvas.style.cursor = hitTest(x, y) >= 0 ? 'grab' : 'default';
  }
}

function onUp() { S.dragging = null; canvas.style.cursor = 'default'; }

function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { [a, b] = [b, a % b]; } return a || 1; }

// 既約分数を「上下に並んだ」HTMLで返す（整数なら整数のまま）
function fracHTML(num, den) {
  if (den < 0) { num = -num; den = -den; }
  const g = gcd(num, den);
  num /= g; den /= g;
  if (den === 1) return `<span class="num-int">${num}</span>`;
  const sign = num < 0 ? '<span class="frac-sign">-</span>' : '';
  return `${sign}<span class="frac"><span class="frac-n">${Math.abs(num)}</span><span class="frac-d">${den}</span></span>`;
}

// 傾きを「縦分数」HTMLで返す（スラッシュ分数は禁止）
function slopeHTML(slope) {
  const f = toSimpleFraction(slope);
  if (f) return fracHTML(f[0], f[1]);
  return `<span class="num-int">${Number(slope)}</span>`;
}

// 数値だけを安全に埋め込むためのヘルパー（NaN混入を防ぐ）
function numHTML(v) { return `<span class="num-int">${Number(v)}</span>`; }

function updateLineInfo() {
  const el = document.getElementById('current-line-info');
  const [p1, p2] = S.pts;
  if (p1.x === p2.x) {
    el.innerHTML = '<span class="li-warn">2点のxが同じだと直線を判定できません</span>';
    return;
  }
  el.textContent = '';
}

// ─── 判定 ─────────────────────────────────────────────────────────
function judge() {
  const [p1, p2] = S.pts;
  if (p1.x === p2.x) return false;
  const q  = S.questions[S.idx];
  const sl = (p2.y - p1.y) / (p2.x - p1.x);
  const ic = p1.y - sl * p1.x;
  return Math.abs(sl - q.slope) < 0.05 && Math.abs(ic - q.intercept) < 0.05;
}

// ─── 画面切替 ────────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ─── localStorage ────────────────────────────────────────────────
function loadHistory() {
  try {
    S.history   = JSON.parse(localStorage.getItem(LS_HIST) || '[]');
    S.highScore = parseInt(localStorage.getItem(LS_HIGH)   || '0');
  } catch { S.history = []; S.highScore = 0; }
}

function saveHistory(entry) {
  try {
    S.history.unshift(entry);
    if (S.history.length > 20) S.history = S.history.slice(0, 20);
    localStorage.setItem(LS_HIST, JSON.stringify(S.history));
    if (entry.score > S.highScore) {
      S.highScore = entry.score;
      localStorage.setItem(LS_HIGH, String(S.highScore));
    }
  } catch {}
}

// ─── スタート画面 ─────────────────────────────────────────────────
function renderStart() {
  document.getElementById('high-score').textContent = S.highScore;
  const el = document.getElementById('history-list');
  if (S.history.length === 0) {
    el.innerHTML = '<p class="no-history">まだ記録なし。チャレンジしよう！</p>';
  } else {
    el.innerHTML = S.history.map(h => {
      const ok = h.score >= h.max * 0.8;
      return `<div class="history-item">
        <span class="h-date">${h.date}</span>
        <span class="h-score">${h.score}点</span>
        <span class="h-badge ${ok ? 'ok' : 'ng'}">${ok ? '💮 クリア' : '❌ もう少し'}</span>
      </div>`;
    }).join('');
  }
}

// ─── クイズ ───────────────────────────────────────────────────────
async function startQuiz() {
  S.questions = generateSession(5);
  S.idx = 0; S.score = 0; S.answers = [];
  showScreen('screen-quiz');
  await loadQ();
}

async function loadQ() {
  S.pts      = [{ x: -2, y: 0 }, { x: 2, y: 0 }];
  S.submitted = false; S.correct = false; S.hintLevel = 0;

  $('feedback-box').className = 'feedback-box hidden';
  $('hint-text').classList.add('hidden');
  $('hint-text').innerHTML = '';
  $('submit-btn').classList.remove('hidden');
  $('next-btn').classList.add('hidden');
  $('hint-btn').removeAttribute('disabled');

  const q = S.questions[S.idx];
  const total = S.questions.length;
  $('q-counter').textContent   = `Q ${S.idx + 1} / ${total}`;
  $('score-display').textContent = `${S.score}点`;
  $('progress-fill').style.width = `${(S.idx / total) * 100}%`;

  const eq = $('equation-display');
  eq.innerHTML = formatEquationLatex(q.slope, q.intercept);

  updateLineInfo();
  render();
  if (window.MathJax) await MathJax.typesetPromise([eq]);
}

async function submit() {
  if (S.submitted) return;
  const [p1, p2] = S.pts;
  if (p1.x === p2.x) {
    showFB('2点のx座標が同じだよ！どちらかの点を横に動かしてね。', 'warn'); return;
  }
  S.submitted = true;
  S.correct   = judge();
  const q = S.questions[S.idx];

  if (S.correct) {
    const pts = S.hintLevel === 0 ? 20 : (S.hintLevel < 3 ? 15 : 5);
    S.score += pts;
    $('score-display').textContent = `${S.score}点`;
    const star = S.hintLevel === 0 ? '⭐ ノーヒント正解！ ' : '';
    showFB(`🎉 ${star}正解！(0, ${numHTML(q.intercept)}) を通って、変化の割合 ${slopeHTML(q.slope)} のグラフだね。`, 'ok');
    pulseLine();
    fireworks(false);
  } else {
    showFB(diagnoseError(q), 'ng');
  }
  S.answers.push({ correct: S.correct, q, hintLevel: S.hintLevel });
  $('submit-btn').classList.add('hidden');
  $('hint-btn').setAttribute('disabled', 'true');   // 提出後はヒント不可（次問で loadQ が解除）
  $('next-btn').classList.remove('hidden');
  render();
}

// 誤答の「型」を診断して、どこがズレたかを返す（形成的フィードバック）
function diagnoseError(q) {
  const [p1, p2] = S.pts;
  const sl = (p2.y - p1.y) / (p2.x - p1.x);
  const ic = p1.y - sl * p1.x;
  const slopeOK = Math.abs(sl - q.slope) < 0.05;
  const icOK    = Math.abs(ic - q.intercept) < 0.05;

  if (icOK && !slopeOK) {
    if (sl * q.slope < 0)
      return `❌ y切片 (0, ${numHTML(q.intercept)}) はバッチリ！でもグラフの向きが逆だよ。右上がり・右下がりをもう一度確認しよう。`;
    return `❌ y切片 (0, ${numHTML(q.intercept)}) は正解！でも傾き（変化の割合）がズレてるよ。正しくは ${slopeHTML(q.slope)} 。緑の点線と見比べてね。`;
  }
  if (slopeOK && !icOK) {
    return `❌ 傾き ${slopeHTML(q.slope)} はバッチリ！でも y 軸と交わる高さがズレてるよ。y切片は (0, ${numHTML(q.intercept)}) だよ。`;
  }
  return `❌ 惜しい！正しくは「y切片 (0, ${numHTML(q.intercept)})」「変化の割合 ${slopeHTML(q.slope)} 」。緑の点線が正解だよ。`;
}

// フィードバックは縦分数（HTML）を含むため innerHTML で描画する。
// 埋め込む値は Number() を通した数値と自前の定型文のみ（外部入力なし）。
function showFB(html, type) {
  const el = $('feedback-box');
  el.innerHTML = html;
  el.className = `feedback-box fb-${type}`;
}

async function next() {
  S.idx++;
  if (S.idx >= S.questions.length) await showResult();
  else await loadQ();
}

// ─── ヒント ───────────────────────────────────────────────────────
// ヒントを下に積み重ねて追記する（視覚ヒント＝点はrender()が描画）
function appendHintStep(bodyHTML, stepNo, isAnswer) {
  const box = $('hint-text');
  box.classList.remove('hidden');
  const block = document.createElement('div');
  block.className = 'hint-step' + (isAnswer ? ' hint-step--answer' : '');
  const label = isAnswer ? '答え' : ('ステップ' + stepNo);
  block.innerHTML = '<span class="hint-step-no">' + label + '</span>'
    + '<span class="hint-step-body">' + bodyHTML + '</span>';
  box.appendChild(block);
  // showFB などで直後にレイアウトが変わるため、2フレーム待って確定後にスクロールする
  scrollHintToBottom(box);
}

// ヒント欄の末尾（＝いま追加したブロック全体）が必ず見える位置までスクロールする
function scrollHintToBottom(box) {
  const apply = () => {
    if (!box || !box.isConnected) return;
    void box.offsetHeight;              // レイアウト強制読み出し
    // ページ全体のスクロールを起こさないよう scrollIntoView は使わず、
    // ヒント欄そのものの scrollTop を末尾へ合わせる
    box.scrollTop = Math.max(0, box.scrollHeight - box.clientHeight);
  };
  requestAnimationFrame(() => requestAnimationFrame(() => {
    apply();
    // レイアウト遷移（フィードバック欄の出現・アニメーション）が終わってから最終補正
    setTimeout(apply, 120);
    setTimeout(apply, 400);
  }));

  // Webフォントの読み込みでヒント文の高さが後から変わることがあるため、
  // しばらくの間はサイズ変化を監視して末尾に追従させる
  try {
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(apply).catch(() => {});
  } catch {}
  try {
    if (typeof ResizeObserver === 'function') {
      const ro = new ResizeObserver(apply);
      ro.observe(box);
      for (const child of box.children) ro.observe(child);
      setTimeout(() => ro.disconnect(), 2000);
    }
  } catch {}
}

// 画面中央のアプリ内モーダル（ブラウザ標準 confirm の置き換え）。Promiseで true/false を返す。
function showConfirm({ title, message, okText = 'OK', cancelText = 'キャンセル', danger = false }) {
  return new Promise(resolve => {
    const ov = $('modal-overlay'), card = $('modal-card');
    $('modal-title').textContent = title;
    $('modal-message').textContent = message;
    $('modal-ok').textContent = okText;
    $('modal-cancel').textContent = cancelText;
    $('modal-icon').textContent = danger ? '⚠️' : '❓';
    card.classList.toggle('is-danger', danger);
    ov.classList.remove('hidden');
    const done = v => { ov.classList.add('hidden'); cleanup(); resolve(v); };
    const onOk = () => done(true), onCancel = () => done(false);
    const onBg = e => { if (e.target === ov) done(false); };
    function cleanup() {
      $('modal-ok').removeEventListener('click', onOk);
      $('modal-cancel').removeEventListener('click', onCancel);
      ov.removeEventListener('click', onBg);
    }
    $('modal-ok').addEventListener('click', onOk);
    $('modal-cancel').addEventListener('click', onCancel);
    ov.addEventListener('click', onBg);
  });
}

async function hint() {
  if (S.submitted) return;
  const q  = S.questions[S.idx];

  // ヒント2を見たら、次は「答え」になる予告（スキル: ヒント警告ブロック）
  if (S.hintLevel === 2) {
    if (!(await showConfirm({ title: '答えを見る？', message: '次のヒントは答えだよ！\n見ると不正解（ギブアップ）になります。', okText: '見る', danger: true }))) return;
  }

  S.hintLevel = Math.min(S.hintLevel + 1, 3);

  if (S.hintLevel === 1) {
    appendHintStep(
      `<b>まず「切片」から</b><br>グラフが y 軸と交わる高さ（<b>y切片</b>）は <b>(0, ${q.intercept})</b>。<br>オレンジの点に、片方の点を重ねよう！`,
      1, false);
  } else if (S.hintLevel === 2) {
    const f = toSimpleFraction(q.slope);
    let step;
    if (f) {
      const [n, d] = f;
      const dir = n >= 0 ? '上' : '下';
      step = `<b>変化の割合 ＝ 傾き</b> は ${fracHTML(n, d)} 。<br>切片から <b>右へ ${d}</b> ・ <b>${dir}へ ${Math.abs(n)}</b> 進んだところが、2つ目のオレンジ点だよ。`;
    } else {
      const a = q.slope, dir = a >= 0 ? '上' : '下';
      step = `<b>変化の割合 ＝ 傾き</b> は ${a} 。<br>切片から <b>右へ 1</b> ・ <b>${dir}へ ${Math.abs(a)}</b> 進んだところが、2つ目のオレンジ点だよ。`;
    }
    appendHintStep(`<b>傾きの分だけ進む</b><br>${step}`, 2, false);
  } else {
    // ヒント3＝答え → スキル通り、その場でギブアップ（誤答）扱い
    appendHintStep(
      `緑の点線が正しいグラフ（オレンジ2点を結んだ直線）。<br>「切片 → 傾きの分だけ進む」の順でかけるよ。次はできる！`,
      3, true);
    giveUp();
  }
  render();
}

// 答えを見た＝ギブアップ（不正解として記録し、入力を締め切る）
function giveUp() {
  if (S.submitted) return;
  S.submitted = true;
  S.correct   = false;
  const q = S.questions[S.idx];
  S.answers.push({ correct: false, q, hintLevel: 3, gaveUp: true });
  showFB(`今回は答えを見たので「ギブアップ（不正解）」だよ。でも解き方は分かったね！次の問題でリベンジしよう。`, 'warn');
  $('submit-btn').classList.add('hidden');
  $('hint-btn').setAttribute('disabled', 'true');
  $('next-btn').classList.remove('hidden');
}

// ─── 結果画面 ─────────────────────────────────────────────────────
async function showResult() {
  const max     = S.questions.length * 20;
  const cleared = S.score >= max * 0.8;

  const now  = new Date();
  const date = `${now.getMonth()+1}/${now.getDate()} ${now.getHours()}:${String(now.getMinutes()).padStart(2,'0')}`;
  saveHistory({ date, score: S.score, max });

  $('result-score').textContent = `${S.score} / ${max}点`;
  const badge = $('result-badge');
  badge.textContent = cleared ? '💮 クリア！' : '❌ もう少し！';
  badge.className   = `result-badge ${cleared ? 'ok' : 'ng'}`;

  const rl = $('review-list');
  rl.innerHTML = S.answers.map((a, i) => `
    <div class="review-item ${a.correct ? 'ok' : 'ng'}">
      <span class="rv-num">Q${i+1}</span>
      <span class="rv-eq">${formatEquationLatex(a.q.slope, a.q.intercept)}</span>
      <span class="rv-mark">${a.correct ? (a.hintLevel === 0 ? '◯⭐' : '◯') : '✕'}</span>
    </div>`).join('');

  showScreen('screen-result');
  if (window.MathJax) await MathJax.typesetPromise([rl]);
  if (cleared) fireworks(true);
}

// ─── 紙吹雪 ───────────────────────────────────────────────────────
function fireworks(big) {
  if (!window.confetti) return;
  const palettes = [
    ['#ff6b6b','#ffd93d','#6bcb77','#4d96ff'],
    ['#ffd700','#ffa500','#ffec8b'],
    ['#c0c0c0','#808080','#e8e8e8'],
  ];
  const p = palettes[Math.floor(Math.random() * palettes.length)];
  if (big) {
    confetti({ particleCount: 100, spread: 80, origin: { y: 0.55 }, colors: p });
    setTimeout(() => confetti({ particleCount: 70, spread: 60, angle:  60, origin: { x: 0, y: 0.6 }, colors: p }), 350);
    setTimeout(() => confetti({ particleCount: 70, spread: 60, angle: 120, origin: { x: 1, y: 0.6 }, colors: p }), 700);
  } else {
    confetti({ particleCount: 55, spread: 55, origin: { y: 0.7 }, colors: p });
  }
}

// ─── 正解ラインのパルス演出 ───────────────────────────────────────
function pulseLine() {
  const start = performance.now();
  function step(t) {
    const e = Math.min((t - start) / 220, 1);
    S.linePulse = 3.5 + Math.sin(e * Math.PI) * 2.5;   // 3.5→6→3.5
    render();
    if (e < 1) requestAnimationFrame(step);
    else { S.linePulse = 3.5; render(); }
  }
  requestAnimationFrame(step);
}

// 点を置いた瞬間に軽く弾ませる
function pulsePoint(idx) {
  const start = performance.now();
  function step(t) {
    const e = Math.min((t - start) / 160, 1);
    S.pulse = { idx, s: 1 + Math.sin(e * Math.PI) * 0.18 };
    render();
    if (e < 1) requestAnimationFrame(step);
    else { S.pulse = null; render(); }
  }
  requestAnimationFrame(step);
}

// ─── 初期化 ───────────────────────────────────────────────────────
function $(id) { return document.getElementById(id); }

function init() {
  canvas = $('graph-canvas');
  ctx    = canvas.getContext('2d');

  // HiDPI 対応（Chromebookでも数字・数式がくっきり）
  const dpr = window.devicePixelRatio || 1;
  canvas.width  = CANVAS_SIZE * dpr;
  canvas.height = CANVAS_SIZE * dpr;
  ctx.scale(dpr, dpr);

  canvas.addEventListener('mousedown',  onDown, { passive: false });
  canvas.addEventListener('mousemove',  onMove);
  canvas.addEventListener('mouseup',    onUp);
  canvas.addEventListener('mouseleave', onUp);
  canvas.addEventListener('touchstart', onDown, { passive: false });
  canvas.addEventListener('touchmove',  onMove, { passive: false });
  canvas.addEventListener('touchend',   onUp);

  $('start-btn').addEventListener('click', startQuiz);
  $('reset-btn').addEventListener('click', () => {
    showConfirm({ title: '履歴を消す？', message: '学習履歴と最高スコアを消すよ。', okText: '消す', danger: true }).then(ok => {
      if (!ok) return;
      try {
        localStorage.removeItem(LS_HIST);
        localStorage.removeItem(LS_HIGH);
      } catch {}
      S.history = []; S.highScore = 0;
      renderStart();
    });
  });
  $('submit-btn').addEventListener('click', submit);
  $('next-btn').addEventListener('click', next);
  $('hint-btn').addEventListener('click', hint);
  $('retry-btn').addEventListener('click', startQuiz);
  $('home-btn').addEventListener('click', () => {
    loadHistory(); renderStart(); showScreen('screen-start');
  });

  loadHistory();
  renderStart();
  showScreen('screen-start');
}

document.addEventListener('DOMContentLoaded', init);
