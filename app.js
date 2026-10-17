"use strict";
const $ = id => document.getElementById(id);
const API = "https://v3.football.api-sports.io";
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};

let N = store.get("n", 10);
// Exemple au premier lancement : les 20 derniers Real Madrid – Barcelone
const EXAMPLE = [
  ["Real Madrid","Barcelona",2,1],["Barcelona","Real Madrid",4,3],["Barcelona","Real Madrid",3,2],["Real Madrid","Barcelona",2,5],
  ["Real Madrid","Barcelona",0,4],["Real Madrid","Barcelona",1,2],["Real Madrid","Barcelona",3,2],["Real Madrid","Barcelona",4,1],
  ["Barcelona","Real Madrid",1,2],["Barcelona","Real Madrid",3,0],["Barcelona","Real Madrid",0,4],["Barcelona","Real Madrid",2,1],
  ["Real Madrid","Barcelona",0,1],["Real Madrid","Barcelona",1,3],["Real Madrid","Barcelona",3,1],["Real Madrid","Barcelona",0,1],
  ["Real Madrid","Barcelona",0,4],["Barcelona","Real Madrid",2,3],["Barcelona","Real Madrid",1,2],["Real Madrid","Barcelona",2,1]
].map(([h, a, hg, ag]) => ({ h, a, hg, ag, date: "", comp: "" }));
let matches = store.get("matches", null);
let isExample = !matches;
if (!matches) matches = EXAMPLE.slice();
$("t1").value = store.get("t1", $("t1").value);
$("t2").value = store.get("t2", $("t2").value);
$("comp").value = store.get("comp", "");

/* ---------- reconnaissance des noms d'équipes ---------- */
const STOP = new Set(["fc","cf","ac","as","sc","club","de","du","la","le","the","afc","ssc","sv","fk","cd","ud","rc","olympique"]);
const toks = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(t => t && !STOP.has(t));
function same(a, b) {
  const A = toks(a), B = toks(b); if (!A.length || !B.length) return false;
  return A.some(x => B.some(y => { const k = Math.min(5, x.length, y.length); return k >= 3 && x.slice(0, k) === y.slice(0, k); }));
}
// 1 si l'équipe 1 joue à domicile, 2 si elle joue à l'extérieur, 0 si non reconnue
function side(m, t1, t2) {
  if (same(m.h, t1) && !same(m.a, t1)) return 1;
  if (same(m.a, t1) && !same(m.h, t1)) return 2;
  if (same(m.h, t2)) return 2;
  if (same(m.a, t2)) return 1;
  return 0;
}

/* ---------- lecture d'un texte (collé ou lu sur une capture) ---------- */
// Accepte une ligne par match, ou une page entière copiée (matchendirect, Flashscore…) :
// date, équipes et score peuvent être sur la même ligne ou sur des lignes voisines.
const RE_DATE = /^(\d{1,2})[\/.](\d{1,2})[\/.](\d{2,4})\b/;
const RE_FULL = /^(.+?)\s+[-–—]\s+(.+?)\s+(\d{1,2})\s*[-–—:]\s*(\d{1,2})(?!\d)/;
const RE_TEAMS = /^([^\d].*?)\s+[-–—]\s+([^\d].*?)$/;
const RE_SCORE = /^(\d{1,2})\s*[-–—:]\s*(\d{1,2})(?:\s|$)/;
function toISO(m) { let y = +m[3]; if (y < 100) y += 2000; return `${y}-${String(m[2]).padStart(2, "0")}-${String(m[1]).padStart(2, "0")}`; }
function parseText(txt) {
  const lines = txt.split(/\n+/).map(l => l.replace(/\t+/g, "  ").replace(/[|*]/g, " ").replace(/\s+/g, " ").trim()).filter(Boolean)
    .map(l => l.replace(/([OoDlI\d])\s*[-–—:]\s*([OoDlI\d])(\s|$)/g, (s, a, b, e) => (/\d/.test(a) || /\d/.test(b)) ? fix(a) + " - " + fix(b) + e : s));
  const out = []; let lastDate = "", lastDateAt = -9;
  for (let i = 0; i < lines.length; i++) {
    let l = lines[i];
    const d = l.match(RE_DATE);
    if (d) { lastDate = toISO(d); lastDateAt = i; l = l.slice(d[0].length).trim(); if (!l) continue; }
    let m = l.match(RE_FULL), h, a, hg, ag;
    if (m) { h = m[1]; a = m[2]; hg = +m[3]; ag = +m[4]; }
    else if ((m = l.match(RE_TEAMS))) {
      const nx = (lines[i + 1] || "").match(RE_SCORE);
      if (!nx) continue;
      h = m[1]; a = m[2]; hg = +nx[1]; ag = +nx[2]; i++;
    } else continue;
    h = h.trim(); a = a.trim();
    if (h.length < 2 || a.length < 2 || h.length > 40 || a.length > 40) continue;
    out.push({ h, a, hg, ag, date: i - lastDateAt <= 2 ? lastDate : "", comp: "" });
  }
  // du plus récent au plus ancien quand les dates sont connues
  if (out.length && out.every(m => m.date)) out.sort((x, y) => y.date.localeCompare(x.date));
  return out;
}
function fix(c) { return c === "O" || c === "o" || c === "D" ? "0" : (c === "l" || c === "I") ? "1" : c; }

