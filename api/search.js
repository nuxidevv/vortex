import https from "https";

const BRIXHUB_URL = "https://api.brixhub.ru/api/v1/search";

const BLOCKED_TARGETS = [
  { prenom: "leo",    nom: "roman" },
  { prenom: "lucile", nom: "roman" },
  { prenom: "jimmy",  nom: "roman" },
  { prenom: "tom",    nom: "roman" },
  { prenom: "nuhi",   nom: "xhaferi" }
];

// Noms de famille bloqués — toute personne avec ce nom de famille
// sera retirée des résultats ET toute requête contenant ce nom sera bloquée
const BLOCKED_LAST_NAMES = ["xhaferi"];

function normalizeName(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isBlocked(fullName) {
  const norm = normalizeName(fullName);
  if (!norm) return false;
  const tokens = norm.split(" ").filter(t => t.length > 0);
  return BLOCKED_TARGETS.some(t => {
    const hasPrenomComplet = tokens.includes(t.prenom);
    const hasNomComplet = tokens.includes(t.nom);
    if (hasPrenomComplet && hasNomComplet) return true;
    const hasPrenomTronque = tokens.some(tok => tok.length >= 2 && t.prenom.startsWith(tok));
    if (hasPrenomTronque && hasNomComplet) return true;
    const hasNomTronque = tokens.some(tok => tok.length >= 3 && t.nom.startsWith(tok));
    if (hasPrenomComplet && hasNomTronque) return true;
    return false;
  });
}

// Vérifie si une chaîne (requête, email, téléphone) contient un nom de famille bloqué
function queryContainsBlockedLastName(query) {
  const norm = normalizeName(query);
  if (!norm) return false;
  const tokens = norm.split(" ").filter(t => t.length > 0);
  return BLOCKED_LAST_NAMES.some(blocked => {
    const b = normalizeName(blocked);
    return tokens.some(tok => tok === b);
  });
}

// Vérifie si un résultat a un nom de famille bloqué
function hasBlockedLastName(item) {
  if (!item || typeof item !== "object") return false;

  // Vérification directe du nom de famille
  const lastName = normalizeName(item.nom_famille || item.last_name || "");
  if (lastName) {
    return BLOCKED_LAST_NAMES.some(blocked => lastName === normalizeName(blocked));
  }

  // Fallback : vérifier le nom d'affichage
  const displayName = normalizeName(item.nom_affichage || item.name || "");
  if (displayName) {
    const tokens = displayName.split(" ").filter(t => t.length > 0);
    return BLOCKED_LAST_NAMES.some(blocked => tokens.includes(normalizeName(blocked)));
  }

  return false;
}

// Filtre récursivement la réponse pour retirer les personnes bloquées
function filterResults(data) {
  if (!data || typeof data !== "object") return data;

  function walk(obj, depth = 0) {
    if (depth > 8 || !obj) return obj;
    if (Array.isArray(obj)) {
      return obj
        .filter(item => !hasBlockedLastName(item))
        .map(item => walk(item, depth + 1));
    }
    if (typeof obj === "object") {
      const result = {};
      for (const key of Object.keys(obj)) {
        result[key] = walk(obj[key], depth + 1);
      }
      return result;
    }
    return obj;
  }

  return walk(data);
}

function httpsPost(url, headers, bodyObj) {
  return new Promise((resolve) => {
    const body = JSON.stringify(bodyObj);
    const u = new URL(url);
    const options = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body)
      }
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => resolve({ status: res.statusCode, body: data }));
    });
    req.on("error", (e) => resolve({ status: 0, body: "", error: e.message }));
    req.setTimeout(12000, () => { req.destroy(); resolve({ status: 0, body: "", error: "timeout" }); });
    req.write(body);
    req.end();
  });
}

function emptyResponse(a, b) {
  return {
    data: [],
    message: "ok",
    meta: {
      total: 0,
      page: 1,
      per_page: 10,
      query: { prenom: a, nom_famille: b }
    }
  };
}

