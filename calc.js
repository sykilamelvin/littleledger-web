/* Little Ledger — calculator.
   A float button in the corner opens a sheet. It evaluates with its own
   parser, never eval(): the input is read as a small expression grammar, so
   nothing typed here can run as code.

   "Smart" means three things:
     - percentages behave the way a till does: 100+6% is 106, not 100.06
     - the bill shortcuts people actually use: split 2/3/4, SST, service
     - the answer goes straight into the Log entry, so you never retype it

   History lives in this browser (localStorage), not in MySQL: it is a working
   tape, not a financial record, and keeping it local means no schema change.
   Clearing site data clears it; the ledger itself is untouched by that. */
"use strict";
(function () {
var I = window.ICONS || {};
function el(id) { return document.getElementById(id); }

/* ---------- tokenizer ---------- */
function tokenize(src) {
  var s = String(src)
    .replace(/[×x✕]/gi, "*")
    .replace(/[÷]/g, "/")
    .replace(/[−–—]/g, "-")
    .replace(/,/g, "");
  var out = [], i = 0;
  while (i < s.length) {
    var c = s.charAt(i);
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) {
      var j = i;
      while (j < s.length && /[0-9.]/.test(s.charAt(j))) j++;
      var text = s.slice(i, j);
      if ((text.match(/\./g) || []).length > 1) throw new Error("Check the decimal point");
      var n = parseFloat(text);
      if (!isFinite(n)) throw new Error("Check that number");
      out.push({ t: "num", v: n });
      i = j;
      continue;
    }
    if ("+-*/()%".indexOf(c) !== -1) { out.push({ t: c }); i++; continue; }
    throw new Error("Cannot use “" + c + "”");
  }
  return out;
}

/* ---------- parser ----------
   expr   := term (('+' | '-') term)*     a trailing % on the right-hand term
                                          is read as a percentage OF the left
   term   := unary (('*' | '/') unary)*
   unary  := '-' unary | primary
   primary:= number '%'? | '(' expr ')' '%'?
   Returns {v, pct} so the additive level can tell "6%" from "6".            */
function evaluate(src) {
  var tk = tokenize(src), p = 0;
  function peek() { return p < tk.length ? tk[p].t : null; }
  function eat(t) { if (peek() === t) { p++; return true; } return false; }

  function primary() {
    if (eat("(")) {
      var inner = expr();
      if (!eat(")")) throw new Error("Missing a closing bracket");
      return { v: inner.v, pct: eat("%") };
    }
    if (peek() === "num") {
      var n = tk[p++].v;
      return { v: n, pct: eat("%") };
    }
    if (peek() === null) throw new Error("Unfinished");
    throw new Error("Unexpected “" + peek() + "”");
  }
  function unary() {
    if (eat("-")) { var r = unary(); return { v: -r.v, pct: r.pct }; }
    if (eat("+")) return unary();
    return primary();
  }
  function term() {
    var left = unary();
    for (;;) {
      if (eat("*")) {
        var r = unary();
        left = { v: left.v * (r.pct ? r.v / 100 : r.v), pct: false };
      } else if (eat("/")) {
        var d = unary();
        var div = d.pct ? d.v / 100 : d.v;
        if (div === 0) throw new Error("Cannot divide by zero");
        left = { v: left.v / div, pct: false };
      } else { return left; }
    }
  }
  function expr() {
    var left = term();
    for (;;) {
      if (eat("+")) {
        var r = term();
        left = { v: left.v + (r.pct ? left.v * r.v / 100 : r.v), pct: false };
      } else if (eat("-")) {
        var s = term();
        left = { v: left.v - (s.pct ? left.v * s.v / 100 : s.v), pct: false };
      } else { return left; }
    }
  }

  var res = expr();
  if (p < tk.length) throw new Error("Unexpected “" + tk[p].t + "”");
  var v = res.pct ? res.v / 100 : res.v;
  if (!isFinite(v)) throw new Error("That does not work out");
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

/* ---------- history, in this browser only ---------- */
var HKEY = "ll.calc.history", hist = [];
function loadHist() {
  try { hist = JSON.parse(localStorage.getItem(HKEY) || "[]"); }
  catch (e) { hist = []; }
  if (!Array.isArray(hist)) hist = [];
}
function saveHist() {
  try { localStorage.setItem(HKEY, JSON.stringify(hist.slice(0, 40))); } catch (e) { }
}

/* ---------- display ---------- */
var lastGood = null;
function fmt(n) {
  return n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function show() {
  var src = el("calc-exp").value.trim();
  var out = el("calc-out");
  if (!src) { out.className = "hasil"; out.textContent = "0.00"; lastGood = null; setUse(); return; }
  try {
    var v = evaluate(src);
    lastGood = v;
    out.className = "hasil";
    out.textContent = fmt(v);
  } catch (e) {
    lastGood = null;
    out.className = "hasil salah";
    out.textContent = e.message;
  }
  setUse();
}
function setUse() {
  var ok = lastGood !== null && lastGood > 0;
  el("calc-use").disabled = !ok;
  el("calc-save").disabled = lastGood === null;
}

function renderHist() {
  var box = el("calc-hist");
  if (!hist.length) {
    box.innerHTML = '<p class="nota kecil">Nothing kept yet. Work something out and press Keep.</p>';
    return;
  }
  box.innerHTML = hist.map(function (h, i) {
    return '<button class="kira-baris" type="button" data-h="' + i + '">' +
      '<span class="e">' + esc(h.e) + '</span><span class="r">' + fmt(h.v) + "</span></button>";
  }).join("");
}
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c];
  });
}