/* ---------- liste des matchs ---------- */
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
function fmtDate(d) { if (!d) return ""; const x = new Date(d); return isNaN(x) ? d : x.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }); }
function renderList() {
  const t1 = $("t1").value, t2 = $("t2").value, box = $("list");
  if (!matches.length) { box.innerHTML = '<p class="empty">Aucun match pour l\'instant. Lance une recherche, envoie une capture ou colle les résultats.</p>'; return; }
  box.innerHTML = (isExample ? '<p class="hint" style="margin:0 0 4px">Exemple pré-rempli. Lance ta propre recherche pour le remplacer.</p>' : "") +
    matches.map((m, i) => {
      const s = side(m, t1, t2), used = i < N && s !== 0;
      const wH = m.hg > m.ag, wA = m.ag > m.hg;
      const cH = s === 1 ? "w1" : "w2", cA = s === 1 ? "w2" : "w1";
      const meta = [fmtDate(m.date), m.comp].filter(Boolean).join(" · ") + (s === 0 ? " · équipe non reconnue" : i >= N ? " · hors analyse" : "");
      return `<div class="m${used ? "" : " off"}"><span class="h">${wH ? `<b class="${cH}">${esc(m.h)}</b>` : esc(m.h)}</span><span class="s">${m.hg} - ${m.ag}</span><span class="a">${wA ? `<b class="${cA}">${esc(m.a)}</b>` : esc(m.a)}</span><button class="del" data-i="${i}" aria-label="Supprimer ce match">×</button>${meta ? `<span class="d">${esc(meta.replace(/^ · /, ""))}</span>` : ""}</div>`;
    }).join("");
}
$("list").addEventListener("click", e => { const b = e.target.closest(".del"); if (!b) return; matches.splice(+b.dataset.i, 1); isExample = false; save(); update(); });

