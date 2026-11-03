/* Little Ledger — the whole app.
   Markup classes and tokens come from Knot Studio (tokens.css, patterns.css).
   Every glyph comes from icons.js. Nothing is drawn in this file. */
"use strict";
(function () {
var MONTH = ["January","February","March","April","May","June","July","August",
             "September","October","November","December"];
var MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
var DAY = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
var I = window.ICONS || {};

function el(id) { return document.getElementById(id); }
function money(n) {
  return (n < 0 ? "-RM " : "RM ") +
    Math.abs(n).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function money0(n) {
  return (n < 0 ? "-RM " : "RM ") + Math.abs(Math.round(n)).toLocaleString("en-MY");
}
function pad(n) { return String(n).length < 2 ? "0" + n : String(n); }
function ymd(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
function monthKey(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1); }
function parseAmt(v) {
  var n = parseFloat(String(v == null ? "" : v).replace(/[^0-9.]/g, ""));
  return isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c];
  });
}
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function dateLabel(iso) {
  var d = new Date(iso + "T00:00:00");
  return isNaN(d.getTime()) ? "" : (d.getDate() + " " + MON[d.getMonth()] + " " + d.getFullYear());
}

/* ---------- state ---------- */
var S = { cats: [], kws: [], tx: [], goals: [], accts: [], commits: [], networth: {}, plan: { income: 0, setAside: 0, living: 0 }, notes: [], logNotes: [] };
var loaded = false, dirty = false, saving = false, saveTimer = null;
var view = new Date(); view.setDate(1);
var tab = "log";
var override = null;   /* category picked by hand for the entry being typed */
var whoName = "";      /* first name of whoever is signed in, for the greeting */

function catOf(n) { for (var i = 0; i < S.cats.length; i++) { if (S.cats[i].name === n) return S.cats[i]; } return null; }
function typeOf(n) { var c = catOf(n); return c ? c.type : "out"; }
function goalOf(id) { for (var i = 0; i < S.goals.length; i++) { if (S.goals[i].id === id) return S.goals[i]; } return null; }
function commitOf(id) { for (var i = 0; i < S.commits.length; i++) { if (S.commits[i].id === id) return S.commits[i]; } return null; }

/* ---------- persistence ---------- */
function setSaved(txt) { var e = el("savestate"); if (e) e.textContent = txt; }

function note(msg) {
  var b = el("bootnote");
  if (!msg) { b.hidden = true; return; }
  b.hidden = false; b.textContent = msg;
}
function save() {
  dirty = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 350);
  setSaved("Saving…");
}
/* Everything is kept in this browser. There is no server to lose, but
   there is also nothing to fall back on if the browser's data is cleared,
   so Settings offers a backup file. */
function flush() {
  if (!dirty || !window.LL || !window.LL.isUnlocked()) return;
  dirty = false;
  window.LL.save(S).then(function () {
    setSaved("Saved at " + new Date().toLocaleTimeString("en-MY"));
    note("");
  }).catch(function () {
    dirty = true;
    setSaved("Could not save.");
    note("This browser would not save. In a private window, records cannot be kept.");
  });
}
window.addEventListener("beforeunload", function () { flush(); });

/* ---------- keyword matching ----------
   Longest keyword wins, and a keyword must begin on a word boundary.
   The end stays free, so "grocer" still catches "groceries" while
   "emak" never matches inside "nasi lemak". List order is irrelevant. */
function guessCat(text) {
  var s = " " + String(text).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() + " ";
  var best = null;
  for (var i = 0; i < S.kws.length; i++) {
    var k = S.kws[i];
    if (!k || !k.kw) continue;
    var w = String(k.kw).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (!w) continue;
    if (best && w.length <= best.w.length) continue;
    var at = s.indexOf(w);
    while (at !== -1) {
      if (at === 0 || !/[a-z0-9]/.test(s.charAt(at - 1))) { best = { w: w, cat: k.cat }; break; }
      at = s.indexOf(w, at + 1);
    }
  }
  return best;
}

/* ---------- derived ---------- */
function monthTx(mk) { return S.tx.filter(function (t) { return t.month === mk; }); }
function savedFor(id) {
  var g = goalOf(id);
  var total = g && isFinite(g.start) ? g.start : 0;
  for (var i = 0; i < S.tx.length; i++) { if (S.tx[i].goal === id) total += S.tx[i].amount; }
  return Math.round(total * 100) / 100;
}
/* Counted in days, then turned into whole months, so a deadline five
   weeks out asks for one month's saving and not two. */
function timeLeft(due) {
  if (!due) return null;
  var d = new Date(due + "T00:00:00");
  if (isNaN(d.getTime())) return null;
  var now = new Date(); now.setHours(0, 0, 0, 0);
  var days = Math.round((d - now) / 86400000);
  return { days: days, months: days <= 0 ? 0 : Math.max(1, Math.round(days / 30.44)) };
}
/* The monthly set-aside, as a record rather than a plan. It is a savings
   transaction for that month that is not tied to any goal. */
function setAsideThisMonth(mk) {
  for (var i = 0; i < S.tx.length; i++) {
    if (S.tx[i].type === "save" && !S.tx[i].goal && S.tx[i].month === mk) return S.tx[i];
  }
  return null;
}
function savedSoFar() {
  var n = 0;
  S.tx.forEach(function (t) { if (t.type === "save") n += t.amount; });
  return Math.round(n * 100) / 100;
}

function paidInMonth(id, mk) {
  for (var i = 0; i < S.tx.length; i++) {
    if (S.tx[i].commit === id && S.tx[i].month === mk) return S.tx[i];
  }
  return null;
}
function paidThisMonth(id) { return paidInMonth(id, monthKey(view)); }
/* "Nov 2026" from "2026-11", for a bill paid in one month and never again. */
function monthLabel(mk) {
  var p = String(mk || "").split("-");
  if (p.length !== 2) return mk || "";
  return (MON[+p[1] - 1] || "") + " " + p[0];
}
/* Whether a bill belongs to a month. A one-off sits in its own month alone;
   everything else runs from now until its last payment. One place decides
   this, so the planner list and the planner maths can never disagree. */
function dueInMonth(c, mk) {
  /* A month she actually paid in always shows the bill, even if the plan
     says otherwise. Otherwise a tick could end up in a month with no row
     to untick it from, and the money would vanish from the planner. */
  if (paidInMonth(c.id, mk)) return true;
  if (c.once) return c.once === mk;
  var endKey = c.end ? c.end.slice(0, 7) : null;
  return endKey === null || mk <= endKey;
}
function paymentsLeft(c) {
  /* A one-off is owed or done with. It never has a run of payments ahead. */
  if (c.once) return paidInMonth(c.id, c.once) ? 0 : 1;
  var tl = timeLeft(c.end);
  if (!tl) return null;
  if (tl.days <= 0) return 0;
  return Math.max(paidThisMonth(c.id) ? 0 : 1, tl.months);
}
/* Two different things live in this list and they must not be added together:
     - debts, which have a last payment and one day stop
     - fixed costs like rent and a travel pass, which have no end because they
       are not borrowing; they simply recur
   Only the first kind ever "frees up" money, so they are counted apart. */
/* How long until the last debt is paid off. The header pill and the Debts
   card both read this, so they always say the same number. */
function monthsRemaining() {
  var T = commitTotals();
  if (!T.lastEnd) return null;
  var tl = timeLeft(T.lastEnd);
  return tl ? tl.months : null;
}

