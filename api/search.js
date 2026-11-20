const https = require('https');

// LA BONNE URL EST ICI :
const VORTEX_URL = "https://brixhub.ru/api/v1/search";

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
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const apiKey = process.env.VORTEX_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ ok: false, error: "ERREUR: La clé VORTEX_API_KEY est introuvable dans Vercel." });
  }

  const payload = req.method === 'GET' ? req.query : req.body;
  const cleanPayload = {};
  Object.keys(payload).forEach(key => {
    if (payload[key] && String(payload[key]).trim() !== "") {
      cleanPayload[key] = String(payload[key]).trim();
    }
  });

  // On envoie la clé de deux façons différentes pour être sûr que l'API l'accepte
  const headers = {
    "Accept": "application/json",
    "Authorization": `Bearer ${apiKey}`,
    "X-API-Key": apiKey 
  };

  try {
    const response = await httpsPost(VORTEX_URL, headers, cleanPayload);
    
    let parsedData = null;
    try { parsedData = JSON.parse(response.body); } catch { parsedData = response.body; }

    if (response.status >= 200 && response.status < 300) {
      return res.status(200).json({ ok: true, data: parsedData });
    } else {
      // Si BrixHub refuse, on affiche le code et le message exact
      return res.status(response.status || 500).json({ 
        ok: false, 
        error: `L'API a répondu (Code ${response.status}).`, 
        details: parsedData,
        rawBody: response.body
      });
    }
  } catch (error) {
    return res.status(500).json({ ok: false, error: `Erreur de connexion : ${error.message}` });
  }
};