/* ---------- analyse ---------- */
const f1 = x => x.toFixed(1).replace(".", ",");
const pc = x => Math.round(x * 100) + " %";
function analyse() {
  const t1 = $("t1").value.trim() || "Équipe 1", t2 = $("t2").value.trim() || "Équipe 2";
  const used = matches.slice(0, N).map(m => ({ m, s: side(m, t1, t2) })).filter(x => x.s);
  const out = $("out");
  if (!used.length) { out.innerHTML = '<span class="tag">Analyse</span><p class="empty">Ajoute des matchs entre ' + esc(t1) + " et " + esc(t2) + " pour voir l'analyse.</p>"; return; }
  const n = used.length;
  let g1 = 0, g2 = 0, w1 = 0, w2 = 0, d = 0, btts = 0, o15 = 0, o25 = 0, o35 = 0, cs1 = 0, cs2 = 0, h1w = 0, h1n = 0, a1w = 0, a1n = 0;
  const form = [];
  used.forEach(({ m, s }) => {
    const x = s === 1 ? m.hg : m.ag, y = s === 1 ? m.ag : m.hg;
    g1 += x; g2 += y;
    if (x > y) { w1++; form.push("1"); } else if (y > x) { w2++; form.push("2"); } else { d++; form.push("N"); }
    if (x > 0 && y > 0) btts++; const t = x + y; if (t > 1) o15++; if (t > 2) o25++; if (t > 3) o35++;
    if (y === 0) cs1++; if (x === 0) cs2++;
    if (s === 1) { h1n++; if (x > y) h1w++; } else { a1n++; if (x > y) a1w++; }
  });
  const tot = g1 + g2, avg1 = g1 / n, avg2 = g2 / n;
  const short = n < N ? ` (seulement ${n} matchs disponibles sur ${N} demandés)` : "";

  let lead, other, concl;
  if (w1 > w2) { lead = [t1, w1]; other = [t2, w2]; } else if (w2 > w1) { lead = [t2, w2]; other = [t1, w1]; }
  if (lead) {
    concl = `Sur cet échantillon, <b>${esc(lead[0])}</b> est devant avec ${pc(lead[1] / n)} de victoires, contre ${pc(other[1] / n)} pour ${esc(other[0])}${d ? ` et ${pc(d / n)} de nuls` : ""}.`;
    const lg = lead[0] === t1 ? avg1 : avg2, og = lead[0] === t1 ? avg2 : avg1;
    concl += lg > og ? " Il marque également davantage de buts en moyenne." : lg < og ? ` Pourtant, c'est ${esc(other[0])} qui marque le plus de buts en moyenne.` : " Les deux équipes marquent autant en moyenne.";
  } else concl = `Équilibre parfait sur les victoires : ${w1} partout${d ? `, avec ${d} nul${d > 1 ? "s" : ""}` : ""}.`;
  const last5 = form.slice(0, 5), l1 = last5.filter(r => r === "1").length, l2 = last5.filter(r => r === "2").length;
  let trend = "";
  if (n >= 6) {
    if (l1 >= 3 && w1 <= w2) trend = `Mais sur les 5 derniers matchs, la tendance s'inverse : ${esc(t1)} en a gagné ${l1}.`;
    else if (l2 >= 3 && w2 <= w1) trend = `Mais sur les 5 derniers matchs, la tendance s'inverse : ${esc(t2)} en a gagné ${l2}.`;
    else trend = `Sur les 5 derniers matchs : ${l1} victoire${l1 > 1 ? "s" : ""} pour ${esc(t1)}, ${l2} pour ${esc(t2)}.`;
  }
  const goalsTxt = tot / n >= 3 ? `Les confrontations sont riches en buts (${f1(tot / n)} par match) : le « +2,5 buts » est passé dans ${pc(o25 / n)} des cas.`
    : tot / n <= 2 ? `Les confrontations sont fermées (${f1(tot / n)} buts par match) : le « −2,5 buts » est passé dans ${pc(1 - o25 / n)} des cas.`
    : `Nombre de buts moyen (${f1(tot / n)} par match), avec ${pc(o25 / n)} de matchs à +2,5 buts.`;

  const bar = (a, b, c) => `<div class="bar"><div style="width:${a / n * 100}%;background:var(--t1)">${a ? pc(a / n) : ""}</div><div style="width:${c / n * 100}%;background:var(--draw)">${c ? pc(c / n) : ""}</div><div style="width:${b / n * 100}%;background:var(--t2)">${b ? pc(b / n) : ""}</div></div>`;
  const row = (lab, k) => `<div class="r"><span>${lab}</span><b>${k} / ${n} · ${pc(k / n)}</b><span class="t"><i style="width:${k / n * 100}%"></i></span></div>`;
  const col = { "1": "var(--t1)", "2": "var(--t2)", "N": "var(--draw)" };

  out.innerHTML = `
  <span class="tag">Analyse sur ${n} matchs${short}</span>
  <div class="sec">
    <h3>1. Buts marqués</h3>
    <div class="duo">
      <div class="stat"><div class="n">${esc(t1)}</div><div class="v">${f1(avg1)}</div><div class="u">but${avg1 >= 2 ? "s" : ""} par match · ${g1} au total</div></div>
      <div class="stat b"><div class="n">${esc(t2)}</div><div class="v">${f1(avg2)}</div><div class="u">but${avg2 >= 2 ? "s" : ""} par match · ${g2} au total</div></div>
    </div>
    <p class="big" style="margin:0">Total des buts inscrits : <b>${tot}</b> en ${n} matchs, soit <b>${f1(tot / n)}</b> buts par match. Les deux équipes marquent en moyenne ${f1(tot / n)} buts cumulés par confrontation.</p>
  </div>
  <div class="sec">
    <h3>2. Bilan des victoires</h3>
    <div class="duo">
      <div class="stat"><div class="n">${esc(t1)}</div><div class="v">${pc(w1 / n)}</div><div class="u">${w1} victoire${w1 > 1 ? "s" : ""} sur ${n}</div></div>
      <div class="stat b"><div class="n">${esc(t2)}</div><div class="v">${pc(w2 / n)}</div><div class="u">${w2} victoire${w2 > 1 ? "s" : ""} sur ${n}</div></div>
    </div>
    ${bar(w1, w2, d)}
    <p class="hint" style="margin:0">Matchs nuls : ${d}. Le pourcentage correspond au nombre de victoires divisé par ${n}.</p>
    <p class="hint" style="margin:0">${esc(t1)} à domicile : ${h1w} victoire${h1w > 1 ? "s" : ""} sur ${h1n} · à l'extérieur : ${a1w} sur ${a1n}.</p>
  </div>
  <div class="sec">
    <h3>3. Tendances de buts</h3>
    <div class="rows">
      ${row("Les deux équipes marquent", btts)}
      ${row("Plus de 1,5 buts", o15)}
      ${row("Plus de 2,5 buts", o25)}
      ${row("Plus de 3,5 buts", o35)}
      ${row(esc(t1) + " ne prend pas de but", cs1)}
      ${row(esc(t2) + " ne prend pas de but", cs2)}
    </div>
  </div>
  <div class="sec">
    <h3>4. Derniers résultats</h3>
    <div class="form">${form.map(r => `<span style="background:${col[r]}">${r}</span>`).join("")}</div>
    <p class="hint" style="margin:0">Du plus récent (à gauche) au plus ancien. 1 = ${esc(t1)}, 2 = ${esc(t2)}, N = nul.</p>
  </div>
  <div class="sec">
    <h3>Conclusion provisoire</h3>
    <div class="conclusion"><p>${concl}</p>${trend ? `<p>${trend}</p>` : ""}<p>${goalsTxt}</p></div>
  </div>`;
}
function save() { store.set("matches", isExample ? null : matches); store.set("t1", $("t1").value); store.set("t2", $("t2").value); store.set("comp", $("comp").value); store.set("n", N); }
function update() { renderList(); analyse(); }

