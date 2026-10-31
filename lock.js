/* Little Ledger — the lock.
   There is no server here, so there is nobody to check a password against,
   and nobody to email a reset link. What this does instead:

   The ledger is encrypted with a random key (the "data key"). That key is
   never stored on its own. Two copies of it are kept, each locked with
   something you know:

       data key  --locked with your PIN-------->  kept in storage
       data key  --locked with your recovery code->  kept in storage

   Unlocking with either one opens the same ledger. That is what makes a
   forgotten PIN survivable: the recovery code opens the current records,
   not an old backup, and you then set a new PIN.

   The limits, plainly:
     - Six digits is a million guesses. Against someone who copies the
       stored data onto a fast machine this is a lock on a drawer, not a
       safe. It does stop anyone who picks up your phone.
     - Lose BOTH the PIN and the recovery code and the records are gone.
       Nothing can open them. That is the cost of there being no server.

   AES-GCM throughout, keys from PBKDF2-SHA256. */
"use strict";
(function () {
var KEY_LOCK = "ll.lock";
var KEY_DATA = "ll.data";
var PIN_ITER = 310000;    // OWASP's figure for PBKDF2-SHA256
var REC_ITER = 120000;    // the code is long and random, so it needs less

function el(id) { return document.getElementById(id); }
function hex(b) {
  return Array.prototype.map.call(new Uint8Array(b),
    function (x) { return ("0" + x.toString(16)).slice(-2); }).join("");
}
function unhex(s) {
  var a = new Uint8Array(s.length / 2);
  for (var i = 0; i < a.length; i++) a[i] = parseInt(s.substr(i * 2, 2), 16);
  return a;
}
function read(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function write(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
function del(k) { try { localStorage.removeItem(k); } catch (e) { } }

var crypto = window.crypto && window.crypto.subtle ? window.crypto : null;

async function keyFrom(secret, salt, iter) {
  var base = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(String(secret)), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt, iterations: iter, hash: "SHA-256" },
    base, { name: "AES-KW", length: 256 }, false, ["wrapKey", "unwrapKey"]);
}
async function newDataKey() {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}
async function wrap(dataKey, withKey) {
  return hex(await crypto.subtle.wrapKey("raw", dataKey, withKey, "AES-KW"));
}
async function unwrap(wrapped, withKey) {
  return crypto.subtle.unwrapKey("raw", unhex(wrapped), withKey, "AES-KW",
    { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}

/* Avoids 0/O and 1/I/L, which get misread off a piece of paper. */
var ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function makeCode() {
  var out = [], r = crypto.getRandomValues(new Uint8Array(20));
  for (var i = 0; i < 20; i++) {
    out.push(ALPHABET[r[i] % ALPHABET.length]);
    if (i % 5 === 4 && i !== 19) out.push("-");
  }
  return out.join("");
}
function tidyCode(s) {
  return String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

var liveKey = null;

var LL = {
  name: "",
  isUnlocked: function () { return !!liveKey; },
  async save(obj) {
    if (!liveKey) throw new Error("locked");
    var iv = crypto.getRandomValues(new Uint8Array(12));
    var ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, liveKey,
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
  lock: function () { liveKey = null; location.reload(); }
};
window.LL = LL;

/* ---------- screens ---------- */
var gate = el("gate");
var pins = Array.prototype.slice.call(document.querySelectorAll(".pin-kotak input"));
var step = read(KEY_LOCK) ? "unlock" : "name";
var draft = { name: "", pin: "" };
var pendingCode = "";

function say(msg, ok) {
  var b = el("gate-msg");
  if (!msg) { b.hidden = true; return; }
  b.hidden = false;
  b.className = ok ? "okbar" : "amaran";
  b.textContent = msg;
}
function clearPin() { pins.forEach(function (p) { p.value = ""; }); if (pins[0]) pins[0].focus(); }
function readPin() { return pins.map(function (p) { return p.value; }).join(""); }

var TEXT = {
  name:    ["Set a PIN", "Your name, and a 6-digit PIN. Your records are locked with it.", "Next"],
  confirm: ["Type it once more", "Just to be sure you will remember it.", "Create"],
  unlock:  ["Welcome back", "Your 6-digit PIN.", "Unlock"],
  recover: ["Recovery code", "Type the code you saved when you set this up.", "Open"],
  newpin:  ["Choose a new PIN", "Six digits. This replaces the one you forgot.", "Save"],
  code:    ["Write this down", "", ""]
};

function paint() {
  var t = TEXT[step] || TEXT.unlock;
  el("gate-title").textContent = t[0];
  el("gate-lede").textContent = t[1];
  el("gate-go").textContent = t[2];
  el("gate-go").disabled = false;

  el("g-name-row").hidden = (step !== "name");
  el("pin-row").hidden = !(step === "name" || step === "confirm" || step === "unlock" || step === "newpin");
  el("code-row").hidden = (step !== "recover");
  el("code-show").hidden = (step !== "code");
  el("gate-go").hidden = (step === "code");
  el("gate-warn").hidden = (step !== "name");
  el("gate-forgot").hidden = (step !== "unlock");
  el("gate-back").hidden = !(step === "recover");

  say("");
  clearPin();
  if (step === "name" && el("g-name")) el("g-name").focus();
  if (step === "recover" && el("g-code")) el("g-code").focus();
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
function weak(p) { return WEAK.indexOf(p) !== -1 || /^(\d)\1{5}$/.test(p); }

/* Build both locked copies of the data key and store them. */
async function seal(name, pin, dataKey) {
  var pinSalt = crypto.getRandomValues(new Uint8Array(16));
  var recSalt = crypto.getRandomValues(new Uint8Array(16));
  var code = makeCode();
  var pinKey = await keyFrom(pin, pinSalt, PIN_ITER);
  var recKey = await keyFrom(tidyCode(code), recSalt, REC_ITER);
  write(KEY_LOCK, JSON.stringify({
    v: 2, name: name,
    pinSalt: hex(pinSalt), pinIter: PIN_ITER, wrapPin: await wrap(dataKey, pinKey),
    recSalt: hex(recSalt), recIter: REC_ITER, wrapRec: await wrap(dataKey, recKey)
  }));
  return code;
}

async function go() {
  var lock = read(KEY_LOCK) ? JSON.parse(read(KEY_LOCK)) : null;

  if (step === "name") {
    var name = (el("g-name").value || "").trim();
    var pin = readPin();
    if (!name) { say("Put your name in."); el("g-name").focus(); return; }
    if (pin.length !== 6) { say("The PIN has to be 6 digits."); clearPin(); return; }
    if (weak(pin)) { say("Pick a less obvious PIN."); clearPin(); return; }
    draft.name = name; draft.pin = pin;
    step = "confirm"; paint();
    return;
  }

  if (step === "confirm") {
    if (readPin() !== draft.pin) {
      say("Those did not match. Start again.");
      step = "name"; paint();
      return;
    }
    el("gate-go").disabled = true;
    say("Setting up…", true);
    liveKey = await newDataKey();
    pendingCode = await seal(draft.name, draft.pin, liveKey);
    LL.name = draft.name;
    await LL.save({});
    showCode();
    return;
  }

  if (step === "unlock") {
    var pin2 = readPin();
    if (pin2.length !== 6) { say("The PIN has to be 6 digits."); clearPin(); return; }
    el("gate-go").disabled = true;
    try {
      var pk = await keyFrom(pin2, unhex(lock.pinSalt), lock.pinIter || PIN_ITER);
      liveKey = await unwrap(lock.wrapPin, pk);
      LL.name = lock.name || "";
      open();
    } catch (e) {
      liveKey = null;
      el("gate-go").disabled = false;
      say("That PIN does not match.");
      clearPin();
    }
    return;
  }

  if (step === "recover") {
    var code = tidyCode(el("g-code").value);
    if (code.length < 20) { say("That code looks too short."); return; }
    el("gate-go").disabled = true;
    try {
      var rk = await keyFrom(code, unhex(lock.recSalt), lock.recIter || REC_ITER);
      liveKey = await unwrap(lock.wrapRec, rk);
      LL.name = lock.name || "";
      step = "newpin"; paint();
      say("Code accepted. Your records are open — now set a new PIN.", true);
    } catch (e) {
      liveKey = null;
      el("gate-go").disabled = false;
      say("That code does not match.");
    }
    return;
  }

  if (step === "newpin") {
    var np = readPin();
    if (np.length !== 6) { say("The PIN has to be 6 digits."); clearPin(); return; }
    if (weak(np)) { say("Pick a less obvious PIN."); clearPin(); return; }
    el("gate-go").disabled = true;
    pendingCode = await seal(LL.name, np, liveKey);   // a new code too, the old one is spent
    showCode();
    return;
  }
}

function showCode() {
  step = "code";
  paint();
  el("gate-code").textContent = pendingCode;
  el("gate-title").textContent = "Write this down";
  el("gate-lede").textContent =
    "This is the only way back in if you forget your PIN. Keep it somewhere " +
    "that is not this phone.";
}

el("gate-copy").onclick = function () {
  navigator.clipboard.writeText(pendingCode).then(function () {
    say("Copied.", true);
  }).catch(function () {
    say("Could not copy. Write it down instead.");
  });
};
el("gate-done").onclick = function () {
  pendingCode = "";
  open();
};
el("gate-forgot").onclick = function () { step = "recover"; paint(); };
el("gate-back").onclick = function () { step = "unlock"; paint(); };
el("gate-go").onclick = go;
if (el("g-name")) {
  el("g-name").addEventListener("keydown", function (e) {
    if (e.key === "Enter" && pins[0]) pins[0].focus();
  });
}
if (el("g-code")) {
  el("g-code").addEventListener("keydown", function (e) { if (e.key === "Enter") go(); });
}

function open() {
  gate.hidden = true;
  document.body.classList.remove("terkunci");
  if (LL.name && el("appname")) {
    el("appname").textContent = "Welcome " + LL.name.split(/\s+/)[0] + " to Little Ledger";
  }
  window.dispatchEvent(new CustomEvent("ll:unlocked"));
}

/* An older setup locked the ledger with the PIN directly and had no
   recovery code. It is upgraded on the next successful unlock. */
async function upgradeIfV1() {
  var lock = JSON.parse(read(KEY_LOCK));
  if (!lock || lock.v !== 1) return false;
  step = "unlock";
  TEXT.unlock = ["Welcome back", "Your 6-digit PIN.", "Unlock"];
  el("gate-forgot").hidden = true;      // nothing to recover with yet
  var once = async function () {
    var pin = readPin();
    if (pin.length !== 6) { say("The PIN has to be 6 digits."); clearPin(); return; }
    el("gate-go").disabled = true;
    try {
      var old = await crypto.subtle.importKey(
        "raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveKey"]);
      var oldKey = await crypto.subtle.deriveKey(
        { name: "PBKDF2", salt: unhex(lock.salt), iterations: lock.iter || 310000, hash: "SHA-256" },
        old, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
      var raw = read(KEY_DATA);
      var ledger = {};
      if (raw) {
        var box = JSON.parse(raw);
        ledger = JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt(
          { name: "AES-GCM", iv: unhex(box.iv) }, oldKey, unhex(box.ct))));
      }
      liveKey = await newDataKey();
      LL.name = lock.name || "";
      pendingCode = await seal(LL.name, pin, liveKey);
      await LL.save(ledger);
      showCode();
    } catch (e) {
      el("gate-go").disabled = false;
      say("That PIN does not match.");
      clearPin();
    }
  };
  el("gate-go").onclick = once;
  pins.forEach(function (b) {
    b.addEventListener("keydown", function (e) { if (e.key === "Enter") once(); });
  });
  return true;
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
  var existing = read(KEY_LOCK);
  if (existing && JSON.parse(existing).v === 1) {
    paint();
    upgradeIfV1();
  } else {
    paint();
  }
}
})();