function commitTotals() {
  var perMonth = 0, left = 0, active = 0, lastEnd = "";
  var ending = 0, ongoing = 0, endingIds = [];
  S.commits.forEach(function (c) {
    var n = paymentsLeft(c);
    var live = (n === null || n > 0);
    /* A one-off is money still owed, so it counts in the total left, but it
       is not a monthly cost and it cannot push back the debt-free date. */
    if (c.once) { if (live) { active++; left += c.monthly; } return; }
    if (live) {
      perMonth += c.monthly; active++;
      if (c.end) {
        ending += c.monthly;
        endingIds.push(c.id);
        if (c.end > lastEnd) lastEnd = c.end;
      } else {
        ongoing += c.monthly;
      }
    }
    left += c.monthly * (n === null ? 0 : n);
  });
  return { perMonth: perMonth, left: left, active: active, lastEnd: lastEnd,
           ending: ending, ongoing: ongoing, endingIds: endingIds };
}
/* Average month of ordinary living costs: spending only, with savings
   transfers and commitment payments taken out, since those are counted
   on their own. Uses up to the three most recent months that have data. */
function avgSpend() {
  var byMonth = {};
  S.tx.forEach(function (t) {
    if (t.type !== "out" || t.commit) return;
    byMonth[t.month] = (byMonth[t.month] || 0) + t.amount;
  });
  var keys = Object.keys(byMonth).sort().reverse().slice(0, 3);
  if (!keys.length) return null;
  var sum = 0;
  keys.forEach(function (k) { sum += byMonth[k]; });
  return { avg: sum / keys.length, months: keys.length };
}
function totalPaidToCommitments() {
  var n = 0;
  S.tx.forEach(function (t) { if (t.commit) n += t.amount; });
  return n;
}

/* ---------- render ---------- */
function render() {
  el("mlbl").textContent = MONTH[view.getMonth()] + " " + view.getFullYear();
  var salam = el("kal-salam");
  if (salam) {
    salam.textContent = whoName
      ? ("Welcome back, " + whoName + " ♡")
      : "Welcome back ♡";
  }
  var mk = monthKey(view);
  if (tab === "log") renderLog(mk);
  else if (tab === "history") renderHistory(mk);
  else if (tab === "debts") renderDebts();
  else if (tab === "savings") renderSavings();
  else if (tab === "settings") renderSettings();
  renderGuess();
}

/* ---------- the planner ----------
   The month is planned first: salary in, commitments and savings out, and
   what is left is what there is to spend. Day-to-day spending draws that
   down. Commitments and savings are deducted as PLAN, and they are also
   logged as records when paid, so "spent" excludes anything tagged to a
   commitment and anything of type save — otherwise they are charged twice. */
function monthPlan(mk) {
  var income = S.plan.income || 0;
  var committed = 0;
  S.commits.forEach(function (c) {
    if (!c.monthly) return;
    if (dueInMonth(c, mk)) committed += c.monthly;
  });
  var saving = S.plan.setAside || 0;
  var toSpend = income - committed - saving;
  var spent = 0, earned = 0;
  S.tx.forEach(function (t) {
    if (t.month !== mk) return;
    if (t.type === "in") { earned += t.amount; return; }
    if (t.type === "save" || t.commit) return;
    spent += t.amount;
  });
  return { income: income, committed: committed, saving: saving,
           toSpend: toSpend, spent: spent, left: toSpend - spent, earned: earned };
}
function daysLeftIn(mk) {
  var parts = mk.split("-"), y = +parts[0], m = +parts[1];
  var last = new Date(y, m, 0).getDate();
  var now = new Date();
  if (now.getFullYear() === y && now.getMonth() + 1 === m) return last - now.getDate() + 1;
  var viewed = new Date(y, m - 1, 1), cur = new Date(now.getFullYear(), now.getMonth(), 1);
  return viewed > cur ? last : 0;
}

function renderPlanner(mk) {
  var p = monthPlan(mk);
  var days = daysLeftIn(mk);
  var left = el("pl-left"), rows = el("pl-rows"), fill = el("pl-fill");

  el("planner").hidden = false;

  /* The planner is where the planning happens, so the two numbers it needs
     are typed straight into it. Commitments come from the Debts tab, so that
     line is a link rather than a field. */
  if (p.income) {
    left.textContent = money0(p.left);
    left.className = "pelan-besar" + (p.left < 0 ? " kurang" : "");
    var used = p.toSpend > 0 ? Math.min(100, Math.max(0, Math.round(p.spent / p.toSpend * 100))) : 0;
    fill.style.width = used + "%";
    fill.className = "pelan-fill" + (p.left < 0 ? " kurang" : "");
    el("pl-hari").textContent = days > 0
      ? (days + (days === 1 ? " day left · " : " days left · ") +
         money0(Math.max(0, p.left) / days) + " a day")
      : "month closed";
  } else {
    left.textContent = "—";
    left.className = "pelan-besar sunyi";
    fill.style.width = "0%";
    el("pl-hari").textContent = "fill in your pay below";
  }

  /* Every line she pays that month, by name, each one editable — not a
     single lumped figure. This is the list she actually thinks in. */
  var due = S.commits.filter(function (c) { return dueInMonth(c, mk); });
  /* A tick means "this month's amount is paid" — not that the whole debt is
     cleared. Ticking records the payment; unticking takes it back. */
  var paidCount = 0;
  var bills = due.map(function (c) {
    var done = !!paidThisMonth(c.id);
    if (done) paidCount++;
    return '<div class="pl-b bil' + (done ? " dibayar" : "") + '">' +
      '<button class="tik' + (done ? " on" : "") + '" type="button" data-tik="' + esc(c.id) +
      '" role="checkbox" aria-checked="' + done + '" title="' +
      (done ? "Paid — tap to undo" : "Tick when you have paid this month") +
      '" aria-label="' + esc(c.name) + (done ? ", paid" : ", not paid yet") + '">' +
      (done ? (I.check || "✓") : "") + "</button>" +
      '<input class="bil-nama" type="text" data-bnm="' + esc(c.id) + '" value="' +
      esc(c.name) + '" aria-label="Name of this bill" spellcheck="false">' +
      '<span class="tolak pl-medan"><span class="rm">RM</span>' +
      '<input type="text" inputmode="decimal" data-bil="' + esc(c.id) + '" value="' +
      (c.monthly ? c.monthly.toFixed(2) : "") + '" placeholder="0.00" aria-label="' +
      esc(c.name) + ' amount"></span>' +
      '<button class="bil-buang" type="button" data-bdel="' + esc(c.id) +
      '" title="Remove this bill" aria-label="Remove ' + esc(c.name) + '">' +
      (I.close || "×") + "</button>" +
      notesForBill(c.id).map(function (n) {
        /* The row is a list of figures, so a note is reduced to a tag here.
           The whole thing stays in the Notes card, and on the tooltip. */
        var short = n.text.length > 34 ? n.text.slice(0, 33).trim() + "…" : n.text;
        return '<span class="bil-nota" title="' + esc(n.text) + '">(' +
               esc(short) + ")</span>";
      }).join("") + "</div>";
  }).join("");

  rows.innerHTML =
    planField("Salary", "pf-income", p.income, "tambah") +
    '<div class="pl-tajuk">What I have to pay</div>' +
    (bills || '<p class="nota kecil" style="margin:0 0 var(--space-2)">Nothing listed yet.</p>') +
    '<button class="pl-tambah" type="button" id="pl-add">+ Add something to pay</button>' +
    '<div class="pl-b jumlah-bil"><span>Total to pay' +
      (due.length ? ' <i>' + paidCount + " of " + due.length + " ticked</i>" : "") +
      '</span><span class="tolak">− ' + money0(p.committed) + "</span></div>" +
    savingsRow(mk, p.saving) +
    '<div class="pl-b garis"><span>Left to spend</span><span class="kuat">' +
      (p.income ? money0(p.toSpend) : "—") + "</span></div>" +
    (p.spent > 0 ? planRow("Spent so far", "− " + money0(p.spent), "tolak") : "") +
    (p.earned > p.income
      ? planRow("Extra money in", "+ " + money0(p.earned - p.income), "tambah")
      : "");
}
function planRow(label, value, cls) {
  return '<div class="pl-b"><span>' + esc(label) + '</span><span class="' + cls + '">' +
    value + "</span></div>";
}
/* Same shape as a bill row, so ticking it means the same thing: this month's
   amount has actually been moved, not merely planned. */
