// Token Launch Radar — Interactive Client (dashboard/app.js)
// Shares globalThis.RadarModel (dashboard/model.js) with main.ts so one model prices board.json and UI.
(function () {
'use strict';
const D = window.RADAR_DATA, M = globalThis.RadarModel || null;
if (!D || !Array.isArray(D.rows)) return;
const defs = D.defaults || {};
const st = { cohort: 'all', verdict: 'ALL', category: 'all', chain: 'all', q: '', depositUsd: defs.deposit_usd || 10000, weeks: defs.weeks || 8, sort: 'rank', dir: 1, anchorSort: 'mcap_usd', anchorDir: -1, selected: null };
const $ = (id) => document.getElementById(id), txt = (id, v) => { $(id).textContent = v; };
const svg = $('comps-svg'), backdrop = $('sheet-backdrop'), sheet = $('tear-sheet');
const on = (el, ev, fn) => el.addEventListener(ev, fn);
const vCls = (v) => v === 'FARM' ? 'b-farm' : v === 'THIN' ? 'b-thin' : 'b-skip';

const fUsd = (n) => {
  if (n == null || !isFinite(n)) return 'n/a';
  const a = Math.abs(n), s = n < 0 ? '-' : '';
  return a >= 1e9 ? s + '$' + (a / 1e9).toFixed(2) + 'B' : a >= 1e6 ? s + '$' + (a / 1e6).toFixed(1) + 'M' : a >= 1e3 ? s + '$' + (a / 1e3).toFixed(1) + 'K' : s + '$' + Math.round(a).toLocaleString('en-US');
};
const fSgn = (n) => {
  const a = Math.abs(n), s = n > 0 ? '+' : n < 0 ? '-' : '';
  return a >= 1e6 ? s + '$' + (a / 1e6).toFixed(2) + 'M' : a >= 1e3 ? s + '$' + (a / 1e3).toFixed(1) + 'K' : s + '$' + (a >= 100 ? Math.round(a).toLocaleString('en-US') : a.toFixed(2));
};
const fEx = (n) => (n < 0 ? '-$' : '$') + Math.round(Math.abs(n)).toLocaleString('en-US');
const fCst = (n) => { const a = Math.abs(n); return (n < 0 ? '-$' : '$') + (a >= 1000 ? Math.round(a).toLocaleString('en-US') : a.toFixed(2)); };
const fMul = (n) => (n == null || !isFinite(n)) ? 'n/a' : n.toFixed(2) + 'x';
const fPct = (n) => (n == null || !isFinite(n)) ? 'unreported' : (n > 0 ? '+' : '') + n.toFixed(1) + '%';

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') on(el, k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of kids) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) c.forEach((x) => x && el.appendChild(typeof x === 'string' ? document.createTextNode(x) : x));
    else el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
}
const sp = (c, t) => h('span', c ? { class: c, text: t } : { text: t });
const bdg = (c, t) => sp('badge ' + c, t);
const dv = (c, ...k) => h('div', c ? { class: c } : null, ...k);
const td = (c, x) => typeof x === 'string' ? h('td', c ? { class: c, text: x } : { text: x }) : h('td', c ? { class: c } : null, x);
const btn = (c, t, onclick) => h('button', { type: 'button', class: c, text: t, onclick });
const kv = (l, v, c, tot) => dv('kv-line' + (tot ? ' kv-total' : ''), sp('', l), sp('mono' + (c ? ' ' + c : ''), v));
const svgEl = (t, a) => { const n = document.createElementNS(svg.namespaceURI, t); if (a) for (const [k, v] of Object.entries(a)) if (v != null) n.setAttribute(k, String(v)); return n; };

const cache = {};
function getLiveFarmPlan(r, dep, wks) {
  const k = r.slug + ':' + dep + ':' + wks;
  return cache[k] || (cache[k] = (M && M.buildDepositFarmPlan) ? M.buildDepositFarmPlan(r, r.implied_value_usd, { deposit_usd: dep, weeks: wks, as_of: D.as_of }) : r.default_farm);
}
function expectedCurveUsd(tvl) {
  const ec = D.econometrics;
  return ec.smearing_factor * Math.exp(ec.mean_log_mcap + ec.beta_tvl * (Math.log(Math.max(1, tvl)) - ec.mean_log_tvl));
}
function verifySharedEngineParity() {
  let ok = 0;
  for (const r of D.rows) {
    const dc = r.decomposition, rec = dc.base_curve_usd * dc.category_factor * dc.growth_factor * dc.seasoning_factor;
    const fOk = !M || !r.default_farm || Math.abs(getLiveFarmPlan(r, r.default_farm.deposit_usd, r.default_farm.weeks).net_ev_usd - r.default_farm.net_ev_usd) < 0.05;
    if (Math.abs(rec - r.implied_value_usd) <= Math.max(5, r.implied_value_usd * 0.002) && fOk) ok++;
  }
  return ok + ' / ' + D.rows.length + ' EXACT';
}

function renderMastheadAndOos() {
  const s = D.summary, ec = D.econometrics, loo = ec.loo_cv, wf = ec.walk_forward_cv;
  txt('model-tag', D.model_version + ' · model.js');
  txt('stat-asof', D.as_of);
  txt('stat-source', s.total_snapshot_protocols + ' protocols · $' + Math.round(D.floor_usd / 1e6) + 'M floor');
  txt('stat-coverage', s.watchlist_covered + '/' + s.watchlist_total + ' + ' + s.sub_floor_discovery_rows);
  txt('stat-discovery', s.watchlist_covered + ' watchlist + ' + s.sub_floor_discovery_rows + ' sub-$50M');
  txt('stat-parity', verifySharedEngineParity());
  txt('stat-anchors', ec.n_anchors + ' 1-per-ticker comps');
  txt('model-equation', ec.equation);
  txt('oos-win-badge', 'LOO -' + loo.mdae_improvement_pct.toFixed(1) + '% · Walk-Fwd -' + wf.mdae_improvement_pct.toFixed(1) + '% MdAE');
  const tb = $('oos-tbody'); tb.textContent = '';
  const fmtErr = (x) => x.log_mdae.toFixed(3) + ' MdAE (' + x.mult_mdae_x.toFixed(2) + 'x) · ' + x.log_rmse.toFixed(2) + ' RMSE';
  for (const [lbl, m, b, gMd, gMa] of [
    ['LOO-CV (n=' + loo.n_anchors + ' tickers)', loo.selected_model, loo.baseline_flat, loo.mdae_improvement_pct, loo.mae_improvement_pct],
    ['Walk-Fwd >=' + wf.split_listed_at + ' (' + wf.n_train_initial + '->' + wf.n_test_out_of_time + ')', wf.comps_curve, wf.baseline_flat, wf.mdae_improvement_pct, wf.mae_improvement_pct]
  ]) tb.appendChild(h('tr', null, td('', lbl), td('num-col', fmtErr(m)), td('num-col muted', fmtErr(b)), td('num-col', sp('gain-pill', '-' + gMd.toFixed(1) + '% MdAE / -' + gMa.toFixed(1) + '% MAE'))));
  if (Array.isArray(loo.nested_steps)) txt('oos-footnote', 'LOO log-MAE (' + loo.nested_steps.map((x) => 'M' + x.level + ':' + x.log_mae.toFixed(3)).join('->') + '). ' + (defs.bootstrap_refits || 200) + ' bootstrap refits give P10–P90 & [rank_best..rank_worst]. DefiLlama records no token (null fields), not proof none exists.');
}

function renderCalibrationSvg() {
  svg.textContent = '';
  const W = 640, H = 158, pL = 44, pR = 12, pT = 10, pB = 20, pW = W - pL - pR, pH = H - pT - pB;
  const minX = 6.6, maxX = 10.3, minY = 5.3, maxY = 9.7;
  const sx = (v) => pL + ((Math.min(maxX, Math.max(minX, v)) - minX) / (maxX - minX)) * pW;
  const sy = (v) => pT + pH - ((Math.min(maxY, Math.max(minY, v)) - minY) / (maxY - minY)) * pH;
  const lb = { 6: '$1M', 7: '$10M', 8: '$100M', 9: '$1B', 10: '$10B' };
  for (const [vals, isX] of [[[7, 8, 9, 10], 1], [[6, 7, 8, 9], 0]]) for (const g of vals) {
    const c = (isX ? sx : sy)(g).toFixed(1), t = svgEl('text', isX ? { x: c, y: H - 4, 'text-anchor': 'middle', class: 'svg-axis-lbl' } : { x: pL - 4, y: (+c + 3).toFixed(1), 'text-anchor': 'end', class: 'svg-axis-lbl' });
    svg.appendChild(svgEl('line', isX ? { x1: c, y1: pT, x2: c, y2: pT + pH, class: 'svg-grid' } : { x1: pL, y1: c, x2: W - pR, y2: c, class: 'svg-grid' }));
    t.textContent = lb[g] + (isX ? ' TVL' : ''); svg.appendChild(t);
  }
  const fx = sx(Math.log10(D.floor_usd)), ft = svgEl('text', { x: (fx + 4).toFixed(1), y: pT + 9, class: 'svg-axis-lbl' });
  svg.appendChild(svgEl('line', { x1: fx.toFixed(1), y1: pT, x2: fx.toFixed(1), y2: pT + pH, class: 'svg-floor' }));
  ft.textContent = '$50M Floor'; svg.appendChild(ft);

  const flatM = D.econometrics.flat_median_multiple, bT = [], bB = [], fP = [], flP = [];
  for (let i = 0; i <= 24; i++) {
    const lx = minX + (i / 24) * (maxX - minX), tvl = Math.pow(10, lx), ly = Math.log10(expectedCurveUsd(tvl)), x = sx(lx).toFixed(1);
    fP.push(x + ',' + sy(ly).toFixed(1)); flP.push(x + ',' + sy(Math.log10(Math.max(1, flatM * tvl))).toFixed(1));
    bT.push(x + ',' + sy(ly + 0.25).toFixed(1)); bB.unshift(x + ',' + sy(ly - 0.25).toFixed(1));
  }
  svg.appendChild(svgEl('polygon', { points: bT.concat(bB).join(' '), class: 'svg-band' }));
  svg.appendChild(svgEl('polyline', { points: flP.join(' '), class: 'svg-flat-line' }));
  svg.appendChild(svgEl('polyline', { points: fP.join(' '), class: 'svg-fit-line' }));

  for (const a of D.anchors) {
    if (a.tvl_usd <= 0 || a.mcap_usd <= 0) continue;
    const c = svgEl('circle', { cx: sx(Math.log10(a.tvl_usd)).toFixed(1), cy: sy(Math.log10(a.mcap_usd)).toFixed(1), r: '2.6', class: 'pt-anchor' });
    on(c, 'mouseenter', () => txt('chart-readout', 'Anchor $' + a.symbol + ' (' + a.name + '): TVL ' + fUsd(a.tvl_usd) + ' · MCap ' + fUsd(a.mcap_usd) + ' (' + fMul(a.mcap_tvl_multiple) + ')'));
    on(c, 'click', () => { st.cohort = 'anchors'; st.q = $('q-input').value = a.symbol; syncHash(); renderAll(); });
    svg.appendChild(c);
  }
  for (const r of D.rows) {
    const px = sx(Math.log10(r.tvl_usd)), py = sy(Math.log10(r.implied_value_usd)), sel = st.selected === r.slug;
    if (sel) {
      svg.appendChild(svgEl('line', { x1: px.toFixed(1), y1: pT, x2: px.toFixed(1), y2: pT + pH, class: 'svg-cross' }));
      svg.appendChild(svgEl('line', { x1: pL, y1: py.toFixed(1), x2: W - pR, y2: py.toFixed(1), class: 'svg-cross' }));
    }
    const d = sel ? 4.8 : r.is_watchlist ? 3.2 : 2.5;
    const pts = r.is_watchlist ? `${px},${py - d} ${px + d},${py} ${px},${py + d} ${px - d},${py}` : `${px},${py - d} ${px + d},${py + d} ${px - d},${py + d}`;
    const node = svgEl('polygon', { points: pts, 'data-slug': r.slug, class: (r.is_watchlist ? 'pt-wl' : 'pt-disc') + (sel ? ' pt-active' : '') });
    on(node, 'mouseenter', () => txt('chart-readout', '#' + r.rank + ' ' + r.name + ': TVL ' + fUsd(r.tvl_usd) + ' -> Implied ' + fUsd(r.implied_value_usd) + ' (' + fMul(r.implied_tvl_multiple) + ')'));
    on(node, 'click', () => openSheet(r.slug));
    svg.appendChild(node);
  }
}

function makeHead(cols, isAnc) {
  const ck = isAnc ? st.anchorSort : st.sort, cd = isAnc ? st.anchorDir : st.dir;
  return h('thead', null, h('tr', null, cols.map(([lbl, key, r]) => {
    if (!key) return h('th', r ? { class: 'r-align', text: lbl } : { text: lbl });
    const act = ck === key;
    return h('th', r ? { class: 'r-align' } : null, btn('sort-th' + (act ? ' is-sorted' : ''), lbl + (act ? (cd > 0 ? ' \u2191' : ' \u2193') : ''), () => {
      if (isAnc) { st.anchorDir = st.anchorSort === key ? -st.anchorDir : (key === 'name' ? 1 : -1); st.anchorSort = key; }
      else { st.dir = st.sort === key ? -st.dir : (key === 'rank' || key === 'name' || key === 'breakeven_bps' ? 1 : -1); st.sort = key; }
      syncHash(); renderBoardView();
    }));
  })));
}

function renderAnchorsTable() {
  const q = st.q.trim().toLowerCase();
  const list = D.anchors.filter((a) => (st.category === 'all' || a.category === st.category) && (st.chain === 'all' || a.chains.includes(st.chain)) && (!q || (a.symbol + ' ' + a.name + ' ' + a.slug + ' ' + a.category + ' ' + a.chains.join(' ')).toLowerCase().includes(q)))
    .map((a) => { const fit = expectedCurveUsd(a.tvl_usd); return { a, fit, resid: Math.log(a.mcap_usd / fit) }; })
    .sort((x, y) => {
      const k = st.anchorSort, d = st.anchorDir;
      const av = k === 'name' ? x.a.name.toLowerCase() : k === 'fitted_usd' ? x.fit : (x.a[k] ?? -1e18);
      const bv = k === 'name' ? y.a.name.toLowerCase() : k === 'fitted_usd' ? y.fit : (y.a[k] ?? -1e18);
      return av < bv ? -d : av > bv ? d : 0;
    });
  txt('row-status', list.length + ' of ' + D.anchors.length + ' canonical traded anchors');
  if (!list.length) return dv('empty-box', h('strong', { text: 'No traded anchors match filters.' }), h('p', { text: 'Reset filters to inspect all 94 canonical families.' }), btn('reset-btn', 'Reset', resetFilters));
  return h('table', { class: 'radar-table' },
    makeHead([['Ticker', null, 0], ['Canonical Traded Anchor (1-Per-Ticker)', 'name', 0], ['Category', null, 0], ['Aggregated TVL', 'tvl_usd', 1], ['Live MCap', 'mcap_usd', 1], ['MCap/TVL', 'mcap_tvl_multiple', 1], ['Curve Fit', 'fitted_usd', 1], ['Log Resid', null, 1], ['7d Flow', 'change_7d', 1]], true),
    h('tbody', null, list.map(({ a, fit, resid }) => h('tr', null,
      td('mono', bdg('b-wl', '$' + a.symbol)),
      td('', dv('p-cell', dv('p-top', sp('p-name', a.name), a.merged_count > 1 && bdg('b-disc', a.merged_count + ' merged')), sp('p-sub', a.chains.slice(0, 3).join(', ') + (a.chains.length > 3 ? ' +' + (a.chains.length - 3) : '') + ' · Set aside from pre-token board'))),
      td('', bdg('b-cat', a.category)), td('mono r-align', fUsd(a.tvl_usd)), td('mono r-align', fUsd(a.mcap_usd)),
      td('mono r-align', fMul(a.mcap_tvl_multiple)), td('mono r-align', fUsd(fit)),
      td('mono r-align muted', (resid >= 0 ? '+' : '') + resid.toFixed(2)),
      td('mono r-align ' + (a.change_7d == null ? 'muted' : a.change_7d >= 0 ? 'pos' : 'neg'), fPct(a.change_7d))
    )))
  );
}

const syncBtns = (id, sel, attr, val) => $(id).querySelectorAll(sel).forEach((b) => b.classList.toggle('is-active', b.getAttribute(attr) == val));

function renderBoardView() {
  txt('cnt-all', D.rows.length); txt('cnt-wl', D.summary.watchlist_covered); txt('cnt-disc', D.summary.sub_floor_discovery_rows); txt('cnt-anch', D.anchors.length);
  syncBtns('cohort-tabs', '.cohort-tab', 'data-cohort', st.cohort);
  syncBtns('deposit-group', '.seg-btn', 'data-deposit', st.depositUsd);
  syncBtns('horizon-group', '.seg-btn', 'data-weeks', st.weeks);
  $('reset-btn').hidden = !(st.cohort !== 'all' || st.verdict !== 'ALL' || st.category !== 'all' || st.chain !== 'all' || st.q.trim() !== '');
  txt('stat-sizing', '$' + st.depositUsd.toLocaleString('en-US') + ' · ' + st.weeks + 'w');

  const wrap = $('table-wrap');
  if (st.cohort === 'anchors') { $('verdict-bar').style.opacity = '0.45'; wrap.textContent = ''; wrap.appendChild(renderAnchorsTable()); return; }
  $('verdict-bar').style.opacity = '1';

  const q = st.q.trim().toLowerCase();
  const base = D.rows.filter((r) => (st.cohort !== 'watchlist' || r.is_watchlist) && (st.cohort !== 'discovery' || !r.is_watchlist) && (st.category === 'all' || r.category === st.category) && (st.chain === 'all' || r.chains.includes(st.chain)) && (!q || (r.name + ' ' + r.slug + ' ' + r.category_label + ' ' + r.chains.join(' ')).toLowerCase().includes(q)));
  const vc = { ALL: base.length, FARM: 0, THIN: 0, SKIP: 0 };
  const enriched = base.map((r) => { const fp = getLiveFarmPlan(r, st.depositUsd, st.weeks); vc[fp.verdict]++; return { r, fp }; });
  txt('cnt-v-all', '(' + vc.ALL + ')'); txt('cnt-v-farm', '(' + vc.FARM + ')'); txt('cnt-v-thin', '(' + vc.THIN + ')'); txt('cnt-v-skip', '(' + vc.SKIP + ')');
  txt('stat-verdicts', vc.FARM + ' FARM · ' + vc.THIN + ' THIN · ' + vc.SKIP + ' SKIP');
  syncBtns('verdict-bar', '.v-btn', 'data-verdict', st.verdict);

  const shown = (st.verdict === 'ALL' ? enriched : enriched.filter((x) => x.fp.verdict === st.verdict)).sort((a, b) => {
    const k = st.sort, d = st.dir;
    const val = (x) => k === 'name' ? x.r.name.toLowerCase() : k === 'net_ev_usd' ? x.fp.net_ev_usd : k === 'breakeven_bps' ? x.fp.breakeven_bps : k === 'change_7d' ? (x.r.change_7d ?? -999999) : k === 'age_days' ? (x.r.age_days ?? -1) : x.r[k];
    const av = val(a), bv = val(b);
    return av < bv ? -d : av > bv ? d : a.r.rank - b.r.rank;
  });

  txt('row-status', shown.length + ' shown · ' + vc.FARM + ' FARM @ $' + (st.depositUsd / 1000) + 'k/' + st.weeks + 'w');
  wrap.textContent = '';
  if (!shown.length) { wrap.appendChild(dv('empty-box', h('strong', { text: 'No protocols match active filters.' }), h('p', { text: 'Adjust deposit sizing, verdict filter, or cohort.' }), btn('reset-btn', 'Reset', resetFilters))); return; }

  let minL = 5.6, maxL = 9.0;
  for (const r of D.rows) { minL = Math.min(minL, Math.log10(Math.max(1, r.p10_value_usd))); maxL = Math.max(maxL, Math.log10(Math.max(1, r.p90_value_usd))); }
  const pos = (v) => Math.max(0, Math.min(100, ((Math.log10(Math.max(1, v)) - minL) / (maxL - minL)) * 100));

  wrap.appendChild(h('table', { class: 'radar-table' },
    makeHead([['Rank / 200-Band', 'rank', 0], ['Protocol & Snapshot Record', 'name', 0], ['Category', null, 0], ['Implied FDV (P10–P90)', 'implied_value_usd', 1], ['Snapshot TVL', 'tvl_usd', 1], ['7d Growth', 'change_7d', 1], ['Unminted', 'age_days', 1], ['Net Farm EV', 'net_ev_usd', 1], ['Verdict / BE', 'breakeven_bps', 1]], false),
    h('tbody', null, shown.map(({ r, fp }) => {
      const ch = r.chains.slice(0, 2).join(', ') + (r.chains.length > 2 ? ' +' + (r.chains.length - 2) : '');
      const p10 = pos(r.p10_value_usd), p50 = pos(r.implied_value_usd), p90 = pos(r.p90_value_usd);
      return h('tr', {
        class: st.selected === r.slug ? 'is-selected' : '', tabindex: '0', 'data-slug': r.slug,
        onclick: () => openSheet(r.slug),
        onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openSheet(r.slug); } }
      },
        td('', dv('rk-cell', sp('rk-main', '#' + r.rank), sp('rk-band', '[' + r.rank_best + '..' + r.rank_worst + ']'))),
        td('', dv('p-cell', dv('p-top', sp('p-name', r.name), bdg(r.is_watchlist ? 'b-wl' : 'b-disc', r.is_watchlist ? 'WATCHLIST' : 'SUB-$50M')), sp('p-sub', ch + ' · Records no token'))),
        td('', dv('rk-cell', bdg('b-cat', r.category_label), sp('rk-band', fMul(r.implied_tvl_multiple) + ' TVL'))),
        td('r-align', dv('fdv-stack', sp('fdv-main', fUsd(r.implied_value_usd)), dv('ci-track', h('i', { class: 'ci-span', style: 'left:' + p10.toFixed(1) + '%;width:' + Math.max(3, p90 - p10).toFixed(1) + '%' }), h('i', { class: 'ci-mid', style: 'left:' + p50.toFixed(1) + '%' })), sp('fdv-sub', fUsd(r.p10_value_usd) + ' – ' + fUsd(r.p90_value_usd)))),
        td('mono r-align', fUsd(r.tvl_usd)),
        td('mono r-align ' + (r.change_7d == null ? 'muted' : r.change_7d >= 0 ? 'pos' : 'neg'), fPct(r.change_7d)),
        td('mono r-align', dv('fdv-stack', sp('', r.age_days == null ? 'unlisted' : r.age_days + 'd'), sp('fdv-sub', r.listed_at ? r.listed_at.slice(0, 7) : 'no date'))),
        td('r-align', dv('ev-stack', sp('fdv-main ' + (fp.net_ev_usd > 0 ? 'pos' : 'neg'), fSgn(fp.net_ev_usd)), sp('fdv-sub', 'Gross ' + fCst(fp.gross_airdrop_usd) + ' − Cost ' + fCst(fp.total_cost_usd)))),
        td('r-align', dv('ev-stack', bdg(vCls(fp.verdict), fp.verdict), sp('fdv-sub', 'BE ' + Math.round(fp.breakeven_bps) + ' bps')))
      );
    }))
  ));
}