/* ---------- contrôles ---------- */
function syncSeg() { $("seg").querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", +x.dataset.n === N ? "true" : "false")); }
$("seg").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; N = +b.dataset.n; syncSeg(); save(); update(); });
["t1", "t2"].forEach((id, k) => $(id).addEventListener("input", () => { $(k ? "p2" : "p1").hidden = true; save(); update(); }));
$("comp").addEventListener("input", save);
document.querySelector("#single .tabs").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  document.querySelectorAll("#single .tabs button").forEach(x => x.setAttribute("aria-selected", x === b ? "true" : "false"));
  document.querySelectorAll("[data-panel]").forEach(p => p.hidden = p.dataset.panel !== b.dataset.tab);
});
function setStatus(t, err) { const s = $("status"); s.textContent = t; s.className = "status" + (err ? " err" : ""); }
function replaceWith(list, src) {
  if (!list.length) { setStatus("Aucun match trouvé. Vérifie les noms ou essaie une autre méthode.", true); return; }
  matches = list; isExample = false;
  setStatus(`${list.length} matchs récupérés (${src}). Vérifie-les et supprime ceux qui ne vont pas.`);
  save(); update();
}
$("parse").onclick = async () => {
  const v = $("paste").value.trim();
  if (/^https:\/\/www\.matchendirect\.fr\/statistique\/\S+\.html$/.test(v)) {
    if (!getRelay()) { setStatus("Pour utiliser un lien, règle d'abord le relais (bouton « Réglages »). Sinon copie le texte de la page.", true); return; }
    setStatus("Lecture de la page…");
    try { const j = await relay("/page?url=" + encodeURIComponent(v)); const l = parseText(j.text || ""); replaceWith(l, "matchendirect"); $("paste").value = ""; autoTeams(l); }
    catch (e) { setStatus(e.message, true); }
    return;
  }
  const l = parseText($("paste").value);
  if (!l.length) { setStatus("Je n'ai reconnu aucun match. Copie la page des confrontations en entier, ou écris : Équipe A - Équipe B 2 - 1", true); return; }
  replaceWith(l, "texte collé"); $("paste").value = "";
  autoTeams(l);
};
const key = m => [m.date, toks(m.h).join(""), toks(m.a).join(""), m.hg, m.ag].join("|");
$("merge").onclick = () => {
  const l = parseText($("paste").value);
  if (!l.length) { setStatus("Je n'ai reconnu aucun match dans le texte collé.", true); return; }
  if (isExample) { matches = []; isExample = false; }
  const seen = new Set(matches.map(key)); let added = 0;
  l.forEach(m => { if (!seen.has(key(m))) { matches.push(m); seen.add(key(m)); added++; } });
  if (matches.every(m => m.date)) matches.sort((x, y) => y.date.localeCompare(x.date));
  setStatus(`${added} match${added > 1 ? "s" : ""} ajouté${added > 1 ? "s" : ""} à la liste (doublons ignorés).`);
  $("paste").value = ""; save(); update(); autoTeams(matches);
};
// si les noms saisis ne correspondent pas aux matchs collés, on reprend ceux de la liste
function autoTeams(l) {
  if (!l.length || side(l[0], $("t1").value, $("t2").value)) return;
  $("t1").value = l[0].h; $("t2").value = l[0].a; $("p1").hidden = $("p2").hidden = true; save(); update();
}
$("findSite").onclick = () => {
  const q = encodeURIComponent(`matchendirect statistique ${$("t1").value} contre ${$("t2").value}`);
  window.open("https://www.google.com/search?q=" + q, "_blank");
};
$("addOne").onclick = () => {
  const l = parseText($("one").value);
  if (!l.length) { setStatus("Format attendu : Équipe A - Équipe B 2 - 1", true); return; }
  if (isExample) { matches = []; isExample = false; }
  matches.unshift(...l); $("one").value = ""; setStatus("Match ajouté en tête de liste (le plus récent)."); save(); update();
};
$("one").addEventListener("keydown", e => { if (e.key === "Enter") $("addOne").click(); });
$("clear").onclick = () => { matches = []; isExample = false; setStatus(""); save(); update(); };