function savingsRow(mk, amount) {
  var done = !!setAsideThisMonth(mk);
  return '<div class="pl-b bil simpan-baris' + (done ? " dibayar" : "") + '">' +
    '<button class="tik' + (done ? " on" : "") + '" type="button" data-tiksimpan="1" ' +
    'role="checkbox" aria-checked="' + done + '" title="' +
    (done ? "Moved — tap to undo" : "Tick when you have moved it across") +
    '" aria-label="Into savings' + (done ? ", moved" : ", not moved yet") + '">' +
    (done ? (I.check || "✓") : "") + "</button>" +
    '<span class="bil-nama tetap-nama">Into savings</span>' +
    '<span class="tolak pl-medan"><span class="rm">RM</span>' +
    '<input type="text" inputmode="decimal" id="pf-aside" value="' +
    (amount ? amount.toFixed(2) : "") + '" placeholder="0.00" aria-label="Into savings"></span>' +
    "<span></span></div>";
}

function planField(label, id, value, cls) {
  return '<div class="pl-b"><span>' + esc(label) + '</span>' +
    '<span class="' + cls + ' pl-medan"><span class="rm">RM</span>' +
    '<input type="text" inputmode="decimal" id="' + id + '" value="' +
    (value ? value.toFixed(2) : "") + '" placeholder="0.00" aria-label="' + esc(label) +
    '"></span></div>';
}

function renderLog(mk) {
  renderPlanner(mk);
  renderLogNotes();
  var out = 0, inc = 0, sav = 0, byCat = {};
  monthTx(mk).forEach(function (t) {
    if (t.type === "in") { inc += t.amount; }
    else {
      out += t.amount;
      if (t.type === "save") sav += t.amount;
      byCat[t.cat] = (byCat[t.cat] || 0) + t.amount;
    }
  });

  var box = el("catbars");
  if (!loaded) { box.innerHTML = '<p class="nota kecil">Loading&hellip;</p>'; return; }
  var names = Object.keys(byCat).filter(function (k) { return byCat[k] > 0; })
    .sort(function (a, b) { return byCat[b] - byCat[a]; });
  if (!names.length) {
    box.innerHTML = '<p class="nota kecil">Nothing spent in ' + esc(MONTH[view.getMonth()]) +
      ' yet. Log the first one above.</p>';
    return;
  }

  /* What made up each category this month, so a lump like Commitments
     breaks down into the things inside it. Entries with the same note are
     added together, so three GrabFood lunches read as one line of three. */
  var inside = {};
  monthTx(mk).forEach(function (t) {
    if (t.type === "in") return;
    /* Repeating the category name under itself says nothing, so an entry
       logged without a note is labelled as exactly that. */
    var label = (t.note || "").trim() || "No note";
    var bucket = inside[t.cat] || (inside[t.cat] = {});
    if (!bucket[label]) bucket[label] = { sum: 0, n: 0 };
    bucket[label].sum += t.amount;
    bucket[label].n += 1;
  });

  var max = byCat[names[0]];
  box.innerHTML = names.map(function (k) {
    var pct = Math.max(2, Math.round(byCat[k] / max * 100));
    var fill = typeOf(k) === "save" ? "var(--isi-simpan)" : "var(--isi-keluar)";
    var head = '<div class="bar"><span class="nm">' + esc(k) + '</span><span class="vl">' + money0(byCat[k]) +
      '</span><span class="track"><span class="fill" style="width:' + pct + "%;background:" + fill +
      '"></span></span></div>';

    var parts = Object.keys(inside[k] || {}).map(function (label) {
      return { label: label, sum: inside[k][label].sum, n: inside[k][label].n };
    }).sort(function (a, b) { return b.sum - a.sum; });

    if (!parts.length) return head;

    var shown = parts.slice(0, 6);
    var rest = parts.slice(6);
    var subs = shown.map(function (p) {
      var w = Math.max(2, Math.round(p.sum / byCat[k] * 100));
      return '<div class="subbar"><span class="nm">' + esc(p.label) +
        (p.n > 1 ? ' <i>&times;' + p.n + "</i>" : "") + '</span><span class="vl">' + money0(p.sum) +
        '</span><span class="track"><span class="fill" style="width:' + w + "%;background:" + fill +
        '"></span></span></div>';
    }).join("");
    if (rest.length) {
      var restSum = rest.reduce(function (s, p) { return s + p.sum; }, 0);
      subs += '<div class="subbar"><span class="nm"><i>' + rest.length + ' more</i></span>' +
        '<span class="vl">' + money0(restSum) + "</span></div>";
    }
    return head + '<div class="dalam">' + subs + "</div>";
  }).join("");
}

function renderHistory(mk) {
  var box = el("historylist");
  if (!loaded) { box.innerHTML = ""; return; }
  var rows = monthTx(mk);
  if (!rows.length) {
    box.innerHTML = "";
    return;
  }
  var days = {};
  rows.forEach(function (t) { (days[t.date] = days[t.date] || []).push(t); });
  box.innerHTML = Object.keys(days).sort().reverse().map(function (d) {
    var items = days[d].slice().sort(function (a, b) { return b.ts - a.ts; }), sum = 0;
    items.forEach(function (t) { sum += (t.type === "in" ? t.amount : -t.amount); });
    var dt = new Date(d + "T00:00:00");
    var head = '<div class="kepala"><span class="t">' + DAY[dt.getDay()] + ", " + dt.getDate() + " " +
      MON[dt.getMonth()] + '</span><span class="j">' + money(sum) + "</span></div>";
    var body = items.map(function (t) {
      var sign = t.type === "in" ? "+" : "−";
      var badge = t.type === "in" ? "is-mint" : (t.type === "save" ? "is-mint" : "");
      return '<button class="baris" type="button" data-tx="' + esc(t.id) + '"><span class="n">' +
        esc(t.note || t.cat) + '</span><span class="a ' + t.type + '">' + sign + " " +
        money(t.amount).replace("RM ", "") + '</span><span class="meta"><span class="badge ' + badge + '">' +
        esc(t.cat) + "</span>" +
        (t.example ? '<span class="badge is-sun">example</span>' : "") + "</span></button>";
    }).join("");
    return '<div class="hari">' + head + body + "</div>";
  }).join("");
}

