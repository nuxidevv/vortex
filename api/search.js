import https from "https";

const VORTEX_URL = "https://api.brixhub.ru/api/v1/search";

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
    meta: { total: 0, page: 1, per_page: 10, query: { prenom: a, nom_famille: b } }
  };
}

async function tryVortex(payload) {
  const headers = { "Accept": "application/json" };
  const r = await httpsPost(VORTEX_URL, headers, payload);
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
  return res.status(200).json({
    ok: result.ok, status: result.status, error: result.error || null, data: result.data
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
    first_name = "", last_name = "", email = "", telephone = "",
    ville = "", code_postal = "", departement = "", pays = "", adresse = "",
    adresse_ip = "", discord_id = "", iban = "", bic = "", annee_naissance = "", genre = "", _confidence = ""
  } = req.query;

  const filters = {
    ville, code_postal, departement, pays, adresse, adresse_ip, discord_id, iban, bic, annee_naissance, genre, _confidence
  };

  const a = String(first_name).trim();
  const b = String(last_name).trim();
  const isEmailSearch = String(email).trim().length > 0;
  const isPhoneSearch = String(telephone).trim().length > 0;

  // Si on a un email, un téléphone, un nom, ou une combinaison, on envoie tout d'un coup
  if (isEmailSearch || isPhoneSearch || (a.length > 0 && b.length > 0)) {
    let payload = mergeFilters({}, filters);
    
    if (a) payload.prenom = a;
    if (b) payload.nom_famille = b;
    if (isEmailSearch) payload.email = String(email).trim();
    if (isPhoneSearch) payload.telephone = String(telephone).replace(/[\s.\-()]/g, "").trim();
    
    const firstResult = await tryVortex(payload);
    
    // Si ça ne donne rien et qu'on avait un nom/prénom, on tente l'inversion
    if (a && b && (!firstResult.ok || countResults(firstResult.data) === 0)) {
       let invertedPayload = { ...payload };
       invertedPayload.prenom = b;
       invertedPayload.nom_famille = a;
       const secondResult = await tryVortex(invertedPayload);
       if (secondResult.ok && countResults(secondResult.data) > 0) return respond(res, secondResult);
    }
    
    return respond(res, firstResult);
  }

  // Si uniquement un des deux noms est fourni
  if (a.length > 0 || b.length > 0) {
    const queryName = a || b;
    const r = await tryVortex(mergeFilters({ prenom: queryName }, filters));
    return respond(res, r);
  }

  if (Object.values(filters).some(v => String(v).trim() !== "")) {
    const r = await tryVortex(mergeFilters({}, filters));
    return respond(res, r);
  }

  return res.status(200).json(emptyResponse(a, b));
}
