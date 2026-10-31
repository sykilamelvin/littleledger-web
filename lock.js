/* Little Ledger — the lock.
   There is no server here, so there is nobody to check a password against.
   What this does instead is encrypt your records with a key derived from
   your PIN, so what sits in the browser's storage is unreadable without it.

   Be clear about what that is and is not:
     - Someone who picks up your phone cannot read your ledger. That is the
       point, and it works.
     - It is a 6-digit PIN, so a million guesses. Someone who copied the
       stored data onto a fast machine could work through that. Against a
       determined attacker with your device in hand, this is a lock on a
       drawer, not a safe.
     - Forget the PIN and the records are gone. There is no reset, because
       there is no server to ask. That is why Backup exists.

   Encryption is AES-GCM with a key from PBKDF2-SHA256 over the PIN. */
"use strict";
(function () {
var KEY_LOCK = "ll.lock";     // {v, name, salt, iter}
var KEY_DATA = "ll.data";     // {iv, ct}
var ITER = 310000;            // OWASP's figure for PBKDF2-SHA256

function el(id) { return document.getElementById(id); }
function hex(buf) {
  return Array.prototype.map.call(new Uint8Array(buf),
    function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
}
function unhex(s) {
  var a = new Uint8Array(s.length / 2);
  for (var i = 0; i < a.length; i++) a[i] = parseInt(s.substr(i * 2, 2), 16);
  return a;
}
function read(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function write(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }

var crypto = window.crypto && window.crypto.subtle ? window.crypto : null;

async function deriveKey(pin, salt, iter) {
  var base = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(String(pin)), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt, iterations: iter, hash: "SHA-256" },
    base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

var liveKey = null;

var LL = {
  name: "",
  async save(obj) {
    if (!liveKey) throw new Error("locked");
    var iv = crypto.getRandomValues(new Uint8Array(12));
    var ct = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv }, liveKey,
      new TextEncoder().encode(JSON.stringify(obj)));
    if (!write(KEY_DATA, JSON.stringify({ iv: hex(iv), ct: hex(ct) }))) {
      throw new Error("storage refused");
    }
  },
  async load() {
    var raw = read(KEY_DATA);
    if (!raw) return null;
    var box = JSON.parse(raw);
    var plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: unhex(box.iv) }, liveKey, unhex(box.ct));
    return JSON.parse(new TextDecoder().decode(plain));
  },
  lock() {
    liveKey = null;
    location.reload();
  },
  /* Used by Backup, which writes a readable file on purpose. */
  isUnlocked() { return !!liveKey; }
};
window.LL = LL;

/* ---------- the screen ---------- */
var gate = el("gate");
var pins = Array.prototype.slice.call(document.querySelectorAll(".pin-kotak input"));
var mode = read(KEY_LOCK) ? "unlock" : "setup";
var confirming = false;
var firstPin = "";

function say(msg, ok) {
  var b = el("gate-msg");
  if (!msg) { b.hidden = true; return; }
  b.hidden = false;
  b.className = ok ? "okbar" : "amaran";
  b.textContent = msg;
}
function clearPin() {
  pins.forEach(function (p) { p.value = ""; });
  if (pins[0]) pins[0].focus();
}
function readPin() { return pins.map(function (p) { return p.value; }).join(""); }

function paint() {
  var setup = (mode === "setup");
  el("gate-title").textContent = setup
    ? (confirming ? "Type it once more" : "Set a PIN")
    : "Welcome back";
  el("gate-lede").textContent = setup
    ? (confirming ? "Just to be sure you will remember it."
                  : "Your name, and a 6-digit PIN. Your records are locked with it.")
    : "Your 6-digit PIN.";
  el("g-name-row").hidden = !setup || confirming;
  el("gate-go").textContent = setup ? (confirming ? "Create" : "Next") : "Unlock";
  el("gate-warn").hidden = !setup;
  clearPin();
  if (setup && !confirming && el("g-name")) el("g-name").focus();
}

pins.forEach(function (box, i) {
  box.addEventListener("input", function () {
    box.value = box.value.replace(/[^0-9]/g, "").slice(0, 1);
    if (box.value && i < pins.length - 1) pins[i + 1].focus();
  });
  box.addEventListener("keydown", function (e) {
    if (e.key === "Backspace" && !box.value && i > 0) { pins[i - 1].focus(); e.preventDefault(); }
    if (e.key === "Enter") go();
  });
});

var WEAK = ["000000", "111111", "222222", "333333", "444444", "555555", "666666",
            "777777", "888888", "999999", "123456", "654321", "012345", "121212"];

async function go() {
  var pin = readPin();
  if (pin.length !== 6) { say("The PIN has to be 6 digits."); clearPin(); return; }

  if (mode === "setup" && !confirming) {
    var name = (el("g-name").value || "").trim();
    if (!name) { say("Put your name in."); el("g-name").focus(); return; }
    if (WEAK.indexOf(pin) !== -1 || /^(\d)\1{5}$/.test(pin)) {
      say("Pick a less obvious PIN."); clearPin(); return;
    }
    firstPin = pin;
    confirming = true;
    LL.name = name;
    paint();
    say("");
    return;
  }

  if (mode === "setup" && confirming) {
    if (pin !== firstPin) {
      say("Those did not match. Start again.");
      confirming = false; firstPin = "";
      paint();
      return;
    }
    var salt = crypto.getRandomValues(new Uint8Array(16));
    el("gate-go").disabled = true;
    say("Setting up…", true);
    liveKey = await deriveKey(pin, salt, ITER);
    write(KEY_LOCK, JSON.stringify({ v: 1, name: LL.name, salt: hex(salt), iter: ITER }));
    await LL.save({});
    open();
    return;
  }

  /* unlock */
  var lock = JSON.parse(read(KEY_LOCK));
  el("gate-go").disabled = true;
  say("");
  try {
    liveKey = await deriveKey(pin, unhex(lock.salt), lock.iter || ITER);
    await LL.load();            // a wrong PIN fails the GCM tag here
    LL.name = lock.name || "";
    open();
  } catch (e) {
    liveKey = null;
    el("gate-go").disabled = false;
    say("That PIN does not match.");
    clearPin();
  }
}

function open() {
  gate.hidden = true;
  document.body.classList.remove("terkunci");
  if (LL.name && el("appname")) {
    el("appname").textContent = "Welcome " + LL.name.split(/\s+/)[0] + " to Little Ledger";
  }
  window.dispatchEvent(new CustomEvent("ll:unlocked"));
}

el("gate-go").onclick = go;
if (el("g-name")) {
  el("g-name").addEventListener("keydown", function (e) {
    if (e.key === "Enter" && pins[0]) pins[0].focus();
  });
}

if (!crypto) {
  /* Without Web Crypto there is no honest way to lock anything, and
     pretending otherwise would be worse than saying so. */
  gate.hidden = true;
  document.body.classList.remove("terkunci");
  window.dispatchEvent(new CustomEvent("ll:unlocked"));
} else {
  gate.hidden = false;
  document.body.classList.add("terkunci");
  paint();
}
})();