function renderDebts() {
  var T = commitTotals();
  var paidNow = 0;
  S.commits.forEach(function (c) { var p = paidThisMonth(c.id); if (p) paidNow += p.amount; });

  /* patterns.css sizes a span inside the chip, so the glyph has to be
     wrapped or it stretches to fill all 52px of it. */
  el("debtchip").innerHTML = "<span>" + (I.bag || "") + "</span>";

  if (!S.commits.length) {
    el("freedate").textContent = "—";
    el("freesub").textContent = "Add what you owe each month to see this.";
    el("debtprog").hidden = true;
  } else if (!T.active) {
    el("freedate").textContent = "All clear";
    el("freesub").textContent = "Nothing left to pay. Send that money to a savings goal instead.";
    el("debtprog").hidden = true;
  } else if (T.lastEnd) {
    var d = new Date(T.lastEnd + "T00:00:00");
    var tl = timeLeft(T.lastEnd);
    el("freedate").textContent = MONTH[d.getMonth()] + " " + d.getFullYear();
    el("freesub").textContent = T.ongoing > 0
      ? "Debt-free. " + money0(T.ongoing) + " a month of rent and passes carries on after that."
      : "Debt-free, if nothing new is added.";
    /* Progress counts only what is being paid off. Rent is not progress. */
    var paidAll = 0;
    S.tx.forEach(function (t) {
      if (t.commit && T.endingIds.indexOf(t.commit) !== -1) paidAll += t.amount;
    });
    var whole = paidAll + T.left;
    var pct = whole > 0 ? Math.min(100, Math.round(paidAll / whole * 100)) : 0;
    el("debtprog").hidden = false;
    el("debtpct").textContent = pct + "%";
    el("debtfill").style.width = pct + "%";
    el("debtleft").textContent = money0(T.left) + " to go";
    var mr = monthsRemaining();
    el("debtmonths").textContent = mr === null ? "" : (mr + (mr === 1 ? " month" : " months"));
  } else {
    el("freedate").textContent = "No end date";
    el("freesub").textContent = money0(T.perMonth) + " a month, with no last payment set.";
    el("debtprog").hidden = true;
  }
  el("c-month").textContent = loaded ? money0(T.perMonth) : "—";
  el("c-total").textContent = loaded ? money0(T.left) : "—";
  el("c-paid").textContent = loaded ? money0(paidNow) : "—";

  var box = el("commitlist");
  if (!loaded) { box.innerHTML = ""; return; }
  if (!S.commits.length) {
    box.innerHTML = "";
    return;
  }
  box.innerHTML = S.commits.map(function (c) {
    var n = paymentsLeft(c), p = paidThisMonth(c.id);
    var cleared = (n === 0);
    var line;
    if (cleared) line = '<span class="sudah">Finished</span>';
    else if (c.once) line = '<span class="perlu">' + money0(c.monthly) +
      ' left</span><span>one payment only</span>';
    else if (n === null) line = '<span class="tetap">Every month · no end</span>';
    else line = '<span class="perlu">' + money0(c.monthly * n) + ' left</span><span>' + n +
      (n === 1 ? " payment" : " payments") + " to go</span>";
    return '<div class="perkara' + (cleared ? " selesai" : "") + (n === null ? " tetap-kad" : "") +
      '"><div class="kepala"><span class="tajuk-p">' +
      esc(c.name) + '</span><span class="kira">' + money0(c.monthly) + "/mo</span></div>" +
      '<div class="baki">' + line +
      (c.once ? "<span>paid in " + esc(monthLabel(c.once)) + "</span>"
              : c.end ? "<span>ends " + esc(dateLabel(c.end)) + "</span>"
                      : "") + "</div>" +
      '<div class="ubah"><label>' + (c.once ? "Amount (RM)" : "Per month (RM)") +
      '<input type="text" inputmode="decimal" value="' +
      c.monthly.toFixed(2) + '" data-cmon="' + esc(c.id) + '" aria-label="' + esc(c.name) +
      ' amount"></label>' +
      (c.once
        ? '<label>Month paid<input type="month" value="' + esc(c.once) +
          '" data-conce="' + esc(c.id) + '" aria-label="' + esc(c.name) +
          ' month paid"></label>'
        : '<label>Last payment<input type="date" value="' + esc(c.end || "") +
          '" data-cend="' + esc(c.id) + '" aria-label="' + esc(c.name) +
          ' last payment"></label>') +
      '<label class="sekali"><input type="checkbox" data-ctog="' + esc(c.id) + '"' +
      (c.once ? " checked" : "") + '>Pay once</label></div>' +
      '<div class="tindakan">' +
      (p ? '<button class="btn kecilbtn" type="button" data-cpay="' + esc(c.id) +
           '">✓ Paid ' + MON[view.getMonth()] + "</button>"
         : '<button class="btn utama kecilbtn" type="button" data-cpay="' + esc(c.id) + '"' +
           (c.monthly > 0 ? "" : " disabled") + ">Paid this month</button>") +
      '<button class="btn kecilbtn" type="button" data-cadd="' + esc(c.id) +
      '" title="A one-off instalment on top, with its own end date">+ Instalment</button>' +
      '<button class="ikon sm bahaya" type="button" data-cdel="' + esc(c.id) +
      '" title="Remove ' + esc(c.name) + '" aria-label="Remove ' + esc(c.name) + '">' + (I.trash || "") +
      "</button></div></div>";
  }).join("");
}

/* Everything that has actually been moved into savings, month by month —
   the monthly set-aside and anything put against a goal. It is built from
   the records, not from the plan, so it only counts what really happened. */
/* A savings note can name an amount — "RM500 of this is for Umrah" — and
   that amount is set against what has actually been saved, so the notes
   add up to a plan for the pot rather than sitting beside it. */
function amountInNote(text) {
  var m = String(text).match(/RMs*([0-9][0-9,]*(?:.[0-9]{1,2})?)/i);
  if (!m) return 0;
  var n = parseFloat(m[1].replace(/,/g, ""));
  return isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
}

function renderSaved() {
  var all = S.tx.filter(function (t) { return t.type === "save"; });
  el("savedbox").hidden = !all.length;
  if (!all.length) return;

  el("saved-total").textContent = money0(savedSoFar());

  var byMonth = {};
  all.forEach(function (t) {
    byMonth[t.month] = (byMonth[t.month] || 0) + t.amount;
  });
  var months = Object.keys(byMonth).sort().reverse();
  var html = '<div class="kiraan" style="margin:var(--space-3) 0 0">' +
    months.map(function (m) {
      var d = new Date(m + "-01T00:00:00");
      return '<div class="b"><span>' + MON[d.getMonth()] + " " + d.getFullYear() +
        '</span><span class="tambah">+ ' + money0(byMonth[m]) + "</span></div>";
    }).join("") + "</div>";

  /* what the notes have spoken for, and what is still unspoken for */
  var spoken = S.notes.map(function (n) { return { text: n.text, amt: amountInNote(n.text) }; })
                      .filter(function (n) { return n.amt > 0; });
  if (spoken.length) {
    var total = savedSoFar();
    var claimed = spoken.reduce(function (a, n) { return a + n.amt; }, 0);
    var leftOver = Math.round((total - claimed) * 100) / 100;
    html += '<div class="kiraan" style="margin-top:var(--space-4)">' +
      '<div class="pl-tajuk" style="margin:0 0 var(--space-1);padding:0;border:0">Set aside for</div>' +
      spoken.map(function (n) {
        /* Her words as written. Cutting the amount out of the middle of a
           sentence left things like "Keep  untouched as the buffer", so the
           note is shown whole and the figure sits beside it. */
        return '<div class="b"><span class="nota-label" title="' + esc(n.text) + '">' +
          esc(n.text) + '</span><span>' + money0(n.amt) + "</span></div>";
      }).join("") +
      '<div class="b garis"><span>' + (leftOver < 0 ? "Over by" : "Not spoken for") +
      '</span><span class="' + (leftOver < 0 ? "tolak" : "tambah") + '">' +
      money0(Math.abs(leftOver)) + "</span></div></div>";
  }
  el("saved-list").innerHTML = html;
}

/* Free text beside the numbers: what the money is meant for, which a goal's
   name and target cannot always carry. */
function drawNotes(box, list, attr) {
  if (!box) return;
  if (!list.length) { box.innerHTML = ""; return; }
  box.innerHTML = list.map(function (n) {
    return '<div class="nota-baris"><span>' + esc(n.text) + "</span>" +
      '<button class="bil-buang" type="button" ' + attr + '="' + esc(n.id) +
      '" title="Remove this note" aria-label="Remove this note">' +
      (I.close || "×") + "</button></div>";
  }).join("");
}
/* A note that names a bill is shown on that bill. Same rule as the category
   matcher: the name must start on a word boundary, and where two bill names
   overlap the longer one wins, so "RAM Laptop" does not also flag "Laptop". */
function tidyName(t) {
  return " " + String(t).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() + " ";
}
function notesForBill(id) {
  var me = commitOf(id);
  if (!me) return [];
  var mine = tidyName(me.name).trim();
  if (!mine) return [];
  return S.logNotes.filter(function (n) {
    var hay = tidyName(n.text);
    var at = hay.indexOf(mine);
    var found = false;
    while (at !== -1) {
      if (at === 0 || !/[a-z0-9]/.test(hay.charAt(at - 1))) { found = true; break; }
      at = hay.indexOf(mine, at + 1);
    }
    if (!found) return false;
    /* if a longer bill name also appears and contains this one, the note
       belongs to that one instead */
    return !S.commits.some(function (o) {
      if (o.id === id) return false;
      var other = tidyName(o.name).trim();
      if (other.length <= mine.length) return false;
      if (other.indexOf(mine) === -1) return false;
      return hay.indexOf(other) !== -1;
    });
  });
}

