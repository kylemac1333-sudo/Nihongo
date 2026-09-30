"use strict";
/* =====================================================================
   Japanese Sensei - plain JavaScript, no build step, GitHub Pages ready
   ===================================================================== */

/* ---------- CONFIG ---------- */
// AI backend: leave empty to use the built-in local Sensei.
// Later, put the URL of YOUR secure backend here (never an API key!).
// The backend should accept POST {message, history} and return {reply}.
const SENSEI_ENDPOINT = "";
const STORE_KEY = "japaneseSensei.v2";
const ACCOUNT_STORE_KEY = "japaneseSensei.accounts.v1";
const DATA_VERSION = 3;
const LEVEL_XP = [0, 100, 250, 500, 1000, 1750, 2500, 3500];
const HEART_MAX = 5;
const COOLDOWN_MS = 2 * 60 * 1000; // friendly 2 minute break
const ANSWER_XP_CAP = 100; // per lesson per day, stops refresh farming
const PROFILE_DEFS = [
  { id: "me", name: "Me", icon: "👤" },
  { id: "mum", name: "Mum", icon: "👩" },
  { id: "nana", name: "Nana", icon: "👵" }
];

/* ---------- LESSON DATA ---------- */
const LESSONS = [
  { id: "numbers", title: "Numbers", icon: "🔢", words: [
    { jp: "いち", ro: "ichi", en: "one" }, { jp: "に", ro: "ni", en: "two" },
    { jp: "さん", ro: "san", en: "three" }, { jp: "よん", ro: "yon", en: "four" },
    { jp: "ご", ro: "go", en: "five" }] },
  { id: "greetings", title: "Greetings", icon: "👋", words: [
    { jp: "こんにちは", ro: "konnichiwa", en: "hello" }, { jp: "おはよう", ro: "ohayou", en: "good morning" },
    { jp: "こんばんは", ro: "konbanwa", en: "good evening" }],
    order: { en: "Good morning (polite)", tokens: ["おはよう", "ございます"] } },
  { id: "useful", title: "Useful Words", icon: "💬", words: [
    { jp: "はい", ro: "hai", en: "yes" }, { jp: "いいえ", ro: "iie", en: "no" },
    { jp: "ありがとう", ro: "arigatou", en: "thank you" }, { jp: "すみません", ro: "sumimasen", en: "excuse me / sorry" }],
    order: { en: "Thank you very much", tokens: ["ありがとう", "ございます"] } },
  { id: "phrases", title: "Simple Phrases", icon: "🗣️", words: [
    { jp: "わたしは", ro: "watashi wa", en: "I am / I..." }, { jp: "おげんきですか", ro: "ogenki desu ka", en: "how are you?" },
    { jp: "げんきです", ro: "genki desu", en: "I am well" }],
    order: { en: "I am well", tokens: ["わたしは", "げんき", "です"] } },
  { id: "family", title: "Family", icon: "👨‍👩‍👧", words: [
    { jp: "かぞく", ro: "kazoku", en: "family" }, { jp: "おかあさん", ro: "okaasan", en: "mother" },
    { jp: "おとうさん", ro: "otousan", en: "father" }, { jp: "おばあさん", ro: "obaasan", en: "grandmother" }],
    order: { en: "Mother is well", tokens: ["おかあさんは", "げんき", "です"] } },
  { id: "food", title: "Food", icon: "🍙", words: [
    { jp: "みず", ro: "mizu", en: "water" }, { jp: "おちゃ", ro: "ocha", en: "tea" },
    { jp: "ごはん", ro: "gohan", en: "rice / meal" }, { jp: "たべます", ro: "tabemasu", en: "to eat" }],
    order: { en: "Water, please", tokens: ["みずを", "ください"] } },
  { id: "time", title: "Time", icon: "⏰", words: [
    { jp: "いま", ro: "ima", en: "now" }, { jp: "きょう", ro: "kyou", en: "today" },
    { jp: "あした", ro: "ashita", en: "tomorrow" }, { jp: "あさ", ro: "asa", en: "morning" }],
    order: { en: "Today I am well", tokens: ["きょうは", "げんき", "です"] } },
  { id: "places", title: "Places", icon: "🏫", words: [
    { jp: "うち", ro: "uchi", en: "home" }, { jp: "がっこう", ro: "gakkou", en: "school" },
    { jp: "えき", ro: "eki", en: "station" }, { jp: "みせ", ro: "mise", en: "shop" }],
    order: { en: "Where is the school?", tokens: ["がっこうは", "どこ", "ですか"] } }
];
const ALL_WORDS = LESSONS.flatMap(l => l.words.map(w => Object.assign({ lesson: l.id }, w)));

/* ---------- SMALL HELPERS ---------- */
const $ = (s, r) => (r || document).querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));
function shuffle(a) { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; }
function todayStr(d) { d = d || new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function dayDiff(a, b) { const x = a.split("-").map(Number), y = b.split("-").map(Number); return Math.round((Date.UTC(y[0], y[1] - 1, y[2]) - Date.UTC(x[0], x[1] - 1, x[2])) / 864e5); }
function fmtTime(ms) { const s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); }
const JP_RE = /[\u3040-\u30ff\u4e00-\u9fff][\u3040-\u30ff\u4e00-\u9fff！？。、]*/g;

/* ---------- STORAGE / LOCAL ACCOUNTS ---------- */
// GitHub Pages is static. This is a local prototype account layer, not secure server authentication.
// Passwords are never stored as plaintext; Web Crypto PBKDF2 is used when available.
let state = null;
let memoryStore = null;
let accountsStore = null;
let sessionAccountId = null;

function newProfile(def) {
  return { id:def.id,name:def.name,icon:def.icon,xp:0,level:1,streak:0,lastActiveDate:null,hearts:HEART_MAX,heartsRefillAt:0,dailyXP:0,dailyGoal:30,dailyDate:null,dailyBonusGiven:false,completedLessons:[],bestTestScore:0,testsTaken:0,totalQuestions:0,correctAnswers:0,xpLog:{},points:0,inventory:[],purchases:[] };
}
function readLegacyStore(){try{const raw=localStorage.getItem(STORE_KEY);return raw?JSON.parse(raw):memoryStore}catch(e){return memoryStore}}
function writeJson(key,val){memoryStore=val;try{localStorage.setItem(key,JSON.stringify(val))}catch(e){}}
function readJson(key){try{const raw=localStorage.getItem(key);return raw?JSON.parse(raw):null}catch(e){return null}}
function sanitizeProfile(src,def){const p=Object.assign(newProfile(def),src||{});["xp","streak","hearts","heartsRefillAt","dailyXP","dailyGoal","bestTestScore","testsTaken","totalQuestions","correctAnswers","points"].forEach(k=>{p[k]=Number.isFinite(+p[k])?Math.max(0,+p[k]):newProfile(def)[k]});p.hearts=Math.min(p.hearts,HEART_MAX);p.completedLessons=Array.isArray(p.completedLessons)?p.completedLessons.filter(id=>LESSONS.some(l=>l.id===id)):[];p.xpLog=p.xpLog&&typeof p.xpLog==='object'?p.xpLog:{};p.inventory=Array.isArray(p.inventory)?p.inventory:[];p.purchases=Array.isArray(p.purchases)?p.purchases:[];p.id=def.id;p.name=def.name;p.icon=def.icon;p.level=levelFromXp(p.xp);return p}
function defaultAccounts(){return {version:DATA_VERSION,accounts:{kyle:{id:'kyle',username:'kyle',name:'Kyle',icon:'👤',role:'admin',classId:'',passwordSet:false,disabled:false,profileId:'me'},mum:{id:'mum',username:'mum',name:'Mum',icon:'👩',role:'student',classId:'family',passwordSet:false,disabled:false,profileId:'mum'},nana:{id:'nana',username:'nana',name:'Nana',icon:'👵',role:'student',classId:'family',passwordSet:false,disabled:false,profileId:'nana'}},classes:{family:{id:'family',name:'Family',studentIds:['mum','nana']}},tests:{},shop:{items:[{id:'streak-freeze',name:'Streak Freeze',description:'Protect one missed day.',price:100,icon:'🧊',stock:-1,enabled:true},{id:'double-xp',name:'Double XP Ticket',description:'Use on your next lesson.',price:150,icon:'⚡',stock:-1,enabled:true},{id:'heart-refill',name:'Heart Refill',description:'Refill all hearts instantly.',price:75,icon:'❤️',stock:-1,enabled:true}]}}}
function hashPassword(password,salt){if(!(crypto&&crypto.subtle))return Promise.resolve('plain:'+btoa(unescape(encodeURIComponent(salt+'|'+password))));return crypto.subtle.importKey('raw',new TextEncoder().encode(password),{name:'PBKDF2'},false,['deriveBits']).then(k=>crypto.subtle.deriveBits({name:'PBKDF2',salt:new TextEncoder().encode(salt),iterations:150000,hash:'SHA-256'},k,256)).then(b=>Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,'0')).join(''))}
async function makePasswordRecord(password){const salt=crypto&&crypto.getRandomValues?Array.from(crypto.getRandomValues(new Uint8Array(16))).map(x=>x.toString(16).padStart(2,'0')).join(''):Math.random().toString(36).slice(2);return {salt,hash:await hashPassword(password,salt),iterations:150000,algo:'PBKDF2-SHA256'}}
async function verifyPassword(acc,password){if(!acc||!acc.passwordSet)return false;const h=await hashPassword(password,acc.salt);return h===acc.hash}
function ensureShop(){if(!accountsStore.shop||!Array.isArray(accountsStore.shop.items)) accountsStore.shop={items:defaultAccounts().shop.items.slice()}; accountsStore.shop.items=accountsStore.shop.items.map(x=>Object.assign({stock:-1,enabled:true},x));}
function migrateOldProfiles(){let a=readJson(ACCOUNT_STORE_KEY);if(a&&a.accounts){accountsStore=a;ensureShop();return}a=defaultAccounts();const old=readLegacyStore();const defs={me:{id:'me',name:'Kyle',icon:'👤'},mum:{id:'mum',name:'Mum',icon:'👩'},nana:{id:'nana',name:'Nana',icon:'👵'}};state={version:DATA_VERSION,current:'me',profiles:{}};Object.keys(defs).forEach(id=>state.profiles[id]=sanitizeProfile(old&&old.profiles&&old.profiles[id],defs[id]));writeJson(STORE_KEY,state);accountsStore=a;ensureShop();writeJson(ACCOUNT_STORE_KEY,a);sessionAccountId=readJson('japaneseSensei.session')||null}
function loadProfile(){migrateOldProfiles();ensureShop();const old=readJson(STORE_KEY);state=old&&old.profiles?old:{version:DATA_VERSION,current:'me',profiles:{me:newProfile({id:'me',name:'Kyle',icon:'👤'}),mum:newProfile({id:'mum',name:'Mum',icon:'👩'}),nana:newProfile({id:'nana',name:'Nana',icon:'👵'})}};state.version=DATA_VERSION;sessionAccountId=readJson('japaneseSensei.session')||null}
function saveProfile(){writeJson(STORE_KEY,state);writeJson(ACCOUNT_STORE_KEY,accountsStore);if(sessionAccountId)try{localStorage.setItem('japaneseSensei.session',sessionAccountId)}catch(e){}}
function getCurrentAccount(){return accountsStore&&accountsStore.accounts&&accountsStore.accounts[sessionAccountId]||null}
function getCurrentProfile(){const a=getCurrentAccount();const id=a?a.profileId:state.current;const p=state.profiles[id]||state.profiles.me;rolloverDaily(p);state.current=id;return p}
function accountList(){return Object.values(accountsStore.accounts).filter(a=>!a.disabled)}
function isAdmin(){const a=getCurrentAccount();return !!(a&&a.role==='admin')}
function requireAdmin(){if(!isAdmin()){toast('Admin access required.');navigate('home');return false}return true}
function syncAccountFromProfile(p){const a=accountsStore.accounts[p.id==='me'?'kyle':p.id];if(a)a.name=p.name}
function loginAccount(id){const a=accountsStore.accounts[id];if(!a||a.disabled){toast('That account is unavailable.');return}if(!a.passwordSet){view='login';render();return}view='login';render()}
function saveSession(id){sessionAccountId=id;state.current=accountsStore.accounts[id].profileId;try{localStorage.setItem('japaneseSensei.session',id)}catch(e){}navigate('home')}
function logout(){sessionAccountId=null;try{localStorage.removeItem('japaneseSensei.session')}catch(e){}session=null;navigate('accountPicker')}