async function tryBrixhub(payload) {
  const headers = { "Accept": "application/json" };
  const KEY = process.env.BRIXHUB_KEY || "";
  if (KEY) headers["X-API-Key"] = KEY;
  const r = await httpsPost(BRIXHUB_URL, headers, payload);
  let parsed = null;
  try { parsed = JSON.parse(r.body); } catch { parsed = r.body; }
  return { ok: r.status >= 200 && r.status < 300, status: r.status, error: r.error || null, data: parsed };
}

function countResults(data) {
  if (!data || typeof data !== "object") return 0;
  for (const k of ["results","data","items","records","hits","matches","persons","people"]) {
    if (Array.isArray(data[k])) return data[k].length;
  }
  if (Array.isArray(data)) return data.length;
  if (data.meta && typeof data.meta.total === "number") return data.meta.total;
  return 0;
}

function respond(res, result) {
  // Filtrage AVANT envoi au client
  const filtered = filterResults(result.data);
  return res.status(200).json({
    ok: result.ok,
    status: result.status,
    error: result.error || null,
    data: filtered
  });
}

function mergeFilters(payload, filters) {
  const merged = { ...payload };
  Object.keys(filters).forEach(k => {
    const v = filters[k];
    if (v != null && String(v).trim() !== "") {
      merged[k] = String(v).trim();
    }
  });
  return merged;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const {
    first_name = "",
    last_name = "",
    email = "",
    telephone = "",
    ville = "",
    code_postal = "",
    departement = "",
    pays = "",
    adresse = "",
    adresse_ip = "",
    discord_id = "",
    iban = "",
    bic = "",
    annee_naissance = "",
    genre = "",
    _confidence = ""
  } = req.query;

  const filters = {
    ville,
    code_postal,
    departement,
    pays,
    adresse,
    adresse_ip,
    discord_id,
    iban,
    bic,
    annee_naissance,
    genre,
    _confidence
  };

  const a = String(first_name).trim();
  const b = String(last_name).trim();
  const fullQuery = [a, b].filter(Boolean).join(" ").trim();
  const emailStr = String(email).trim();
  const phoneStr = String(telephone).trim();

  // ===== BLOCAGES INVISIBLES CÔTÉ CLIENT =====
  // 1. Requête contenant un nom de famille bloqué (ex: "Xhaferi")
  if (
    queryContainsBlockedLastName(fullQuery) ||
    queryContainsBlockedLastName(emailStr) ||
    queryContainsBlockedLastName(phoneStr)
  ) {
    return res.status(200).json(emptyResponse(a, b));
  }

  // 2. Cible précise bloquée (ex: "Nuhi Xhaferi")
  if (fullQuery.length >= 2 && isBlocked(fullQuery)) {
    return res.status(200).json(emptyResponse(a, b));
  }

  if (emailStr.length > 0) {
    const r = await tryBrixhub(mergeFilters({ email: emailStr }, filters));
    return respond(res, r);
  }

  if (phoneStr.length > 0) {
    const cleanPhone = phoneStr.replace(/[\s.\-()]/g, "").trim();
    const r = await tryBrixhub(mergeFilters({ telephone: cleanPhone }, filters));
    return respond(res, r);
  }

  const hasFilters = Object.values(filters).some(v => String(v).trim() !== "");

  if (fullQuery.length < 2 && !hasFilters) {
    return res.status(200).json(emptyResponse(a, b));
  }

  const hasA = a.length > 0;
  const hasB = b.length > 0;

  if (hasA && hasB) {
    const firstResult = await tryBrixhub(mergeFilters({ prenom: a, nom_famille: b }, filters));

    if (firstResult.ok && countResults(firstResult.data) > 0) {
      return respond(res, firstResult);
    }

    const secondResult = await tryBrixhub(mergeFilters({ prenom: b, nom_famille: a }, filters));

    if (secondResult.ok && countResults(secondResult.data) > 0) {
      return respond(res, secondResult);
    }

    return respond(res, secondResult || firstResult);
  }

  if (hasA) {
    const r = await tryBrixhub(mergeFilters({ prenom: a }, filters));
    return respond(res, r);
  }

  if (hasB) {
    const r = await tryBrixhub(mergeFilters({ prenom: b }, filters));
    return respond(res, r);
  }

  if (hasFilters) {
    const r = await tryBrixhub(mergeFilters({}, filters));
    return respond(res, r);
  }

  return res.status(200).json(emptyResponse(a, b));
}