function renderTearSheet(row) {
  const fp = getLiveFarmPlan(row, st.depositUsd, st.weeks), dc = row.decomposition;
  sheet.textContent = '';
  sheet.appendChild(dv('ts-head',
    dv('',
      dv('ts-badges',
        bdg('b-wl', 'RANK #' + row.rank + ' [200-REFIT #' + row.rank_best + '..#' + row.rank_worst + ']'),
        bdg(row.is_watchlist ? 'b-wl' : 'b-disc', row.is_watchlist ? 'WATCHLIST >=$50M' : 'SUB-$50M DISCOVERY'),
        bdg('b-cat', row.category_label), fp.kyc_gated && bdg('b-thin', 'KYC / PERMISSIONED'),
        bdg(vCls(fp.verdict), fp.verdict + ' (' + fSgn(fp.net_ev_usd) + ')')
      ),
      h('h2', { class: 'ts-title', id: 'sheet-title', text: row.name }),
      h('p', { class: 'ts-record-note', text: row.token_record_note + ' · Chains: ' + row.chains.slice(0, 6).join(', ') + (row.listed_at ? ' · Tracked since ' + row.listed_at : '') })
    ),
    btn('close-btn', 'Close [Esc]', closeSheet)
  ));

  sheet.appendChild(dv('ts-kpi-strip', ...[
    ['IMPLIED LAUNCH FDV', fUsd(row.implied_value_usd), fEx(row.implied_value_usd), ''],
    ['200-REFIT P10–P90', fUsd(row.p10_value_usd) + '–' + fUsd(row.p90_value_usd), 'P50 ' + fUsd(row.p50_value_usd) + ' · [#' + row.rank_best + '..#' + row.rank_worst + ']', ''],
    ['SNAPSHOT TVL & MULT', fUsd(row.tvl_usd), fMul(row.implied_tvl_multiple) + ' TVL · 7d ' + fPct(row.change_7d), ''],
    ['NET EV ($' + (st.depositUsd / 1000) + 'K · ' + st.weeks + 'W)', fSgn(fp.net_ev_usd), 'BE ' + Math.round(fp.breakeven_bps) + ' bps · Review ' + fp.review_date, fp.net_ev_usd >= 0 ? ' emerald-ink' : ' rust-ink']
  ].map(([k, v, s, c]) => dv('ts-kpi', dv('ts-kpi-k', k), dv('ts-kpi-v' + c, v), dv('ts-kpi-s mono', s)))));

  const sizer = dv('seg-group',
    [2500, 10000, 50000].map((dep) => btn('seg-btn' + (st.depositUsd === dep ? ' is-active' : ''), '$' + (dep / 1000) + 'k', () => { st.depositUsd = dep; syncHash(); renderAll(); })),
    [4, 8, 16].map((wk) => btn('seg-btn' + (st.weeks === wk ? ' is-active' : ''), wk + 'w', () => { st.weeks = wk; syncHash(); renderAll(); }))
  );

  sheet.appendChild(dv('ts-grid',
    dv('',
      h('section', { class: 'ts-card', style: 'margin-bottom:8px' },
        dv('ts-card-hdr', h('h3', { class: 'ts-card-title', text: 'Valuation Decomposition' }), sp('ts-card-sub', 'fitOnePerTickerComps')),
        dv('decomp-list', ...[
          ['1. Snapshot TVL (' + D.as_of + ')', fEx(row.tvl_usd)],
          ['2. Power-Law Base (β=' + D.econometrics.beta_tvl.toFixed(3) + ')', fUsd(dc.base_curve_usd) + ' (' + D.econometrics.smearing_factor.toFixed(2) + 'x smear)'],
          ['3. Category EB (' + row.category_label + ')', dc.category_factor.toFixed(3) + 'x'],
          ['4. 7d Flow (' + fPct(row.change_7d) + ')', dc.growth_factor.toFixed(3) + 'x'],
          ['5. Seasoning (' + (row.age_days == null ? 'unlisted' : row.age_days + 'd') + ')', dc.seasoning_factor.toFixed(3) + 'x (S=' + dc.season_score.toFixed(2) + ')'],
          ['6. Implied Launch FDV (board.json)', fEx(row.implied_value_usd) + ' (' + fMul(row.implied_tvl_multiple) + ')', '', 1]
        ].map((x) => kv(x[0], x[1], x[2], x[3])))
      ),
      h('section', { class: 'ts-card' },
        dv('ts-card-hdr', h('h3', { class: 'ts-card-title', text: '3 Nearest Traded-Token Comps' }), sp('ts-card-sub', 'findNearestTradedComps')),
        h('table', { class: 'comps-mini-table' },
          h('thead', null, h('tr', null, ['Ticker', 'Anchor', 'TVL', 'MCap', 'MCap/TVL'].map((t, i) => h('th', i > 1 ? { class: 'r-align', text: t } : { text: t })))),
          h('tbody', null, (row.nearest_comps || []).map((c) => h('tr', null, td('mono', '$' + c.symbol), td('', c.name), td('mono r-align', fUsd(c.tvl_usd)), td('mono r-align', fUsd(c.mcap_usd)), td('mono r-align', fMul(c.mcap_tvl_multiple)))))
        )
      )
    ),
    h('section', { class: 'ts-card' },
      dv('ts-card-hdr', h('h3', { class: 'ts-card-title', text: 'Dollar-Itemized Farm Cost & EV' }), sizer),
      dv('ledger-list', ...[
        ['Mechanism & Venue', fp.mechanism_label + ' · ' + fp.execution_chain],
        ['Principal & Exit', fEx(fp.deposit_usd) + ' · ' + fp.weeks + 'w (-> ' + fp.review_date + ')'],
        ['Gross Airdrop (' + fp.airdrop_bps + ' bps)', '+' + fCst(fp.gross_airdrop_usd), 'pos'],
        ['Gas + Bridge (' + fp.tx_count + ' txs)', '-' + fCst(fp.gas_bridge_usd), 'neg'],
        ['Slippage & Funding Drag', '-' + fCst(fp.execution_drag_usd), 'neg'],
        ['Net 4.5% USDC Opp. Cost', '-' + fCst(fp.opp_cost_usd) + ' (' + fCst(fp.gross_opp_cost_usd) + '−' + fCst(fp.native_yield_offset_usd) + ')', 'neg'],
        ['Net Expected EV & BE', fSgn(fp.net_ev_usd) + ' (' + fp.net_roi_pct.toFixed(2) + '%) · BE ' + Math.round(fp.breakeven_bps) + ' bps', fp.net_ev_usd >= 0 ? 'pos' : 'neg', 1]
      ].map((x) => kv(x[0], x[1], x[2], x[3]))),
      h('p', { class: 'ts-note', text: fp.verdict + ': ' + fp.verdict_reason + (fp.risk_note ? ' ' + fp.risk_note : '') })
    )
  ));

  const steps = fp.farm_steps || [];
  sheet.appendChild(h('section', { class: 'ts-card' },
    dv('ts-card-hdr', h('h3', { class: 'ts-card-title', text: 'Concrete Dated Farming Playbook (' + steps.length + ' Steps)' }), sp('ts-card-sub', 'Midpoint ' + fp.midpoint_date + ' · Exit ' + fp.review_date)),
    h('ol', { class: 'steps-grid' }, steps.map((s, i) => h('li', { class: 'step-item' }, sp('step-num', '0' + (i + 1)), sp('', String(s).replace(/^\d+\.\s*/, '')))))
  ));
}

