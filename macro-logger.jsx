import { useState, useEffect } from "react";
import { Plus, Trash2, Flame, X, Moon, Sun, Refrigerator, Search, Loader2, Target, Save, Key } from "lucide-react";

const LIGHT = {
  bg: "#F7F5EF",
  panel: "#FFFFFF",
  ink: "#1F2A22",
  inkSoft: "#5C6B60",
  line: "#E4E1D6",
  protein: "#C4603C",
  carbs: "#D9A441",
  fat: "#3E6B5C",
  overlay: "rgba(31,42,34,0.4)",
};

const DARK_THEME = {
  bg: "#000000",
  panel: "#0E0E10",
  ink: "#FFFFFF",
  inkSoft: "#8FA3B8",
  line: "#222429",
  protein: "#7CC4F2",
  carbs: "#A8DDF7",
  fat: "#4FA3E8",
  overlay: "rgba(0,0,0,0.8)",
};

const STORES = ["Costco", "Harris Teeter", "Target"];

const ACTIVITY_LEVELS = [
  { key: "sedentary", label: "Sedentary", desc: "Little to no exercise", mult: 1.2 },
  { key: "light", label: "Light", desc: "1-3 days/week", mult: 1.375 },
  { key: "moderate", label: "Moderate", desc: "3-5 days/week", mult: 1.55 },
  { key: "active", label: "Active", desc: "6-7 days/week", mult: 1.725 },
  { key: "extreme", label: "Extreme", desc: "Physical job + training", mult: 1.9 },
];

const RATE_OPTIONS = [
  { key: "low", label: "Low", lbsPerWeek: 0.5 },
  { key: "moderate", label: "Moderate", lbsPerWeek: 1 },
  { key: "extreme", label: "Extreme", lbsPerWeek: 1.5 },
];

// Standard adult BMI bands (WHO). Matched in order, so `max` is an upper bound.
const BMI_BANDS = [
  { key: "under", label: "Underweight", max: 18.5 },
  { key: "normal", label: "Normal", max: 25 },
  { key: "over", label: "Overweight", max: 30 },
  { key: "obese", label: "Obese", max: Infinity },
];

const DEFAULT_GOALS = { calories: 2200, protein: 150, carbs: 240, fat: 70 };

const STARTER_FOODS = [
  { name: "Chicken breast (150g)", calories: 248, protein: 46, carbs: 0, fat: 5 },
  { name: "White rice (1 cup)", calories: 205, protein: 4, carbs: 45, fat: 0 },
  { name: "Avocado (half)", calories: 120, protein: 1, carbs: 6, fat: 11 },
  { name: "Egg (large)", calories: 72, protein: 6, carbs: 0, fat: 5 },
  { name: "Greek yogurt (1 cup)", calories: 150, protein: 20, carbs: 9, fat: 4 },
  { name: "Peanut butter (2 tbsp)", calories: 190, protein: 7, carbs: 7, fat: 16 },
];

function bmiColor(key, T) {
  if (key === "normal") return T.fat;
  if (key === "obese") return T.protein;
  return T.carbs;
}

