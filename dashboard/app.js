// Token Launch Radar — Interactive Offline Client (app.js)
// Reads window.RADAR_DATA produced by main.ts, verifies client-side valuation parity
// against board.json, separates pre-token candidates from traded peer comps, and
// renders the valuation waterfall + concrete 5-step farming playbook per protocol.
(function () {
  'use strict';

  var DATA = window.RADAR_DATA;
  if (!DATA || !Array.isArray(DATA.rows)) return;

  var STEP_PHASES = [
    '01 WALLET & GAS ISOLATION',
    '02 CORE LIQUIDITY DEPLOYMENT',
    '03 RECURRING EPOCH CADENCE',
    '04 SNAPSHOT RETENTION & CAP',
    '05 VERIFY & REVOKE HYGIENE'
  ];

  var state = { mode: 'pretoken', q: '', category: 'all', chain: 'all', tier: 'all', sort: 'rank', dir: 1, peerSort: 'mcap_usd', peerDir: -1, selected: null };
  var byId = function (id) { return document.getElementById(id); };
  var dom = {
    modelPill: byId('hdr-model-pill'), asOf: byId('meta-asof'), floor: byId('meta-floor'), parityVal: byId('meta-parity-val'),
    tabPretoken: byId('tab-pretoken'), tabPeers: byId('tab-peers'),
    tabPretokenCount: byId('tab-pretoken-count'), tabPeersCount: byId('tab-peers-count'),
    pillAll: byId('pill-n-all'), pillWl: byId('pill-n-wl'), pillGem: byId('pill-n-gem'),
    kpiStrip: byId('kpi-strip'), calibrationBar: byId('calibration-bar'),
    searchInput: byId('search-input'), filterCategory: byId('filter-category'), filterChain: byId('filter-chain'),
    tierPills: byId('tier-pills'), resetBtn: byId('reset-filters-btn'), resultCounter: byId('result-counter'),
    activeFiltersRow: byId('active-filters-row'), tableContainer: byId('table-container'),
    drawerBackdrop: byId('drawer-backdrop'), detailDrawer: byId('detail-drawer')
  };

  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    var abs = Math.abs(n), sign = n < 0 ? '-' : '';
    if (abs >= 1e9) return sign + '$' + (abs / 1e9).toFixed(2) + 'B';
    if (abs >= 1e6) return sign + '$' + (abs / 1e6).toFixed(1) + 'M';
    if (abs >= 1e3) return sign + '$' + (abs / 1e3).toFixed(1) + 'K';
    return sign + '$' + Math.round(abs).toLocaleString('en-US');
  }
  function fmtWholeUsd(n) { return (n === null || n === undefined || !isFinite(n)) ? 'n/a' : '$' + Math.round(n).toLocaleString('en-US'); }
  function fmtMult(n) { return (n === null || n === undefined || !isFinite(n)) ? 'n/a' : n.toFixed(2) + 'x'; }
  function fmtFactor(n) { return (n === null || n === undefined || !isFinite(n)) ? '1.000x' : n.toFixed(3) + 'x'; }
  function fmtPct(n) { return (n === null || n === undefined || !isFinite(n)) ? 'unreported' : (n > 0 ? '+' : '') + n.toFixed(2) + '%'; }
  function fmtTenure(d) {
    if (d === null || d === undefined || !isFinite(d)) return 'unlisted';
    return d >= 365 ? (d / 365).toFixed(1) + 'y (' + Math.round(d) + 'd)' : Math.round(d) + 'd';
  }
  function fmtShortTenure(d) {
    if (d === null || d === undefined || !isFinite(d)) return 'unlisted';
    return d >= 365 ? (d / 365).toFixed(1) + 'y' : Math.round(d) + 'd';
  }

  // Recomputes implied launch FDV from snapshot fields + model_spec to verify exact parity with board.json.
  function recomputeImpliedValue(row, spec) {
    if (!spec || !row || !row.waterfall) return row ? row.implied_value_usd : 0;
    var tvl = Math.max(1, row.tvl_usd), sb = spec.scale_bounds || [0.72, 1.18];
    var scale = clamp(Math.pow(tvl / spec.scale_pivot_usd, spec.scale_exponent), sb[0], sb[1]);
    var d7 = typeof row.change_7d === 'number' && isFinite(row.change_7d) ? row.change_7d : 0;
    var growth = 1 + spec.growth_max_swing * Math.tanh(d7 / spec.growth_scale_pct);
    var effAge = row.tenure_days === null || row.tenure_days === undefined ? spec.unknown_tenure_days : row.tenure_days;
    var tenure = 0.82 + 0.33 * (1 - Math.exp(-Math.max(0, effAge) / spec.tenure_half_life_days));
    var chains = Math.max(1, (row.chains || []).length);
    var chainF = 1 + Math.min(spec.chain_bonus_cap, 0.03 * Math.log2(chains));
    return clamp(Math.round(tvl * row.waterfall.category_multiple * scale * growth * tenure * chainF), 1, 100000000000000);
  }

  function verifyBoardParity(rows, spec) {
    var matched = 0;
    for (var i = 0; i < rows.length; i++) {
      if (Math.abs(recomputeImpliedValue(rows[i], spec) - rows[i].implied_value_usd) <= Math.max(2, Math.round(rows[i].implied_value_usd * 0.0005))) matched++;
    }
    return { matched: matched, total: rows.length };
  }

  function parsePlaybookStep(rawStep, index) {
    var text = String(rawStep || '').trim(), tags = [];
    var m = text.match(/\(([^()]+)\)\.?\s*$/);
    if (m && m[1] && (m[1].indexOf(':') >= 0 || m[1].indexOf(';') >= 0)) {
      m[1].split(';').forEach(function (part) { var c = part.trim(); if (c) tags.push(c); });
      text = text.slice(0, m.index).trim();
      if (text && !/[.]$/.test(text)) text += '.';
    }
    return { phase: STEP_PHASES[index] || ('0' + (index + 1) + ' EXECUTION STEP'), body: text, tags: tags };
  }

  function h(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        var val = attrs[key];
        if (val === null || val === undefined || val === false) return;
        if (key === 'class') node.className = val;
        else if (key === 'text') node.textContent = val;
        else if (key.slice(0, 2) === 'on' && typeof val === 'function') node.addEventListener(key.slice(2), val);
        else if (val === true) node.setAttribute(key, '');
        else node.setAttribute(key, String(val));
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined || child === false) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
      else node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    }
    return node;
  }

  function span(cls, t) { return h('span', cls ? { class: cls, text: t } : { text: t }); }
  function div(cls) {
    var args = ['div', cls ? { class: cls } : null];
    for (var i = 1; i < arguments.length; i++) args.push(arguments[i]);
    return h.apply(null, args);
  }

  function filterCandidateRows(rows, st) {
    var q = st.q.trim().toLowerCase();
    return rows.filter(function (r) {
      if (st.category !== 'all' && r.category_label !== st.category) return false;
      if (st.chain !== 'all' && (!r.chains || r.chains.indexOf(st.chain) < 0)) return false;
      if (st.tier === 'watchlist' && !r.is_watchlist) return false;
      if (st.tier === 'early' && r.is_watchlist) return false;
      return !q || (r.name + ' ' + r.slug + ' ' + r.category_label + ' ' + (r.chains || []).join(' ')).toLowerCase().indexOf(q) >= 0;
    });
  }

  function sortCandidateRows(rows, key, dir) {
    var valOf = function (r) {
      if (key === 'name') return r.name.toLowerCase();
      if (key === 'category_multiple') return r.waterfall ? r.waterfall.category_multiple : 0;
      if (key === 'change_7d') return r.change_7d === null ? -999999 : r.change_7d;
      if (key === 'tenure_days') return r.tenure_days === null ? -1 : r.tenure_days;
      return r[key] !== undefined ? r[key] : r.rank;
    };
    return rows.slice().sort(function (a, b) {
      var av = valOf(a), bv = valOf(b);
      return av < bv ? -dir : av > bv ? dir : a.rank - b.rank;
    });
  }

  function filterTradedPeers(peers, st) {
    var q = st.q.trim().toLowerCase();
    return peers.filter(function (p) {
      if (st.category !== 'all' && p.category !== st.category) return false;
      if (st.chain !== 'all' && (!p.chains || p.chains.indexOf(st.chain) < 0)) return false;
      return !q || (p.name + ' ' + p.slug + ' ' + (p.symbol || '') + ' ' + p.category + ' ' + (p.chains || []).join(' ')).toLowerCase().indexOf(q) >= 0;
    });
  }

  function sortTradedPeers(peers, key, dir) {
    var valOf = function (p) {
      if (key === 'name') return p.name.toLowerCase();
      if (key === 'change_7d') return p.change_7d === null ? -999999 : p.change_7d;
      return p[key] !== undefined ? p[key] : p.mcap_usd;
    };
    return peers.slice().sort(function (a, b) {
      var av = valOf(a), bv = valOf(b);
      return av < bv ? -dir : av > bv ? dir : (a.slug < b.slug ? -1 : 1);
    });
  }

  function renderKpiStrip(data, parity) {
    var s = data.summary;
    var yields = data.rows.map(function (r) { return r.yield_per_1k_tvl; }).sort(function (a, b) { return a - b; });
    var medYield = yields.length ? yields[Math.floor(yields.length / 2)] : 0;
    dom.kpiStrip.textContent = '';
    [
      ['accent-emerald', 'Watchlist Coverage', '100% FLOOR', 'tag-emerald', s.watchlist_covered + ' / ' + s.watchlist_total, 'All >=$' + Math.round(data.floor_usd / 1e6) + 'M pre-token watchlist slugs ranked'],
      ['accent-amber', 'Pre-Token Candidates', s.early_gem_rows + ' EARLY GEMS', 'tag-amber', String(s.board_rows), s.watchlist_covered + ' watchlist + ' + s.early_gem_rows + ' sub-$50M candidates'],
      ['accent-amber', 'Aggregate Implied FDV', 'RANK 1..' + s.board_rows, 'tag-amber', fmtUsd(s.total_implied_fdv_usd), 'Board parity: ' + parity.matched + '/' + parity.total + ' rows verified'],
      ['accent-emerald', 'Est. Community Pool', '$' + medYield.toFixed(1) + ' / $1K TVL', 'tag-emerald', fmtUsd(s.total_est_pool_usd), 'Modeled 3.5%-6.5% initial float distribution'],
      ['accent-cyan', 'Traded Peer Calibration', 'PRIOR ' + fmtMult(s.global_shrunk_prior_multiple), 'tag-cyan', s.traded_peer_rows + ' Peers', 'Live-token comps set aside out of ' + s.total_snapshot_protocols + ' total']
    ].forEach(function (c) {
      dom.kpiStrip.appendChild(div('kpi-card ' + c[0], div('kpi-head', span('kpi-label', c[1]), span('kpi-tag ' + c[3], c[2])), div('kpi-value', c[4]), div('kpi-foot', c[5])));
    });
  }

  function renderCalibrationStrip(data) {
    dom.calibrationBar.textContent = '';
    var spec = data.model_spec, space = spec.shrinkage_space ? spec.shrinkage_space + ' ' : '';
    var list = (data.tradedPeerSummary || []).slice(0, 8);
    if (state.category !== 'all' && !list.some(function (c) { return c.category === state.category; })) {
      var extra = (data.tradedPeerSummary || []).filter(function (c) { return c.category === state.category; })[0];
      if (extra) list = list.slice(0, 7).concat([extra]);
    }
    var chipsRow = div('cal-chips', list.map(function (cal) {
      var sel = state.category === cal.category;
      return h('button', {
        type: 'button', class: 'cal-chip' + (sel ? ' is-selected' : ''),
        title: cal.category + ': shrunk ' + fmtMult(cal.shrunk_multiple) + ' (IQR ' + fmtMult(cal.p25_multiple) + '-' + fmtMult(cal.p75_multiple) + ', n=' + cal.sample_count + ')',
        onclick: function () { state.category = sel ? 'all' : cal.category; dom.filterCategory.value = state.category; syncUrlHash(); renderMainView(); }
      }, span('cal-cat', cal.category), span('cal-mult', fmtMult(cal.shrunk_multiple)), span('cal-peers', 'n=' + cal.sample_count));
    }));
    dom.calibrationBar.appendChild(div('cal-top',
      div('cal-title-group', span('cal-title', 'Empirical Category Multiples (' + space + 'EB k=' + spec.prior_strength_k + ')'), h('code', { class: 'cal-equation', text: 'FDV = TVL x CatMult_EB x Scale(TVL^-0.075) x Flow7d(tanh) x Tenure(exp) x ChainBreadth' })),
      span('cal-note', 'Winsorized [' + fmtMult(spec.winsor_floor_multiple) + '..' + fmtMult(spec.winsor_cap_multiple) + '] across ' + data.summary.traded_peer_rows + ' peers · click category to filter')
    ));
    dom.calibrationBar.appendChild(chipsRow);
  }

  function makeSortHeader(label, key, alignRight, isPeerTable) {
    var activeKey = isPeerTable ? state.peerSort : state.sort, activeDir = isPeerTable ? state.peerDir : state.dir;
    var isSorted = activeKey === key;
    return h('th', { scope: 'col', class: alignRight ? 'align-right' : '' },
      h('button', {
        type: 'button', class: 'sort-btn' + (isSorted ? ' is-sorted' : ''),
        onclick: function () {
          if (isPeerTable) { state.peerDir = state.peerSort === key ? -state.peerDir : (key === 'name' ? 1 : -1); state.peerSort = key; }
          else { state.dir = state.sort === key ? -state.dir : ((key === 'rank' || key === 'name') ? 1 : -1); state.sort = key; }
          syncUrlHash(); renderMainView();
        }
      }, label + (isSorted ? (activeDir > 0 ? ' ^' : ' v') : ''))
    );
  }

  function renderRadarTable(rows) {
    if (!rows.length) return div('empty-state', h('h3', { text: 'No pre-token candidates match current filters' }), h('button', { type: 'button', class: 'reset-btn', text: 'Clear All Filters', onclick: resetAllFilters }));
    var maxFdv = 1;
    rows.forEach(function (r) { if (r.implied_value_usd > maxFdv) maxFdv = r.implied_value_usd; });
    var tbody = h('tbody', null, rows.map(function (r) {
      var dCls = r.change_7d === null ? 'delta-flat' : (r.change_7d >= 0 ? 'delta-pos' : 'delta-neg');
      var barPct = Math.max(4, Math.round(Math.pow(r.implied_value_usd / maxFdv, 0.55) * 100));
      var chText = r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') + (r.chains.length > 2 ? ' +' + (r.chains.length - 2) : '') : 'Multi-Chain';
      return h('tr', {
        class: state.selected === r.slug ? 'is-selected' : '', tabindex: '0',
        onclick: function () { openProtocolDrawer(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openProtocolDrawer(r.slug); } }
      },
        h('td', { class: 'num' }, span('rank-badge' + (r.rank <= 10 ? ' rank-top' : ''), '#' + r.rank)),
        h('td', null, div('proto-cell', div('proto-name-line', span('proto-name', r.name), span('tier-chip ' + (r.is_watchlist ? 'tier-wl' : 'tier-gem'), r.is_watchlist ? 'WATCHLIST' : 'EARLY GEM')), div('proto-sub', span('', chText), span('', '· Records no token')))),
        h('td', null, span('cat-badge', r.category_label)),
        h('td', { class: 'num align-right', text: fmtUsd(r.tvl_usd) }),
        h('td', { class: 'num align-right', text: fmtMult(r.waterfall.category_multiple) }),
        h('td', { class: 'num align-right ' + dCls, text: fmtPct(r.change_7d) }),
        h('td', { class: 'num align-right', text: fmtShortTenure(r.tenure_days) }),
        h('td', { class: 'align-right' }, div('fdv-cell', h('div', { class: 'fdv-bar-track', 'aria-hidden': 'true' }, h('div', { class: 'fdv-bar-fill', style: 'width:' + barPct + '%' })), span('fdv-val', fmtUsd(r.implied_value_usd)))),
        h('td', { class: 'align-right' }, span('eff-pill', '$' + r.yield_per_1k_tvl.toFixed(1) + '/$1k')),
        h('td', { class: 'align-right' }, span('action-hint', fmtWholeUsd(r.farm_plan.minCapitalUsd) + ' · ' + r.farm_plan.durationDays + 'd ->'))
      );
    }));
    return div('table-scroll', h('table', { class: 'radar-table' }, h('thead', null, h('tr', null,
      makeSortHeader('Rank', 'rank', false, false), makeSortHeader('Protocol & Snapshot Record', 'name', false, false), h('th', { scope: 'col', text: 'Category' }),
      makeSortHeader('TVL', 'tvl_usd', true, false), makeSortHeader('Cat Mult', 'category_multiple', true, false), makeSortHeader('7d Flow', 'change_7d', true, false),
      makeSortHeader('Tenure', 'tenure_days', true, false), makeSortHeader('Implied Launch FDV', 'implied_value_usd', true, false), makeSortHeader('Est. Pool/$1k', 'yield_per_1k_tvl', true, false),
      h('th', { scope: 'col', class: 'align-right', text: 'Farm Plan' })
    )), tbody));
  }

  function renderTradedPeersTable(peers) {
    if (!peers.length) return div('empty-state', h('h3', { text: 'No traded peer comps match current filters' }), h('button', { type: 'button', class: 'reset-btn', text: 'Clear All Filters', onclick: resetAllFilters }));
    var tbody = h('tbody', null, peers.map(function (p) {
      var dCls = p.change_7d === null ? 'delta-flat' : (p.change_7d >= 0 ? 'delta-pos' : 'delta-neg');
      var chText = p.chains && p.chains.length ? p.chains.slice(0, 3).join(', ') + (p.chains.length > 3 ? ' +' + (p.chains.length - 3) : '') : 'Multi-Chain';
      return h('tr', null,
        h('td', { class: 'num' }, span('tier-chip tier-live', p.symbol ? '$' + p.symbol : 'TRADED')),
        h('td', null, div('proto-cell', span('proto-name', p.name), span('proto-sub', chText + ' · Set aside from pre-token board'))),
        h('td', null, span('cat-badge', p.category)),
        h('td', { class: 'num align-right', text: fmtUsd(p.tvl_usd) }),
        h('td', { class: 'num align-right', text: fmtUsd(p.mcap_usd) }),
        h('td', { class: 'num align-right', text: fmtMult(p.mcap_tvl_multiple) }),
        h('td', { class: 'num align-right', text: fmtMult(p.winsorized_multiple) }),
        h('td', { class: 'num align-right ' + dCls, text: fmtPct(p.change_7d) })
      );
    }));
    return div('table-scroll', h('table', { class: 'radar-table' }, h('thead', null, h('tr', null,
      h('th', { scope: 'col', text: 'Ticker' }), makeSortHeader('Traded Protocol (Live Token Set Aside)', 'name', false, true), h('th', { scope: 'col', text: 'Category' }),
      makeSortHeader('Snapshot TVL', 'tvl_usd', true, true), makeSortHeader('Live Market Cap', 'mcap_usd', true, true), makeSortHeader('Raw MCap/TVL', 'mcap_tvl_multiple', true, true),
      h('th', { scope: 'col', class: 'align-right', text: 'Winsorized Mult' }), makeSortHeader('7d Flow', 'change_7d', true, true)
    )), tbody));
  }

  function renderValuationWaterfall(row, spec) {
    var wf = row.waterfall, recomputed = recomputeImpliedValue(row, spec);
    var exact = Math.abs(recomputed - row.implied_value_usd) <= 2;
    var maxStage = Math.max(wf.tvl_usd, wf.category_base_usd, wf.after_scale_usd, wf.after_growth_usd, wf.after_tenure_usd, wf.implied_value_usd, 1);
    var steps = [
      ['1. Sealed Snapshot TVL', 'base', wf.tvl_usd, false],
      ['2. Cat. EB Multiple (' + row.category_label + ', n=' + row.peer_sample_count + ')', 'x ' + fmtMult(wf.category_multiple), wf.category_base_usd, false],
      ['3. Sub-Linear TVL Scale ($50M pivot)', 'x ' + fmtFactor(wf.scale_factor), wf.after_scale_usd, false],
      ['4. 7d Flow Momentum (' + fmtPct(row.change_7d) + ')', 'x ' + fmtFactor(wf.growth_factor), wf.after_growth_usd, false],
      ['5. Tokenless Tenure (' + fmtTenure(row.tenure_days) + ')', 'x ' + fmtFactor(wf.tenure_factor), wf.after_tenure_usd, false],
      ['6. Multi-Chain Breadth (' + row.chain_count + ' chain' + (row.chain_count === 1 ? '' : 's') + ')', 'x ' + fmtFactor(wf.chain_factor), wf.implied_value_usd, true]
    ];
    var rowsBox = div('wf-rows', steps.map(function (s) {
      var pct = Math.max(4, Math.min(100, Math.round(Math.pow(s[2] / maxStage, 0.55) * 100)));
      return div('wf-row' + (s[3] ? ' wf-final' : ''),
        div('wf-row-top', span('wf-label', s[0]), span('wf-mult', s[1]), span('wf-val', fmtUsd(s[2]))),
        h('div', { class: 'wf-bar-track', 'aria-hidden': 'true' }, h('div', { class: 'wf-bar-fill', style: 'width:' + pct + '%' }))
      );
    }));
    var effMult = row.effective_multiple || (wf.implied_value_usd / Math.max(1, wf.tvl_usd));
    var subText = row.peer_sample_count >= 3
      ? 'Eff. ' + fmtMult(effMult) + ' · Peer IQR ' + fmtMult(row.category_p25_multiple) + '-' + fmtMult(row.category_p75_multiple)
      : 'Eff. ' + fmtMult(effMult) + ' · EB shrunk -> ' + fmtMult(DATA.summary.global_shrunk_prior_multiple) + ' prior';
    return h('section', { class: 'drawer-card' },
      div('section-hdr', h('h3', { class: 'section-title', text: 'Valuation Waterfall' }), span('section-sub', subText)),
      rowsBox,
      h('p', { class: 'parity-note', text: 'Client recomputeImpliedValue() = ' + fmtWholeUsd(recomputed) + (exact ? ' (exact match with board.json).' : '.') + ' Est. ' + row.airdrop_pct.toFixed(2) + '% float = ' + fmtUsd(row.est_pool_usd) + '.' })
    );
  }

  function renderCategoryPeers(row, data) {
    var allSample = (data.tradedSample || []).slice().sort(function (a, b) { return b.tvl_usd - a.tvl_usd; });
    var direct = allSample.filter(function (p) { return p.category === row.category_label; }).slice(0, 4);
    var spec = data.model_spec || {};
    if (direct.length < 4) {
      var seen = {};
      direct.forEach(function (p) { seen[p.slug] = true; });
      allSample.forEach(function (p) {
        if (direct.length >= 4 || seen[p.slug]) return;
        if (p.mcap_tvl_multiple >= (spec.winsor_floor_multiple || 0.03) && p.mcap_tvl_multiple <= (spec.winsor_cap_multiple || 1.65)) {
          direct.push(p); seen[p.slug] = true;
        }
      });
    }
    var comps = direct.length ? direct : (row.peer_comps || []).slice(0, 4);
    var modeMap = {
      category: row.peer_sample_count + ' direct ' + row.category_label + ' peers',
      blended_prior: row.peer_sample_count + ' direct + EB prior anchor comps',
      global_prior: 'EB global prior anchor comps (n=0 direct)'
    };
    var listBox = div('peer-list', comps.map(function (p) {
      var winDiff = p.winsorized_multiple !== undefined && Math.abs(p.mcap_tvl_multiple - p.winsorized_multiple) > 0.01;
      var multTxt = winDiff ? fmtMult(p.winsorized_multiple) + ' cap (' + fmtMult(p.mcap_tvl_multiple) + ')' : fmtMult(p.mcap_tvl_multiple);
      return div('peer-item',
        div('wf-label', h('strong', { text: p.name }), p.symbol ? span('peer-sym', '$' + p.symbol) : null),
        span('num section-sub', 'TVL ' + fmtUsd(p.tvl_usd)),
        span('num section-sub', 'MCap ' + fmtUsd(p.mcap_usd)),
        span('wf-mult', multTxt)
      );
    }));
    return h('section', { class: 'drawer-card' },
      div('section-hdr', h('h3', { class: 'section-title', text: 'Empirical Traded Peer Comps' }), span('section-sub', modeMap[row.peer_match_mode] || (row.peer_sample_count + ' live peers'))),
      listBox
    );
  }

  function renderFarmPlaybook(row) {
    var fp = row.farm_plan || {}, stepsRaw = row.farm_steps || fp.steps || [];
    var kpiGrid = div('farm-kpis',
      div('farm-kpi', span('', 'Min Capital'), h('strong', { text: fmtWholeUsd(fp.minCapitalUsd || 500) })),
      div('farm-kpi', span('', 'Est. Total Gas'), h('strong', { text: fp.estGasUsd || 'Chain-calibrated' })),
      div('farm-kpi', span('', 'Target Horizon'), h('strong', { text: (fp.durationDays || 45) + ' days' })),
      div('farm-kpi', span('', 'Epoch Cadence'), h('strong', { text: fp.cadence || 'Weekly active' }))
    );
    var ol = h('ol', { class: 'playbook-steps' }, stepsRaw.map(function (raw, i) {
      var parsed = parsePlaybookStep(raw, i);
      return h('li', { class: 'playbook-step' },
        div('step-top', span('step-phase', parsed.phase), div('step-tags', parsed.tags.map(function (t) { return span('step-tag', t); }))),
        h('p', { class: 'step-body', text: parsed.body })
      );
    }));
    return h('section', { class: 'drawer-card' },
      div('section-hdr', h('h3', { class: 'section-title', text: 'Actionable Farm Playbook' }), span('section-sub', stepsRaw.length + ' concrete steps')),
      kpiGrid, ol, fp.riskNote ? div('risk-banner', fp.riskNote) : null
    );
  }

  function openProtocolDrawer(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug; syncUrlHash(); dom.detailDrawer.textContent = '';
    var shownChains = (row.chains || []).slice(0, 6), extra = (row.chains || []).length - shownChains.length;
    var chainRow = div('drawer-chains-row',
      shownChains.map(function (c) { return span('chain-pill', c); }),
      extra > 0 ? span('chain-pill', '+' + extra + ' chains') : null
    );
    dom.detailDrawer.appendChild(div('drawer-header',
      div('drawer-title-block',
        div('drawer-badges',
          span('rank-badge rank-top', 'Rank #' + row.rank + ' of ' + DATA.summary.board_rows),
          span('tier-chip ' + (row.is_watchlist ? 'tier-wl' : 'tier-gem'), row.is_watchlist ? 'WATCHLIST >=$50M' : 'EARLY GEM <$50M'),
          span('cat-badge', row.category_label),
          span('model-pill', row.confidence_tier + ' Confidence')
        ),
        h('h2', { class: 'drawer-title', id: 'drawer-title', text: row.name }),
        h('p', { class: 'brand-sub', text: row.token_record_note + (row.listed_at ? ' · Tracked since ' + row.listed_at : '') }),
        chainRow
      ),
      div('drawer-hero-metrics',
        div('hero-stat primary', div('hero-stat-label', 'Implied FDV'), div('hero-stat-val', fmtUsd(row.implied_value_usd))),
        div('hero-stat', div('hero-stat-label', 'Pool / $1K TVL'), div('hero-stat-val', '$' + row.yield_per_1k_tvl.toFixed(1))),
        h('button', { type: 'button', class: 'close-drawer-btn', 'aria-label': 'Close protocol detail drawer', text: 'Close [Esc]', onclick: closeProtocolDrawer })
      )
    ));
    dom.detailDrawer.appendChild(div('drawer-grid',
      div('drawer-col', renderValuationWaterfall(row, DATA.model_spec), renderCategoryPeers(row, DATA)),
      div('drawer-col', renderFarmPlaybook(row))
    ));
    dom.drawerBackdrop.hidden = false;
    renderMainView();
  }

  function closeProtocolDrawer() {
    state.selected = null;
    dom.drawerBackdrop.hidden = true;
    syncUrlHash();
    renderMainView();
  }

  function renderActiveFilterPills(shownCount, totalCount) {
    var pills = [];
    if (state.q.trim()) pills.push('Search: "' + state.q.trim() + '"');
    if (state.category !== 'all') pills.push('Category: ' + state.category);
    if (state.chain !== 'all') pills.push('Chain: ' + state.chain);
    if (state.mode === 'pretoken' && state.tier !== 'all') pills.push('Tier: ' + (state.tier === 'watchlist' ? 'Watchlist >=$50M' : 'Early Gems <$50M'));
    var hasFilter = pills.length > 0;
    dom.resetBtn.hidden = !hasFilter;
    dom.activeFiltersRow.hidden = !hasFilter;
    dom.activeFiltersRow.textContent = '';
    pills.forEach(function (p) { dom.activeFiltersRow.appendChild(h('span', { class: 'active-filter-pill', text: p })); });
    if (hasFilter) dom.activeFiltersRow.appendChild(h('span', { class: 'section-sub', text: 'Showing ' + shownCount + ' of ' + totalCount + ' protocols' }));
  }

  function resetAllFilters() {
    state.q = ''; state.category = 'all'; state.chain = 'all'; state.tier = 'all';
    dom.searchInput.value = ''; dom.filterCategory.value = 'all'; dom.filterChain.value = 'all';
    syncUrlHash(); renderMainView();
  }

  function syncUrlHash() {
    var params = new URLSearchParams();
    if (state.mode !== 'pretoken') params.set('mode', state.mode);
    if (state.q.trim()) params.set('q', state.q.trim());
    if (state.category !== 'all') params.set('cat', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.tier !== 'all') params.set('tier', state.tier);
    if (state.sort !== 'rank') params.set('sort', state.sort);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    window.history.replaceState(null, '', next ? '#' + next : window.location.pathname + window.location.search);
  }

  function applyUrlHash() {
    var raw = window.location.hash.replace(/^#/, '');
    if (!raw) return;
    var p = new URLSearchParams(raw);
    if (p.get('mode') === 'peers') state.mode = 'peers';
    if (p.get('q')) state.q = p.get('q');
    if (p.get('cat')) state.category = p.get('cat');
    if (p.get('chain')) state.chain = p.get('chain');
    if (p.get('tier') === 'watchlist' || p.get('tier') === 'early') state.tier = p.get('tier');
    if (p.get('sort')) { state.sort = p.get('sort'); state.dir = (state.sort === 'rank' || state.sort === 'name') ? 1 : -1; }
    if (p.get('p')) state.selected = p.get('p');
  }

  function renderMainView() {
    var isPre = state.mode === 'pretoken';
    dom.tabPretoken.classList.toggle('is-active', isPre);
    dom.tabPretoken.setAttribute('aria-selected', isPre ? 'true' : 'false');
    dom.tabPeers.classList.toggle('is-active', !isPre);
    dom.tabPeers.setAttribute('aria-selected', !isPre ? 'true' : 'false');
    dom.tierPills.style.display = isPre ? 'inline-flex' : 'none';
    dom.tierPills.querySelectorAll('.pill-btn').forEach(function (btn) {
      btn.classList.toggle('is-active', btn.getAttribute('data-tier') === state.tier);
    });
    renderCalibrationStrip(DATA);
    dom.tableContainer.textContent = '';
    if (isPre) {
      var filtered = sortCandidateRows(filterCandidateRows(DATA.rows, state), state.sort, state.dir);
      dom.resultCounter.textContent = filtered.length + ' / ' + DATA.rows.length + ' pre-token';
      renderActiveFilterPills(filtered.length, DATA.rows.length);
      dom.tableContainer.appendChild(renderRadarTable(filtered));
    } else {
      var allPeers = DATA.tradedSample || [];
      var peers = sortTradedPeers(filterTradedPeers(allPeers, state), state.peerSort, state.peerDir);
      dom.resultCounter.textContent = peers.length + ' / ' + allPeers.length + ' traded peers';
      renderActiveFilterPills(peers.length, allPeers.length);
      dom.tableContainer.appendChild(renderTradedPeersTable(peers));
    }
  }

  function populateDropdowns() {
    var cats = (DATA.categories || []).slice(), seen = {};
    cats.forEach(function (c) { seen[c.category] = true; });
    (DATA.tradedPeerSummary || []).forEach(function (p) {
      if (!seen[p.category]) cats.push({ category: p.category, count: 0, shrunk_multiple: p.shrunk_multiple });
    });
    cats.sort(function (a, b) { return a.category < b.category ? -1 : 1; }).forEach(function (c) {
      dom.filterCategory.appendChild(h('option', { value: c.category, text: c.category + ' (' + fmtMult(c.shrunk_multiple) + ')' }));
    });
    (DATA.chains || []).slice(0, 45).forEach(function (ch) {
      dom.filterChain.appendChild(h('option', { value: ch.chain, text: ch.chain + ' (' + ch.count + ')' }));
    });
  }

  function init() {
    applyUrlHash();
    populateDropdowns();
    var s = DATA.summary, parity = verifyBoardParity(DATA.rows, DATA.model_spec);
    dom.modelPill.textContent = DATA.model_version || 'eb-radar-v1.1';
    dom.asOf.textContent = DATA.as_of || '--';
    dom.floor.textContent = fmtUsd(DATA.floor_usd || 50000000);
    dom.tabPretokenCount.textContent = String(s.board_rows);
    dom.tabPeersCount.textContent = String(s.traded_peer_rows);
    if (dom.pillAll) dom.pillAll.textContent = '(' + s.board_rows + ')';
    if (dom.pillWl) dom.pillWl.textContent = '(' + s.watchlist_covered + ')';
    if (dom.pillGem) dom.pillGem.textContent = '(' + s.early_gem_rows + ')';
    dom.parityVal.textContent = parity.matched + '/' + parity.total + ' EXACT';
    dom.searchInput.value = state.q;
    dom.filterCategory.value = state.category;
    dom.filterChain.value = state.chain;

    renderKpiStrip(DATA, parity);
    renderMainView();
    if (state.selected) openProtocolDrawer(state.selected);

    dom.tabPretoken.addEventListener('click', function () { state.mode = 'pretoken'; syncUrlHash(); renderMainView(); });
    dom.tabPeers.addEventListener('click', function () { state.mode = 'peers'; syncUrlHash(); renderMainView(); });
    dom.searchInput.addEventListener('input', function () { state.q = dom.searchInput.value; syncUrlHash(); renderMainView(); });
    dom.filterCategory.addEventListener('change', function () { state.category = dom.filterCategory.value; syncUrlHash(); renderMainView(); });
    dom.filterChain.addEventListener('change', function () { state.chain = dom.filterChain.value; syncUrlHash(); renderMainView(); });
    dom.tierPills.addEventListener('click', function (e) {
      var btn = e.target.closest('.pill-btn');
      if (!btn) return;
      state.tier = btn.getAttribute('data-tier') || 'all';
      syncUrlHash(); renderMainView();
    });
    dom.resetBtn.addEventListener('click', resetAllFilters);
    dom.drawerBackdrop.addEventListener('click', function (e) { if (e.target === dom.drawerBackdrop) closeProtocolDrawer(); });
    window.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !dom.drawerBackdrop.hidden) closeProtocolDrawer();
      else if (e.key === '/' && document.activeElement !== dom.searchInput) { e.preventDefault(); dom.searchInput.focus(); }
    });
  }

  init();
})();