function renderNotes() { drawNotes(el("notalist"), S.notes, "data-ndel"); }
function renderLogNotes() { drawNotes(el("lognotalist"), S.logNotes, "data-lndel"); }

function renderSavings() {
  renderSaved();
  renderNotes();
  var gb = el("goallist");
  if (!loaded) {
    gb.innerHTML = "";
  } else if (!S.goals.length) {
    /* Nothing to say until there is a goal. "Add a savings goal" is right
       underneath, so an empty notice is just something to scroll past. */
    gb.innerHTML = "";
  } else {
    gb.innerHTML = S.goals.map(function (g) {
      var saved = savedFor(g.id), target = g.target || 0;
      var pct = target > 0 ? Math.min(100, Math.round(saved / target * 100)) : 0;
      var left = Math.round(Math.max(0, target - saved) * 100) / 100;
      var tl = timeLeft(g.due), line;
      if (left <= 0) line = '<span class="sudah">Goal reached</span>';
      else if (!tl) line = '<span>No target date — ' + money0(left) + " to go</span>";
      else if (tl.months === 0) line = '<span class="lewat">Date has passed — ' + money0(left) + " to go</span>";
      else line = '<span class="perlu">' + money0(left / tl.months) + ' a month</span><span>' +
        (tl.days < 45 ? (tl.days + " days left") : (tl.months + " months left")) + "</span>";
      return '<div class="perkara' + (left <= 0 ? " selesai" : "") + '"><div class="kepala"><span class="tajuk-p">' +
        esc(g.name) + (g.example ? ' <span class="badge is-sun">example</span>' : "") +
        '</span><span class="kira">' + money0(saved) + " / " + money0(target) + '</span></div>' +
        '<div class="progress" style="margin-top:0"><div class="atas"><span>Saved</span><b>' + pct +
        '%</b></div><div class="track"><div class="fill" style="width:' + pct + '%"></div></div></div>' +
        '<div class="baki">' + line + (g.due ? "<span>by " + esc(dateLabel(g.due)) + "</span>" : "") + "</div>" +
        '<div class="tindakan"><input type="text" inputmode="decimal" placeholder="Add RM" data-gin="' +
        esc(g.id) + '" aria-label="Add savings to ' + esc(g.name) + '" style="flex:1 1 100px;width:auto">' +
        '<button class="btn utama kecilbtn" type="button" data-gadd="' + esc(g.id) + '">Add</button>' +
        '<button class="ikon sm bahaya" type="button" data-gdel="' + esc(g.id) + '" title="Remove ' +
        esc(g.name) + '" aria-label="Remove ' + esc(g.name) + '">' + (I.trash || "") + "</button></div></div>";
    }).join("");
  }

  var A = 0, D = 0;
  S.accts.forEach(function (a) { if (a.kind === "debt") { D += a.balance; } else { A += a.balance; } });
  var ab = el("acctlist");
  if (!S.accts.length) {
    ab.innerHTML = '<p class="nota kecil">Add accounts to track net worth — savings, ASB, EPF, card debt.</p>';
  } else {
    ab.innerHTML = S.accts.map(function (a) {
      return '<div class="akaun"><span class="badge ' + (a.kind === "debt" ? "" : "is-mint") + '">' +
        (a.kind === "debt" ? "Debt" : "Asset") + '</span><span class="nm">' + esc(a.name) +
        '</span><input type="text" inputmode="decimal" value="' + a.balance.toFixed(2) + '" data-abal="' +
        esc(a.id) + '" aria-label="' + esc(a.name) + ' balance">' +
        '<button class="ikon sm bahaya" type="button" data-adel="' + esc(a.id) + '" title="Remove ' +
        esc(a.name) + '" aria-label="Remove ' + esc(a.name) + '">' + (I.trash || "") + "</button></div>";
    }).join("");
  }
  el("nw-a").textContent = loaded ? money0(A) : "—";
  el("nw-d").textContent = loaded ? money0(D) : "—";
  el("nw-n").textContent = loaded ? money0(A - D) : "—";
  var last = Object.keys(S.networth).sort().pop();
  el("nw-last").textContent = last ? ("Last recorded " + last + " · " + money0(S.networth[last].net)) : "";
}
function row(label, value, cls) {
  return '<div class="b"><span>' + esc(label) + '</span><span class="' + cls + '">' + value + "</span></div>";
}
function renderSettings() {
  var ex = S.tx.filter(function (t) { return t.example; });
  var exg = S.goals.filter(function (g) { return g.example; });
  el("exbox").hidden = !(ex.length + exg.length);
  el("excount").textContent = ex.length + exg.length;

  var sig = S.cats.map(function (c) { return c.name; }).join("|");
  [el("k-cat"), el("n-cat")].forEach(function (sel) {
    if (sel.dataset.sig === sig) return;
    sel.dataset.sig = sig;
    sel.innerHTML = S.cats.map(function (c) {
      return '<option value="' + esc(c.name) + '">' + esc(c.name) + "</option>";
    }).join("");
  });

  var kl = el("kwlist");
  kl.innerHTML = S.kws.length
    ? S.kws.slice().sort(function (a, b) { return a.kw < b.kw ? -1 : 1; }).map(function (k) {
        return '<span class="kunci"><span>' + esc(k.kw) + '</span><i>' + esc(k.cat) +
          '</i><button type="button" data-kdel="' + esc(k.kw) + '" title="Remove ' + esc(k.kw) +
          '" aria-label="Remove ' + esc(k.kw) + '">' + (I.close || "×") + "</button></span>";
      }).join("")
    : '<p class="nota kecil">No keywords yet.</p>';

  el("catlist").innerHTML = S.cats.length
    ? S.cats.map(function (c) {
        return '<span class="badge ' + (c.type === "out" ? "" : "is-mint") + '">' + esc(c.name) + "</span>";
      }).join("")
    : '<p class="nota kecil">No categories yet.</p>';
}

function renderGuess() {
  var noteTxt = el("e-note").value.trim(), amt = parseAmt(el("e-amt").value), box = el("e-guess");
  el("e-go").disabled = !(isFinite(amt) && amt > 0 && loaded);
  var vm = monthKey(view), nowm = monthKey(new Date());
  el("e-go").textContent = (vm === nowm) ? "Save" : ("Save to " + MONTH[view.getMonth()]);
  /* The strip only exists to show which category was picked, so it stays out
     of the way until there is something in it to say. */
  if (!noteTxt) {
    box.hidden = true;
    box.innerHTML = "";
    return;
  }
  box.hidden = false;
  var hit = override ? null : guessCat(noteTxt);
  var cat = override || (hit ? hit.cat : null);
  var hint = override ? "your pick" : (hit ? "from “" + esc(hit.w) + "”" : "not recognised — pick one");
  box.innerHTML = '<span class="badge ' + (cat && typeOf(cat) !== "out" ? "is-mint" : "") + '">' +
    esc(cat || "No category") + '</span><span class="kecil">' + hint + "</span>" +
    (S.cats.length ? '<select id="e-cat" aria-label="Change category">' +
      (cat ? "" : '<option value="">Choose…</option>') +
      S.cats.map(function (c) {
        return '<option value="' + esc(c.name) + '"' + (c.name === cat ? " selected" : "") + ">" + esc(c.name) + "</option>";
      }).join("") + "</select>" : "");
  var cs = el("e-cat");
  if (cs) { cs.onchange = function () { override = cs.value || null; renderGuess(); }; }
}

