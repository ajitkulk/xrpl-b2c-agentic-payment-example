// Weather from a free public data source: Open-Meteo (no API key required).
//   1. Geocode the city name -> lat/lon
//   2. Fetch current conditions
//   3. Render a short human-readable report

const GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";

// WMO weather interpretation codes -> text.
const WMO = {
  0: "clear sky",
  1: "mainly clear",
  2: "partly cloudy",
  3: "overcast",
  45: "fog",
  48: "depositing rime fog",
  51: "light drizzle",
  53: "moderate drizzle",
  55: "dense drizzle",
  56: "light freezing drizzle",
  57: "dense freezing drizzle",
  61: "slight rain",
  63: "moderate rain",
  65: "heavy rain",
  66: "light freezing rain",
  67: "heavy freezing rain",
  71: "slight snowfall",
  73: "moderate snowfall",
  75: "heavy snowfall",
  77: "snow grains",
  80: "slight rain showers",
  81: "moderate rain showers",
  82: "violent rain showers",
  85: "slight snow showers",
  86: "heavy snow showers",
  95: "thunderstorm",
  96: "thunderstorm with slight hail",
  99: "thunderstorm with heavy hail",
};

async function fetchJson(url) {
  const res = await fetch(url, { headers: { "user-agent": "xrpl-x402-weather-demo" } });
  if (!res.ok) throw new Error(`weather source responded ${res.status}`);
  return res.json();
}

export async function getWeatherText(city) {
  const geo = await fetchJson(
    `${GEOCODE_URL}?name=${encodeURIComponent(city)}&count=1&language=en&format=json`,
  );
  const place = geo.results?.[0];
  if (!place) throw new Error(`could not find a city named "${city}"`);

  const { latitude, longitude, name, country, admin1 } = place;
  const data = await fetchJson(
    `${FORECAST_URL}?latitude=${latitude}&longitude=${longitude}` +
      `&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code` +
      `&temperature_unit=celsius&wind_speed_unit=kmh`,
  );

  const c = data.current;
  const condition = WMO[c.weather_code] ?? `code ${c.weather_code}`;
  const where = [name, admin1, country].filter(Boolean).join(", ");

  const text =
    `Weather in ${where}: ${condition}, ${c.temperature_2m}°C ` +
    `(feels like ${c.apparent_temperature}°C). ` +
    `Humidity ${c.relative_humidity_2m}%, wind ${c.wind_speed_10m} km/h.`;

  return {
    text,
    resolved: where,
    condition,
    temperatureC: c.temperature_2m,
    feelsLikeC: c.apparent_temperature,
    humidity: c.relative_humidity_2m,
    windKmh: c.wind_speed_10m,
  };
}