function Ring({ value, goal, color, label, unit, T }) {
  const pct = Math.min(value / goal, 1);
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <svg width="84" height="84" viewBox="0 0 84 84">
        <circle cx="42" cy="42" r={r} fill="none" stroke={T.line} strokeWidth="7" />
        <circle
          cx="42"
          cy="42"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          transform="rotate(-90 42 42)"
          style={{ transition: "stroke-dashoffset 0.5s ease" }}
        />
        <text x="42" y="38" textAnchor="middle" fontSize="15" fontWeight="700" fill={T.ink} fontFamily="'DM Mono', monospace">
          {Math.round(value)}
        </text>
        <text x="42" y="52" textAnchor="middle" fontSize="9" fill={T.inkSoft} fontFamily="'DM Mono', monospace">
          /{goal}{unit}
        </text>
      </svg>
      <span style={{ fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", color: T.inkSoft, fontWeight: 600 }}>
        {label}
      </span>
    </div>
  );
}

export default function MacroLogger() {
  const prefersDark =
    typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const [dark, setDark] = useState(prefersDark);
  const T = dark ? DARK_THEME : LIGHT;

  const [tab, setTab] = useState("log"); // "log" | "fridge" | "goals"
  const [entries, setEntries] = useState([]);
  const [fridge, setFridge] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [showFridgeAdd, setShowFridgeAdd] = useState(false);
  const [form, setForm] = useState({ name: "", calories: "", protein: "", carbs: "", fat: "" });
  const [fridgeForm, setFridgeForm] = useState({ name: "", calories: "", protein: "", carbs: "", fat: "", units: "1", servingsPerUnit: "1", servingInfo: "" });

  const [lookupQuery, setLookupQuery] = useState("");
  const [lookupStore, setLookupStore] = useState("Costco");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [lookupResults, setLookupResults] = useState([]);

  // Goals / calculator state
  const [goals, setGoals] = useState(DEFAULT_GOALS);
  const [profile, setProfile] = useState({
    sex: "male",
    age: "",
    heightFt: "",
    heightIn: "",
    weight: "",
    activity: "moderate",
    rate: "moderate",
    direction: "lose",
  });
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [apiKeyDraft, setApiKeyDraft] = useState("");

  const LS_KEY = "macro-logger-data";
  const LS_KEY_API = "macro-logger-api-key";

  // Load persisted data on mount (per-browser, via localStorage — works standalone with no login)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.profile) setProfile(parsed.profile);
        if (parsed.goals) setGoals(parsed.goals);
        if (parsed.entries) setEntries(parsed.entries);
        if (parsed.fridge) setFridge(parsed.fridge);
      }
      const key = localStorage.getItem(LS_KEY_API);
      if (key) setApiKey(key);
    } catch (err) {
      // no saved data yet, or storage unavailable — app still works this session
    } finally {
      setProfileLoaded(true);
    }
  }, []);

  // Persist whenever data changes, once initial load has completed
  useEffect(() => {
    if (!profileLoaded) return;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ profile, goals, entries, fridge }));
    } catch (err) {
      // storage full or unavailable; app still works this session
    }
  }, [profile, goals, entries, fridge, profileLoaded]);

  const saveProfileAndGoals = (nextProfile, nextGoals) => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ profile: nextProfile, goals: nextGoals, entries, fridge }));
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 2000);
    } catch (err) {
      // storage failed silently; app still works this session
    }
  };

  const totals = entries.reduce(
    (acc, e) => ({
      calories: acc.calories + e.calories,
      protein: acc.protein + e.protein,
      carbs: acc.carbs + e.carbs,
      fat: acc.fat + e.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  const fridgeTotals = fridge.reduce(
    (acc, f) => {
      const count = (f.units || 1) * (f.servingsPerUnit || 1);
      return {
        calories: acc.calories + f.calories * count,
        protein: acc.protein + f.protein * count,
        carbs: acc.carbs + f.carbs * count,
        fat: acc.fat + f.fat * count,
      };
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  const addFood = (food) => setEntries([{ ...food, id: Date.now() }, ...entries]);

  const addCustom = () => {
    if (!form.name.trim()) return;
    addFood({
      name: form.name.trim(),
      calories: Number(form.calories) || 0,
      protein: Number(form.protein) || 0,
      carbs: Number(form.carbs) || 0,
      fat: Number(form.fat) || 0,
    });
    setForm({ name: "", calories: "", protein: "", carbs: "", fat: "" });
    setShowAdd(false);
  };

  const addToFridge = () => {
    if (!fridgeForm.name.trim()) return;
    setFridge([
      {
        name: fridgeForm.name.trim(),
        calories: Number(fridgeForm.calories) || 0,
        protein: Number(fridgeForm.protein) || 0,
        carbs: Number(fridgeForm.carbs) || 0,
        fat: Number(fridgeForm.fat) || 0,
        units: Number(fridgeForm.units) || 1,
        servingsPerUnit: Number(fridgeForm.servingsPerUnit) || 1,
        servingInfo: fridgeForm.servingInfo.trim(),
        id: Date.now(),
      },
      ...fridge,
    ]);
    setFridgeForm({ name: "", calories: "", protein: "", carbs: "", fat: "", units: "1", servingsPerUnit: "1", servingInfo: "" });
    setShowFridgeAdd(false);
  };

  const removeEntry = (id) => setEntries(entries.filter((e) => e.id !== id));
  const removeFridgeItem = (id) => setFridge(fridge.filter((f) => f.id !== id));

  const logFromFridge = (item) => {
    addFood({ name: item.name, calories: item.calories, protein: item.protein, carbs: item.carbs, fat: item.fat });
  };

  const runLookup = async () => {
    if (!lookupQuery.trim()) {
      setLookupResults([]);
      setLookupError("");
      return;
    }
    setLookupLoading(true);
    setLookupError("");
    setLookupResults([]);
    try {
      const key = apiKey.trim() || "DEMO_KEY";
      const q = encodeURIComponent(`${lookupQuery} ${lookupStore}`);
      const res = await fetch(
        `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${key}&query=${q}&pageSize=5&dataType=Branded`
      );
      if (!res.ok) {
        if (res.status === 429 || res.status === 403) {
          setLookupError("The shared free key is busy right now — add your own free USDA key in Settings (instant signup, no card) for reliable results.");
        } else {
          setLookupError(`Lookup failed (${res.status}). Try again or enter manually.`);
        }
        return;
      }
      const data = await res.json();
      const foods = (data.foods || []).slice(0, 5).map((f) => {
        const getNutrient = (name) => {
          const n = (f.foodNutrients || []).find((x) => x.nutrientName === name);
          return n ? Math.round(n.value) : 0;
        };
        return {
          name: f.description + (f.brandName ? ` (${f.brandName})` : ""),
          calories: getNutrient("Energy"),
          protein: getNutrient("Protein"),
          carbs: getNutrient("Carbohydrate, by difference"),
          fat: getNutrient("Total lipid (fat)"),
          serving: f.servingSize ? `${f.servingSize}${f.servingSizeUnit || ""}` : "100g",
        };
      });

      if (!foods.length) {
        setLookupError("Couldn't find that product — try a more specific name, or enter it manually.");
      } else {
        setLookupResults(foods);
      }
    } catch (err) {
      setLookupError("Network error: " + (err && err.message ? err.message : String(err)));
    } finally {
      setLookupLoading(false);
    }
  };

  // Live search: auto-run as the user types, once they've typed at least 3 characters
  useEffect(() => {
    if (!lookupQuery.trim() || lookupQuery.trim().length < 3) {
      setLookupResults([]);
      setLookupError("");
      return;
    }
    const timer = setTimeout(() => {
      runLookup();
    }, 450);
    return () => clearTimeout(timer);
  }, [lookupQuery, lookupStore]);

  const applyLookupResult = (item, applyTo) => {
    const filled = {
      name: item.name || lookupQuery,
      calories: String(item.calories ?? ""),
      protein: String(item.protein ?? ""),
      carbs: String(item.carbs ?? ""),
      fat: String(item.fat ?? ""),
    };
    if (applyTo === "log") {
      setForm(filled);
    } else {
      setFridgeForm((prev) => ({ ...prev, ...filled, servingInfo: item.serving || prev.servingInfo }));
    }
    setLookupResults([]);
    setLookupQuery("");
  };

  // Mifflin-St Jeor BMR + activity multiplier + rate-based deficit/surplus
  const calcResult = (() => {
    const age = Number(profile.age);
    const ft = Number(profile.heightFt);
    const inch = Number(profile.heightIn);
    const weightLb = Number(profile.weight);
    if (!age || !weightLb || (!ft && !inch)) return null;

    const heightCm = (ft * 12 + inch) * 2.54;
    const weightKg = weightLb * 0.453592;
    const bmr =
      profile.sex === "male"
        ? 10 * weightKg + 6.25 * heightCm - 5 * age + 5
        : 10 * weightKg + 6.25 * heightCm - 5 * age - 161;

    const activityMult = ACTIVITY_LEVELS.find((a) => a.key === profile.activity)?.mult || 1.55;
    const tdee = bmr * activityMult;

    const rateLbs = RATE_OPTIONS.find((r) => r.key === profile.rate)?.lbsPerWeek || 1;
    const dailyDelta = (rateLbs * 3500) / 7;
    const target = profile.direction === "lose" ? tdee - dailyDelta : tdee + dailyDelta;

    const heightM = heightCm / 100;
    // Band off the rounded value so the label always agrees with the number shown
    // (raw 24.97 displays as 25.0, which would otherwise read as "25.0 Normal").
    const bmi = Math.round((weightKg / (heightM * heightM)) * 10) / 10;
    const band = BMI_BANDS.find((b) => bmi < b.max) || BMI_BANDS[BMI_BANDS.length - 1];

    return {
      bmr: Math.round(bmr),
      tdee: Math.round(tdee),
      target: Math.round(target),
      bmi,
      bmiLabel: band.label,
      bmiKey: band.key,
    };
  })();

  const applyCalculatedGoal = () => {
    if (!calcResult) return;
    const nextGoals = { ...goals, calories: calcResult.target };
    setGoals(nextGoals);
    saveProfileAndGoals(profile, nextGoals);
  };

  const updateProfileField = (field, value) => {
    const next = { ...profile, [field]: value };
    setProfile(next);
  };

  const remaining = goals.calories - totals.calories;

  const inputStyle = {
    padding: "11px 12px",
    borderRadius: 10,
    border: `1px solid ${T.line}`,
    fontSize: 14,
    background: dark ? "#080B12" : "#FFF",
    color: T.ink,
    width: "100%",
    minWidth: 0,
  };

  const pillButtonStyle = (active) => ({
    padding: "8px 4px",
    borderRadius: 9,
    border: `1px solid ${active ? T.fat : T.line}`,
    background: active ? T.fat : "transparent",
    color: active ? "#FFF" : T.inkSoft,
    fontSize: 11.5,
    fontWeight: 700,
  });

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        maxWidth: "100vw",
        overflowX: "hidden",
        background: T.bg,
        fontFamily: "'Inter', -apple-system, sans-serif",
        color: T.ink,
        paddingBottom: 40,
        transition: "background 0.25s ease, color 0.25s ease",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; }
        html, body { margin: 0; padding: 0; overflow-x: hidden; max-width: 100%; }
        button { font-family: inherit; cursor: pointer; }
        input::placeholder { color: ${T.inkSoft}; opacity: 0.7; }
        input:focus { outline: 2px solid ${T.fat}; outline-offset: 1px; }
        input { min-width: 0; max-width: 100%; }
        .spin { animation: spin 0.8s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <div style={{ padding: "28px 20px 20px", maxWidth: 480, width: "100%", margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", color: T.fat, textTransform: "uppercase" }}>
              {tab === "log" ? "Today's log" : tab === "fridge" ? "My fridge" : "Calorie goal"}
            </div>
            <h1 style={{ fontSize: 26, fontWeight: 800, margin: "2px 0 0", letterSpacing: "-0.02em" }}>
              {tab === "log"
                ? remaining >= 0
                  ? `${remaining} kcal left`
                  : `${Math.abs(remaining)} over`
                : tab === "fridge"
                ? `${fridge.length} item${fridge.length === 1 ? "" : "s"} stored`
                : `${goals.calories} kcal / day`}
            </h1>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              onClick={() => {
                setApiKeyDraft(apiKey);
                setShowSettings(true);
              }}
              aria-label="Search settings"
              style={{
                background: T.panel,
                border: `1px solid ${T.line}`,
                borderRadius: 10,
                padding: 8,
                display: "flex",
              }}
            >
              <Key size={16} color={apiKey ? T.fat : T.inkSoft} />
            </button>
            <button
              onClick={() => setDark(!dark)}
              aria-label="Toggle dark mode"
              style={{
                background: T.panel,
                border: `1px solid ${T.line}`,
                borderRadius: 10,
                padding: 8,
                display: "flex",
              }}
            >
              {dark ? <Sun size={16} color={T.carbs} /> : <Moon size={16} color={T.fat} />}
            </button>
            <Flame size={24} color={T.protein} strokeWidth={2.2} />
          </div>
        </div>

        <div
          style={{
            display: "flex",
            marginTop: 18,
            background: T.panel,
            border: `1px solid ${T.line}`,
            borderRadius: 12,
            padding: 4,
            gap: 4,
          }}
        >
          <button onClick={() => setTab("log")} style={{ flex: 1, padding: "9px 0", borderRadius: 9, border: "none", fontWeight: 700, fontSize: 12, background: tab === "log" ? T.fat : "transparent", color: tab === "log" ? "#FFF" : T.inkSoft, transition: "all 0.15s" }}>
            Log
          </button>
          <button onClick={() => setTab("fridge")} style={{ flex: 1, padding: "9px 0", borderRadius: 9, border: "none", fontWeight: 700, fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 4, background: tab === "fridge" ? T.fat : "transparent", color: tab === "fridge" ? "#FFF" : T.inkSoft, transition: "all 0.15s" }}>
            <Refrigerator size={12} /> Fridge
          </button>
          <button onClick={() => setTab("goals")} style={{ flex: 1, padding: "9px 0", borderRadius: 9, border: "none", fontWeight: 700, fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 4, background: tab === "goals" ? T.fat : "transparent", color: tab === "goals" ? "#FFF" : T.inkSoft, transition: "all 0.15s" }}>
            <Target size={12} /> Goals
          </button>
        </div>

        {tab === "log" && (
          <>
            <div style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 18, padding: "20px 12px", marginTop: 18, display: "flex", justifyContent: "space-around" }}>
              <Ring value={totals.protein} goal={goals.protein} color={T.protein} label="Protein" unit="g" T={T} />
              <Ring value={totals.carbs} goal={goals.carbs} color={T.carbs} label="Carbs" unit="g" T={T} />
              <Ring value={totals.fat} goal={goals.fat} color={T.fat} label="Fat" unit="g" T={T} />
            </div>

            <div style={{ marginTop: 24 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: T.inkSoft, textTransform: "uppercase", marginBottom: 10 }}>
                Quick add
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, minWidth: 0 }}>
                {STARTER_FOODS.map((f) => (
                  <button key={f.name} onClick={() => addFood(f)} style={{ textAlign: "left", background: T.panel, border: `1px solid ${T.line}`, borderRadius: 12, padding: "10px 12px", fontSize: 12.5, fontWeight: 600, color: T.ink }}>
                    {f.name}
                    <div style={{ color: T.inkSoft, fontFamily: "'DM Mono', monospace", fontSize: 11, marginTop: 3 }}>{f.calories} kcal</div>
                  </button>
                ))}
              </div>

              {fridge.length > 0 && (
                <>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: T.inkSoft, textTransform: "uppercase", margin: "16px 0 10px" }}>
                    From your fridge
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, minWidth: 0 }}>
                    {fridge.map((f) => (
                      <button key={f.id} onClick={() => logFromFridge(f)} style={{ textAlign: "left", background: T.panel, border: `1px solid ${T.line}`, borderRadius: 12, padding: "10px 12px", fontSize: 12.5, fontWeight: 600, color: T.ink }}>
                        {f.name}
                        <div style={{ color: T.inkSoft, fontFamily: "'DM Mono', monospace", fontSize: 11, marginTop: 3 }}>
                          {f.calories} kcal · {f.units}×{f.servingsPerUnit} left
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              )}

              <button onClick={() => setShowAdd(true)} style={{ width: "100%", marginTop: 10, background: T.ink, color: T.bg, border: "none", borderRadius: 12, padding: "12px", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <Plus size={16} /> Log custom food
              </button>
            </div>

            <div style={{ marginTop: 26 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: T.inkSoft, textTransform: "uppercase", marginBottom: 10 }}>
                Logged ({entries.length})
              </div>
              {entries.length === 0 ? (
                <div style={{ border: `1px dashed ${T.line}`, borderRadius: 12, padding: "24px 16px", textAlign: "center", color: T.inkSoft, fontSize: 13 }}>
                  Nothing logged yet. Tap a food above to get started.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {entries.map((e) => (
                    <div key={e.id} style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 12, padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 600 }}>{e.name}</div>
                        <div style={{ fontSize: 10.5, color: T.inkSoft, fontFamily: "'DM Mono', monospace", marginTop: 4 }}>{e.calories} kcal</div>
                        <div style={{ display: "flex", gap: 10, marginTop: 4, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 10.5, fontFamily: "'DM Mono', monospace", color: T.protein, fontWeight: 700 }}>P {e.protein}g</span>
                          <span style={{ fontSize: 10.5, fontFamily: "'DM Mono', monospace", color: T.carbs, fontWeight: 700 }}>C {e.carbs}g</span>
                          <span style={{ fontSize: 10.5, fontFamily: "'DM Mono', monospace", color: T.fat, fontWeight: 700 }}>F {e.fat}g</span>
                        </div>
                      </div>
                      <button onClick={() => removeEntry(e.id)} style={{ background: "none", border: "none", color: T.inkSoft, padding: 4, flexShrink: 0 }}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {tab === "fridge" && (
          <>
            {fridge.length > 0 && (
              <div style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 16, padding: "16px 18px", marginTop: 18 }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: T.inkSoft, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Total on hand
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, marginTop: 2 }}>{fridgeTotals.calories.toLocaleString()} kcal</div>
                <div style={{ display: "flex", gap: 12, marginTop: 6 }}>
                  <span style={{ fontSize: 11.5, fontFamily: "'DM Mono', monospace", color: T.protein, fontWeight: 700 }}>P {fridgeTotals.protein}g</span>
                  <span style={{ fontSize: 11.5, fontFamily: "'DM Mono', monospace", color: T.carbs, fontWeight: 700 }}>C {fridgeTotals.carbs}g</span>
                  <span style={{ fontSize: 11.5, fontFamily: "'DM Mono', monospace", color: T.fat, fontWeight: 700 }}>F {fridgeTotals.fat}g</span>
                </div>
              </div>
            )}

            <button onClick={() => setShowFridgeAdd(true)} style={{ width: "100%", marginTop: 14, background: T.fat, color: "#FFF", border: "none", borderRadius: 12, padding: "13px", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <Plus size={16} /> Add food to fridge
            </button>

            <div style={{ marginTop: 22 }}>
              {fridge.length === 0 ? (
                <div style={{ border: `1px dashed ${T.line}`, borderRadius: 12, padding: "28px 16px", textAlign: "center", color: T.inkSoft, fontSize: 13 }}>
                  Your fridge is empty. Add groceries here so you can log them in one tap later.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {fridge.map((f) => (
                    <div key={f.id} style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 12, padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 600 }}>{f.name}</div>
                        <div style={{ fontSize: 10.5, color: T.inkSoft, marginTop: 3 }}>
                          {f.units} {f.units === 1 ? "unit" : "units"} · {f.servingsPerUnit} {f.servingsPerUnit === 1 ? "serving" : "servings"} each
                          {f.servingInfo ? ` (${f.servingInfo})` : ""}
                        </div>
                        <div style={{ fontSize: 10.5, color: T.inkSoft, fontFamily: "'DM Mono', monospace", marginTop: 4 }}>{f.calories} kcal / serving</div>
                        <div style={{ display: "flex", gap: 10, marginTop: 4, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 10.5, fontFamily: "'DM Mono', monospace", color: T.protein, fontWeight: 700 }}>P {f.protein}g</span>
                          <span style={{ fontSize: 10.5, fontFamily: "'DM Mono', monospace", color: T.carbs, fontWeight: 700 }}>C {f.carbs}g</span>
                          <span style={{ fontSize: 10.5, fontFamily: "'DM Mono', monospace", color: T.fat, fontWeight: 700 }}>F {f.fat}g</span>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 10, alignItems: "center", flexShrink: 0 }}>
                        <button onClick={() => logFromFridge(f)} style={{ background: T.bg, border: `1px solid ${T.line}`, borderRadius: 8, padding: "6px 10px", fontSize: 11, fontWeight: 700, color: T.fat }}>
                          Log
                        </button>
                        <button onClick={() => removeFridgeItem(f.id)} style={{ background: "none", border: "none", color: T.inkSoft, padding: 4 }}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {tab === "goals" && (
          <div style={{ marginTop: 18 }}>
            <div style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 16, padding: 18 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.inkSoft, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
                Your details
              </div>

              <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                <button onClick={() => updateProfileField("sex", "male")} style={{ ...pillButtonStyle(profile.sex === "male"), flex: 1 }}>Male</button>
                <button onClick={() => updateProfileField("sex", "female")} style={{ ...pillButtonStyle(profile.sex === "female"), flex: 1 }}>Female</button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10, minWidth: 0 }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: T.inkSoft, textTransform: "uppercase" }}>Age</span>
                  <input type="number" value={profile.age} onChange={(e) => updateProfileField("age", e.target.value)} style={inputStyle} />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: T.inkSoft, textTransform: "uppercase" }}>Weight (lb)</span>
                  <input type="number" value={profile.weight} onChange={(e) => updateProfileField("weight", e.target.value)} style={inputStyle} />
                </label>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14, minWidth: 0 }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: T.inkSoft, textTransform: "uppercase" }}>Height (ft)</span>
                  <input type="number" value={profile.heightFt} onChange={(e) => updateProfileField("heightFt", e.target.value)} style={inputStyle} />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: T.inkSoft, textTransform: "uppercase" }}>Height (in)</span>
                  <input type="number" value={profile.heightIn} onChange={(e) => updateProfileField("heightIn", e.target.value)} style={inputStyle} />
                </label>
              </div>

              <div style={{ fontSize: 10.5, fontWeight: 700, color: T.inkSoft, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
                Activity level
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
                {ACTIVITY_LEVELS.map((a) => (
                  <button
                    key={a.key}
                    onClick={() => updateProfileField("activity", a.key)}
                    style={{
                      textAlign: "left",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "9px 12px",
                      borderRadius: 10,
                      border: `1px solid ${profile.activity === a.key ? T.fat : T.line}`,
                      background: profile.activity === a.key ? (dark ? "rgba(87,176,138,0.12)" : "rgba(62,107,92,0.08)") : "transparent",
                    }}
                  >
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: T.ink }}>{a.label}</span>
                    <span style={{ fontSize: 10.5, color: T.inkSoft }}>{a.desc}</span>
                  </button>
                ))}
              </div>

              <div style={{ fontSize: 10.5, fontWeight: 700, color: T.inkSoft, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
                Goal
              </div>
              <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                <button onClick={() => updateProfileField("direction", "lose")} style={{ ...pillButtonStyle(profile.direction === "lose"), flex: 1 }}>Lose</button>
                <button onClick={() => updateProfileField("direction", "gain")} style={{ ...pillButtonStyle(profile.direction === "gain"), flex: 1 }}>Gain</button>
              </div>

              <div style={{ fontSize: 10.5, fontWeight: 700, color: T.inkSoft, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
                Rate per week
              </div>
              <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
                {RATE_OPTIONS.map((r) => (
                  <button key={r.key} onClick={() => updateProfileField("rate", r.key)} style={{ ...pillButtonStyle(profile.rate === r.key), flex: 1 }}>
                    {r.label}
                    <div style={{ fontWeight: 500, fontSize: 9.5, marginTop: 2 }}>{r.lbsPerWeek} lb</div>
                  </button>
                ))}
              </div>

              {calcResult ? (
                <div style={{ borderTop: `1px solid ${T.line}`, paddingTop: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: T.inkSoft, marginBottom: 4 }}>
                    <span>BMR</span>
                    <span style={{ fontFamily: "'DM Mono', monospace" }}>{calcResult.bmr} kcal</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: T.inkSoft, marginBottom: 10 }}>
                    <span>Maintenance (TDEE)</span>
                    <span style={{ fontFamily: "'DM Mono', monospace" }}>{calcResult.tdee} kcal</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, color: T.inkSoft, marginBottom: 10 }}>
                    <span>BMI</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <span style={{ fontFamily: "'DM Mono', monospace" }}>{calcResult.bmi}</span>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          padding: "2px 7px",
                          borderRadius: 999,
                          color: bmiColor(calcResult.bmiKey, T),
                          border: `1px solid ${bmiColor(calcResult.bmiKey, T)}`,
                        }}
                      >
                        {calcResult.bmiLabel}
                      </span>
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>Daily target</span>
                    <span style={{ fontSize: 20, fontWeight: 800, fontFamily: "'DM Mono', monospace", color: T.fat }}>{calcResult.target} kcal</span>
                  </div>
                  <button
                    onClick={applyCalculatedGoal}
                    style={{ width: "100%", background: T.fat, color: "#FFF", border: "none", borderRadius: 10, padding: "13px", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                  >
                    <Save size={15} /> {savedNotice ? "Saved!" : "Set as my daily goal"}
                  </button>
                </div>
              ) : (
                <div style={{ fontSize: 12, color: T.inkSoft, borderTop: `1px solid ${T.line}`, paddingTop: 14 }}>
                  Fill in your age, height, and weight to calculate your daily target.
                </div>
              )}
            </div>

            <div style={{ marginTop: 14, fontSize: 11, color: T.inkSoft, textAlign: "center" }}>
              Your saved goal stays put even if you close this — {goals.calories} kcal/day right now.
            </div>
          </div>
        )}
      </div>

      {showAdd && (
        <div style={{ position: "fixed", inset: 0, background: T.overlay, display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 10 }} onClick={() => setShowAdd(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: T.panel, width: "100%", maxWidth: 480, borderRadius: "20px 20px 0 0", padding: "20px 20px 28px", maxHeight: "85vh", overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontSize: 16, fontWeight: 800 }}>Log a food</div>
              <button onClick={() => setShowAdd(false)} style={{ background: "none", border: "none", color: T.inkSoft }}>
                <X size={20} />
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ background: T.bg, border: `1px solid ${T.line}`, borderRadius: 12, padding: 12 }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: T.inkSoft, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
                  Search a store product
                </div>
                <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                  {STORES.map((s) => (
                    <button key={s} onClick={() => setLookupStore(s)} style={{ flex: 1, padding: "7px 4px", borderRadius: 8, border: `1px solid ${lookupStore === s ? T.fat : T.line}`, background: lookupStore === s ? T.fat : "transparent", color: lookupStore === s ? "#FFF" : T.inkSoft, fontSize: 11, fontWeight: 700 }}>
                      {s}
                    </button>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <input placeholder="e.g. Kirkland rotisserie chicken" value={lookupQuery} onChange={(e) => setLookupQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && runLookup()} style={{ ...inputStyle, flex: 1 }} />
                  <button onClick={runLookup} disabled={lookupLoading} style={{ background: T.ink, color: T.bg, border: "none", borderRadius: 10, padding: "0 14px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {lookupLoading ? <Loader2 size={16} className="spin" /> : <Search size={16} />}
                  </button>
                </div>
                {lookupError && <div style={{ fontSize: 11, color: T.protein, marginTop: 6 }}>{lookupError}</div>}
                {lookupResults.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10, maxHeight: 260, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
                    {lookupResults.map((item, i) => (
                      <button key={i} onClick={() => applyLookupResult(item, "log")} style={{ textAlign: "left", background: T.panel, border: `1px solid ${T.line}`, borderRadius: 10, padding: "9px 11px", flexShrink: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 700 }}>{item.name}</div>
                        <div style={{ fontSize: 10.5, color: T.inkSoft, fontFamily: "'DM Mono', monospace", marginTop: 2 }}>
                          {item.calories} kcal · P{item.protein} C{item.carbs} F{item.fat}{item.serving ? ` · ${item.serving}` : ""}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ fontSize: 10.5, fontWeight: 700, color: T.inkSoft, textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "center" }}>
                — or enter manually —
              </div>

              <input placeholder="Food name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inputStyle} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, minWidth: 0 }}>
                {[
                  { k: "calories", label: "Calories" },
                  { k: "protein", label: "Protein (g)" },
                  { k: "carbs", label: "Carbs (g)" },
                  { k: "fat", label: "Fat (g)" },
                ].map(({ k, label }) => (
                  <label key={k} style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: T.inkSoft, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</span>
                    <input type="number" value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} style={{ ...inputStyle, width: "100%" }} />
                  </label>
                ))}
              </div>
              <button onClick={addCustom} style={{ marginTop: 4, background: T.fat, color: "#FFF", border: "none", borderRadius: 10, padding: "13px", fontSize: 14, fontWeight: 700 }}>
                Add to log
              </button>
            </div>
          </div>
        </div>
      )}

      {showFridgeAdd && (
        <div style={{ position: "fixed", inset: 0, background: T.overlay, display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 10 }} onClick={() => setShowFridgeAdd(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: T.panel, width: "100%", maxWidth: 480, borderRadius: "20px 20px 0 0", padding: "20px 20px 28px", maxHeight: "85vh", overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontSize: 16, fontWeight: 800 }}>Add to fridge</div>
              <button onClick={() => setShowFridgeAdd(false)} style={{ background: "none", border: "none", color: T.inkSoft }}>
                <X size={20} />
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ background: T.bg, border: `1px solid ${T.line}`, borderRadius: 12, padding: 12 }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: T.inkSoft, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
                  Search a store product
                </div>
                <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                  {STORES.map((s) => (
                    <button key={s} onClick={() => setLookupStore(s)} style={{ flex: 1, padding: "7px 4px", borderRadius: 8, border: `1px solid ${lookupStore === s ? T.fat : T.line}`, background: lookupStore === s ? T.fat : "transparent", color: lookupStore === s ? "#FFF" : T.inkSoft, fontSize: 11, fontWeight: 700 }}>
                      {s}
                    </button>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <input placeholder="e.g. Kirkland rotisserie chicken" value={lookupQuery} onChange={(e) => setLookupQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && runLookup()} style={{ ...inputStyle, flex: 1 }} />
                  <button onClick={runLookup} disabled={lookupLoading} style={{ background: T.ink, color: T.bg, border: "none", borderRadius: 10, padding: "0 14px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {lookupLoading ? <Loader2 size={16} className="spin" /> : <Search size={16} />}
                  </button>
                </div>
                {lookupError && <div style={{ fontSize: 11, color: T.protein, marginTop: 6 }}>{lookupError}</div>}
                {lookupResults.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10, maxHeight: 260, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
                    {lookupResults.map((item, i) => (
                      <button key={i} onClick={() => applyLookupResult(item, "fridge")} style={{ textAlign: "left", background: T.panel, border: `1px solid ${T.line}`, borderRadius: 10, padding: "9px 11px", flexShrink: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 700 }}>{item.name}</div>
                        <div style={{ fontSize: 10.5, color: T.inkSoft, fontFamily: "'DM Mono', monospace", marginTop: 2 }}>
                          {item.calories} kcal · P{item.protein} C{item.carbs} F{item.fat}{item.serving ? ` · ${item.serving}` : ""}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ fontSize: 10.5, fontWeight: 700, color: T.inkSoft, textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "center" }}>
                — or enter manually —
              </div>

              <input placeholder="Food or grocery name" value={fridgeForm.name} onChange={(e) => setFridgeForm({ ...fridgeForm, name: e.target.value })} style={inputStyle} />
              <input placeholder="Serving size (e.g. 2 oz / 56g)" value={fridgeForm.servingInfo} onChange={(e) => setFridgeForm({ ...fridgeForm, servingInfo: e.target.value })} style={inputStyle} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, minWidth: 0 }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: T.inkSoft, textTransform: "uppercase", letterSpacing: "0.04em" }}>Units on hand</span>
                  <input type="number" value={fridgeForm.units} onChange={(e) => setFridgeForm({ ...fridgeForm, units: e.target.value })} style={{ ...inputStyle, width: "100%" }} />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: T.inkSoft, textTransform: "uppercase", letterSpacing: "0.04em" }}>Servings / unit</span>
                  <input type="number" value={fridgeForm.servingsPerUnit} onChange={(e) => setFridgeForm({ ...fridgeForm, servingsPerUnit: e.target.value })} style={{ ...inputStyle, width: "100%" }} />
                </label>
              </div>
              <div style={{ fontSize: 11, color: T.inkSoft, fontWeight: 600, marginTop: 2 }}>Per serving:</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, minWidth: 0 }}>
                {[
                  { k: "calories", label: "Calories" },
                  { k: "protein", label: "Protein (g)" },
                  { k: "carbs", label: "Carbs (g)" },
                  { k: "fat", label: "Fat (g)" },
                ].map(({ k, label }) => (
                  <label key={k} style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: T.inkSoft, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</span>
                    <input type="number" value={fridgeForm[k]} onChange={(e) => setFridgeForm({ ...fridgeForm, [k]: e.target.value })} style={{ ...inputStyle, width: "100%" }} />
                  </label>
                ))}
              </div>
              <button onClick={addToFridge} style={{ marginTop: 4, background: T.fat, color: "#FFF", border: "none", borderRadius: 10, padding: "13px", fontSize: 14, fontWeight: 700 }}>
                Add to fridge
              </button>
            </div>
          </div>
        </div>
      )}

      {showSettings && (
        <div style={{ position: "fixed", inset: 0, background: T.overlay, display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 10 }} onClick={() => setShowSettings(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: T.panel, width: "100%", maxWidth: 480, borderRadius: "20px 20px 0 0", padding: "20px 20px 28px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontSize: 16, fontWeight: 800 }}>Product search settings</div>
              <button onClick={() => setShowSettings(false)} style={{ background: "none", border: "none", color: T.inkSoft }}>
                <X size={20} />
              </button>
            </div>
            <div style={{ fontSize: 12.5, color: T.inkSoft, lineHeight: 1.5, marginBottom: 12 }}>
              Store product search uses the free USDA FoodData Central database and works out of the box — no key needed. If you search a lot and hit rate limits, get your own free key (instant, no card) at{" "}
              <span style={{ color: T.fat, fontWeight: 700 }}>fdc.nal.usda.gov/api-key-signup</span>. Saved only in this browser.
            </div>
            <input
              placeholder="Optional: your own USDA API key"
              value={apiKeyDraft}
              onChange={(e) => setApiKeyDraft(e.target.value)}
              style={inputStyle}
              type="password"
            />
            <button
              onClick={() => {
                setApiKey(apiKeyDraft.trim());
                try {
                  localStorage.setItem(LS_KEY_API, apiKeyDraft.trim());
                } catch (err) {}
                setShowSettings(false);
              }}
              style={{ marginTop: 10, width: "100%", background: T.fat, color: "#FFF", border: "none", borderRadius: 10, padding: "13px", fontSize: 14, fontWeight: 700 }}
            >
              Save key
            </button>
            {apiKey && (
              <button
                onClick={() => {
                  setApiKey("");
                  setApiKeyDraft("");
                  try {
                    localStorage.removeItem(LS_KEY_API);
                  } catch (err) {}
                }}
                style={{ marginTop: 8, width: "100%", background: "none", border: `1px solid ${T.line}`, color: T.inkSoft, borderRadius: 10, padding: "11px", fontSize: 13, fontWeight: 600 }}
              >
                Remove saved key
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