/* ---------- tabs ---------- */
var TABS = [
  { k: "log", label: "Log", ic: "plus" },
  { k: "history", label: "History", ic: "list" },
  { k: "debts", label: "Debts", ic: "bag" },
  { k: "savings", label: "Savings", ic: "gift" },
  { k: "settings", label: "Settings", ic: "grid" }
];
el("tabs").innerHTML = TABS.map(function (t) {
  return '<button type="button" role="tab" data-tab="' + t.k + '" aria-selected="false" title="' +
    t.label + '">' + (I[t.ic] || "") + "<span>" + t.label + "</span></button>";
}).join("");
el("mprev").innerHTML = I.back || "";
el("mnext").innerHTML = I.chevron || "";

function setTab(k) {
  tab = k;
  /* Settings has nothing that belongs to a month, so the month strip goes. */
  /* Settings has nothing that belongs to a month, so the month and its
     arrows step back there; the curve and the greeting stay. */
  el("atas").hidden = (k === "settings");
  ["log", "history", "debts", "savings", "settings"].forEach(function (x) { el("p-" + x).hidden = (x !== k); });
  Array.prototype.forEach.call(el("tabs").children, function (b) {
    b.setAttribute("aria-selected", b.dataset.tab === k ? "true" : "false");
  });
  try { localStorage.setItem("ll.tab", k); } catch (e) { }
  render();
}

/* ---------- mutations ---------- */
/* A record belongs to the month you are looking at, not to today. Planning
   November on the 31st of October and marking a bill paid has to land in
   November, or the plan and the record disagree. Within the current month
   it keeps today's date, so ordinary logging is unchanged. */
function addTx(d) {
  var now = new Date();
  var mk = monthKey(view);
  var when = (mk === monthKey(now))
    ? now
    : new Date(view.getFullYear(), view.getMonth(), 1);
  var r = { id: uid(), amount: d.amount, note: d.note || "", cat: d.cat, type: d.type,
            date: ymd(when), month: mk, ts: Date.now() };
  if (d.goal) r.goal = d.goal;
  if (d.commit) r.commit = d.commit;
  S.tx.unshift(r);
  save(); render();
}

/* ---------- events ---------- */
el("entryform").addEventListener("submit", function (ev) {
  ev.preventDefault();
  var amt = parseAmt(el("e-amt").value), noteTxt = el("e-note").value.trim();
  if (!isFinite(amt) || amt <= 0 || !loaded) return;
  var hit = override ? null : guessCat(noteTxt);
  var cat = override || (hit ? hit.cat : null);
  if (!cat || !catOf(cat)) cat = catOf("Other") ? "Other" : null;
  if (!cat) { renderGuess(); el("e-note").focus(); return; }
  addTx({ amount: amt, note: noteTxt, cat: cat, type: typeOf(cat) });
  el("e-amt").value = ""; el("e-note").value = ""; override = null;
  renderGuess(); el("e-amt").focus();
});
el("e-note").addEventListener("input", function () { override = null; renderGuess(); });
el("e-amt").addEventListener("input", renderGuess);

el("mprev").onclick = function () { view.setMonth(view.getMonth() - 1); render(); };
el("mnext").onclick = function () { view.setMonth(view.getMonth() + 1); render(); };
/* The planner's inline fields and its link to the Debts tab. They are
   rebuilt on every render, so the listener sits on the container. */
el("pl-rows").addEventListener("change", function (ev) {
  /* one of the named bills */
  var nm = ev.target.closest("input[data-bnm]");
  if (nm) {
    var cn = commitOf(nm.dataset.bnm);
    var text = nm.value.trim();
    if (cn && text) { cn.name = text; save(); render(); }
    else if (cn) { nm.value = cn.name; }   /* a bill with no name is not a bill */
    return;
  }
  var bil = ev.target.closest("input[data-bil]");
  if (bil) {
    var c = commitOf(bil.dataset.bil);
    if (c) {
      var n = parseAmt(bil.value);
      c.monthly = (isFinite(n) && n >= 0) ? n : 0;
      /* already ticked as paid? then the record follows the figure */
      var paid = paidThisMonth(c.id);
      if (paid) paid.amount = c.monthly;
      save(); render();
    }
    return;
  }
  var inp = ev.target.closest("input[id^='pf-']");
  if (!inp) return;
  var v = parseAmt(inp.value);
  v = (isFinite(v) && v >= 0) ? v : 0;
  if (inp.id === "pf-income") S.plan.income = v;
  else {
    S.plan.setAside = v;
    /* already moved across? then the record follows the plan */
    var moved = setAsideThisMonth(monthKey(view));
    if (moved) moved.amount = v;
  }
  save(); render();
});
el("pl-rows").addEventListener("keydown", function (ev) {
  if (ev.key === "Enter" && ev.target.matches("input[id^='pf-'], input[data-bil]")) {
    ev.preventDefault();
    ev.target.blur();
  }
});
el("pl-rows").addEventListener("click", function (ev) {
  var b = ev.target.closest("button[data-go]");
  if (b) { setTab(b.dataset.go); return; }
  var bd = ev.target.closest("button[data-bdel]");
  if (bd) {
    S.commits = S.commits.filter(function (x) { return x.id !== bd.dataset.bdel; });
    save(); render();
    return;
  }
  var tik = ev.target.closest("button[data-tik]");
  if (tik) {
    togglePaid(tik.dataset.tik);
    return;
  }
  if (ev.target.closest("#pl-add")) {
    askForBill();
  }
});

/* Ticking records this month's payment against that bill; unticking removes
   the record again. It does not change "Left to spend" — the bill was already
   taken out when the month was planned, so counting it again would be wrong. */
function togglePaid(id) {
  var c = commitOf(id);
  if (!c) return;
  var already = paidThisMonth(id);
  if (already) {
    S.tx = S.tx.filter(function (t) { return t.id !== already.id; });
    save(); render();
    return;
  }
  if (!c.monthly) { note("Put the amount in first, then tick it."); return; }
  addTx({ amount: c.monthly, note: c.name, cat: catOf(c.cat) ? c.cat : "Commitments",
          type: "out", commit: c.id });
}

/* A small inline form rather than a browser prompt, which some views ignore. */
function askForBill() {
  if (el("pl-borang")) { el("pl-nama").focus(); return; }
  var wrap = document.createElement("div");
  wrap.className = "pl-borang";
  wrap.id = "pl-borang";
  wrap.innerHTML =
    '<input type="text" id="pl-nama" placeholder="What is it? e.g. Astro" aria-label="What is it">' +
    '<span class="pl-medan"><span class="rm">RM</span>' +
    '<input type="text" id="pl-jum" inputmode="decimal" placeholder="0.00" aria-label="How much"></span>' +
    '<button class="btn kecilbtn utama" type="button" id="pl-simpan">Add</button>' +
    '<button class="btn kecilbtn" type="button" id="pl-batal">Cancel</button>';
  el("pl-add").insertAdjacentElement("afterend", wrap);
  el("pl-nama").focus();
  el("pl-batal").onclick = function () { wrap.remove(); };
  el("pl-simpan").onclick = function () {
    var nama = el("pl-nama").value.trim();
    var jum = parseAmt(el("pl-jum").value);
    if (!nama) { el("pl-nama").focus(); return; }
    S.commits.push({ id: uid(), name: nama, monthly: isFinite(jum) ? jum : 0,
                     cat: catOf("Commitments") ? "Commitments" : (S.cats[0] || {}).name || "Other",
                     end: "", ts: Date.now() });
    save(); render();
  };
  [el("pl-nama"), el("pl-jum")].forEach(function (i) {
    i.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); el("pl-simpan").click(); }
      if (e.key === "Escape") wrap.remove();
    });
  });
}

el("tabs").addEventListener("click", function (ev) {
  var b = ev.target.closest("button[data-tab]");
  if (b) setTab(b.dataset.tab);
});