/* ---------- réglages : relais et clé API ---------- */
const getKey = () => store.get("apikey", "");
const getRelay = () => store.get("relay", "").replace(/\/+$/, "");
$("key").value = getKey(); $("relay").value = getRelay();
$("openKey").onclick = () => { $("keyCard").hidden = false; $("keyCard").scrollIntoView({ behavior: "smooth" }); };
$("closeKey").onclick = () => { $("keyCard").hidden = true; };
$("saveKey").onclick = async () => {
  let r = $("relay").value.trim(); if (r && !/^https?:\/\//.test(r)) r = "https://" + r;
  store.set("relay", r.replace(/\/+$/, "")); $("relay").value = getRelay();
  store.set("apikey", $("key").value.trim());
  const msgs = [];
  if (getRelay()) {
    try { const j = await fetch(getRelay() + "/").then(x => x.json()); msgs.push(j.ok ? "Relais OK." : "Le relais répond, mais pas comme prévu."); }
    catch (e) { msgs.push("Relais injoignable : vérifie l'adresse."); }
  }
  if (getKey()) {
    try { const j = await api("/status"); const q = j.response && j.response.requests; msgs.push(q ? `Clé API valide (${q.current}/${q.limit_day} aujourd'hui).` : "Clé API enregistrée."); }
    catch (e) { msgs.push(e.message); }
  }
  $("quota").textContent = msgs.join(" ") || "Réglages enregistrés.";
  if (!/injoignable|refusée/.test($("quota").textContent)) setTimeout(() => { $("keyCard").hidden = true; }, 1500);
};

/* ---------- relais matchendirect ---------- */
async function relay(path) {
  let res;
  try { res = await fetch(getRelay() + path); } catch (e) { throw new Error("Relais injoignable. Vérifie ta connexion ou l'adresse dans Réglages."); }
  let j = {}; try { j = await res.json(); } catch (e) {}
  if (!res.ok || j.error) throw new Error(j.error || "Le relais a répondu une erreur (" + res.status + ").");
  return j;
}
async function relayH2H(a, b) {
  const ck = "r:" + toks(a).join("-") + "|" + toks(b).join("-");
  const c = store.get(ck, null);
  if (c && Date.now() - c.t < 3 * 3600e3) return c.d;
  const j = await relay(`/h2h?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`);
  const d = { url: j.url, list: parseText(j.text || "") };
  store.set(ck, { t: Date.now(), d }); return d;
}
// noms à utiliser pour l'analyse : ceux de la page s'ils diffèrent de ceux tapés
function namesFor(list, a, b) {
  if (!list.length) return [a, b];
  if (side(list[0], a, b)) {
    const m = list[0], s = side(m, a, b);
    return s === 1 ? [m.h, m.a] : [m.a, m.h];
  }
  return [list[0].h, list[0].a];
}

/* ---------- API-Football ---------- */
// L'offre gratuite limite le nombre de requêtes par minute : on espace les appels.
const calls = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function throttle(onWait) {
  for (;;) {
    const now = Date.now();
    while (calls.length && now - calls[0] > 61000) calls.shift();
    if (calls.length < 8) { calls.push(now); return; }
    const wait = 61000 - (now - calls[0]);
    if (onWait) onWait(Math.ceil(wait / 1000));
    await sleep(Math.min(wait, 1000));
  }
}
let onThrottle = null;
async function api(path, retried) {
  const key = getKey();
  if (!key) throw new Error("Ajoute d'abord ta clé API (bouton « Réglages » en haut).");
  await throttle(onThrottle);
  let res;
  try { res = await fetch(API + path, { headers: { "x-apisports-key": key } }); }
  catch (e) { throw new Error("Pas de connexion au service de résultats. Vérifie ta connexion internet."); }
  if (!res.ok) throw new Error("Le service de résultats a répondu une erreur (" + res.status + "). Réessaie plus tard.");
  const j = await res.json();
  const errs = j.errors && (Array.isArray(j.errors) ? j.errors : Object.values(j.errors));
  if (errs && errs.length) {
    const t = errs.join(" ");
    if (/token|key|access/i.test(t)) throw new Error("Clé API refusée. Vérifie-la dans « Réglages ».");
    if (/minute/i.test(t) && !retried) { if (onThrottle) onThrottle(60); await sleep(61000); return api(path, true); }
    if (/request|limit/i.test(t)) throw new Error("Limite de 100 requêtes du jour atteinte. Réessaie demain, ou utilise Capture / Coller.");
    if (/plan|season/i.test(t)) throw new Error("L'offre gratuite ne donne pas accès à ces données : " + t);
    throw new Error("Erreur du service : " + t);
  }
  return j;
}
async function cached(path, ttlH) {
  const c = store.get("c:" + path, null);
  if (c && Date.now() - c.t < ttlH * 3600e3) return c.d;
  const d = await api(path); store.set("c:" + path, { t: Date.now(), d }); return d;
}
async function findTeams(name) {
  const q = name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  if (q.length < 3) throw new Error(`Le nom « ${name} » est trop court (3 lettres minimum).`);
  const j = await cached("/teams?search=" + encodeURIComponent(q), 24 * 30);
  return (j.response || []).map(x => ({ id: x.team.id, name: x.team.name, country: x.team.country || "", national: x.team.national }));
}
function bestTeam(list, typed) {
  const t = toks(typed).join(" ");
  return list.find(x => toks(x.name).join(" ") === t) || list.find(x => !x.national) || list[0];
}
function fillPick(sel, list, chosen) {
  sel.innerHTML = list.slice(0, 30).map(x => `<option value="${x.id}"${x.id === chosen.id ? " selected" : ""}>${esc(x.name)}${x.country ? " (" + esc(x.country) + ")" : ""}</option>`).join("");
  sel.hidden = list.length < 2;
}
let picked = { p1: null, p2: null };
async function resolve(k) {
  const input = $(k === "p1" ? "t1" : "t2"), sel = $(k);
  if (!sel.hidden && sel.value) { const o = sel.selectedOptions[0]; return { id: +sel.value, name: o.textContent.replace(/ \([^)]*\)$/, "") }; }
  const list = await findTeams(input.value.trim());
  if (!list.length) throw new Error(`Aucune équipe trouvée pour « ${input.value} ». Essaie le nom en anglais (ex. : Bayern Munich).`);
  const best = bestTeam(list, input.value);
  fillPick(sel, list, best);
  return best;
}
["p1", "p2"].forEach(k => $(k).addEventListener("change", () => setStatus("Équipe changée. Relance la recherche.")));

