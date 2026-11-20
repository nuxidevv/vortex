const https = require('https');

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

module.exports = async function handler(req, res) {
  // Gestion CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Vérification de la clé
  const apiKey = process.env.VORTEX_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ ok: false, error: "Clé API manquante dans Vercel (VORTEX_API_KEY)." });
  }

  // Récupération des paramètres
  const payload = req.method === 'GET' ? req.query : req.body;
  const cleanPayload = {};
  Object.keys(payload).forEach(key => {
    if (payload[key] && String(payload[key]).trim() !== "") {
      cleanPayload[key] = String(payload[key]).trim();
    }
  });

  if (Object.keys(cleanPayload).length === 0) {
    return res.status(400).json({ ok: false, error: "Aucun critère de recherche fourni." });
  }

  // Préparation de la requête
  const headers = {
    "Accept": "application/json",
    "Authorization": `Bearer ${apiKey}` 
  };

  try {
    const response = await httpsPost(VORTEX_URL, headers, cleanPayload);
    
    let parsedData = null;
    try { parsedData = JSON.parse(response.body); } catch { parsedData = response.body; }

    // Si l'API répond correctement
    if (response.status >= 200 && response.status < 300) {
      return res.status(200).json({ ok: true, data: parsedData });
    } 
    // Si la clé est mauvaise
    else if (response.status === 401 || response.status === 403) {
      return res.status(401).json({ ok: false, error: "Clé API refusée par BrixHub (401/403)." });
    } 
    // Autres erreurs
    else {
      return res.status(response.status || 500).json({ 
        ok: false, 
        error: `Erreur API externe (Code ${response.status})`, 
        details: parsedData 
      });
    }
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
};