el("historylist").addEventListener("click", function (ev) {
  var row = ev.target.closest("button[data-tx]");
  if (!row || row.dataset.open === "1") return;
  var id = row.dataset.tx, t = null;
  for (var i = 0; i < S.tx.length; i++) { if (S.tx[i].id === id) t = S.tx[i]; }
  if (!t) return;
  row.dataset.open = "1";
  var wrap = document.createElement("div");
  wrap.className = "sunting";
  wrap.innerHTML =
    '<input type="text" class="apa-isi" placeholder="What was it for?" value="' + esc(t.note) +
    '" aria-label="What it was for">' +
    '<select aria-label="Category">' + S.cats.map(function (c) {
      return '<option value="' + esc(c.name) + '"' + (c.name === t.cat ? " selected" : "") + ">" + esc(c.name) + "</option>";
    }).join("") + "</select>" +
    '<button class="btn kecilbtn" type="button">Save</button>' +
    '<button class="btn bahaya kecilbtn" type="button">Delete</button>' +
    '<button class="ikon sm" type="button" title="Close" aria-label="Close">' + (I.close || "") + "</button>";

  var noteInput = wrap.querySelector("input");
  var sel = wrap.querySelector("select");
  var bs = wrap.querySelectorAll("button");
  function close() { wrap.remove(); row.dataset.open = ""; }

  /* Typing what it was for re-runs the matcher, so an amount logged bare
     lands in the right category as soon as it is described. The picker is
     still there, so the guess can be overruled. */
  var touchedCat = false;
  sel.addEventListener("change", function () { touchedCat = true; });
  noteInput.addEventListener("input", function () {
    if (touchedCat) return;
    var hit = guessCat(noteInput.value.trim());
    if (hit && catOf(hit.cat)) sel.value = hit.cat;
  });

  function commit() {
    t.note = noteInput.value.trim();
    t.cat = sel.value;
    t.type = typeOf(sel.value);
    close(); save(); render();
  }
  noteInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); commit(); }
  });
  bs[0].onclick = commit;
  bs[1].onclick = function () { S.tx = S.tx.filter(function (x) { return x.id !== t.id; }); close(); save(); render(); };
  bs[2].onclick = close;
  row.insertAdjacentElement("afterend", wrap);
  noteInput.focus();
  noteInput.select();
});

el("n-add").onclick = function () {
  var name = el("n-name").value.trim(), monthly = parseAmt(el("n-monthly").value);
  if (!name) { el("n-name").focus(); return; }
  S.commits.push({ id: uid(), name: name, monthly: isFinite(monthly) ? monthly : 0,
                   cat: el("n-cat").value || "Commitments", end: el("n-end").value || "", ts: Date.now() });
  el("n-name").value = ""; el("n-monthly").value = "";
  el("newcommit").open = false;
  save(); render();
};
el("commitlist").addEventListener("change", function (ev) {
  var m = ev.target.closest("input[data-cmon]");
  if (m) {
    var v = parseAmt(m.value);
    if (!isFinite(v)) return;
    var c = commitOf(m.dataset.cmon);
    if (c) {
      c.monthly = v;
      /* already ticked as paid? then the record follows the figure */
      var cp = paidInMonth(c.id, c.once || monthKey(view));
      if (cp) cp.amount = v;
      save(); render();
    }
    return;
  }
  var e = ev.target.closest("input[data-cend]");
  if (e) {
    var c2 = commitOf(e.dataset.cend);
    if (c2) { c2.end = e.value || ""; save(); render(); }
    return;
  }
  /* Which single month a one-off belongs to. */
  var o = ev.target.closest("input[data-conce]");
  if (o) {
    var c3 = commitOf(o.dataset.conce);
    if (c3 && o.value) { c3.once = o.value; save(); render(); }
    return;
  }
  /* Pay once, or every month. Turning it on claims the month on screen,
     since that is the month she is looking at when she pays it. */
  var tg = ev.target.closest("input[data-ctog]");
  if (tg) {
    var c4 = commitOf(tg.dataset.ctog);
    if (c4) { c4.once = tg.checked ? monthKey(view) : ""; save(); render(); }
  }
});
el("commitlist").addEventListener("click", function (ev) {
  var pay = ev.target.closest("button[data-cpay]");
  if (pay) { togglePaid(pay.dataset.cpay); return; }
  /* A BNPL account is rarely one flat amount — each purchase is its own
     instalment with its own last payment. They sit as separate rows next to
     the parent, so every month only counts the ones actually running. */
  var plus = ev.target.closest("button[data-cadd]");
  if (plus) {
    var parent = commitOf(plus.dataset.cadd);
    if (!parent) return;
    var at = S.commits.indexOf(parent);
    S.commits.splice(at + 1, 0, {
      id: uid(), name: parent.name + " — instalment", monthly: 0,
      cat: parent.cat, end: parent.end, ts: Date.now()
    });
    save(); render();
    var fresh = el("commitlist").querySelectorAll("input[data-cmon]")[at + 1];
    if (fresh) { fresh.focus(); fresh.select(); }
    return;
  }

  var del = ev.target.closest("button[data-cdel]");
  if (del) {
    S.commits = S.commits.filter(function (x) { return x.id !== del.dataset.cdel; });
    save(); render();
  }
});

el("g-add").onclick = function () {
  var name = el("g-name").value.trim(), target = parseAmt(el("g-target").value);
  var start = parseAmt(el("g-start").value), due = el("g-due").value;
  if (!name) { el("g-name").focus(); return; }
  if (!isFinite(target) || target <= 0) { el("g-target").focus(); return; }
  S.goals.push({ id: uid(), name: name, target: target, start: isFinite(start) ? start : 0,
                 due: due || "", ts: Date.now() });
  el("g-name").value = ""; el("g-target").value = ""; el("g-start").value = ""; el("g-due").value = "";
  el("newgoal").open = false;
  save(); render();
};
el("goallist").addEventListener("click", function (ev) {
  var add = ev.target.closest("button[data-gadd]");
  if (add) {
    var id = add.dataset.gadd;
    var inp = el("goallist").querySelector('input[data-gin="' + id + '"]');
    var v = parseAmt(inp && inp.value);
    if (!isFinite(v) || v <= 0) { if (inp) inp.focus(); return; }
    var g = goalOf(id), saveCat = null;
    for (var i = 0; i < S.cats.length; i++) { if (S.cats[i].type === "save") saveCat = S.cats[i].name; }
    if (!saveCat) { note("There is no Savings-type category. Add one in Settings."); return; }
    addTx({ amount: v, note: "Saved — " + (g ? g.name : ""), cat: saveCat, type: "save", goal: id });
    return;
  }
  var del = ev.target.closest("button[data-gdel]");
  if (del) {
    S.goals = S.goals.filter(function (x) { return x.id !== del.dataset.gdel; });
    save(); render();
  }
});

el("lognota-add").onclick = function () {
  var t = el("lognota-teks").value.trim();
  if (!t) { el("lognota-teks").focus(); return; }
  S.logNotes.push({ id: uid(), text: t.slice(0, 255) });
  el("lognota-teks").value = "";
  save(); render();
};
el("lognota-teks").addEventListener("keydown", function (e) {
  if (e.key === "Enter") { e.preventDefault(); el("lognota-add").click(); }
});
el("lognotalist").addEventListener("click", function (ev) {
  var b = ev.target.closest("button[data-lndel]");
  if (!b) return;
  S.logNotes = S.logNotes.filter(function (n) { return n.id !== b.dataset.lndel; });
  save(); render();
});

el("nota-add").onclick = function () {
  var t = el("nota-teks").value.trim();
  if (!t) { el("nota-teks").focus(); return; }
  S.notes.push({ id: uid(), text: t.slice(0, 255) });
  el("nota-teks").value = "";
  save(); render();
};
el("nota-teks").addEventListener("keydown", function (e) {
  if (e.key === "Enter") { e.preventDefault(); el("nota-add").click(); }
});
el("notalist").addEventListener("click", function (ev) {
  var b = ev.target.closest("button[data-ndel]");
  if (!b) return;
  S.notes = S.notes.filter(function (n) { return n.id !== b.dataset.ndel; });
  save(); render();
});