const DONE = new Set(["FT", "AET", "PEN"]);
$("search").onclick = async () => {
  const b = $("search");
  if (!$("t1").value.trim() || !$("t2").value.trim()) { setStatus("Écris le nom des deux équipes.", true); return; }
  if (getRelay()) {
    b.disabled = true; setStatus("Recherche sur matchendirect…");
    try {
      const d = await relayH2H($("t1").value.trim(), $("t2").value.trim());
      if (!d.list.length) throw new Error("Page trouvée, mais aucun match joué n'a été lu dessus.");
      const [n1, n2] = namesFor(d.list, $("t1").value.trim(), $("t2").value.trim());
      $("t1").value = n1; $("t2").value = n2; $("p1").hidden = $("p2").hidden = true;
      replaceWith(d.list, "matchendirect");
    } catch (e) { setStatus(e.message, true); }
    finally { b.disabled = false; }
    return;
  }
  if (!getKey()) { setStatus("Règle d'abord le relais matchendirect (bouton « Réglages » en haut).", true); return; }
  b.disabled = true; setStatus("Recherche des équipes…");
  try {
    const [a, c] = await Promise.all([resolve("p1"), resolve("p2")]);
    if (a.id === c.id) throw new Error("Les deux noms donnent la même équipe. Choisis la bonne dans la liste.");
    setStatus(`Recherche des confrontations ${a.name} – ${c.name}…`);
    const j = await cached(`/fixtures/headtohead?h2h=${a.id}-${c.id}`, 6);
    const comp = $("comp").value.trim();
    let list = (j.response || []).filter(f => DONE.has(f.fixture.status.short) && f.goals.home != null)
      .map(f => {
        // score sans les tirs au but : temps réglementaire + prolongations
        const s = f.score || {}, et = s.extratime && s.extratime.home != null;
        const hg = et ? s.fulltime.home + s.extratime.home : f.goals.home;
        const ag = et ? s.fulltime.away + s.extratime.away : f.goals.away;
        return { h: f.teams.home.name, a: f.teams.away.name, hg: f.goals.home != null ? f.goals.home : hg, ag: f.goals.away != null ? f.goals.away : ag, date: f.fixture.date, comp: f.league.name };
      })
      .sort((x, y) => new Date(y.date) - new Date(x.date));
    if (comp) {
      const f = list.filter(m => same(m.comp, comp) || toks(m.comp).join(" ").includes(toks(comp).join(" ")));
      if (f.length) list = f; else setStatus(`Aucun match trouvé pour « ${comp} », toutes compétitions affichées.`);
    }
    $("t1").value = a.name; $("t2").value = c.name;
    if (!list.length) throw new Error("Aucune confrontation trouvée. L'offre gratuite ne couvre que les saisons récentes : utilise Capture ou Coller pour l'historique plus ancien.");
    replaceWith(list, "API-Football");
    if (list.length < N) setStatus(`${list.length} matchs trouvés seulement. L'offre gratuite ne couvre que les saisons récentes : complète avec Capture ou Coller si besoin.`);
  } catch (e) { setStatus(e.message, true); }
  finally { b.disabled = false; }
};