function openSheet(slug) {
  if (!slug) return closeSheet();
  const found = D.rows.find((r) => r.slug === slug);
  if (!found) return;
  st.selected = slug; backdrop.hidden = false; renderTearSheet(found); renderCalibrationSvg(); renderBoardView(); syncHash();
}
function closeSheet() { st.selected = null; backdrop.hidden = true; renderCalibrationSvg(); renderBoardView(); syncHash(); }
function resetFilters() {
  Object.assign(st, { cohort: 'all', verdict: 'ALL', category: 'all', chain: 'all', q: '' });
  $('q-input').value = ''; $('cat-select').value = 'all'; $('chain-select').value = 'all'; syncHash(); renderAll();
}

const HKEYS = [['cohort', 'cohort', 'all'], ['verdict', 'verdict', 'ALL'], ['category', 'cat', 'all'], ['chain', 'chain', 'all'], ['q', 'q', ''], ['depositUsd', 'deposit', 10000], ['weeks', 'weeks', 8], ['selected', 'slug', null]];
function syncHash() {
  const p = new URLSearchParams();
  for (const [k, hk, def] of HKEYS) { const v = typeof st[k] === 'string' ? st[k].trim() : st[k]; if (v && v !== def) p.set(hk, String(v)); }
  const s = p.toString();
  try { history.replaceState(null, '', s ? '#' + s : location.pathname + location.search); } catch (_e) {}
}
function applyPatch(p) {
  if (!p) return;
  if (p.cohort) st.cohort = p.cohort;
  if (p.verdict) st.verdict = String(p.verdict).toUpperCase();
  if (p.category !== undefined || p.cat) st.category = $('cat-select').value = p.category ?? p.cat;
  if (p.chain !== undefined) st.chain = $('chain-select').value = p.chain;
  if (p.q !== undefined) st.q = $('q-input').value = p.q;
  if (p.depositUsd || p.deposit) st.depositUsd = Number(p.depositUsd || p.deposit) || 10000;
  if (p.weeks) st.weeks = Number(p.weeks) || 8;
  if (p.sort) st.sort = p.sort;
  if (p.dir !== undefined) st.dir = p.dir;
  if (p.slug !== undefined) st.selected = p.slug;
}
function renderAll() {
  renderCalibrationSvg(); renderBoardView();
  const found = st.selected ? D.rows.find((r) => r.slug === st.selected) : null;
  backdrop.hidden = !found; if (found) renderTearSheet(found);
}

