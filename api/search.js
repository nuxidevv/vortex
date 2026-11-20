import https from "https";

const VORTEX_URL = "https://api.brixhub.ru/api/v1/search";

// Fonction utilitaire pour faire une requête POST HTTPS
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

// Fonction principale exportée pour Vercel
export default async function handler(req, res) {
  const apiKey = process.env.VORTEX_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ 
      ok: false, 
      error: "Configuration manquante." 
    });
  }

  // 2. Construire le payload à partir des paramètres de la requête (query string)
  // Le frontend envoie les critères en GET (ex: ?prenom=Jean&nom_famille=Dupont)
  const payload = { ...req.query };

  // 3. Préparer les en-têtes pour l'API externe
  const headers = {
    "Accept": "application/json",
    // La plupart des API attendent "Authorization: Bearer <clé>" ou "X-API-Key".
    // Adapte le nom de l'en-tête selon la documentation de api.brixhub.ru.
    "Authorization": `Bearer ${apiKey}` 
  };

  try {
    // 4. Appeler l'API externe avec la clé secrète
    const response = await httpsPost(VORTEX_URL, headers, payload);
    
    let parsedData = null;
    try { 
      parsedData = JSON.parse(response.body); 
    } catch { 
      parsedData = response.body; 
    }

    // 5. Renvoyer la réponse au frontend
    if (response.status >= 200 && response.status < 300) {
      return res.status(200).json({ ok: true, data: parsedData });
    } else {
      return res.status(response.status || 500).json({ 
        ok: false, 
        error: response.error || "Erreur de l'API externe", 
        details: parsedData 
      });
    }
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}