/* ---------- LEVELS, STREAK, DAILY GOAL, HEARTS ---------- */
function levelFromXp(xp) { let l = 1; while (l < LEVEL_XP.length && xp >= LEVEL_XP[l]) l++; if (l === LEVEL_XP.length && xp >= LEVEL_XP[l - 1]) l += Math.floor((xp - LEVEL_XP[l - 1]) / 1500); return l; }
function levelStart(l) { return l <= LEVEL_XP.length ? LEVEL_XP[l - 1] : LEVEL_XP[LEVEL_XP.length - 1] + (l - LEVEL_XP.length) * 1500; }
function levelInfo(xp) { const level = levelFromXp(xp), a = levelStart(level), b = levelStart(level + 1); return { level, a, b, pct: Math.min(100, Math.round((xp - a) / (b - a) * 100)) }; }
function rolloverDaily(p) {
  const t = todayStr();
  if (p.dailyDate !== t) { p.dailyDate = t; p.dailyXP = 0; p.dailyBonusGiven = false; p.xpLog = {}; p.hearts = HEART_MAX; p.heartsRefillAt = 0; memoryStore = state; try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { } }
}
function checkHearts(p) { if (p.hearts <= 0 && p.heartsRefillAt && Date.now() >= p.heartsRefillAt) { p.hearts = 3; p.heartsRefillAt = 0; saveProfile(); } }
function touchStreak(p) {
  const t = todayStr(); if (p.lastActiveDate === t) return;
  if (!p.lastActiveDate) p.streak = 1;
  else { const d = dayDiff(p.lastActiveDate, t); if (d === 1 || d === 2) p.streak += 1; else if (d > 2 && p.inventory.includes('streak-freeze')) { p.inventory.splice(p.inventory.indexOf('streak-freeze'),1); toast('🧊 Streak Freeze used!'); } else if (d > 2) p.streak = 1; else p.streak = Math.max(1, p.streak); } // 1 missed day is forgiven
  p.lastActiveDate = t;
}
function shownStreak(p) { return p.lastActiveDate && dayDiff(p.lastActiveDate, todayStr()) > 2 ? 0 : p.streak; }

/* ---------- XP ---------- */
function addXP(n) {
  const p = getCurrentProfile(), before = levelFromXp(p.xp); let total = n;
  p.xp += n; p.points += n; p.dailyXP += n; touchStreak(p);
  if (p.dailyXP >= p.dailyGoal && !p.dailyBonusGiven) { p.dailyBonusGiven = true; p.xp += 20; p.dailyXP += 20; total += 20; toast("🎉 Daily goal complete! +20 XP"); }
  p.level = levelFromXp(p.xp); saveProfile(); showXp(total);
  if (p.level > before) showLevelUp(p.level);
  return total;
}
function awardAnswerXp(p) { // returns XP for a correct answer, capped per lesson per day
  const k = todayStr() + ":" + (session.mode === "lesson" ? session.lesson.id : session.mode);
  const got = p.xpLog[k] || 0; if (got >= ANSWER_XP_CAP) return 0; p.xpLog[k] = got + 5; return 5;
}
function showXp(n) { const d = document.createElement("div"); d.className = "xp-pop"; d.textContent = "+" + n + " XP"; document.body.appendChild(d); setTimeout(() => d.remove(), 1300); }
function showLevelUp(l) {
  const d = document.createElement("div"); d.className = "levelup"; d.setAttribute("role", "dialog"); d.setAttribute("aria-label", "Level up");
  d.innerHTML = '<div><div aria-hidden="true">🎌</div><h2>Level up!</h2><div class="n">Level ' + l + '</div><button class="btn primary block" type="button">Nice!</button></div>';
  d.addEventListener("click", () => d.remove()); document.body.appendChild(d); const b = $("button", d); if (b) b.focus(); setTimeout(() => d.remove(), 5000);
}
function toast(msg) { const box = $("#toasts"); if (!box) return; const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; box.appendChild(t); setTimeout(() => t.remove(), 2800); }
function confetti() { const c = document.createElement("div"); c.className = "confetti"; c.setAttribute("aria-hidden", "true"); c.innerHTML = Array.from({ length: 16 }, (_, i) => '<i style="left:' + Math.round(Math.random() * 96) + '%;animation-delay:' + (i * 0.08).toFixed(2) + 's">' + ["🌸", "⭐", "🎊", "🔴"][i % 4] + "</i>").join(""); document.body.appendChild(c); setTimeout(() => c.remove(), 3500); }

/* ---------- TEXT TO SPEECH ---------- */
let jaVoice = null, warnedVoice = false;
function loadVoices() { try { const v = speechSynthesis.getVoices(); jaVoice = v.find(x => /^ja[-_]?jp$/i.test(x.lang)) || v.find(x => x.lang && x.lang.toLowerCase().indexOf("ja") === 0) || null; } catch (e) { jaVoice = null; } }
function speakJapanese(text) {
  const clean = String(text || "").replace(/[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/gu, "").replace(/[（(][^）)]*[）)]/g, "").trim();
  if (!clean) return false;
  if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") { toast("Audio isn't available in this browser."); return false; }
  try {
    speechSynthesis.cancel(); loadVoices();
    const u = new SpeechSynthesisUtterance(clean); u.lang = "ja-JP"; u.rate = 0.85; if (jaVoice) u.voice = jaVoice;
    else if (!warnedVoice) { warnedVoice = true; toast("No Japanese voice found on this device - it may sound odd."); }
    speechSynthesis.speak(u); return true;
  } catch (e) { return false; }
}