(D.categories || []).forEach((c) => $('cat-select').appendChild(h('option', { value: c.category, text: c.category + ' (' + c.count + ' · ' + c.category_factor.toFixed(2) + 'x)' })));
(D.chains || []).slice(0, 45).forEach((c) => $('chain-select').appendChild(h('option', { value: c.chain, text: c.chain + ' (' + c.count + ')' })));

for (const [id, sel, attr, key, num, all] of [
  ['cohort-tabs', '.cohort-tab', 'data-cohort', 'cohort', 0, 1],
  ['verdict-bar', '.v-btn', 'data-verdict', 'verdict', 0, 0],
  ['deposit-group', '.seg-btn', 'data-deposit', 'depositUsd', 1, 1],
  ['horizon-group', '.seg-btn', 'data-weeks', 'weeks', 1, 1]
]) on($(id), 'click', (e) => {
  const b = e.target.closest(sel);
  if (!b || (!all && st.cohort === 'anchors')) return;
  st[key] = num ? Number(b.getAttribute(attr)) : b.getAttribute(attr);
  syncHash(); all ? renderAll() : renderBoardView();
});
for (const [id, ev, k] of [['q-input', 'input', 'q'], ['cat-select', 'change', 'category'], ['chain-select', 'change', 'chain']]) {
  on($(id), ev, () => { st[k] = $(id).value; syncHash(); renderBoardView(); });
}
on($('reset-btn'), 'click', resetFilters);
on(backdrop, 'click', (e) => { if (e.target === backdrop) closeSheet(); });
on(document, 'keydown', (e) => {
  if (e.key === 'Escape' && !backdrop.hidden) closeSheet();
  else if (e.key === '/' && document.activeElement !== $('q-input')) { e.preventDefault(); $('q-input').focus(); }
});

window.selectProtocol = openSheet;
window.setRadarState = (p) => { applyPatch(p); syncHash(); renderAll(); };

renderMastheadAndOos();
applyPatch(Object.fromEntries(new URLSearchParams(location.hash.replace(/^#/, ''))));
renderAll();
})();