/* ---------- plusieurs matchs ---------- */
function computeStats(list, t1, t2, n) {
  const used = list.slice(0, n).map(m => ({ m, s: side(m, t1, t2) })).filter(x => x.s);
  const k = used.length; if (!k) return null;
  let g1 = 0, g2 = 0, w1 = 0, w2 = 0, d = 0, btts = 0, o25 = 0;
  used.forEach(({ m, s }) => {
    const x = s === 1 ? m.hg : m.ag, y = s === 1 ? m.ag : m.hg;
    g1 += x; g2 += y; if (x > y) w1++; else if (y > x) w2++; else d++;
    if (x > 0 && y > 0) btts++; if (x + y > 2) o25++;
  });
  return { n: k, w1, w2, d, avg1: g1 / k, avg2: g2 / k, avg: (g1 + g2) / k, btts: btts / k, o25: o25 / k };
}
async function fetchH2H(a, c) {
  const j = await cached(`/fixtures/headtohead?h2h=${a.id}-${c.id}`, 6);
  return (j.response || []).filter(f => DONE.has(f.fixture.status.short) && f.goals.home != null)
    .map(f => ({ h: f.teams.home.name, a: f.teams.away.name, hg: f.goals.home, ag: f.goals.away, date: f.fixture.date, comp: f.league.name }))
    .sort((x, y) => new Date(y.date) - new Date(x.date));
}
function parseFixtures(txt) {
  return txt.split(/\n+/).map(l => l.trim()).filter(Boolean).map(l => {
    const p = l.split(/\s+(?:-|–|—|vs\.?|contre)\s+/i);
    return p.length >= 2 ? { a: p[0].trim(), b: p.slice(1).join(" ").replace(/\s+\d+\s*[-:]\s*\d+\s*$/, "").trim() } : null;
  }).filter(Boolean);
}
let NB = store.get("nb", 10);
let batchRes = store.get("batchRes", []);
let stopFlag = false;
function syncSegB() { $("segB").querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", +x.dataset.n === NB ? "true" : "false")); }
$("segB").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; NB = +b.dataset.n; store.set("nb", NB); syncSegB(); renderBatch(); });
$("batch").value = store.get("batchTxt", "");
$("batch").addEventListener("input", () => store.set("batchTxt", $("batch").value));
function verdict(s, t1, t2) {
  const p1 = s.w1 / s.n, p2 = s.w2 / s.n;
  if (p1 >= 0.5 && p1 - p2 >= 0.2) return { cls: "p1", txt: "Avantage " + t1 };
  if (p2 >= 0.5 && p2 - p1 >= 0.2) return { cls: "p2", txt: "Avantage " + t2 };
  return { cls: "", txt: "Équilibré" };
}
function renderBatch() {
  const out = $("bout");
  if (!batchRes.length) { out.innerHTML = '<span class="tag">Résultats</span><p class="empty">Écris tes matchs, un par ligne, puis touche « Analyser tous les matchs ».</p>'; return; }
  out.innerHTML = `<span class="tag">Résultats · ${NB} dernières confrontations par match</span>` + batchRes.map((r, i) => {
    if (r.wait) return `<div class="bm wait"><div class="bm-top"><div class="bm-teams">${esc(r.a)} <span style="color:var(--muted)">vs</span> ${esc(r.b)}</div><span class="pill">En attente</span></div></div>`;
    if (r.err) return `<div class="bm"><div class="bm-top"><div class="bm-teams">${esc(r.a)} <span style="color:var(--muted)">vs</span> ${esc(r.b)}</div><span class="pill err">Erreur</span></div><div class="bm-foot"><span>${esc(r.err)}</span></div></div>`;
    const s = computeStats(r.list, r.t1, r.t2, NB);
    if (!s) return `<div class="bm"><div class="bm-top"><div class="bm-teams"><span class="c1">${esc(r.t1)}</span> <span style="color:var(--muted)">vs</span> <span class="c2">${esc(r.t2)}</span></div><span class="pill">Aucun match</span></div><div class="bm-foot"><span>Aucune confrontation trouvée (saisons récentes seulement).</span></div></div>`;
    const v = verdict(s, r.t1, r.t2);
    return `<div class="bm"><div class="bm-top"><div class="bm-teams"><span class="c1">${esc(r.t1)}</span> <span style="color:var(--muted)">vs</span> <span class="c2">${esc(r.t2)}</span></div><span class="pill ${v.cls}">${esc(v.txt)}</span></div>
      <div class="kpis">
        <div class="kpi"><b>${pc(s.w1 / s.n)}</b><span>Vict. 1</span></div>
        <div class="kpi"><b>${pc(s.d / s.n)}</b><span>Nul</span></div>
        <div class="kpi"><b>${pc(s.w2 / s.n)}</b><span>Vict. 2</span></div>
        <div class="kpi"><b>${f1(s.avg)}</b><span>Buts/match</span></div>
      </div>
      <div class="kpis" style="grid-template-columns:repeat(2,1fr)">
        <div class="kpi"><b>${pc(s.o25)}</b><span>+2,5 buts</span></div>
        <div class="kpi"><b>${pc(s.btts)}</b><span>Les 2 marquent</span></div>
      </div>
      <div class="bm-foot"><span>Sur ${s.n} match${s.n > 1 ? "s" : ""}${s.n < NB ? " (pas plus de disponibles)" : ""} · ${f1(s.avg1)} – ${f1(s.avg2)} buts/match</span><button class="link" data-open="${i}">Détail →</button></div></div>`;
  }).join("");
}
$("bout").addEventListener("click", e => {
  const b = e.target.closest("[data-open]"); if (!b) return;
  const r = batchRes[+b.dataset.open];
  $("t1").value = r.t1; $("t2").value = r.t2; $("p1").hidden = $("p2").hidden = true;
  matches = r.list.slice(); isExample = false; N = NB; syncSeg(); save(); update();
  setMode("single"); setStatus(`Détail de ${r.t1} – ${r.t2}.`); window.scrollTo(0, 0);
});
$("stopBatch").onclick = () => { stopFlag = true; };
$("runBatch").onclick = async () => {
  const fx = parseFixtures($("batch").value);
  const bs = $("bstatus");
  if (!fx.length) { bs.textContent = "Écris au moins un match, au format Équipe A - Équipe B."; bs.className = "status err"; return; }
  const useRelay = !!getRelay();
  if (!useRelay && !getKey()) { bs.textContent = "Règle d'abord le relais matchendirect (bouton « Réglages » en haut)."; bs.className = "status err"; return; }
  if (fx.length > 25) { bs.textContent = "25 matchs maximum à la fois, pour ne pas épuiser tes requêtes du jour."; bs.className = "status err"; return; }
  stopFlag = false; $("runBatch").disabled = true; $("stopBatch").hidden = false; bs.className = "status";
  batchRes = fx.map(f => ({ a: f.a, b: f.b, wait: true })); renderBatch();
  onThrottle = s => { bs.textContent = `Pause imposée par l'offre gratuite… reprise dans ${s} s`; };
  for (let i = 0; i < fx.length; i++) {
    if (stopFlag) { batchRes = batchRes.filter(r => !r.wait); break; }
    bs.textContent = `Analyse ${i + 1} sur ${fx.length} : ${fx[i].a} – ${fx[i].b}…`;
    try {
      if (useRelay) {
        const d = await relayH2H(fx[i].a, fx[i].b);
        const [n1, n2] = namesFor(d.list, fx[i].a, fx[i].b);
        batchRes[i] = { a: fx[i].a, b: fx[i].b, t1: n1, t2: n2, list: d.list };
        store.set("batchRes", batchRes.filter(r => !r.wait)); renderBatch();
        await sleep(800);
        continue;
      }
      const la = await findTeams(fx[i].a); if (!la.length) throw new Error(`Équipe introuvable : « ${fx[i].a} ». Essaie le nom en anglais.`);
      const lb = await findTeams(fx[i].b); if (!lb.length) throw new Error(`Équipe introuvable : « ${fx[i].b} ». Essaie le nom en anglais.`);
      const A = bestTeam(la, fx[i].a), B = bestTeam(lb, fx[i].b);
      if (A.id === B.id) throw new Error("Les deux noms donnent la même équipe.");
      const list = await fetchH2H(A, B);
      batchRes[i] = { a: fx[i].a, b: fx[i].b, t1: A.name, t2: B.name, list };
    } catch (e) {
      batchRes[i] = { a: fx[i].a, b: fx[i].b, err: e.message };
      if (/Limite de 100|Clé API refusée/.test(e.message)) { for (let k = i + 1; k < fx.length; k++) batchRes[k] = { a: fx[k].a, b: fx[k].b, err: "Non analysé : " + e.message }; renderBatch(); break; }
    }
    store.set("batchRes", batchRes.filter(r => !r.wait)); renderBatch();
  }
  onThrottle = null; $("runBatch").disabled = false; $("stopBatch").hidden = true;
  const ok = batchRes.filter(r => r.list).length;
  bs.textContent = stopFlag ? `Arrêté. ${ok} match${ok > 1 ? "s" : ""} analysé${ok > 1 ? "s" : ""}.` : `Terminé : ${ok} sur ${fx.length} analysés. Touche « Détail » pour voir l'analyse complète d'un match.`;
};

