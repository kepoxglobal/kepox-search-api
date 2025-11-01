// === KEPOX Search API ===
// يعتمد على Express و node-fetch

const fetch = require("node-fetch");
const express = require("express");
const app = express();

// Render يوفر متغير PORT تلقائياً
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("🚀 Kepox Search API is running successfully on Render!");
});

// === /search endpoint ===
app.get("/search", async (req, res) => {
  try {
    const { q, country } = req.query;
    if (!q) return res.status(400).json({ error: "Please provide a search query (q)" });

    // روابط ملفات Kepox
    const carsURL = "https://kepox.com/wp-content/uploads/2025/10/cars-full.json";
    const countriesURL = "https://kepox.com/wp-content/uploads/2025/10/countries_cities.json";

    // جلب الملفات من موقعك
    const [carsRes, countriesRes] = await Promise.all([
      fetch(carsURL),
      fetch(countriesURL)
    ]);

    const carsData = await carsRes.json();
    const countriesData = await countriesRes.json();

    // نحول كائن السيارات إلى مصفوفة قابلة للبحث
    const carsArray = Object.entries(carsData).flatMap(([brand, models]) => {
      if (Array.isArray(models)) {
        return models.map(model => ({ brand, model }));
      } else if (typeof models === "object") {
        return Object.keys(models).map(key => ({ brand, model: key }));
      } else {
        return [{ brand, model: String(models) }];
      }
    });

    // فلترة حسب الكلمة المفتاحية
    const query = q.toLowerCase();
    const results = carsArray.filter(car =>
      `${car.brand} ${car.model}`.toLowerCase().includes(query)
    );

    // لو أضفت لاحقاً فلترة حسب الدولة:
    let countryInfo = null;
    if (country) {
      const normalizedCountry = country.toLowerCase();
      const foundCountry = Object.keys(countriesData).find(
        c => c.toLowerCase().includes(normalizedCountry)
      );
      if (foundCountry) {
        countryInfo = {
          country: foundCountry,
          cities: countriesData[foundCountry]
        };
      }
    }

    res.json({
      query: q,
      country: countryInfo ? countryInfo.country : null,
      totalResults: results.length,
      results: results.slice(0, 50), // نرجع أول 50 نتيجة فقط
      ...(countryInfo ? { countryData: countryInfo } : {})
    });

  } catch (err) {
    console.error("Error fetching JSON:", err);
    res.status(500).json({ error: "Failed to fetch JSON files" });
  }
});

// ✅ السطر المهم الذي يجعل السيرفر يعمل على Render
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