/* ---------- keypad ---------- */
var KEYS = [
  ["C", "kosongkan"], ["(", "op"], [")", "op"], ["÷", "op"],
  ["7", ""], ["8", ""], ["9", ""], ["×", "op"],
  ["4", ""], ["5", ""], ["6", ""], ["−", "op"],
  ["1", ""], ["2", ""], ["3", ""], ["+", "op"],
  ["0", ""], [".", ""], ["%", "op"], ["=", "sama"]
];
el("calc-keys").innerHTML = KEYS.map(function (k) {
  return '<button type="button" class="' + k[1] + '" data-k="' + k[0] + '">' + k[0] + "</button>";
}).join("");

function typeIn(ch) {
  var inp = el("calc-exp");
  if (ch === "C") { inp.value = ""; show(); inp.focus(); return; }
  if (ch === "=") { keep(); return; }
  var map = { "÷": "/", "×": "*", "−": "-" };
  inp.value += (map[ch] || ch);
  show();
  inp.focus();
}

/* ---------- actions ---------- */
function keep() {
  var src = el("calc-exp").value.trim();
  if (!src || lastGood === null) return;
  if (!hist.length || hist[0].e !== src) {
    hist.unshift({ e: src, v: lastGood, ts: Date.now() });
    hist = hist.slice(0, 40);
    saveHist();
    renderHist();
  }
}
function openSheet() {
  el("calcveil").hidden = false;
  el("calcsheet").hidden = false;
  el("calcopen").setAttribute("aria-expanded", "true");
  renderHist();
  show();
  el("calc-exp").focus();
  document.addEventListener("keydown", onEsc);
}
function closeSheet() {
  el("calcveil").hidden = true;
  el("calcsheet").hidden = true;
  el("calcopen").setAttribute("aria-expanded", "false");
  document.removeEventListener("keydown", onEsc);
  el("calcopen").focus();
}
function onEsc(e) { if (e.key === "Escape") closeSheet(); }

/* ---------- wiring ---------- */
el("calcopen").innerHTML = I.calculator || "";
el("calcclose").innerHTML = I.close || "";
el("calc-clear").innerHTML = I.trash || "";

el("calcopen").onclick = openSheet;
el("calcclose").onclick = closeSheet;
el("calcveil").onclick = closeSheet;

el("calc-exp").addEventListener("input", show);
el("calc-exp").addEventListener("keydown", function (e) {
  if (e.key === "Enter") { e.preventDefault(); keep(); }
});
el("calc-keys").addEventListener("click", function (e) {
  var b = e.target.closest("button[data-k]");
  if (b) typeIn(b.dataset.k);
});
el("calc-quick").addEventListener("click", function (e) {
  var b = e.target.closest("button[data-q]");
  if (!b) return;
  var inp = el("calc-exp");
  var cur = inp.value.trim();
  if (!cur) return;
  /* wrap what is there so "12+8" then Split 2 means (12+8)/2, not 12+8/2 */
  inp.value = "(" + cur + ")" + b.dataset.q;
  show();
  inp.focus();
});
el("calc-save").onclick = keep;

el("calc-use").onclick = function () {
  if (lastGood === null || lastGood <= 0) return;
  keep();
  var amt = el("e-amt");
  amt.value = lastGood.toFixed(2);
  amt.dispatchEvent(new Event("input", { bubbles: true }));
  closeSheet();
  var logTab = document.querySelector('#tabs button[data-tab="log"]');
  if (logTab) logTab.click();
  el("e-note").focus();
};

el("calc-clear").onclick = function () {
  if (!hist.length) return;
  hist = [];
  saveHist();
  renderHist();
};

el("calc-hist").addEventListener("click", function (e) {
  var b = e.target.closest("button[data-h]");
  if (!b) return;
  var h = hist[+b.dataset.h];
  if (!h) return;
  el("calc-exp").value = h.e;
  show();
  el("calc-exp").focus();
});

loadHist();
renderHist();
show();

/* exposed so the console and any future caller can use the same parser */
window.LLCalc = { evaluate: evaluate };
})();