/* ---------- choix du mode ---------- */
function setMode(m) {
  document.querySelectorAll("#mode button").forEach(x => x.setAttribute("aria-selected", x.dataset.mode === m ? "true" : "false"));
  $("single").hidden = m !== "single"; $("multi").hidden = m !== "multi"; store.set("mode", m);
}
$("mode").addEventListener("click", e => { const b = e.target.closest("button"); if (b) setMode(b.dataset.mode); });
setMode(store.get("mode", "single")); syncSegB(); renderBatch();

/* ---------- lecture de capture sur le téléphone (OCR) ---------- */
function loadScript(src) { return new Promise((ok, ko) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => ko(new Error("load")); document.head.appendChild(s); }); }
$("shot").onchange = async e => {
  const file = e.target.files && e.target.files[0]; if (!file) return;
  setStatus("Préparation de la lecture (la première fois, ça peut prendre une minute)…");
  try {
    if (!window.Tesseract) await loadScript("https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js");
    const r = await Tesseract.recognize(file, "fra+eng", {
      logger: m => { if (m.status === "recognizing text") setStatus("Lecture de la capture… " + Math.round(m.progress * 100) + " %"); }
    });
    const list = parseText(r.data.text);
    replaceWith(list, "capture");
  } catch (err) {
    setStatus(err && err.message === "load" ? "La lecture de capture a besoin d'internet la première fois. Vérifie ta connexion." : "Impossible de lire cette image. Essaie une capture plus nette, ou colle les résultats.", true);
  } finally { e.target.value = ""; }
};

/* ---------- démarrage ---------- */
syncSeg(); update();
if (!getRelay() && !getKey()) setStatus("Pour la recherche automatique, règle le relais matchendirect (bouton « Réglages » en haut).");
if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
