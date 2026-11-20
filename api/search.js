const https = require('https');

const VORTEX_URL = "https://brixhub.ru/api/v1/search";

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const apiKey = process.env.VORTEX_API_KEY;
  if (!apiKey) {
    console.log("ERREUR: VORTEX_API_KEY est absente de Vercel");
    return res.status(500).json({ ok: false, error: "Clé API absente." });
  }

  const payload = req.method === 'GET' ? req.query : req.body;
  const cleanPayload = {};
  Object.keys(payload).forEach(key => {
    if (payload[key] && String(payload[key]).trim() !== "") {
      cleanPayload[key] = String(payload[key]).trim();
    }
  });

  console.log("➡️ Payload envoyé à BrixHub :", JSON.stringify(cleanPayload));

  const postData = JSON.stringify(cleanPayload);
  const u = new URL(VORTEX_URL);

  const options = {
    hostname: u.hostname,
    path: u.pathname + u.search,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(postData),
      "X-API-Key": apiKey,
      "Authorization": `Bearer ${apiKey}`
    }
  };

  try {
    const response = await new Promise((resolve, reject) => {
      const request = https.request(options, (response) => {
        let body = "";
        response.on("data", chunk => body += chunk);
        response.on("end", () => {
          console.log("⬅️ Réponse brute de BrixHub (Status " + response.statusCode + ") :", body);
          resolve({ status: response.statusCode, body: body });
        });
      });
      request.on("error", reject);
      request.setTimeout(12000, () => { request.destroy(); reject(new Error("Timeout API")); });
      request.write(postData);
      request.end();
    });

    let parsed = null;
    try { parsed = JSON.parse(response.body); } catch (e) { parsed = { rawText: response.body }; }

    if (response.status >= 200 && response.status < 300) {
      return res.status(200).json({ ok: true, data: parsed });
    } else {
      return res.status(response.status).json({ 
        ok: false, 
        error: "Erreur API BrixHub (Code " + response.status + ")",
        details: parsed
      });
    }
  } catch (error) {
    console.log("💥 Crash de la fonction :", error.message);
    return res.status(500).json({ ok: false, error: error.message });
  }
};
