// Minimal Kepox Search API — Express 5 + Elasticsearch proxy
const express = require('express');
const fetch = require('node-fetch');

const app = express();

// ---- Config via env ----
const PORT         = process.env.PORT || 3000;
const ES_URL       = process.env.ES_URL || "";            // مثال: https://xxxx.es.io:9243
const ES_API_KEY   = process.env.ES_API_KEY || "";        // Base64 API Key من Elastic Cloud
const ES_INDEX     = process.env.ES_INDEX || "cars";      // اسم الـindex
const CORS_ORIGIN  = process.env.CORS_ORIGIN || "*";      // يفضّل https://kepox.com

// ---- CORS بسيط ----
app.use((req,res,next)=>{
  res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods','GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.get('/health', (_req,res)=> res.json({ok:true}));

// Normalize helper
const norm = s => String(s||"").trim();

// ---- /search ----
// Query params المقبولة: q, country, city, make, model, year, budget
app.get('/search', async (req, res) => {
  try {
    const { q, country, city, make, model, year, budget } = req.query;
    // لو ES غير مكوّن نعيد رسالة واضحة
    if (!ES_URL || !ES_API_KEY) {
      return res.status(503).json({
        ok:false,
        error:"Elasticsearch is not configured on the server (ES_URL / ES_API_KEY)."
      });
    }

    // نبني ES query: مزيج من full-text + فلاتر دقيقة
    const must = [];
    const should = [];
    const filter = [];

    const qText = norm(q);
    if (qText) {
      should.push(
        { multi_match: { query: qText, fields: ["title^4","model^4","brand^3","description^1"], type: "most_fields", fuzziness: "AUTO" } },
        { match_phrase: { model: { query: qText, slop: 1, boost: 5 } } }, // يدعم "Camry" بدقة
        { match_phrase: { brand: { query: qText, slop: 1, boost: 3 } } }
      );
    }

    if (norm(make))   must.push({ match: { brand: { query: norm(make),   operator: "and" } } });
    if (norm(model))  must.push({ match: { model: { query: norm(model),  operator: "and" } } });
    if (norm(country))filter.push({ term:  { country_kw: norm(country) } });
    if (norm(city))   filter.push({ term:  { city_kw:    norm(city)    } });

    const y = parseInt(year || "", 10);
    if (!isNaN(y))    filter.push({ term:  { year: y } });

    const b = parseInt(String(budget||"").replace(/[^\d]/g,''),10);
    if (!isNaN(b))    filter.push({ range: { price_usd: { lte: b } } });

    const body = {
      size: 24,
      query: {
        bool: {
          must,
          should,
          filter,
          minimum_should_match: should.length ? 1 : 0
        }
      },
      sort: [
        { _score: "desc" },
        { year: "desc" }
      ]
    };

    const url = `${ES_URL.replace(/\/+$/,'')}/${encodeURIComponent(ES_INDEX)}/_search`;
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `ApiKey ${ES_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    const data = await r.json();
    if (!r.ok) {
      return res.status(500).json({ ok:false, error: data.error || data });
    }

    // نُرجِع تنسيق بسيط تقرأه صفحة النتائج
    const hits = (data.hits?.hits || []).map(h => {
      const s = h._source || {};
      return {
        id: h._id,
        score: h._score,
        title: s.title || `${s.brand || ''} ${s.model || ''} ${s.year || ''}`.trim(),
        brand: s.brand, model: s.model, year: s.year,
        country: s.country, city: s.city,
        price_usd: s.price_usd, currency: s.currency,
        image: s.image, url: s.url, source: s.source
      };
    });

    res.json({ ok:true, total: data.hits?.total?.value || 0, hits });
  } catch (e) {
    res.status(500).json({ ok:false, error: e.message || e });
  }
});

app.listen(PORT, () => {
  console.log(`Kepox Search API running on :${PORT}`);
});