/* ---------- SPEECH RECOGNITION ---------- */
function speechSupported() { return !!(window.SpeechRecognition || window.webkitSpeechRecognition); }
function startSpeechRecognition(cb) { // cb: {onResult(alts), onError(code), onEnd()} - returns false if unsupported
  const C = window.SpeechRecognition || window.webkitSpeechRecognition; if (!C) return false;
  try {
    const r = new C(); r.lang = "ja-JP"; r.interimResults = false; r.maxAlternatives = 3;
    r.onresult = e => { const alts = []; const res = e.results; for (let i = 0; i < res.length; i++) for (let k = 0; k < res[i].length; k++) alts.push(res[i][k].transcript); cb.onResult(alts); };
    r.onerror = e => { cb.onError && cb.onError(e.error || "error"); };
    r.onend = () => { cb.onEnd && cb.onEnd(); };
    r.start(); return true;
  } catch (e) { return false; }
}
function normJp(s) { return String(s).normalize("NFKC").toLowerCase().replace(/[\u30a1-\u30f6]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60)).replace(/[\s'’\-_.,!?、。！？「」]/g, ""); }
function normRo(s) { return normJp(s).replace(/ou/g, "o").replace(/oo/g, "o").replace(/uu/g, "u"); }
function lev(a, b) { const m = []; for (let i = 0; i <= a.length; i++) { m[i] = [i]; } for (let j = 1; j <= b.length; j++) m[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return m[a.length][b.length]; }
function matchSpeech(alts, jp, ro) { // forgiving: close enough counts
  return alts.some(h => { const a = normJp(h), b = normJp(jp), r = normRo(h), rr = normRo(ro);
    return a === b || a.indexOf(b) >= 0 || (a.length > 1 && b.indexOf(a) >= 0 && a.length >= b.length - 1) || lev(a, b) <= Math.floor(b.length / 3) || r === rr || lev(r, rr) <= Math.floor(rr.length / 4); });
}

/* ---------- QUESTION BUILDERS ---------- */
function distractors(w, key, n) {
  const seen = new Set([w[key]]), out = [];
  const pool = shuffle(ALL_WORDS.filter(x => x.lesson === w.lesson)).concat(shuffle(ALL_WORDS));
  for (const x of pool) { if (!seen.has(x[key])) { seen.add(x[key]); out.push(x[key]); if (out.length >= n) break; } }
  return out;
}
const qJp2En = w => ({ t: "mc", kind: "Japanese → English", prompt: "What does this mean?", big: w.jp, bigJp: true, sub: w.ro, say: w.jp, choices: shuffle([w.en].concat(distractors(w, "en", 3))), answer: w.en });
const qEn2Jp = w => ({ t: "mc", kind: "English → Japanese", prompt: "Choose the Japanese answer.", big: w.en, choiceJp: true, choices: shuffle([w.jp].concat(distractors(w, "jp", 3))), answer: w.jp });
const qListen = w => ({ t: "mc", kind: "Listening", prompt: "Tap Listen, then choose what you heard.", listen: w.jp, choices: shuffle([w.en].concat(distractors(w, "en", 3))), answer: w.en });
const qType = w => ({ t: "type", kind: "Typing", prompt: "Type the Japanese word for:", big: w.en, accept: [w.jp, w.ro], hint: "Romaji is fine, no need to type Japanese characters." });
const qSpeak = w => ({ t: "speak", kind: "Speaking", prompt: "Say this in Japanese:", big: w.jp, bigJp: true, sub: w.ro + " - " + w.en, say: w.jp, jp: w.jp, ro: w.ro });
const qOrder = l => ({ t: "order", kind: "Word order", prompt: "Put the words in order: “" + l.order.en + "”", tokens: shuffle(l.order.tokens), answer: l.order.tokens.slice(), say: l.order.tokens.join("") });
function buildLessonQuestions(l) {
  const ws = l.words, pick = () => ws[Math.floor(Math.random() * ws.length)], qs = [];
  ws.forEach((w, i) => qs.push(i % 2 ? qEn2Jp(w) : qJp2En(w)));
  qs.push(qListen(pick()), qType(ws[0]), qSpeak(pick()));
  if (ws.length > 1) qs.push(qType(ws[ws.length - 1]));
  if (l.order) qs.push(qOrder(l));
  const s = shuffle(qs), i = s.findIndex(q => q.t === "mc");
  if (s[0].t !== "mc" && i > 0) { const t = s[0]; s[0] = s[i]; s[i] = t; }
  return s;
}
function buildMixedQuestions(mode, requestedCount) {
  const p = getCurrentProfile();
  let ws = LESSONS.filter(l => p.completedLessons.includes(l.id)).flatMap(l => l.words.map(w => Object.assign({ lesson: l.id }, w)));
  if (ws.length < 4) ws = ALL_WORDS.filter(w => w.lesson === "numbers" || w.lesson === "greetings");
  ws = shuffle(ws);
  const gens = mode === "test" ? [qJp2En, qListen, qEn2Jp, qType] : [qJp2En, qEn2Jp, qListen, qType, qSpeak];
  const n = requestedCount ? Math.max(1, Math.min(50, requestedCount)) : (mode === "test" ? 10 : 8);
  return Array.from({ length: n }, (_, i) => gens[i % gens.length](ws[i % ws.length]));
}

/* ---------- STATE FOR SCREENS ---------- */
let view = "home", session = null, timer = null, chatLog = [], chatBusy = false, autoVoice = true;
const IMMERSIVE = ["lesson", "done", "break"];
function navigate(v) {
  if (v.startsWith("adminStudentEdit:")) { view="adminStudentEdit"; viewAccountId=v.split(":")[1]; } else view=v;
  if (timer) { clearInterval(timer); timer = null; }
  if (!v.startsWith("adminStudentEdit:")) view = v; render();
  const main = $("#view"); if (main) main.focus({ preventScroll: true }); window.scrollTo(0, 0);
}
function setView(html) { $("#view").innerHTML = html; }
function render() {
  document.body.classList.toggle("immersive", IMMERSIVE.includes(view));
  $("#app").classList.toggle("immersive", IMMERSIVE.includes(view));
  const fns = { firstRun:renderFirstRun, accountPicker:renderAccountPicker, login:renderLogin, createAccount:renderCreateAccount, home: renderHome, learn: renderLessons, lesson: renderLesson, talk: renderTalk, family: renderLeaderboard, profile: renderProfile, practice: renderPractice, switch: renderSwitch, admin:renderAdmin, adminStudents:renderAdminStudents, adminClasses:renderAdminClasses, adminTests:renderAdminTests, adminStudentEdit:()=>renderStudentEdit(viewAccountId), adminCreateStudent:renderAdminCreateStudent, adminShop:renderAdminShop, shop:renderShop, shopEditor:()=>renderShopEditor(viewShopItemId), break: renderBreak, done: renderDone };
  try { (fns[view] || renderHome)(); } catch (e) { console.error(e); setView('<div class="card"><h2>Something went wrong</h2><p>Please go back Home. If it keeps happening, use Profile → Reset.</p><button class="btn primary block" data-act="nav" data-v="home">Home</button></div>'); }
  const active = view === "lesson" ? "learn" : view;
  document.querySelectorAll("#nav button").forEach(b => { if (b.dataset.v === active) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
  const adminNav = $("#navAdmin"); if (adminNav) adminNav.hidden = !isAdmin();
  const nav = $("#nav"); if (nav) nav.style.display = ["firstRun","accountPicker","login","createAccount"].includes(view) ? "none" : "";
}
const sayBtn = t => '<button class="icon-btn say" type="button" data-act="say" data-say="' + esc(t) + '" aria-label="Listen to ' + esc(t) + '">🔊</button>';
const heartsStr = n => "❤️".repeat(n) + "🤍".repeat(Math.max(0, HEART_MAX - n));
function isUnlocked(i, p) { return i === 0 || p.completedLessons.includes(LESSONS[i - 1].id); }
function nextLesson(p) { for (let i = 0; i < LESSONS.length; i++) if (!p.completedLessons.includes(LESSONS[i].id) && isUnlocked(i, p)) return LESSONS[i]; return null; }

/* ---------- ACCOUNT / ADMIN SCREENS ---------- */
function renderAccountPicker(){const cards=accountList().map(a=>'<button class="account-card" data-act="accountLogin" data-id="'+a.id+'"><span class="face">'+a.icon+'</span><b>'+esc(a.name)+'</b><small>'+(a.role==='admin'?'Admin':'Student')+(a.passwordSet?'':' · Set password on first login')+'</small></button>').join('');setView('<div class="welcome"><h1>Japanese Sensei</h1><p>Who is learning today?</p></div><div class="account-grid">'+cards+'</div><p class="note">Student accounts are created and managed by Kyle from Admin.</p>')}
function renderFirstRun(){setView('<div class="welcome"><h1>Welcome to Japanese Sensei</h1><p>Set the local admin password for Kyle. This password is not hardcoded into the app.</p></div><div class="card login-wrap"><div class="field"><label for="setupPw">Kyle admin password</label><input id="setupPw" class="input" type="password" autocomplete="new-password"></div><button class="btn primary block" data-act="finishSetup">Create Kyle Admin</button></div>')}
function renderLogin(){const id=viewAccountId||'kyle',a=accountsStore.accounts[id];if(!a){navigate('accountPicker');return}setView('<div class="login-wrap"><button class="btn" data-act="nav" data-v="accountPicker">← Accounts</button><div class="login-avatar"><span class="face">'+a.icon+'</span><b>'+esc(a.name)+'</b></div>'+(a.passwordSet?'<div class="field"><label for="loginPw">Password</label><input id="loginPw" class="input" type="password" autocomplete="current-password"></div><button class="btn primary block" data-act="doLogin" data-id="'+a.id+'">Log in</button>':'<p class="note">First login: choose a password for this account.</p><div class="field"><label for="newPw">New password</label><input id="newPw" class="input" type="password" autocomplete="new-password"></div><button class="btn primary block" data-act="setFirstPassword" data-id="'+a.id+'">Set password & continue</button>')+'</div>')}
let viewAccountId=null, viewShopItemId=null;
function renderCreateAccount(){setView('<div class="login-wrap"><h1>Create account</h1><div class="field"><label>Name</label><input id="newName" class="input" maxlength="30"></div><div class="field"><label>Username</label><input id="newUser" class="input" maxlength="20" autocomplete="off"></div><div class="field"><label>Password</label><input id="newAccountPw" class="input" type="password" autocomplete="new-password"></div><button class="btn primary block" data-act="saveNewAccount">Create account</button><button class="btn block" data-act="nav" data-v="accountPicker">Cancel</button></div>')}
function renderAdmin(){if(!requireAdmin())return;const shopCount=accountsStore.shop.items.filter(x=>x.enabled).length;setView('<div class="eyebrow">CONTROL CENTRE</div><h1>Admin</h1><p class="muted">Manage your Japanese Sensei classroom.</p><div class="admin-stats"><div class="stat-card"><b>'+Object.values(accountsStore.accounts).filter(a=>a.role==='student').length+'</b><small>Students</small></div><div class="stat-card"><b>'+Object.keys(accountsStore.classes).length+'</b><small>Classes</small></div><div class="stat-card"><b>'+Object.keys(accountsStore.tests).length+'</b><small>Tests</small></div></div><div class="admin-tiles"><button class="btn" data-act="adminStudents">👥 Students</button><button class="btn" data-act="adminClasses">🏫 Classes</button><button class="btn" data-act="adminTests">📝 Tests</button><button class="btn" data-act="adminShop">🛍️ Shop <small>'+shopCount+' active rewards</small></button></div><div class="card"><b>Admin account</b><p class="muted">Kyle is the only admin by default. Student accounts are created here.</p></div><button class="btn block" data-act="logout">Log out</button>')}
function renderAdminStudents(){if(!requireAdmin())return;const rows=Object.values(accountsStore.accounts).filter(a=>a.role==='student').map(a=>{const p=state.profiles[a.profileId];return '<div class="student-row"><div><b>'+a.icon+' '+esc(a.name)+'</b><small>@'+esc(a.username)+' · ⭐'+p.xp+' · '+p.points+' points · Level '+levelFromXp(p.xp)+'</small></div><button class="chip-btn" data-act="editStudent" data-id="'+a.id+'">Edit</button></div>'}).join('');setView('<button class="btn" data-act="nav" data-v="admin">← Admin</button><h1>Students</h1>'+rows+'<button class="btn primary block" data-act="adminCreateStudent">➕ Create student</button>')}
function renderAdminCreateStudent(){if(!requireAdmin())return;const classes=Object.values(accountsStore.classes).map(c=>'<option value="'+c.id+'">'+esc(c.name)+'</option>').join('');setView('<button class="btn" data-act="adminStudents">← Students</button><h1>Create student</h1><p class="muted">This creates a student account. It does not log you out of Kyle.</p><div class="card"><div class="field"><label>Name</label><input id="adminNewName" class="input" maxlength="30"></div><div class="field"><label>Username</label><input id="adminNewUser" class="input" maxlength="20" autocomplete="off"></div><div class="field"><label>Initial password</label><input id="adminNewPw" class="input" type="password" autocomplete="new-password"></div><div class="field"><label>Class</label><select id="adminNewClass" class="input"><option value="">No class</option>'+classes+'</select></div><button class="btn primary block" data-act="adminSaveStudent">Create student</button></div>')}
function renderAdminClasses(){if(!requireAdmin())return;const rows=Object.values(accountsStore.classes).map(c=>'<div class="class-row"><div><b>🏫 '+esc(c.name)+'</b><small>'+c.studentIds.length+' students</small></div><button class="chip-btn" data-act="manageClass" data-id="'+c.id+'">Members</button><button class="chip-btn" data-act="renameClass" data-id="'+c.id+'">Rename</button></div>').join('');setView('<button class="btn" data-act="nav" data-v="admin">← Admin</button><h1>Classes</h1>'+rows+'<button class="btn primary block" data-act="createClass">➕ Create class</button>')}
function renderAdminTests(){if(!requireAdmin())return;const existing=Object.values(accountsStore.tests).map(t=>'<div class="card"><b>'+esc(t.title)+'</b><small class="muted">'+esc(t.difficulty)+' · '+t.questionCount+' questions'+(t.dueDate?' · due '+esc(t.dueDate):'')+'</small></div>').join('');setView('<button class="btn" data-act="nav" data-v="admin">← Admin</button><h1>Tests</h1>'+existing+'<div class="card"><h2>Create test</h2><div class="field"><label>Test name</label><input id="testTitle" class="input"></div><div class="field"><label>Description</label><input id="testDesc" class="input"></div><div class="field"><label>Difficulty</label><select id="testDiff" class="input"><option>Beginner</option><option>Intermediate</option><option>Hard</option></select></div><div class="field"><label>Question count</label><input id="testCount" class="input" type="number" min="1" max="50" value="10"></div><div class="field"><label>Due date</label><input id="testDue" class="input" type="date"></div><div class="field"><label>For</label><select id="testTarget" class="input"><option value="all">All students</option>'+Object.values(accountsStore.classes).map(c=>'<option value="class:'+c.id+'">Class: '+esc(c.name)+'</option>').join('')+'</select></div><button class="btn primary block" data-act="saveTest">Save test</button></div>')}
function renderAdminShop(){if(!requireAdmin())return;const rows=accountsStore.shop.items.map(x=>'<div class="shop-admin-row"><div><b>'+x.icon+' '+esc(x.name)+'</b><small>'+x.price+' points · '+(x.enabled?'Enabled':'Disabled')+(x.stock<0?' · unlimited':' · stock '+x.stock)+'</small><span class="muted">'+esc(x.description)+'</span></div><div class="shop-admin-actions"><button class="chip-btn" data-act="editShopItem" data-id="'+x.id+'">Edit</button><button class="chip-btn danger-text" data-act="deleteShopItem" data-id="'+x.id+'">Delete</button></div></div>').join('');setView('<button class="btn" data-act="nav" data-v="admin">← Admin</button><h1>🛍️ Shop Admin</h1><p class="muted">Create real rewards students can buy with points.</p>'+rows+'<button class="btn primary block" data-act="newShopItem">➕ Add shop item</button>')}
function renderShopEditor(id){if(!requireAdmin())return;const x=id?accountsStore.shop.items.find(i=>i.id===id):null;setView('<button class="btn" data-act="adminShop">← Shop</button><h1>'+(x?'Edit shop item':'New shop item')+'</h1><div class="card"><div class="field"><label>Item name</label><input id="shopName" class="input" maxlength="40" value="'+esc(x?x.name:'')+'"></div><div class="field"><label>Description</label><input id="shopDesc" class="input" maxlength="120" value="'+esc(x?x.description:'')+'"></div><div class="field"><label>Icon</label><input id="shopIcon" class="input" maxlength="4" value="'+esc(x?x.icon:'🎁')+'"></div><div class="field"><label>Price (points)</label><input id="shopPrice" class="input" type="number" min="0" value="'+(x?x.price:100)+'"></div><div class="field"><label>Stock (-1 = unlimited)</label><input id="shopStock" class="input" type="number" min="-1" value="'+(x?x.stock:-1)+'"></div><button class="btn primary block" data-act="saveShopItem" data-id="'+(x?x.id:'')+'">Save item</button></div>')}
function adminPassword(a){return '<div class="field"><label>New password</label><input id="resetPw" class="input" type="password"></div><button class="btn" data-act="resetPassword" data-id="'+a.id+'">Set new password</button>'}
function renderStudentEdit(id){if(!requireAdmin())return;const a=accountsStore.accounts[id];if(!a)return;const p=state.profiles[a.profileId];setView('<button class="btn" data-act="adminStudents">← Students</button><h1>Edit '+esc(a.name)+'</h1><div class="card"><p>⭐ '+p.xp+' XP · 🔥 '+shownStreak(p)+' streak · 📚 '+p.completedLessons.length+' lessons</p>'+adminPassword(a)+'<button class="btn block danger" data-act="resetStudent" data-id="'+id+'">Reset progress</button><button class="btn block" data-act="disableStudent" data-id="'+id+'">'+(a.disabled?'Enable':'Disable')+' account</button></div>')}

function assignedTestsForCurrent(){const a=getCurrentAccount();if(!a)return [];const today=todayStr();return Object.values(accountsStore.tests).filter(t=>{if(t.startDate&&today<t.startDate)return false;if(t.dueDate&&today>t.dueDate)return false;if(t.targets?.all)return true;if(t.targets?.students?.includes(a.id))return true;return !!(t.targets?.classes||[]).includes(a.classId)});}

/* ---------- HOME ---------- */
function renderHome() {
  const p = getCurrentProfile(), lv = levelInfo(p.xp), pct = Math.min(100, Math.round(p.dailyXP / p.dailyGoal * 100)), done = p.dailyXP >= p.dailyGoal;
  setView(
    '<header class="top"><div class="brand">🇯🇵 Japanese Sensei</div><button class="chip-btn" data-act="nav" data-v="switch" aria-label="Switch profile. Current profile ' + esc(p.name) + '">' + p.icon + " " + esc(p.name) + "</button></header>" +
    '<section class="hero"><p class="greet jp">こんにちは！</p><p class="sub">Ready for some Japanese, ' + esc(p.name) + "?</p></section>" +
    '<div class="stats"><div class="stat"><b>⭐ ' + p.xp + '</b><span>XP</span></div><div class="stat"><b>🔥 ' + shownStreak(p) + '</b><span>day streak</span></div>' +
    '<div class="stat"><b><span aria-hidden="true">' + heartsStr(p.hearts) + '</span></b><span>' + p.hearts + " of " + HEART_MAX + ' hearts</span></div>' +
    '<div class="stat"><b>🎯 ' + Math.min(p.dailyXP, p.dailyGoal) + " / " + p.dailyGoal + '</b><span>XP today</span></div><div class="stat"><b>💰 ' + p.points + '</b><span>points</span></div></div>' +
    '<div class="card"><div class="row between"><b>Level ' + lv.level + '</b><span class="muted">' + p.xp + " / " + lv.b + ' XP</span></div><div class="bar" role="progressbar" aria-label="Progress to next level" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + lv.pct + '"><i style="width:' + lv.pct + '%"></i></div>' +
    '<div class="bar gold" style="margin-top:10px" role="progressbar" aria-label="Daily goal" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '"><i style="width:' + pct + '%"></i></div>' +
    '<p class="muted" style="margin-top:6px">' + (done ? "🎉 Daily goal complete!" : "🎯 " + p.dailyGoal + " XP today") + "</p></div>" +
    (assignedTestsForCurrent().length ? '<div class="card"><h2>📝 Assigned tests</h2>' + assignedTestsForCurrent().map(t=>'<div class="test-card"><div><b>'+esc(t.title)+'</b><small>'+esc(t.difficulty)+' · '+t.questionCount+' questions'+(t.dueDate?' · due '+esc(t.dueDate):'')+'</small></div><button class="btn primary" data-act="startAssignedTest" data-id="'+t.id+'">Start</button></div>').join('')+'</div>' : '') + '<button class="btn primary block" data-act="continue">Continue Learning →</button>' +
    '<div class="menu"><button class="btn wide" data-act="nav" data-v="talk"><span aria-hidden="true">🎤</span>Talk to Sensei</button>' +
    '<button class="btn" data-act="nav" data-v="learn"><span aria-hidden="true">📚</span>Learn</button><button class="btn" data-act="nav" data-v="practice"><span aria-hidden="true">🧠</span>Practice</button>' +
    '<button class="btn" data-act="nav" data-v="family"><span aria-hidden="true">🏆</span>Family</button><button class="btn" data-act="nav" data-v="shop"><span aria-hidden="true">🛍️</span>Shop</button><button class="btn" data-act="nav" data-v="profile"><span aria-hidden="true">👤</span>Profile</button></div>');
}

/* ---------- LEARNING PATH ---------- */
function renderLessons() {
  const p = getCurrentProfile(), cur = nextLesson(p);
  const nodes = LESSONS.map((l, i) => {
    const done = p.completedLessons.includes(l.id), open = isUnlocked(i, p), isCur = cur && cur.id === l.id;
    const status = done ? "Completed ✓" : open ? "Ready to start" : "Locked - finish lesson " + i + " first";
    return '<button class="node ' + (done ? "done" : open ? "" : "locked") + (isCur ? " current" : "") + '" data-act="startLesson" data-id="' + l.id + '" ' + (open ? "" : "disabled") + ' aria-label="Lesson ' + (i + 1) + ": " + esc(l.title) + ". " + status + '">' +
      '<span class="ic" aria-hidden="true">' + (done ? "✅" : open ? "🔓" : "🔒") + '</span><span><small>Lesson ' + (i + 1) + "</small><b>" + l.icon + " " + esc(l.title) + '</b><small>' + status + "</small></span></button>";
  });
  setView("<h1>Japanese Basics</h1>" + nodes.join('<div class="arrow" aria-hidden="true">↓</div>'));
}
function renderPractice() {
  setView('<h1>Practice</h1><div class="card"><h2>🧠 Quick practice</h2><p class="muted">8 mixed questions from what you have learned. No hearts lost.</p><button class="btn primary block" data-act="startPractice">Start practice</button></div>' +
    '<div class="card"><h2>📝 Test Day</h2><p class="muted">10 questions: vocabulary, listening, translation and typing.</p><button class="btn primary block" data-act="startTest">Start Japanese Test</button></div>');
}

/* ---------- SESSIONS: START / QUESTIONS / ANSWER / COMPLETE ---------- */
function startSession(mode, lesson, testSpec) {
  const qs = mode === "lesson" ? buildLessonQuestions(lesson) : buildMixedQuestions(mode, testSpec && testSpec.questionCount);
  session = { mode, lesson: lesson || null, qs, i: 0, correct: 0, wrong: 0, xp: 0, fb: null, pick: null, sel: [], typed: "", speak: null, intro: mode === "lesson", noHearts: mode !== "lesson" };
  const p = getCurrentProfile(); checkHearts(p);
  navigate(session.noHearts || p.hearts > 0 ? "lesson" : "break");
}
function startLesson(id) {
  const p = getCurrentProfile(), i = LESSONS.findIndex(l => l.id === id);
  if (i < 0 || !isUnlocked(i, p)) { toast("Finish the previous lesson to unlock this one."); return; }
  startSession("lesson", LESSONS[i]);
}
function renderIntro() {
  const l = session.lesson;
  setView('<div class="lesson-top"><button class="icon-btn" data-act="quit" aria-label="Leave lesson">✕</button><h2>' + l.icon + " " + esc(l.title) + '</h2></div><p class="muted">Take a look and tap 🔊 to listen. Then we will practise.</p><div class="wordlist">' +
    l.words.map(w => '<div class="wordrow"><div class="w"><b class="jp">' + esc(w.jp) + '</b><br><span class="muted">' + esc(w.ro) + " - " + esc(w.en) + "</span></div>" + sayBtn(w.jp) + "</div>").join("") +
    '</div><button class="btn primary block" data-act="begin">Start lesson</button>');
}
function renderLesson() {
  if (!session) { navigate("learn"); return; }
  const p = getCurrentProfile();
  if (session.intro) { renderIntro(); return; }
  if (session.i >= session.qs.length) { completeLesson(); return; }
  const q = session.qs[session.i], fb = session.fb, pct = Math.round(session.i / session.qs.length * 100);
  let body = '<p class="kind">' + esc(q.kind) + '</p><h2 class="prompt">' + esc(q.prompt) + "</h2>";
  if (q.big) body += '<div class="bigrow"><span class="big ' + (q.bigJp ? "jp" : "") + '">' + esc(q.big) + "</span>" + (q.say ? sayBtn(q.say) : "") + "</div>";
  if (q.sub) body += '<p class="romaji">' + esc(q.sub) + "</p>";
  if (q.listen) body += '<div class="bigrow"><button class="btn primary" data-act="say" data-say="' + esc(q.listen) + '">🔊 Listen</button></div>';
  if (q.t === "mc") {
    body += '<div class="choices">' + q.choices.map((c, ix) => {
      let cls = "choice" + (q.choiceJp ? " jp" : ""), mark = "";
      if (fb) { if (c === q.answer) { cls += " correct"; mark = "✓ "; } else if (ix === session.pick) { cls += " wrong"; mark = "✗ "; } }
      return '<button class="' + cls + '" data-act="choose" data-i="' + ix + '" ' + (fb ? "disabled" : "") + '><b class="letter">' + "ABCD"[ix] + ".</b> " + mark + esc(c) + "</button>";
    }).join("") + "</div>";
  } else if (q.t === "type") {
    body += '<input id="typeIn" class="input" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Type romaji or Japanese" aria-label="Your answer" value="' + esc(session.typed) + '" ' + (fb ? "disabled" : "") + '><p class="hint">' + esc(q.hint) + "</p>" + (fb ? "" : '<button class="btn primary block" data-act="check">Check</button>');
  } else if (q.t === "order") {
    body += '<div class="answer-line" aria-label="Your sentence">' + (session.sel.length ? session.sel.map((ti, k) => '<button class="tok jp" data-act="unpick" data-k="' + k + '" ' + (fb ? "disabled" : "") + ">" + esc(q.tokens[ti]) + "</button>").join("") : '<span class="hint">Tap the words below</span>') + "</div>" +
      '<div class="pool">' + q.tokens.map((t, ti) => session.sel.includes(ti) ? '<span class="tok ghost" aria-hidden="true">' + esc(t) + "</span>" : '<button class="tok jp" data-act="pick" data-ti="' + ti + '" ' + (fb ? "disabled" : "") + ">" + esc(t) + "</button>").join("") + "</div>" +
      (fb ? "" : '<button class="btn primary block" data-act="check" ' + (session.sel.length === q.tokens.length ? "" : "disabled") + ">Check</button>");
  } else if (q.t === "speak") {
    const sp = session.speak || { status: "idle" };
    if (!speechSupported() || sp.status === "unsupported") body += '<div class="note">Speaking practice isn\'t supported in this browser yet. You can still practise by saying it aloud and tapping Continue.</div><button class="btn primary block" data-act="skip">Continue</button>';
    else {
      if (!fb) body += '<button class="btn primary block" data-act="mic" ' + (sp.status === "listening" ? "disabled" : "") + ">🎤 Speak Japanese</button>";
      if (sp.status === "listening") body += '<p class="center" role="status">Listening…</p>';
      if (sp.heard) body += '<p class="center" role="status">I heard: “' + esc(sp.heard) + "”</p>";
      if (sp.status === "miss") body += '<div class="note">Not quite - speech recognition isn\'t perfect, so try again or continue.</div><button class="btn block" data-act="skip">Continue without points</button>';
      if (sp.status === "error") body += '<div class="note">I couldn\'t use the microphone (check permission). Say it aloud and tap Continue.</div><button class="btn block" data-act="skip">Continue</button>';
    }
  }
  const fbHtml = fb ? '<div class="fb ' + (fb.ok ? "ok" : "bad") + '" role="status"><strong>' + (fb.ok ? "✓ Correct! 🎉" : "✗ Not quite") + "</strong>" + (fb.ok ? "" : "<span>Answer: " + esc(fb.ans) + "</span>") + '<button class="btn ' + (fb.ok ? "primary" : "danger") + ' block" id="nextBtn" data-act="next">Continue</button></div>' : "";
  setView('<div class="lesson-top"><button class="icon-btn" data-act="quit" aria-label="Leave lesson">✕</button><div class="bar" role="progressbar" aria-label="Lesson progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '"><i style="width:' + pct + '%"></i></div>' +
    (session.noHearts ? '<span class="muted" title="Practice mode">🌿</span>' : '<span aria-label="' + p.hearts + ' hearts left">' + p.hearts + "❤️</span>") + '</div><div class="qcard">' + body + "</div>" + fbHtml);
  const nb = $("#nextBtn"); if (nb) nb.focus(); else { const ti = $("#typeIn"); if (ti && !fb) ti.focus({ preventScroll: true }); }
  if (q.listen && !fb && !session.heardOnce) { session.heardOnce = true; }
}
function answerQuestion(ok, ans) {
  if (!session || session.fb) return;
  const p = getCurrentProfile(); p.totalQuestions++;
  if (ok) { session.correct++; p.correctAnswers++; const g = awardAnswerXp(p); if (g) session.xp += addXP(g); }
  else { session.wrong++; if (!session.noHearts && p.hearts > 0) { p.hearts--; if (p.hearts === 0) p.heartsRefillAt = Date.now() + COOLDOWN_MS; } }
  session.fb = { ok, ans }; saveProfile(); render();
}
function advance() {
  session.i++; session.fb = null; session.pick = null; session.sel = []; session.typed = ""; session.speak = null;
  const p = getCurrentProfile();
  if (!session.noHearts && p.hearts <= 0 && session.i < session.qs.length) { navigate("break"); return; }
  render(); window.scrollTo(0, 0);
}
function completeLesson() {
  const p = getCurrentProfile();
  session.first = false;
  if (session.mode === "lesson" && !p.completedLessons.includes(session.lesson.id)) {
    session.first = true; p.completedLessons.push(session.lesson.id);
    session.xp += addXP(20 + (session.wrong === 0 ? 10 : 0)); // completion + perfect bonus (first time only)
  }
  if (session.mode === "test") { p.testsTaken++; if (session.correct > p.bestTestScore) p.bestTestScore = session.correct; }
  touchStreak(p); saveProfile();
  session.finished = true; view = "done"; render(); confetti();
}
function renderDone() {
  if (!session) { navigate("home"); return; }
  const s = session, total = s.qs.length, isTest = s.mode === "test";
  let msg = s.correct === total ? "Perfect! すごい！ 🌟" : s.correct >= total * 0.7 ? "Great job! You're getting it." : "Good effort! Every try helps you learn.";
  if (isTest) msg = s.correct >= 9 ? "Excellent! Sensei is proud. 🌟" : s.correct >= 7 ? "Great job! Keep it up." : s.correct >= 5 ? "Nice work - a little more practice and you'll shine." : "Keep going! Try Practice, then test again.";
  const nxt = s.mode === "lesson" ? nextLesson(getCurrentProfile()) : null;
  setView('<div class="center card"><div class="trophy" aria-hidden="true">' + (isTest ? "📝" : "🎉") + "</div><h1>" + (isTest ? "Japanese Test" : s.mode === "practice" ? "Practice done!" : "Lesson complete!") + "</h1><p>Score:</p><div class=\"xpbig\">" + s.correct + " / " + total + "</div><p>XP earned:</p><div class=\"xpbig\">+" + s.xp + '</div><p>' + msg + "</p></div>" +
    (nxt ? '<button class="btn primary block" data-act="startLesson" data-id="' + nxt.id + '">Next: ' + esc(nxt.title) + '</button>' : "") +
    '<button class="btn block" data-act="nav" data-v="learn">Back to lessons</button><button class="btn block" data-act="nav" data-v="home">Home</button>');
}
function renderBreak() {
  const p = getCurrentProfile(); checkHearts(p);
  if (p.hearts > 0) { view = "lesson"; render(); return; }
  if (!p.heartsRefillAt) { p.heartsRefillAt = Date.now() + COOLDOWN_MS; saveProfile(); }
  setView('<div class="center card"><div class="trophy" aria-hidden="true">🍵</div><h1>Take a little break!</h1><p>You are out of hearts, but that is okay - mistakes are how we learn. Your progress is safe.</p><p>Hearts refill in <b id="cd">' + fmtTime(p.heartsRefillAt - Date.now()) + "</b></p></div>" +
    '<button class="btn primary block" data-act="noHearts">Practise without losing progress</button><button class="btn block" data-act="quit">Back to lessons</button>');
  timer = setInterval(() => { const r = p.heartsRefillAt - Date.now(); if (r <= 0) { clearInterval(timer); timer = null; checkHearts(p); render(); } else { const c = $("#cd"); if (c) c.textContent = fmtTime(r); } }, 1000);
}

/* ---------- LEADERBOARD / PROFILE ---------- */
function renderLeaderboard() {
  const list = Object.values(state.profiles).sort((a, b) => b.xp - a.xp), medals = ["🥇", "🥈", "🥉"];
  setView("<h1>🏆 Family Leaderboard</h1>" + list.map((p, i) => '<div class="rank ' + (p.id === state.current ? "me" : "") + '"><span class="medal" aria-label="Place ' + (i + 1) + '">' + medals[i] + '</span><div class="who"><b>' + p.icon + " " + esc(p.name) + '</b><br><small>Level ' + levelFromXp(p.xp) + " · 🔥 " + shownStreak(p) + ' day streak</small></div><b>⭐ ' + p.xp + "</b></div>").join("") +
    '<p class="note">This leaderboard is local to this device. It does not sync over the internet.</p>');
}
function renderShop(){const p=getCurrentProfile();const items=accountsStore.shop.items.filter(x=>x.enabled);const cards=items.map(x=>{const owned=p.inventory.filter(id=>id===x.id).length;const disabled=p.points<x.price||(x.stock===0);return '<div class="shop-card"><div class="shop-icon">'+x.icon+'</div><div class="shop-info"><h2>'+esc(x.name)+'</h2><p>'+esc(x.description)+'</p><b>💰 '+x.price+' points</b>'+(x.stock>=0?'<small>Stock: '+x.stock+'</small>':'<small>Unlimited</small>')+(owned?'<small>Owned: '+owned+'</small>':'')+'</div><button class="btn primary" data-act="buyShopItem" data-id="'+x.id+'" '+(disabled?'disabled':'')+'>Buy</button></div>'}).join('');setView('<div class="row between"><div><h1>🛍️ Shop</h1><p class="muted">Spend your points on rewards.</p></div><div class="points-pill">💰 '+p.points+'</div></div>'+cards+'<button class="btn block" data-act="nav" data-v="home">Back home</button>')}

function renderProfile() {
  const p = getCurrentProfile(), lv = levelInfo(p.xp), acc = p.totalQuestions ? Math.round(p.correctAnswers / p.totalQuestions * 100) : 0;
  setView('<h1>' + p.icon + " " + esc(p.name) + '</h1><div class="card list"><div>⭐ ' + p.xp + " XP (Level " + lv.level + ")</div><div>🔥 " + shownStreak(p) + " day streak</div><div>📚 " + p.completedLessons.length + " lessons complete</div><div>🏆 Best test: " + p.bestTestScore + "/10</div><div>🎯 Accuracy: " + acc + "% (" + p.correctAnswers + "/" + p.totalQuestions + ")</div></div>" +
    '<button class="btn primary block" data-act="nav" data-v="shop">🛍️ Open Shop</button><button class="btn block" data-act="nav" data-v="switch">Switch Profile</button><button class="btn primary block" data-act="startTest">Test Day</button>' +
    '<button class="btn block" data-act="resetProfile">Reset Progress</button>' +
    '<details class="card"><summary>Something looks wrong?</summary><p class="muted">This clears saved data for everyone on this device and starts fresh.</p><button class="btn danger block" data-act="resetAll">Reset everything</button></details>');
}
function renderSwitch(){navigate("accountPicker")}

/* ---------- TALK TO SENSEI ---------- */
function renderTalk() {
  if (!chatLog.length) chatLog.push({ role: "sensei", text: "こんにちは！😊\n(Konnichiwa! I'm Sensei. Say hello, or ask me how to say something.)" });
  setView('<div class="talk"><div class="talk-head"><div class="avatar" aria-hidden="true">🤖</div><div class="grow"><strong>Talk to Sensei</strong><small>Tap Japanese text to hear it</small></div><button class="chip-btn" data-act="autoVoice" aria-pressed="' + autoVoice + '">' + (autoVoice ? "🔊 Voice on" : "🔇 Voice off") + '</button></div>' +
    '<div id="chat" class="chat" role="log" aria-live="polite"></div><div class="quick"><button class="chip-btn jp" data-act="quick" data-text="こんにちは！">こんにちは！</button><button class="chip-btn" data-act="quick" data-text="How do I say thank you?">How do I say thank you?</button><button class="chip-btn" data-act="quick" data-text="help">Help</button></div>' +
    '<div class="chatbar"><button class="icon-btn" data-act="chatMic" aria-label="Speak to Sensei">🎤</button><input id="chatIn" class="input" type="text" placeholder="Type English or Japanese…" aria-label="Message to Sensei" autocomplete="off"><button class="btn primary" data-act="send">Send</button></div></div>');
  const chat = $("#chat"); chatLog.forEach(m => chat.appendChild(bubbleEl(m))); chat.scrollTop = chat.scrollHeight;
}
function bubbleEl(m) {
  const d = document.createElement("div"); d.className = "bubble " + m.role;
  if (m.role === "sensei") {
    const jpText = (m.text.match(JP_RE) || []).join(" ");
    d.innerHTML = esc(m.text).replace(JP_RE, r => '<span class="jp-tap jp" role="button" tabindex="0" data-act="say" data-say="' + r + '">' + r + "</span>").replace(/\n/g, "<br>") + (jpText ? '<button class="icon-btn say" type="button" data-act="say" data-say="' + esc(jpText) + '" aria-label="Listen to Sensei">🔊</button>' : "");
  } else d.textContent = m.text;
  return d;
}
function addBubble(m) { chatLog.push(m); const c = $("#chat"); if (c) { c.appendChild(bubbleEl(m)); c.scrollTop = c.scrollHeight; } }
async function sendMessage(text) {
  text = (text || "").trim(); if (!text || chatBusy) return;
  chatBusy = true; const inp = $("#chatIn"); if (inp) inp.value = "";
  addBubble({ role: "user", text });
  const c = $("#chat"), typing = document.createElement("div"); typing.className = "bubble sensei"; typing.innerHTML = '<span class="dots" role="status" aria-label="Sensei is typing"><i></i><i></i><i></i></span>'; if (c) { c.appendChild(typing); c.scrollTop = c.scrollHeight; }
  let reply; try { const r = await Promise.all([askSensei(text, chatLog.slice(0, -1)), sleep(600)]); reply = r[0]; } catch (e) { reply = localSensei(text); }
  typing.remove(); addBubble({ role: "sensei", text: reply }); chatBusy = false;
  if (autoVoice) speakJapanese((reply.match(JP_RE) || []).join(" "));
}
/* AI adapter: connect a secure backend by setting SENSEI_ENDPOINT. Falls back to the local teacher. */
async function askSensei(message, conversationHistory) {
  if (SENSEI_ENDPOINT) {
    try {
      const r = await fetch(SENSEI_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, history: (conversationHistory || []).slice(-10) }) });
      if (r.ok) { const d = await r.json(); if (d && typeof d.reply === "string") return d.reply; }
    } catch (e) { /* fall through to local */ }
  }
  return localSensei(message);
}
function localSensei(msg) { // friendly offline fallback
  const raw = msg.trim(), m = raw.toLowerCase().replace(/[?!.]+$/g, "").trim();
  const fmt = w => "「" + w.jp + "」(" + w.ro + ") means “" + w.en + "” 😊";
  if (/^(help|\?|what can you do)/.test(m)) { const s = shuffle(ALL_WORDS).slice(0, 5); return "I can help you practise! Try “How do I say thank you?” or say こんにちは！\nSome words:\n" + s.map(w => "「" + w.jp + "」(" + w.ro + ") - " + w.en).join("\n"); }
  const ask = m.match(/(?:how do i say|how to say|how would i say|what is|what's|say)\s+(.+?)(?:\s+in japanese)?$/);
  if (ask) { const q = ask[1].replace(/^["'“]|["'”]$/g, "").trim(), w = ALL_WORDS.find(x => x.en.toLowerCase().split(" / ").some(e => e === q || e === "to " + q)); if (w) return "「" + w.jp + "」(" + w.ro + ") 😊"; return "I don't know “" + q + "” yet! Try: hello, thank you, yes, no, water, school…"; }
  if (raw.includes("こんにちは") || /^(hi|hello|hey)\b/.test(m)) return "こんにちは！げんきですか？ 😊\n(Hello! How are you?)";
  if (raw.includes("おはよう") || m.includes("good morning")) return "おはよう！☀️ (Good morning!)";
  if (raw.includes("こんばんは") || m.includes("good evening")) return "こんばんは！🌙 (Good evening!)";
  if (raw.includes("げんきです") || /^(i'?m|i am) (fine|good|well|great)/.test(m)) return "いいですね！👏\n(That's great!)";
  if (raw.includes("おげんきですか") || m.includes("how are you")) return "げんきです！ありがとう 😊\n(I'm well, thank you!)";
  if (raw.includes("ありがとう") || /^thank/.test(m)) return "どういたしまして！😊\n(douitashimashite - you're welcome!)";
  if (raw.includes("すみません") || m === "sorry") return "だいじょうぶですよ！😊\n(daijoubu desu yo - it's okay!)";
  const w = ALL_WORDS.find(x => raw.includes(x.jp) || x.en.toLowerCase() === m || x.ro === m);
  if (w) return fmt(w);
  return "いいですね！👏 Try saying こんにちは！ or ask “How do I say thank you?”. Type “help” for more words.";
}
function chatMic() {
  if (!speechSupported()) { addBubble({ role: "sys", text: "Voice input isn't supported in this browser yet. You can still type your message." }); return; }
  toast("Listening…");
  const ok = startSpeechRecognition({ onResult: alts => { const inp = $("#chatIn"); if (inp) inp.value = alts[0] || ""; sendMessage(alts[0] || ""); }, onError: () => addBubble({ role: "sys", text: "I couldn't hear you. Check microphone permission or type instead." }) });
  if (!ok) addBubble({ role: "sys", text: "Voice input isn't available right now. Please type instead." });
}

/* ---------- LESSON MIC ---------- */
function lessonMic() {
  const q = session && session.qs[session.i]; if (!q || q.t !== "speak" || session.fb) return;
  const idx = session.i; session.speak = { status: "listening" }; render();
  const alive = () => session && session.i === idx && view === "lesson" && !session.fb;
  const ok = startSpeechRecognition({
    onResult: alts => { if (!alive()) return; if (matchSpeech(alts, q.jp, q.ro)) { session.speak = { status: "heard", heard: alts[0] }; answerQuestion(true, q.jp); } else { session.speak = { status: "miss", heard: alts[0] || "" }; render(); } },
    onError: () => { if (alive()) { session.speak = { status: "error" }; render(); } },
    onEnd: () => { if (alive() && session.speak && session.speak.status === "listening") { session.speak = { status: "miss", heard: "" }; render(); } }
  });
  if (!ok) { session.speak = { status: "unsupported" }; render(); }
}

/* ---------- EVENTS ---------- */
const ACTIONS = {
  nav: el => navigate(el.dataset.v), say: el => speakJapanese(el.dataset.say),
  continue:()=>{const n=nextLesson(getCurrentProfile());if(n)startLesson(n.id);else navigate('learn')},
  startLesson:el=>startLesson(el.dataset.id),startPractice:()=>startSession('practice'),startTest:()=>startSession('test'),startAssignedTest:el=>{const t=accountsStore.tests[el.dataset.id];if(!t)return;startSession('test',null,t);},
  begin:()=>{session.intro=false;render()},quit:()=>{if(session&&!session.finished&&!confirm('Leave this lesson? Your XP so far is kept.'))return;session=null;navigate('learn')},
  noHearts:()=>{if(session){session.noHearts=true;navigate('lesson')}else navigate('learn')},
  choose:el=>{const q=session.qs[session.i];if(!q||session.fb)return;const ix=+el.dataset.i;session.pick=ix;answerQuestion(q.choices[ix]===q.answer,q.answer)},
  pick:el=>{if(session.fb)return;session.sel.push(+el.dataset.ti);render()},unpick:el=>{if(session.fb)return;session.sel.splice(+el.dataset.k,1);render()},
  check:()=>{const q=session.qs[session.i];if(!q||session.fb)return;if(q.t==='type'){const v=($("#typeIn")||{}).value||'';if(!v.trim())return;answerQuestion(q.accept.some(a=>normRo(a)===normRo(v)),q.accept[0]+' ('+q.accept[1]+')')}else if(q.t==='order'){if(session.sel.length!==q.tokens.length)return;answerQuestion(session.sel.map(k=>q.tokens[k]).join('|')===q.answer.join('|'),q.answer.join(' '))}},
  mic:lessonMic,skip:()=>advance(),next:()=>advance(),
  accountLogin:el=>{viewAccountId=el.dataset.id;navigate('login')},
  logout:()=>logout(), admin:()=>{if(requireAdmin())navigate('admin')},adminStudents:()=>{if(requireAdmin())navigate('adminStudents')},adminClasses:()=>{if(requireAdmin())navigate('adminClasses')},adminTests:()=>{if(requireAdmin())navigate('adminTests')},adminShop:()=>{if(requireAdmin())navigate('adminShop')},adminCreateStudent:()=>{if(requireAdmin())navigate('adminCreateStudent')},
  editStudent:el=>{if(requireAdmin())navigate('adminStudentEdit:'+el.dataset.id)},
  createAccount:()=>{if(requireAdmin())navigate('adminCreateStudent')},
  adminSaveStudent:async()=>{if(!requireAdmin())return;const name=(($('#adminNewName')||{}).value||'').trim(),username=(($('#adminNewUser')||{}).value||'').trim().toLowerCase(),pw=(($('#adminNewPw')||{}).value||''),classId=(($('#adminNewClass')||{}).value||'');if(!name||!username||pw.length<6){toast('Enter a name, username and 6+ character password.');return}if(Object.values(accountsStore.accounts).some(a=>a.username===username)){toast('That username is already used.');return}const id='u_'+Date.now().toString(36),profileId=id,icon='🧑';state.profiles[profileId]=sanitizeProfile({id:profileId,name,icon},{id:profileId,name,icon});accountsStore.accounts[id]={id,username,name,icon,role:'student',classId,passwordSet:true,disabled:false,profileId,...await makePasswordRecord(pw)};if(classId&&accountsStore.classes[classId])accountsStore.classes[classId].studentIds.push(id);saveProfile();toast('Student created. Kyle is still signed in.');navigate('adminStudents')},
  finishSetup:async()=>{const pw=(($('#setupPw')||{}).value||'');if(pw.length<6){toast('Use at least 6 characters.');return}const a=accountsStore.accounts.kyle;Object.assign(a,await makePasswordRecord(pw),{passwordSet:true});writeJson(ACCOUNT_STORE_KEY,accountsStore);saveSession('kyle')},
  doLogin:async el=>{const a=accountsStore.accounts[el.dataset.id],pw=(($('#loginPw')||{}).value||'');if(await verifyPassword(a,pw))saveSession(a.id);else toast('Incorrect password.')},
  setFirstPassword:async el=>{const a=accountsStore.accounts[el.dataset.id],pw=(($('#newPw')||{}).value||'');if(pw.length<6){toast('Use at least 6 characters.');return}Object.assign(a,await makePasswordRecord(pw),{passwordSet:true});writeJson(ACCOUNT_STORE_KEY,accountsStore);saveSession(a.id)},
  createClass:()=>{if(!requireAdmin())return;const n=prompt('Class name');if(!n||!n.trim())return;const id='c_'+Date.now().toString(36);accountsStore.classes[id]={id,name:n.trim(),studentIds:[]};saveProfile();renderAdminClasses()},
  manageClass:el=>{if(!requireAdmin())return;const c=accountsStore.classes[el.dataset.id];const students=Object.values(accountsStore.accounts).filter(a=>a.role==='student');const current=new Set(c.studentIds);const rows=students.map(a=>'<label class="check-row"><input type="checkbox" data-class-member="'+a.id+'" '+(current.has(a.id)?'checked':'')+'> '+a.icon+' '+esc(a.name)+'</label>').join('');setView('<button class="btn" data-act="adminClasses">← Classes</button><h1>'+esc(c.name)+'</h1><p class="muted">Choose class members.</p><div class="card">'+(rows||'<p>No students yet.</p>')+'</div><button class="btn primary block" data-act="saveClassMembers" data-id="'+c.id+'">Save members</button>')},
saveClassMembers:el=>{if(!requireAdmin())return;const c=accountsStore.classes[el.dataset.id];const ids=Array.from(document.querySelectorAll('[data-class-member]:checked')).map(x=>x.dataset.classMember);c.studentIds=ids;Object.values(accountsStore.accounts).forEach(a=>{if(a.role==='student'&&a.classId===c.id&&!ids.includes(a.id))a.classId='';if(ids.includes(a.id))a.classId=c.id});saveProfile();toast('Class members saved.');renderAdminClasses()},
renameClass:el=>{if(!requireAdmin())return;const c=accountsStore.classes[el.dataset.id];const n=prompt('New class name',c.name);if(n&&n.trim()){c.name=n.trim();saveProfile();renderAdminClasses()}},
  resetStudent:el=>{if(!requireAdmin())return;const a=accountsStore.accounts[el.dataset.id];if(confirm('Reset '+a.name+' progress?')){state.profiles[a.profileId]=sanitizeProfile({id:a.profileId,name:a.name,icon:a.icon},{id:a.profileId,name:a.name,icon:a.icon});saveProfile();renderStudentEdit(el.dataset.id)}},
  disableStudent:el=>{if(!requireAdmin())return;const a=accountsStore.accounts[el.dataset.id];a.disabled=!a.disabled;saveProfile();renderStudentEdit(el.dataset.id)},
  resetPassword:async el=>{if(!requireAdmin())return;const a=accountsStore.accounts[el.dataset.id],pw=(($('#resetPw')||{}).value||'');if(pw.length<6){toast('Use at least 6 characters.');return}Object.assign(a,await makePasswordRecord(pw),{passwordSet:true});saveProfile();toast('Password updated.');renderStudentEdit(a.id)},
  saveTest:()=>{if(!requireAdmin())return;const id='t_'+Date.now().toString(36),target=(($('#testTarget')||{}).value||'all');accountsStore.tests[id]={id,title:(($('#testTitle')||{}).value||'Untitled').trim(),description:(($('#testDesc')||{}).value||'').trim(),difficulty:(($('#testDiff')||{}).value||'Beginner'),questionCount:+(($('#testCount')||{}).value||10),dueDate:(($('#testDue')||{}).value||''),questionTypes:['mc','listen','type','speak'],targets:target==='all'?{classes:[],students:[],all:true}:{classes:target.startsWith('class:')?[target.slice(6)]:[],students:[],all:false}};saveProfile();toast('Test saved.');renderAdminTests()},
  newShopItem:()=>{if(requireAdmin())navigate('shopEditor')},
  editShopItem:el=>{if(!requireAdmin())return;viewShopItemId=el.dataset.id;navigate('shopEditor')},
  saveShopItem:()=>{if(!requireAdmin())return;const name=(($('#shopName')||{}).value||'').trim(),description=(($('#shopDesc')||{}).value||'').trim(),icon=(($('#shopIcon')||{}).value||'🎁').trim(),price=Math.max(0,+($('#shopPrice')||{}).value||0),stock=Math.max(-1,+($('#shopStock')||{}).value||-1);if(!name){toast('Give the item a name.');return}let x=viewShopItemId?accountsStore.shop.items.find(i=>i.id===viewShopItemId):null;if(!x){x={id:'shop_'+Date.now().toString(36),enabled:true};accountsStore.shop.items.push(x)}Object.assign(x,{name,description,icon,price,stock,enabled:true});saveProfile();viewShopItemId=null;toast('Shop item saved.');navigate('adminShop')},
  deleteShopItem:el=>{if(!requireAdmin())return;const x=accountsStore.shop.items.find(i=>i.id===el.dataset.id);if(x&&confirm('Delete '+x.name+' from the shop?')){accountsStore.shop.items=accountsStore.shop.items.filter(i=>i.id!==x.id);saveProfile();renderAdminShop()}},
  buyShopItem:el=>{const p=getCurrentProfile(),x=accountsStore.shop.items.find(i=>i.id===el.dataset.id);if(!x||!x.enabled)return;if(p.points<x.price){toast('You need more points.');return}if(x.stock===0){toast('That item is out of stock.');return}p.points-=x.price;p.inventory.push(x.id);p.purchases.push({id:x.id,name:x.name,price:x.price,date:new Date().toISOString()});if(x.stock>0)x.stock--;if(x.id==='heart-refill')p.hearts=HEART_MAX; if(x.id==='double-xp'){p.xp+=100;p.level=levelFromXp(p.xp);toast('⚡ +100 XP!');} saveProfile(); if(x.id!=='double-xp')toast('Bought '+x.name+'!');renderShop()},
  resetProfile:()=>{const p=getCurrentProfile();if(confirm('Reset all progress for '+p.name+'?')){const a=getCurrentAccount();state.profiles[a.profileId]=sanitizeProfile({id:a.profileId,name:a.name,icon:a.icon},{id:a.profileId,name:a.name,icon:a.icon});saveProfile();toast('Progress reset.');render()}},
  resetAll:()=>{if(confirm("Reset EVERYONE's progress on this device? This cannot be undone.")){try{localStorage.removeItem(STORE_KEY)}catch(e){}loadProfile();session=null;navigate('accountPicker')}},
  send:()=>{const i=$("#chatIn");sendMessage(i?i.value:'')},quick:el=>sendMessage(el.dataset.text),chatMic:chatMic,autoVoice:()=>{autoVoice=!autoVoice;if(!autoVoice&&'speechSynthesis'in window)try{speechSynthesis.cancel()}catch(e){}render()}
};

document.addEventListener("click", e => {
  const el = e.target.closest("[data-act]"); if (!el || el.disabled) return;
  const fn = ACTIONS[el.dataset.act]; if (fn) { try { fn(el); } catch (err) { console.error(err); } }
});
document.addEventListener("keydown", e => {
  const t = e.target;
  if (e.key === "Enter" && t.id === "typeIn") { e.preventDefault(); ACTIONS.check(); }
  else if (e.key === "Enter" && t.id === "chatIn") { e.preventDefault(); ACTIONS.send(); }
  else if ((e.key === "Enter" || e.key === " ") && t.classList && t.classList.contains("jp-tap")) { e.preventDefault(); speakJapanese(t.dataset.say); }
});

/* ---------- START ---------- */
function init() {
  loadProfile(); if(!accountsStore.accounts.kyle.passwordSet){navigate("firstRun");return} if(sessionAccountId&&accountsStore.accounts[sessionAccountId]&&!accountsStore.accounts[sessionAccountId].disabled) navigate("home"); else navigate("accountPicker");
  if ("speechSynthesis" in window) { loadVoices(); try { speechSynthesis.onvoiceschanged = loadVoices; } catch (e) { } }
  if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js").catch(() => { }));
}
init();
