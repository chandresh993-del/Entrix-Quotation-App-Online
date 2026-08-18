/* ============================================================
   ENTRIX Quotation App — Firebase layer
   Login (Email/Password) + cloud quotations (Firestore)
   Drop next to index.html and load with:
   <script type="module" src="entrix-firebase.js"></script>
   ============================================================ */

import { initializeApp }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, setPersistence, browserLocalPersistence,
  signInWithEmailAndPassword, signOut, onAuthStateChanged,
  sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, addDoc, setDoc, getDoc, getDocs, deleteDoc,
  query, where, orderBy, limit, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* ---------- 1. Project config ---------- */

const firebaseConfig = {
  apiKey: "AIzaSyCFHLbIgQNuVqdeiTk1v6SnDUVu9qEe5fA",
  authDomain: "entrix-quotation-app.firebaseapp.com",
  projectId: "entrix-quotation-app",
  storageBucket: "entrix-quotation-app.firebasestorage.app",
  messagingSenderId: "279992464314",
  appId: "1:279992464314:web:8447e4e115436817f66383"
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Offline cache — the app keeps working on site with weak signal
// and syncs when the connection returns.
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});

const QUOTES = "quotations";
const USERS  = "users";

/* ---------- 2. State ---------- */

let currentUser    = null;
let currentProfile = null;   // { name, role } from users/{uid}
let readyResolve;
const ready = new Promise(res => { readyResolve = res; });

/* ---------- 3. Login screen ---------- */

const NAVY  = "#0A1F44";
const AMBER = "#F2A900";

const style = document.createElement("style");
style.textContent = `
  #ex-gate{position:fixed;inset:0;z-index:99999;display:none;
    align-items:center;justify-content:center;padding:24px;
    background:${NAVY};color:#fff;
    font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;}
  #ex-gate.on{display:flex;}
  #ex-card{width:100%;max-width:360px;}
  #ex-card h1{margin:0;font-size:26px;letter-spacing:.14em;font-weight:700;}
  #ex-card h1 span{color:${AMBER};}
  #ex-card p.sub{margin:6px 0 28px;font-size:13px;opacity:.65;letter-spacing:.04em;}
  #ex-card label{display:block;font-size:11px;text-transform:uppercase;
    letter-spacing:.1em;opacity:.6;margin:0 0 6px;}
  #ex-card input{width:100%;box-sizing:border-box;padding:13px 14px;margin:0 0 18px;
    border:1px solid rgba(255,255,255,.18);border-radius:8px;
    background:rgba(255,255,255,.06);color:#fff;font-size:16px;}
  #ex-card input:focus{outline:2px solid ${AMBER};outline-offset:1px;
    border-color:transparent;}
  #ex-signin{width:100%;padding:14px;border:0;border-radius:8px;cursor:pointer;
    background:${AMBER};color:${NAVY};font-size:15px;font-weight:700;
    letter-spacing:.05em;}
  #ex-signin:disabled{opacity:.55;cursor:default;}
  #ex-forgot{display:block;width:100%;margin-top:14px;background:none;border:0;
    color:rgba(255,255,255,.55);font-size:12.5px;cursor:pointer;
    text-decoration:underline;}
  #ex-msg{min-height:20px;margin:14px 0 0;font-size:13px;line-height:1.4;}
  #ex-msg.err{color:#FF8A80;}
  #ex-msg.ok{color:${AMBER};}
  #ex-pill{position:fixed;right:12px;bottom:12px;z-index:9998;display:none;
    align-items:center;gap:10px;padding:7px 8px 7px 13px;border-radius:999px;
    background:${NAVY};color:#fff;font:500 12px system-ui,sans-serif;
    box-shadow:0 3px 14px rgba(0,0,0,.28);}
  #ex-pill.on{display:flex;}
  #ex-pill b{color:${AMBER};font-weight:600;}
  #ex-out{border:0;border-radius:999px;padding:5px 11px;cursor:pointer;
    background:rgba(255,255,255,.14);color:#fff;font-size:11px;}
  @media print{#ex-pill{display:none !important;}}
`;
document.head.appendChild(style);

const gate = document.createElement("div");
gate.id = "ex-gate";
gate.innerHTML = `
  <div id="ex-card">
    <h1>ENT<span>RIX</span></h1>
    <p class="sub">Quotation App — sign in to continue</p>
    <label for="ex-email">Email</label>
    <input id="ex-email" type="email" autocomplete="username" inputmode="email">
    <label for="ex-pass">Password</label>
    <input id="ex-pass" type="password" autocomplete="current-password">
    <button id="ex-signin" type="button">Sign in</button>
    <button id="ex-forgot" type="button">Forgot password</button>
    <p id="ex-msg"></p>
  </div>`;

const pill = document.createElement("div");
pill.id = "ex-pill";
pill.innerHTML = `<span id="ex-who"></span><button id="ex-out" type="button">Sign out</button>`;

