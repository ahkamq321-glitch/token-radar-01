// Token Radar dashboard: renders the pre-token board from window.RADAR.
// No network calls: every value on the page comes from data.js.
(function () {
  'use strict';

  var DATA = window.RADAR || null;

  var state = {
    q: '',
    category: '',
    chain: '',
    watchlistOnly: false,
    tab: 'pre',
    sortKey: 'implied',
    sortDir: -1,
    selected: null,
    sandbox: { active: false, benchmark: 0, growthWeight: 0 }
  };

  var searchFocusAt = 0;

  function isFiniteNumber(value) {
    return typeof value === 'number' && isFinite(value);
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function formatDollars(value) {
    if (!isFiniteNumber(value)) { return 'n/a'; }
    if (value >= 1000000000) { return '$' + (value / 1000000000).toFixed(2) + 'B'; }
    if (value >= 1000000) { return '$' + (value / 1000000).toFixed(1) + 'M'; }
    if (value >= 1000) { return '$' + Math.round(value / 1000) + 'K'; }
    return '$' + Math.round(value);
  }

  function formatPercent(value) {
    if (!isFiniteNumber(value)) { return 'n/a'; }
    var sign = value > 0 ? '+' : '';
    return sign + value.toFixed(2) + '%';
  }

  function formatAge(days) {
    if (!isFiniteNumber(days)) { return 'unknown'; }
    if (days >= 365) { return (days / 365).toFixed(1) + ' years'; }
    return Math.round(days) + ' days';
  }

  function shortDate(value) {
    if (typeof value === 'string') { return value.slice(0, 10); }
    if (isFiniteNumber(value)) {
      var ms = value < 100000000000 ? value * 1000 : value;
      return new Date(ms).toISOString().slice(0, 10);
    }
    return 'n/a';
  }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        var value = attrs[key];
        if (key === 'class') { node.className = value; }
        else if (key === 'text') { node.textContent = value; }
        else if (key === 'html') { node.innerHTML = value; }
        else if (key === 'value') { node.value = value; }
        else if (key === 'checked') { node.checked = !!value; }
        else if (key === 'selected') { node.selected = !!value; }
        else if (key.slice(0, 2) === 'on' && typeof value === 'function') {
          node.addEventListener(key.slice(2), value);
        } else { node.setAttribute(key, value); }
      });
    }
    (children || []).forEach(function (child) {
      if (child == null) { return; }
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    });
    return node;
  }

  function model() {
    return DATA.model || {};
  }

  function activeBenchmark() {
    if (state.sandbox.active) { return state.sandbox.benchmark; }
    return model().benchmark_multiple;
  }

  function activeGrowthWeight() {
    if (state.sandbox.active) { return state.sandbox.growthWeight; }
    return model().growth_weight;
  }

  function breakdown(row) {
    var m = model();
    var growth = isFiniteNumber(row.change_7d) ? clamp(row.change_7d, m.growth_floor, m.growth_cap) : 0;
    var growthMult = 1 + (growth / 100) * activeGrowthWeight();
    var age = isFiniteNumber(row.age_days) ? row.age_days : m.unknown_age_days;
    var maturity = m.maturity_floor + (Math.min(Math.max(age, 0), m.maturity_days) / m.maturity_days) * m.maturity_range;
    var chains = row.chains || [];
    var breadth = 1 + m.breadth_per_chain * Math.min(chains.length, m.breadth_max_chains);
    var value = row.tvl_usd * activeBenchmark() * growthMult * maturity * breadth;
    return {
      growth: growth,
      growthMult: growthMult,
      age: age,
      maturity: maturity,
      breadth: breadth,
      benchmark: activeBenchmark(),
      value: Math.max(1, Math.round(value))
    };
  }

  function impliedValue(row) {
    return breakdown(row).value;
  }

  var L2_CHAINS = ['Arbitrum', 'Arbitrum Nova', 'Optimism', 'Base', 'Polygon', 'zkSync Era', 'Linea', 'Scroll', 'Blast', 'Ink', 'Mode', 'Fraxtal', 'Mantle', 'Starknet', 'Metis', 'Boba', 'ApeChain', 'Abstract', 'Soneium', 'Unichain', 'World Chain', 'Zora', 'Shape', 'Berachain'];

  var CATEGORY_ACTIONS = {
    lend: 'Supply {capital} of USDC to {name} on {chain} and keep the position open.',
    dex: 'Provide {capital} of liquidity to {name}\'s main pool on {chain} and keep the position open.',
    yield: 'Deposit {capital} of USDC into {name}\'s main yield strategy on {chain} and let it earn.',
    bridge: 'Bridge {capital} of USDC to {chain} through {name} and use the bridged funds in its app.',
    staking: 'Stake {capital} of the chain\'s staking asset through {name} and keep the receipt.',
    perpetual: 'Deposit {capital} of USDC as margin on {name} and open one small hedge.',
    prediction: 'Fund {capital} and place one market position on {name}.',
    curator: 'Deposit {capital} into a {name} vault on {chain} and keep the shares.',
    stable: 'Mint or deposit {capital} of the stable asset through {name} on {chain}.',
    rwa: 'Mint {capital} of the protocol\'s yield asset on {chain} and hold it.',
    insurance: 'Buy {capital} of cover from {name} on {chain} and keep the policy.',
    payment: 'Pay {capital} through {name} on {chain} and keep the receipt.',
    default: 'Deposit {capital} of USDC into {name} on {chain} and keep the position open.'
  };

  var WEEKLY_ACTIONS = {
    lend: 'Top up the supply or borrow a small amount against it on {name} once a week.',
    dex: 'Swap a small amount in {name}\'s main pool once a week.',
    yield: 'Harvest and re-deposit the yield {name} pays once a week.',
    bridge: 'Bridge a small amount through {name} once a week.',
    staking: 'Claim and restake the staking rewards {name} pays once a week.',
    perpetual: 'Open and close one small position on {name} once a week.',
    prediction: 'Place one small market position on {name} once a week.',
    curator: 'Check the vault allocation on {name} and add a small deposit once a week.',
    stable: 'Mint or redeem a small amount of the stable asset on {name} once a week.',
    rwa: 'Claim the yield {name} pays and hold the receipt once a week.',
    insurance: 'Check the policy on {name} and renew or top it up once a week.',
    payment: 'Make one small payment through {name} once a week.',
    default: 'Make one qualifying action on {name} once a week, such as a deposit, a swap or a vote.'
  };

  function capitalFor(tvl) {
    if (tvl >= 5000000000) { return '$250'; }
    if (tvl >= 1000000000) { return '$150'; }
    if (tvl >= 100000000) { return '$100'; }
    return '$50';
  }

  function holdFor(ageDays) {
    if (!isFiniteNumber(ageDays)) { return 30; }
    if (ageDays < 180) { return 60; }
    if (ageDays < 365) { return 45; }
    return 30;
  }

  function gasFor(chain) {
    if (chain === 'Ethereum') { return 'about $8 of gas'; }
    if (chain === 'Solana') { return 'about $0.05 of gas'; }
    if (chain === 'Binance' || chain === 'BNB Chain') { return 'about $0.30 of gas'; }
    if (L2_CHAINS.indexOf(chain) !== -1) { return 'about $0.50 of gas'; }
    return 'about $2 of gas';
  }

  function categoryKey(category) {
    var c = String(category || '').toLowerCase();
    if (c.indexOf('lend') !== -1 || c.indexOf('cdp') !== -1 || c.indexOf('collateral') !== -1) { return 'lend'; }
    if (c.indexOf('dex') !== -1 || c.indexOf('leverag') !== -1) { return 'dex'; }
    if (c.indexOf('yield') !== -1) { return 'yield'; }
    if (c.indexOf('bridge') !== -1) { return 'bridge'; }
    if (c.indexOf('stak') !== -1 || c.indexOf('restak') !== -1) { return 'staking'; }
    if (c.indexOf('perp') !== -1 || c.indexOf('deriv') !== -1) { return 'perpetual'; }
    if (c.indexOf('predict') !== -1) { return 'prediction'; }
    if (c.indexOf('curat') !== -1 || c.indexOf('allocat') !== -1) { return 'curator'; }
    if (c.indexOf('stable') !== -1) { return 'stable'; }
    if (c.indexOf('rwa') !== -1) { return 'rwa'; }
    if (c.indexOf('insur') !== -1) { return 'insurance'; }
    if (c.indexOf('pay') !== -1) { return 'payment'; }
    return 'default';
  }

  function fill(template, vars) {
    var out = template;
    Object.keys(vars).forEach(function (key) {
      out = out.split('{' + key + '}').join(vars[key]);
    });
    return out;
  }

  function formatStep(action, cost, time) {
    var text = action + ' Cost: ' + cost + '. Time: ' + time + '.';
    if (text.length > 600) { text = text.slice(0, 596) + '...'; }
    if (text.length < 20) { text += ' Hold the position and check the protocol\'s own page.'; }
    return text;
  }

  function farmPlan(row) {
    var capital = capitalFor(row.tvl_usd);
    var hold = holdFor(row.age_days);
    var chain = (row.chains && row.chains[0]) || 'Ethereum';
    var gas = gasFor(chain);
    var key = categoryKey(row.category);
    var vars = { capital: capital, name: row.name, chain: chain };
    var steps = [
      { action: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: gas, time: '5 minutes' },
      { action: fill(CATEGORY_ACTIONS[key], vars), cost: capital + ' of capital and ' + gas, time: '15 minutes to set up' },
      { action: fill(WEEKLY_ACTIONS[key], vars), cost: gas + ' a week', time: '10 minutes a week' },
      { action: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the ' + capital + ' stays in the position', time: hold + ' days' },
      { action: 'Before you withdraw, open the protocol\'s own points or rewards page and claim only from the link it publishes.', cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { action: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' }
    ];
    return steps.map(function (step) {
      return formatStep(step.action, step.cost, step.time);
    });
  }

  function readHash() {
    var params = new URLSearchParams(window.location.hash.slice(1));
    state.q = params.get('q') || '';
    state.category = params.get('category') || '';
    state.chain = params.get('chain') || '';
    state.watchlistOnly = params.get('watchlist') === '1';
    state.tab = params.get('tab') === 'live' ? 'live' : 'pre';
    state.selected = params.get('p') || null;
  }

  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) { params.set('q', state.q); }
    if (state.selected) { params.set('p', state.selected); }
    if (state.category) { params.set('category', state.category); }
    if (state.chain) { params.set('chain', state.chain); }
    if (state.watchlistOnly) { params.set('watchlist', '1'); }
    if (state.tab === 'live') { params.set('tab', 'live'); }
    var next = params.toString();
    var current = window.location.hash.slice(1);
    if (next !== current) {
      var url = next ? '#' + next : window.location.pathname + window.location.search;
      history.replaceState(null, '', url);
    }
  }

  function scoredRows() {
    return (DATA.rows || []).map(function (row) {
      return { row: row, value: impliedValue(row) };
    });
  }

  function compareValues(a, b, key) {
    if (typeof a === 'string' && typeof b === 'string') { return a.localeCompare(b); }
    var na = isFiniteNumber(a) ? a : (key === 'age' ? Infinity : -Infinity);
    var nb = isFiniteNumber(b) ? b : (key === 'age' ? Infinity : -Infinity);
    if (na < nb) { return -1; }
    if (na > nb) { return 1; }
    return 0;
  }

  function compareRows(a, b) {
    var key = state.sortKey;
    var va;
    var vb;
    if (key === 'implied') { va = a.value; vb = b.value; }
    else if (key === 'name') { va = a.row.name; vb = b.row.name; }
    else if (key === 'tvl') { va = a.row.tvl_usd; vb = b.row.tvl_usd; }
    else if (key === 'growth') { va = a.row.change_7d; vb = b.row.change_7d; }
    else if (key === 'age') { va = a.row.age_days; vb = b.row.age_days; }
    else if (key === 'token') { va = 'no token'; vb = 'no token'; }
    else { va = a.row.rank; vb = b.row.rank; }
    var cmp = compareValues(va, vb, key);
    if (cmp !== 0) { return cmp * state.sortDir; }
    if (a.row.slug < b.row.slug) { return -1; }
    if (a.row.slug > b.row.slug) { return 1; }
    return 0;
  }

  function visibleRows() {
    var q = state.q.trim().toLowerCase();
    var watchlist = DATA.watchlist || [];
    var rows = scoredRows().filter(function (item) {
      var row = item.row;
      if (state.category && row.category !== state.category) { return false; }
      if (state.chain && (row.chains || []).indexOf(state.chain) === -1) { return false; }
      if (state.watchlistOnly && watchlist.indexOf(row.slug) === -1) { return false; }
      if (q) {
        var hay = [row.name, row.slug, row.category].concat(row.chains || []).join(' ').toLowerCase();
        if (hay.indexOf(q) === -1) { return false; }
      }
      return true;
    });
    rows.sort(compareRows);
    return rows;
  }

  function findRow(slug) {
    var found = null;
    (DATA.rows || []).forEach(function (row) {
      if (row.slug === slug) { found = row; }
    });
    return found;
  }

  function uniqueSorted(values) {
    var seen = {};
    var out = [];
    values.forEach(function (value) {
      if (value != null && !seen[value]) { seen[value] = true; out.push(value); }
    });
    out.sort();
    return out;
  }

  function allCategories() {
    return uniqueSorted((DATA.rows || []).map(function (row) { return row.category; }));
  }

  function allChains() {
    var chains = [];
    (DATA.rows || []).forEach(function (row) {
      (row.chains || []).forEach(function (chain) { chains.push(chain); });
    });
    return uniqueSorted(chains);
  }

  function render() {
    var board = document.getElementById('board');
    var restoreSearch = Date.now() - searchFocusAt < 5000;
    board.setAttribute('aria-busy', 'true');
    board.innerHTML = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(renderHeader());
    shell.appendChild(renderLede());
    shell.appendChild(renderSpotlight());
    shell.appendChild(renderControls());
    if (state.tab === 'pre') {
      shell.appendChild(renderBoardTable());
    } else {
      shell.appendChild(renderLiveTable());
    }
    shell.appendChild(renderModelPanel());
    shell.appendChild(renderFooter());
    board.appendChild(shell);
    board.setAttribute('aria-busy', 'false');
    if (restoreSearch) {
      var input = board.querySelector('.search');
      if (input) {
        input.focus();
        try { input.setSelectionRange(input.value.length, input.value.length); } catch (e) { /* older browsers */ }
      }
    }
    if (state.selected) {
      openDetail(state.selected);
    }
  }

  function renderHeader() {
    var meta = 'Snapshot ' + shortDate(DATA.as_of) + ' · Source: ' + DATA.source + ' · Model ' + DATA.model_version;
    return el('header', { class: 'site-header' }, [
      el('div', { class: 'brand', text: 'Token Radar' }),
      el('p', { class: 'meta', text: meta })
    ]);
  }

  function renderLede() {
    var watchlistCount = DATA.watchlist_size || (DATA.watchlist || []).length;
    var facts = [
      { num: String(watchlistCount), label: 'Watchlist covered' },
      { num: String(DATA.board_size || 0), label: 'Pre-token rows' },
      { num: String(DATA.early_size || 0), label: 'Early rows' },
      { num: String(DATA.live_size || 0), label: 'Live protocols' }
    ];
    var factNodes = facts.map(function (fact) {
      return el('div', { class: 'fact' }, [
        el('div', { class: 'fact-num', text: fact.num }),
        el('div', { class: 'fact-label', text: fact.label })
      ]);
    });
    return el('section', { class: 'lede' }, [
      el('h1', { class: 'lede-title', text: watchlistCount + ' pre-token protocols, ranked by implied value' }),
      el('p', { class: 'lede-text', text: 'Each protocol is scored by the value a token launch might imply: TVL times a benchmark multiple, adjusted for recent growth, age and chain breadth. The board covers the full watchlist plus early-stage protocols; live protocols are listed separately.' }),
      el('div', { class: 'facts' }, factNodes)
    ]);
  }

  function renderSpotlight() {
    var top = scoredRows().sort(function (a, b) {
      if (b.value !== a.value) { return b.value - a.value; }
      if (a.row.slug < b.row.slug) { return -1; }
      if (a.row.slug > b.row.slug) { return 1; }
      return 0;
    }).slice(0, 3);
    var cards = top.map(function (item, index) {
      return el('button', {
        class: 'spot-card',
        type: 'button',
        onclick: function () {
          state.selected = item.row.slug;
          writeHash();
          render();
        }
      }, [
        el('span', { class: 'spot-rank', text: '#' + (index + 1) }),
        el('span', { class: 'spot-name', text: item.row.name }),
        el('span', { class: 'spot-value', text: formatDollars(item.value) + ' implied' })
      ]);
    });
    return el('section', { class: 'spotlight' }, [
      el('h2', { text: 'Top of the board' }),
      el('div', { class: 'spot-grid' }, cards)
    ]);
  }

  function renderControls() {
    var search = el('input', {
      class: 'search',
      type: 'search',
      placeholder: 'Search name, slug, category or chain',
      value: state.q,
      'aria-label': 'Search protocols',
      onfocus: function () { searchFocusAt = Date.now(); },
      onblur: function () { searchFocusAt = 0; },
      oninput: function (event) {
        state.q = event.target.value;
        searchFocusAt = Date.now();
        writeHash();
        render();
      }
    });
    var categoryOptions = [el('option', { value: '', text: 'All categories' })].concat(
      allCategories().map(function (category) {
        return el('option', { value: category, text: category, selected: state.category === category });
      })
    );
    var categorySelect = el('select', {
      class: 'select',
      'aria-label': 'Filter by category',
      onchange: function (event) {
        state.category = event.target.value;
        writeHash();
        render();
      }
    }, categoryOptions);
    var chainOptions = [el('option', { value: '', text: 'All chains' })].concat(
      allChains().map(function (chain) {
        return el('option', { value: chain, text: chain, selected: state.chain === chain });
      })
    );
    var chainSelect = el('select', {
      class: 'select',
      'aria-label': 'Filter by chain',
      onchange: function (event) {
        state.chain = event.target.value;
        writeHash();
        render();
      }
    }, chainOptions);
    var watchCheck = el('label', { class: 'check' }, [
      el('input', {
        type: 'checkbox',
        checked: state.watchlistOnly,
        onchange: function (event) {
          state.watchlistOnly = event.target.checked;
          writeHash();
          render();
        }
      }),
      'Watchlist only'
    ]);
    var preTab = el('button', {
      class: 'tab' + (state.tab === 'pre' ? ' tab-active' : ''),
      type: 'button',
      onclick: function () { state.tab = 'pre'; writeHash(); render(); }
    }, ['Pre-token']);
    var liveTab = el('button', {
      class: 'tab' + (state.tab === 'live' ? ' tab-active' : ''),
      type: 'button',
      onclick: function () { state.tab = 'live'; writeHash(); render(); }
    }, ['Live']);
    var tabs = el('div', { class: 'tabs' }, [preTab, liveTab]);
    var rows = visibleRows();
    var total = (DATA.rows || []).length;
    var countText = state.tab === 'pre'
      ? 'Showing ' + rows.length + ' of ' + total + ' protocols'
      : 'Showing ' + (DATA.live || []).length + ' live protocols';
    var count = el('span', { class: 'count', text: countText });
    return el('div', { class: 'controls' }, [search, categorySelect, chainSelect, watchCheck, tabs, count]);
  }

  function sortHeader(label, key) {
    var active = state.sortKey === key;
    var attrs = {
      class: 'sortable' + (active ? ' sorted' : ''),
      onclick: function () {
        if (state.sortKey === key) {
          state.sortDir = -state.sortDir;
        } else {
          state.sortKey = key;
          state.sortDir = key === 'name' ? 1 : -1;
        }
        render();
      }
    };
    if (active) {
      attrs['aria-sort'] = state.sortDir === 1 ? 'ascending' : 'descending';
    }
    attrs.text = label + (active ? (state.sortDir === 1 ? ' ↑' : ' ↓') : '');
    return el('th', attrs);
  }

  function renderBoardTable() {
    var rows = visibleRows();
    var wrap = el('div', { class: 'table-wrap' });
    if (rows.length === 0) {
      var clear = el('button', {
        class: 'btn',
        type: 'button',
        onclick: function () {
          state.q = '';
          state.category = '';
          state.chain = '';
          state.watchlistOnly = false;
          writeHash();
          render();
        }
      }, ['Clear filters']);
      wrap.appendChild(el('div', { class: 'empty' }, [
        el('p', { text: 'No protocol matches that filter.' }),
        clear
      ]));
      return wrap;
    }
    var maxValue = 0;
    rows.forEach(function (item) { if (item.value > maxValue) { maxValue = item.value; } });
    var head = el('tr', {}, [
      sortHeader('Rank', 'rank'),
      sortHeader('Protocol', 'name'),
      sortHeader('TVL', 'tvl'),
      sortHeader('7d', 'growth'),
      sortHeader('Age', 'age'),
      sortHeader('Implied value', 'implied'),
      sortHeader('Token', 'token')
    ]);
    var bodyRows = rows.map(function (item, index) {
      var row = item.row;
      var rank = state.sortKey === 'implied' ? index + 1 : row.rank;
      var growth = el('td', { class: isFiniteNumber(row.change_7d) ? (row.change_7d >= 0 ? 'pos' : 'neg') : '', text: formatPercent(row.change_7d) });
      var width = maxValue > 0 ? Math.round((item.value / maxValue) * 100) : 0;
      var valueCell = el('td', {}, [
        el('span', { class: 'value-bar' }, [
          el('span', { class: 'value-fill', style: 'width: ' + width + '%' })
        ]),
        el('span', { class: 'value-num', text: formatDollars(item.value) })
      ]);
      var nameCell = el('td', {}, [
        el('div', { class: 'row-name', text: row.name }),
        el('div', { class: 'row-sub', text: (row.category || '') + ' · ' + (row.chains || []).join(', ') })
      ]);
      var open = function () {
        state.selected = row.slug;
        writeHash();
        render();
      };
      return el('tr', {
        class: 'row-click',
        tabindex: '0',
        onclick: open,
        onkeydown: function (event) {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            open();
          }
        }
      }, [
        el('td', { text: String(rank) }),
        nameCell,
        el('td', { text: formatDollars(row.tvl_usd) }),
        growth,
        el('td', { text: formatAge(row.age_days) }),
        valueCell,
        el('td', {}, [el('span', { class: 'status', text: 'no token' })])
      ]);
    });
    var table = el('table', { class: 'board-table' }, [
      el('thead', {}, [head]),
      el('tbody', {}, bodyRows)
    ]);
    wrap.appendChild(table);
    return wrap;
  }

  function renderLiveTable() {
    var live = (DATA.live || []).slice().sort(function (a, b) {
      var ta = isFiniteNumber(a.tvl_usd) ? a.tvl_usd : -Infinity;
      var tb = isFiniteNumber(b.tvl_usd) ? b.tvl_usd : -Infinity;
      return tb - ta;
    });
    var wrap = el('div', { class: 'table-wrap' });
    var head = el('tr', {}, [
      el('th', { text: 'Status' }),
      el('th', { text: 'Protocol' }),
      el('th', { text: 'TVL' }),
      el('th', { text: '7d' }),
      el('th', { text: 'Market cap' }),
      el('th', { text: 'Note' })
    ]);
    var bodyRows = live.map(function (row) {
      return el('tr', {}, [
        el('td', {}, [el('span', { class: 'status-live', text: 'live' })]),
        el('td', {}, [
          el('div', { class: 'row-name', text: row.name }),
          el('div', { class: 'row-sub', text: (row.category || '') + ' · ' + (row.chains || []).join(', ') })
        ]),
        el('td', { text: formatDollars(row.tvl_usd) }),
        el('td', { class: isFiniteNumber(row.change_7d) ? (row.change_7d >= 0 ? 'pos' : 'neg') : '', text: formatPercent(row.change_7d) }),
        el('td', { text: formatDollars(row.mcap_usd) }),
        el('td', { text: 'already trades' })
      ]);
    });
    var table = el('table', { class: 'live-table' }, [
      el('thead', {}, [head]),
      el('tbody', {}, bodyRows)
    ]);
    wrap.appendChild(table);
    return wrap;
  }

  function renderModelPanel() {
    var m = model();
    var benchInput = el('input', {
      type: 'number',
      class: 'sandbox-input',
      min: '0.05',
      max: '1',
      step: '0.01',
      value: String(activeBenchmark()),
      'aria-label': 'Sandbox benchmark multiple'
    });
    var weightInput = el('input', {
      type: 'number',
      class: 'sandbox-input',
      min: '0',
      max: '2',
      step: '0.1',
      value: String(activeGrowthWeight()),
      'aria-label': 'Sandbox growth weight'
    });
    var applyBtn = el('button', {
      class: 'btn',
      type: 'button',
      onclick: function () {
        var bench = clamp(parseFloat(benchInput.value) || 0, 0.05, 1);
        var weight = clamp(parseFloat(weightInput.value) || 0, 0, 2);
        state.sandbox = { active: true, benchmark: bench, growthWeight: weight };
        render();
      }
    }, ['Apply sandbox']);
    var resetBtn = el('button', {
      class: 'btn btn-secondary',
      type: 'button',
      onclick: function () {
        state.sandbox = { active: false, benchmark: 0, growthWeight: 0 };
        render();
      }
    }, ['Reset model']);
    var badge = state.sandbox.active ? el('span', { class: 'sandbox-badge', text: 'sandbox' }) : null;
    var sandbox = el('div', { class: 'sandbox' }, [
      el('label', { class: 'sandbox-field' }, ['Benchmark ', benchInput]),
      el('label', { class: 'sandbox-field' }, ['Growth weight ', weightInput]),
      applyBtn,
      resetBtn,
      badge
    ]);
    return el('section', { class: 'model-panel' }, [
      el('h2', { text: 'How the implied value is computed' }),
      el('p', { class: 'formula', text: 'Implied value = TVL × benchmark × growth multiplier × maturity multiplier × breadth multiplier.' }),
      el('p', { text: 'The benchmark is ' + m.benchmark_multiple + ', the median market-cap to TVL ratio of ' + m.benchmark_n + ' live-token protocols in the snapshot. Growth is the 7-day TVL change, clamped to the model floor and cap, and it moves the value through 1 + growth × ' + m.growth_weight + '. Maturity rises with protocol age up to ' + m.maturity_days + ' days. Breadth adds ' + m.breadth_per_chain + ' per chain, up to ' + m.breadth_max_chains + ' chains.' }),
      sandbox
    ]);
  }

  function openDetail(slug) {
    var row = findRow(slug);
    if (!row) { return; }
    var parts = breakdown(row);
    var stored = isFiniteNumber(row.implied_value_usd) ? row.implied_value_usd : null;
    var note;
    if (stored !== null && parts.value === stored) {
      note = 'Matches the value in board.json.';
    } else if (stored !== null) {
      note = 'board.json lists ' + formatDollars(stored) + (state.sandbox.active ? ' — this is a sandbox value.' : '.');
    } else {
      note = '';
    }
    var eqItems = [
      { label: 'TVL', value: formatDollars(row.tvl_usd) },
      { label: '7d growth', value: formatPercent(row.change_7d) },
      { label: 'Age', value: formatAge(row.age_days) },
      { label: 'Benchmark', value: String(parts.benchmark) },
      { label: 'Growth multiplier', value: '×' + parts.growthMult.toFixed(2) },
      { label: 'Maturity multiplier', value: '×' + parts.maturity.toFixed(2) },
      { label: 'Breadth multiplier', value: '×' + parts.breadth.toFixed(2) },
      { label: 'Implied value', value: formatDollars(parts.value) }
    ];
    var eqNodes = eqItems.map(function (item) {
      return el('div', { class: 'detail-item' }, [
        el('div', { class: 'detail-label', text: item.label }),
        el('div', { class: 'detail-value', text: item.value })
      ]);
    });
    var farmItems = farmPlan(row).map(function (step) {
      var split = step.split(' Cost: ');
      var action = split[0];
      var cost = split.length > 1 ? 'Cost: ' + split[1] : '';
      return el('li', {}, [
        el('span', { text: action }),
        cost ? el('span', { class: 'farm-cost', text: cost }) : null
      ]);
    });
    var board = document.getElementById('board');
    var overlay = el('div', {
      class: 'dialog',
      role: 'dialog',
      'aria-modal': 'true',
      onclick: function (event) {
        if (event.target === overlay) { closeDetail(); }
      }
    });
    var card = el('div', { class: 'dialog-card' }, [
      el('button', {
        class: 'dialog-close',
        type: 'button',
        'aria-label': 'Close',
        onclick: closeDetail
      }, ['×']),
      el('h2', { text: row.name }),
      el('p', { class: 'detail-meta', text: 'Rank #' + row.rank + ' · ' + (row.category || '') + ' · ' + (row.chains || []).join(', ') + ' · Listed ' + shortDate(row.listed_at) }),
      el('div', { class: 'detail-grid' }, eqNodes),
      note ? el('p', { class: 'detail-note', text: note }) : null,
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'farm-list' }, farmItems)
    ]);
    overlay.appendChild(card);
    board.appendChild(overlay);
  }

  function closeDetail() {
    state.selected = null;
    writeHash();
    render();
  }

  function renderFooter() {
    var text = 'Source: ' + DATA.source + ' · Floor: ' + formatDollars(DATA.floor_usd) + ' · Implied values are estimates, not prices or promises of a token launch.';
    return el('footer', { class: 'site-footer' }, [
      el('p', { text: text })
    ]);
  }

  function init() {
    if (!DATA) {
      var board = document.getElementById('board');
      board.textContent = 'No radar data found. Open this page next to data.js.';
      board.setAttribute('aria-busy', 'false');
      return;
    }
    readHash();
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && state.selected) {
        closeDetail();
      }
    });
    window.addEventListener('hashchange', function () {
      readHash();
      render();
    });
    render();
  }

  init();
})();