el("a-add").onclick = function () {
  var name = el("a-name").value.trim();
  if (!name) return;
  S.accts.push({ id: uid(), name: name, kind: el("a-kind").value, balance: 0, ts: Date.now() });
  el("a-name").value = "";
  save(); render();
};
el("acctlist").addEventListener("change", function (ev) {
  var inp = ev.target.closest("input[data-abal]");
  if (!inp) return;
  var v = parseAmt(inp.value);
  if (!isFinite(v)) return;
  S.accts.forEach(function (a) { if (a.id === inp.dataset.abal) a.balance = v; });
  save(); render();
});
el("acctlist").addEventListener("click", function (ev) {
  var b = ev.target.closest("button[data-adel]");
  if (!b) return;
  S.accts = S.accts.filter(function (a) { return a.id !== b.dataset.adel; });
  save(); render();
});
el("nw-save").onclick = function () {
  var A = 0, D = 0;
  S.accts.forEach(function (a) { if (a.kind === "debt") { D += a.balance; } else { A += a.balance; } });
  S.networth[monthKey(new Date())] = { assets: A, debts: D, net: A - D, ts: Date.now() };
  save(); render();
};

el("k-add").onclick = function () {
  var w = el("k-word").value.trim().toLowerCase(), c = el("k-cat").value;
  if (!w || !c) return;
  S.kws = S.kws.filter(function (k) { return k.kw !== w; });
  S.kws.push({ kw: w, cat: c });
  el("k-word").value = "";
  save(); render();
};
el("kwlist").addEventListener("click", function (ev) {
  var b = ev.target.closest("button[data-kdel]");
  if (!b) return;
  S.kws = S.kws.filter(function (k) { return k.kw !== b.dataset.kdel; });
  save(); render();
});
el("c-add").onclick = function () {
  var n = el("c-name").value.trim();
  if (!n || catOf(n)) return;
  S.cats.push({ name: n, type: el("c-type").value });
  el("c-name").value = "";
  save(); render();
};
el("ex-clear").onclick = function () {
  S.tx = S.tx.filter(function (t) { return !t.example; });
  S.goals = S.goals.filter(function (g) { return !g.example; });
  save(); render();
};

/* The title greets whoever is signed in. Without accounts it is just the
   app's name, so the header never says "Welcome undefined". */
window.addEventListener("ll:signedin", function (e) {
  var who = e.detail && e.detail.name ? String(e.detail.name).trim().split(/\s+/)[0] : "";
  if (who) { whoName = who; render(); }
});

/* ---------- appearance ----------
   "auto" follows the phone; the other two override it. The choice is a
   per-device preference, so it lives in this browser rather than the
   ledger — the same account on a laptop can be light and dark on a phone. */
function applyTema(choice) {
  var root = document.documentElement;
  if (choice === "dark") root.setAttribute("data-theme", "dark");
  else if (choice === "light") root.setAttribute("data-theme", "light");
  else root.removeAttribute("data-theme");
  Array.prototype.forEach.call(el("tema").children, function (b) {
    b.classList.toggle("on", b.dataset.tema === choice);
  });
}
function temaNow() {
  try { return localStorage.getItem("ll.tema") || "auto"; } catch (e) { return "auto"; }
}
el("tema").addEventListener("click", function (ev) {
  var b = ev.target.closest("button[data-tema]");
  if (!b) return;
  try { localStorage.setItem("ll.tema", b.dataset.tema); } catch (e) { }
  applyTema(b.dataset.tema);
});
applyTema(temaNow());

/* ---------- boot ---------- */
try { var t0 = localStorage.getItem("ll.tab"); if (t0) tab = t0; } catch (e) { }
setTab(tab);

/* First run: start from the standard categories and keywords, with none of
   anyone else's records. After that, whatever is in this browser. */
function boot(d) {
  S.cats = Array.isArray(d.cats) ? d.cats : [];
  S.kws = Array.isArray(d.kws) ? d.kws : [];
  S.tx = (Array.isArray(d.tx) ? d.tx : []).map(function (o) {
    return { id: o.id || uid(), amount: +o.amount || 0, note: o.note || "", cat: o.cat || "Other",
             type: (o.type === "in" || o.type === "save") ? o.type : "out",
             date: o.date || "", month: o.month || "", ts: +o.ts || 0,
             example: !!o.example, goal: o.goal || null, commit: o.commit || null };
  });
  S.goals = (Array.isArray(d.goals) ? d.goals : []).map(function (o) {
    return { id: o.id || uid(), name: o.name || "Goal", target: +o.target || 0,
             start: +o.start || 0, due: o.due || "", ts: +o.ts || 0, example: !!o.example };
  });
  S.commits = (Array.isArray(d.commits) ? d.commits : []).map(function (o) {
    return { id: o.id || uid(), name: o.name || "Commitment", monthly: +o.monthly || 0,
             cat: o.cat || "Commitments", end: o.end || "", once: o.once || "",
             ts: +o.ts || 0 };
  });
  S.accts = (Array.isArray(d.accts) ? d.accts : []).map(function (o) {
    return { id: o.id || uid(), name: o.name || "Account", kind: o.kind === "debt" ? "debt" : "asset",
             balance: +o.balance || 0, ts: +o.ts || 0 };
  });
  S.networth = (d.networth && typeof d.networth === "object") ? d.networth : {};
  S.logNotes = (Array.isArray(d.logNotes) ? d.logNotes : [])
    .filter(function (n) { return n && n.id && n.text; })
    .map(function (n) { return { id: String(n.id), text: String(n.text) }; });
  S.notes = (Array.isArray(d.notes) ? d.notes : [])
    .filter(function (n) { return n && n.id && n.text; })
    .map(function (n) { return { id: String(n.id), text: String(n.text) }; });
  S.plan = (d.plan && typeof d.plan === "object")
    ? { income: +d.plan.income || 0, setAside: +d.plan.setAside || 0, living: +d.plan.living || 0 }
    : { income: 0, setAside: 0, living: 0 };
  loaded = true;
  note("");
  setSaved("Kept in this browser.");
  render();
}

window.addEventListener("ll:unlocked", function () {
  window.LL.load()
    .then(function (d) {
      if (d && (d.cats || []).length) { boot(d); return; }
      /* unlocked but nothing saved yet: take the starting categories only */
      return fetch("seed.json").then(function (r) { return r.json(); })
        .then(function (x) { boot({ cats: x.cats, kws: x.kws }); dirty = true; flush(); });
    })
    .catch(function () {
      note("The saved records could not be opened.");
      boot({});
    });
});

/* ---- backup, since this browser is the only copy ---- */
function download(name, text) {
  var blob = new Blob([text], { type: "application/json" });
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
}
if (el("backup")) {
  el("backup").onclick = function () {
    var d = new Date();
    download("little-ledger-" + ymd(d) + ".json", JSON.stringify(S, null, 1));
  };
}
if (el("lock")) {
  el("lock").onclick = function () { flush(); setTimeout(function () { window.LL.lock(); }, 200); };
}
if (el("restore")) {
  el("restore").onclick = function () { el("restore-file").click(); };
  el("restore-file").onchange = function () {
    var f = el("restore-file").files[0];
    if (!f) return;
    var fr = new FileReader();
    fr.onload = function () {
      try {
        var d = JSON.parse(fr.result);
        if (!d || typeof d !== "object") throw new Error("not a ledger file");
        boot(d);
        dirty = true; flush();
        note("Restored from " + f.name, "ok");
      } catch (e) {
        note("That file could not be read as a Little Ledger backup.");
      }
      el("restore-file").value = "";
    };
    fr.readAsText(f);
  };
}
})();