function mount() {
  document.body.appendChild(gate);
  document.body.appendChild(pill);

  const email  = gate.querySelector("#ex-email");
  const pass   = gate.querySelector("#ex-pass");
  const signin = gate.querySelector("#ex-signin");
  const msg    = gate.querySelector("#ex-msg");

  const say = (text, cls) => { msg.textContent = text; msg.className = cls || ""; };

  async function attempt() {
    if (!email.value.trim() || !pass.value) {
      say("Enter your email and password.", "err"); return;
    }
    signin.disabled = true; signin.textContent = "Signing in…"; say("");
    try {
      await setPersistence(auth, browserLocalPersistence);
      await signInWithEmailAndPassword(auth, email.value.trim(), pass.value);
      pass.value = "";
    } catch (e) {
      say(explain(e.code), "err");
    } finally {
      signin.disabled = false; signin.textContent = "Sign in";
    }
  }

  signin.addEventListener("click", attempt);
  pass.addEventListener("keydown", e => { if (e.key === "Enter") attempt(); });
  email.addEventListener("keydown", e => { if (e.key === "Enter") pass.focus(); });

  gate.querySelector("#ex-forgot").addEventListener("click", async () => {
    if (!email.value.trim()) { say("Enter your email first, then tap again.", "err"); return; }
    try {
      await sendPasswordResetEmail(auth, email.value.trim());
      say("Reset link sent. Check your inbox.", "ok");
    } catch (e) { say(explain(e.code), "err"); }
  });

  pill.querySelector("#ex-out").addEventListener("click", () => signOut(auth));
}

function explain(code) {
  switch (code) {
    case "auth/invalid-email":       return "That email address isn't valid.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":  return "Email or password is incorrect.";
    case "auth/too-many-requests":   return "Too many attempts. Wait a minute and try again.";
    case "auth/network-request-failed": return "No connection. Check your data and try again.";
    case "auth/user-disabled":       return "This account has been disabled. Contact the admin.";
    default:                         return "Sign-in failed (" + (code || "unknown") + ").";
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mount);
} else {
  mount();
}

/* ---------- 4. Auth state ---------- */

onAuthStateChanged(auth, async user => {
  currentUser = user;
  currentProfile = null;

  if (user) {
    try {
      const snap = await getDoc(doc(db, USERS, user.uid));
      currentProfile = snap.exists() ? snap.data() : { role: "user" };
    } catch { currentProfile = { role: "user" }; }

    gate.classList.remove("on");
    pill.classList.add("on");
    pill.querySelector("#ex-who").innerHTML =
      `<b>${currentProfile.name || user.email}</b>` +
      (currentProfile.role === "admin" ? " · Admin" : "");
  } else {
    gate.classList.add("on");
    pill.classList.remove("on");
  }

  readyResolve(user);
  document.dispatchEvent(new CustomEvent("entrix-auth", {
    detail: { user, role: currentProfile ? currentProfile.role : null }
  }));
});

/* ---------- 5. Public API ---------- */

function requireUser() {
  if (!currentUser) throw new Error("Not signed in.");
  return currentUser;
}

const EntrixCloud = {
  ready,
  get user()    { return currentUser; },
  get role()    { return currentProfile ? currentProfile.role : null; },
  get isAdmin() { return currentProfile && currentProfile.role === "admin"; },
  signOut()     { return signOut(auth); },

  /* Save a new quotation. Returns the Firestore document id. */
  async saveQuotation(data) {
    const u = requireUser();
    const ref = await addDoc(collection(db, QUOTES), {
      ...data,
      uid: u.uid,
      userEmail: u.email,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    return ref.id;
  },

  /* Overwrite an existing quotation. */
  async updateQuotation(id, data) {
    const u = requireUser();
    await setDoc(doc(db, QUOTES, id), {
      ...data,
      uid: u.uid,
      userEmail: u.email,
      updatedAt: serverTimestamp()
    }, { merge: true });
    return id;
  },

  async deleteQuotation(id) {
    requireUser();
    await deleteDoc(doc(db, QUOTES, id));
  },

  async getQuotation(id) {
    requireUser();
    const snap = await getDoc(doc(db, QUOTES, id));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  },

  /* One-off fetch. { all:true } returns the whole team's (admins only). */
  async listQuotations(opts = {}) {
    const u = requireUser();
    const parts = [collection(db, QUOTES)];
    if (!(opts.all && this.isAdmin)) parts.push(where("uid", "==", u.uid));
    parts.push(orderBy("createdAt", "desc"), limit(opts.limit || 200));
    const snap = await getDocs(query(...parts));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  /* Live list — callback re-fires whenever anything changes.
     Returns an unsubscribe function. */
  watchQuotations(callback, opts = {}) {
    const u = requireUser();
    const parts = [collection(db, QUOTES)];
    if (!(opts.all && this.isAdmin)) parts.push(where("uid", "==", u.uid));
    parts.push(orderBy("createdAt", "desc"), limit(opts.limit || 200));
    return onSnapshot(query(...parts), snap => {
      callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, err => console.error("[EntrixCloud] watch failed:", err));
  }
};

window.EntrixCloud = EntrixCloud;
