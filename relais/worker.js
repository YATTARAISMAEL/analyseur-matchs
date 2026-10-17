// Relais de l'Analyseur de matchs — à coller dans un Worker Cloudflare.
// Il va chercher la page « statistique » de matchendirect.fr et renvoie son texte à l'appli.
// Routes :
//   /h2h?a=Real Madrid&b=Barcelone   → trouve la page des deux équipes et renvoie le texte
//   /page?url=https://www.matchendirect.fr/statistique/....html   → renvoie le texte de cette page

const SITE = "https://www.matchendirect.fr";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

// Noms courants → nom utilisé par matchendirect (complète la liste si besoin)
const ALIAS = {
  "barcelona": "fc-barcelone", "barcelone": "fc-barcelone", "barca": "fc-barcelone",
  "psg": "paris-saint-germain", "paris": "paris-saint-germain", "paris sg": "paris-saint-germain",
  "om": "olympique-de-marseille", "marseille": "olympique-de-marseille",
  "ol": "olympique-lyonnais", "lyon": "olympique-lyonnais",
  "bayern": "bayern-munich", "bayern munchen": "bayern-munich",
  "dortmund": "borussia-dortmund", "bvb": "borussia-dortmund",
  "inter": "inter-milan", "internazionale": "inter-milan", "milan": "ac-milan",
  "juventus": "juventus-turin", "juve": "juventus-turin",
  "napoli": "naples", "roma": "as-rome", "rome": "as-rome", "lazio": "lazio-rome",
  "man city": "manchester-city", "manchester city": "manchester-city",
  "man united": "manchester-united", "man utd": "manchester-united", "manchester united": "manchester-united",
  "atletico": "atletico-madrid", "atletico madrid": "atletico-madrid", "atl madrid": "atletico-madrid",
  "real": "real-madrid", "tottenham": "tottenham-hotspur", "spurs": "tottenham-hotspur",
  "leverkusen": "bayer-leverkusen", "sporting": "sporting-portugal", "benfica": "benfica-lisbonne",
};

const slug = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

function candidates(name) {
  const base = slug(name), plain = base.replace(/-/g, " ");
  const list = [];
  if (ALIAS[plain]) list.push(ALIAS[plain]);
  list.push(base);
  if (!base.startsWith("fc-")) list.push("fc-" + base);
  if (/^(fc|as|ac|sc|cf|us|rc)-/.test(base)) list.push(base.slice(3));
  if (/-fc$/.test(base)) list.push(base.slice(0, -3));
  return [...new Set(list)].slice(0, 4);
}

async function get(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36", "Accept-Language": "fr-FR,fr" },
    redirect: "follow",
    cf: { cacheTtl: 21600, cacheEverything: true },
  });
  const ok = res.ok && new URL(res.url).pathname === new URL(url).pathname;
  return { ok, html: ok ? await res.text() : "" };
}

// HTML → texte, une cellule de tableau par ligne (l'appli sait lire ce format)
function toText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, "")
    .replace(/<\/(td|th|tr|p|div|li|h\d)>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"')
    .replace(/&eacute;/g, "é").replace(/&egrave;/g, "è").replace(/&agrave;/g, "à").replace(/&ccedil;/g, "ç")
    .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n))
    .split("\n").map(l => l.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n");
}

async function findTeam(name) {
  for (const c of candidates(name)) {
    const r = await get(`${SITE}/equipe/${c}.html`);
    if (r.ok) return c;
  }
  return null;
}

const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: CORS });

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
    const u = new URL(request.url);
    try {
      if (u.pathname === "/page") {
        const target = u.searchParams.get("url") || "";
        if (!/^https:\/\/www\.matchendirect\.fr\/statistique\/[a-z0-9-]+\.html$/.test(target))
          return json({ error: "Lien invalide : il faut un lien de page « statistique » de matchendirect.fr." }, 400);
        const r = await get(target);
        if (!r.ok) return json({ error: "Page introuvable sur matchendirect." }, 404);
        return json({ url: target, text: toText(r.html) });
      }
      if (u.pathname === "/h2h") {
        const a = (u.searchParams.get("a") || "").trim(), b = (u.searchParams.get("b") || "").trim();
        if (!a || !b) return json({ error: "Il manque le nom d'une équipe." }, 400);
        const [sa, sb] = await Promise.all([findTeam(a), findTeam(b)]);
        if (!sa) return json({ error: `Équipe introuvable sur matchendirect : « ${a} ». Essaie son nom en français (ex. : Bayern Munich, Juventus Turin) ou colle le lien de la page.` }, 404);
        if (!sb) return json({ error: `Équipe introuvable sur matchendirect : « ${b} ». Essaie son nom en français (ex. : Bayern Munich, Juventus Turin) ou colle le lien de la page.` }, 404);
        for (const [x, y] of [[sa, sb], [sb, sa]]) {
          const url = `${SITE}/statistique/${x}-contre-${y}.html`;
          const r = await get(url);
          if (r.ok) return json({ url, teams: [sa, sb], text: toText(r.html) });
        }
        return json({ error: "Les équipes existent, mais matchendirect n'a pas de page de confrontations pour elles." }, 404);
      }
      return json({ ok: true, message: "Relais de l'Analyseur de matchs en marche." });
    } catch (e) {
      return json({ error: "Le relais n'a pas pu joindre matchendirect. Réessaie dans un moment." }, 502);
    }
  },
};
