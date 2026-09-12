import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";
import { readTodaySteps, isNativeAndroid } from "./health";
import type { FoodEntry } from "./types";

const today = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

type LocalState = {
  calorieGoal: number;
  proteinGoal: number;
  fiberGoal: number;
  stepsGoal: number;
  steps: number;
  stepsSource: "manual" | "health_connect";
  weight?: number | null;
  entries: FoodEntry[];
};

type PeriodSummary = {
  days: number;
  calories: number;
  protein: number;
  steps: number;
};

function dateKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function summarizePeriod(start: Date, end: Date, currentDate: string, currentState: LocalState): PeriodSummary {
  const summary: PeriodSummary = { days: 0, calories: 0, protein: 0, steps: 0 };
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  const last = new Date(end);
  last.setHours(0, 0, 0, 0);

  while (cursor <= last) {
    const day = dateKey(cursor);
    let saved: LocalState | null = day === currentDate ? currentState : null;
    if (!saved) {
      const raw = localStorage.getItem(`jurnal:${day}`);
      if (raw) {
        try { saved = JSON.parse(raw) as LocalState; } catch { saved = null; }
      }
    }

    if (saved && (saved.entries.length > 0 || saved.steps > 0)) {
      summary.days += 1;
      summary.steps += Number(saved.steps || 0);
      for (const entry of saved.entries) {
        summary.calories += Number(entry.calories || 0);
        summary.protein += Number(entry.protein_g || 0);
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return summary;
}

const DEFAULT: LocalState = {
  calorieGoal: 1800,
  proteinGoal: 160,
  fiberGoal: 30,
  stepsGoal: 8000,
  steps: 0,
  stepsSource: "manual",
  weight: null,
  entries: []
};

function seedIfNeeded(): LocalState {
  const key = `jurnal:${today()}`;
  const existing = localStorage.getItem(key);
  if (existing) return JSON.parse(existing);

  const state = { ...DEFAULT, entries: [] as FoodEntry[] };
  if (today() === "2026-09-11") {
    state.entries = [{
      id: "seed-2026-09-11",
      log_date: "2026-09-11",
      name: "Consum până acum",
      quantity: "total agregat",
      calories: 1616,
      protein_g: 169,
      carbs_g: 86,
      fat_g: 65,
      fiber_g: 6,
      created_at: new Date().toISOString()
    }];
  }
  localStorage.setItem(key, JSON.stringify(state));
  return state;
}

export default function App() {
  const [state, setState] = useState<LocalState>(() => seedIfNeeded());
  const [syncStatus, setSyncStatus] = useState<"local"|"syncing"|"synced"|"error">("local");
  const [email, setEmail] = useState("");
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({name:"", calories:"", protein:"", carbs:"", fat:"", fiber:""});
  const date = today();

  const totals = useMemo(() => state.entries.reduce((a,e) => ({
    calories: a.calories + Number(e.calories || 0),
    protein: a.protein + Number(e.protein_g || 0),
    carbs: a.carbs + Number(e.carbs_g || 0),
    fat: a.fat + Number(e.fat_g || 0),
    fiber: a.fiber + Number(e.fiber_g || 0),
  }), {calories:0, protein:0, carbs:0, fat:0, fiber:0}), [state.entries]);

  useEffect(() => {
    localStorage.setItem(`jurnal:${date}`, JSON.stringify(state));
  }, [state, date]);

  useEffect(() => {
    let active = true;

    const syncStepsSilently = async () => {
      if (!isNativeAndroid()) return;
      try {
        const steps = await readTodaySteps();
        if (active) {
          setState(s => ({...s, steps, stepsSource:"health_connect"}));
        }
      } catch {
        // Manual sync remains available if Health Connect needs user attention.
      }
    };

    void syncStepsSilently();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void syncStepsSilently();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      active = false;
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({data}) => setSessionEmail(data.session?.user.email ?? null));
    const {data:{subscription}} = supabase.auth.onAuthStateChange((_e, session) => {
      setSessionEmail(session?.user.email ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  async function sendMagicLink() {
    if (!email.trim()) return;
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin }
    });
    alert(error ? `Eroare: ${error.message}` : "Ți-am trimis linkul de conectare pe email.");
  }

  async function syncNow() {
    const {data:{session}} = await supabase.auth.getSession();
    if (!session) {
      alert("Conectează-te întâi cu emailul.");
      return;
    }
    setSyncStatus("syncing");
    const uid = session.user.id;

    try {
      const { error: dayErr } = await supabase.from("daily_log").upsert({
        log_date: date,
        user_id: uid,
        steps: state.steps,
        steps_source: state.stepsSource,
        weight_kg: state.weight ?? null,
        updated_at: new Date().toISOString()
      }, { onConflict: "log_date" });
      if (dayErr) throw dayErr;

      // Settings table currently has one seeded row; update own row if it exists,
      // otherwise insert a new row for this authenticated user.
      const { data: ownSettings, error: getSettingsErr } = await supabase
        .from("settings").select("id").eq("user_id", uid).maybeSingle();
      if (getSettingsErr) throw getSettingsErr;

      if (ownSettings?.id) {
        const { error } = await supabase.from("settings").update({
          daily_calorie_goal: state.calorieGoal,
          protein_goal: state.proteinGoal,
          fiber_goal: state.fiberGoal,
          updated_at: new Date().toISOString()
        }).eq("id", ownSettings.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("settings").insert({
          user_id: uid,
          daily_calorie_goal: state.calorieGoal,
          protein_goal: state.proteinGoal,
          fiber_goal: state.fiberGoal
        });
        if (error) throw error;
      }

      const { error: delErr } = await supabase
        .from("food_entries")
        .delete()
        .eq("user_id", uid)
        .eq("log_date", date);
      if (delErr) throw delErr;

      if (state.entries.length) {
        const rows = state.entries.map(e => ({
          user_id: uid,
          log_date: date,
          name: e.name,
          quantity: e.quantity ?? null,
          calories: e.calories,
          protein_g: e.protein_g,
          carbs_g: e.carbs_g,
          fat_g: e.fat_g,
          fiber_g: e.fiber_g,
          created_at: e.created_at
        }));
        const { error: insErr } = await supabase.from("food_entries").insert(rows);
        if (insErr) throw insErr;
      }
      setSyncStatus("synced");
    } catch (e) {
      console.error(e);
      setSyncStatus("error");
      alert("Sincronizarea nu a reușit. Datele locale au rămas salvate.");
    }
  }

  async function syncHealth() {
    try {
      const steps = await readTodaySteps();
      setState(s => ({...s, steps, stepsSource:"health_connect"}));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      alert(message || "Health Connect nu a putut fi accesat.");
    }
  }

  function addEntry() {
    if (!form.name.trim()) return;
    const entry: FoodEntry = {
      id: crypto.randomUUID(),
      log_date: date,
      name: form.name.trim(),
      calories: Number(form.calories || 0),
      protein_g: Number(form.protein || 0),
      carbs_g: Number(form.carbs || 0),
      fat_g: Number(form.fat || 0),
      fiber_g: Number(form.fiber || 0),
      created_at: new Date().toISOString()
    };
    setState(s => ({...s, entries:[...s.entries, entry]}));
    setForm({name:"", calories:"", protein:"", carbs:"", fat:"", fiber:""});
    setShowAdd(false);
    setSyncStatus("local");
  }

  function removeEntry(id:string) {
    setState(s => ({...s, entries:s.entries.filter(e => e.id !== id)}));
    setSyncStatus("local");
  }

  const history = useMemo(() => {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - 6);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    return {
      week: summarizePeriod(weekStart, now, date, state),
      month: summarizePeriod(monthStart, now, date, state)
    };
  }, [state, date]);

  const remaining = state.calorieGoal - totals.calories;

  return (
    <main className="app">
      <header>
        <div>
          <div className="eyebrow">JURNAL NUTRIȚIE</div>
          <h1>Azi</h1>
          <div className="muted">{date} · zi 00:00–00:00</div>
        </div>
        <span className={`status ${syncStatus}`}>{syncStatus === "synced" ? "Sincronizat" : syncStatus === "syncing" ? "Se sincronizează" : syncStatus === "error" ? "Eroare sync" : "Local"}</span>
      </header>

      <section className="hero card">
        <div>
          <div className="muted">Calorii</div>
          <div className="big">{Math.round(totals.calories)} <span>/ {state.calorieGoal}</span></div>
        </div>
        <div className={remaining < 0 ? "over" : "remaining"}>{remaining >= 0 ? `${Math.round(remaining)} rămase` : `${Math.abs(Math.round(remaining))} peste`}</div>
      </section>

      <section className="grid4">
        <div className="card mini"><b>{Math.round(totals.protein)} g</b><span>Proteine</span></div>
        <div className="card mini"><b>{Math.round(totals.carbs)} g</b><span>Carbo</span></div>
        <div className="card mini"><b>{Math.round(totals.fat)} g</b><span>Grăsimi</span></div>
        <div className="card mini"><b>{Math.round(totals.fiber)} g</b><span>Fibre</span></div>
      </section>

      <section className="card">
        <div className="sectionHead"><h2>Pași</h2><b>{state.steps.toLocaleString("ro-RO")} / {state.stepsGoal.toLocaleString("ro-RO")}</b></div>
        <input type="number" value={state.steps} onChange={e => setState(s => ({...s, steps:Number(e.target.value||0), stepsSource:"manual"}))} />
        {isNativeAndroid() && <button onClick={syncHealth}>Sincronizează Health Connect</button>}
        {!isNativeAndroid() && <div className="muted small">În browser pașii se introduc manual. În aplicația Android se citesc din Health Connect.</div>}
      </section>

      <section className="card">
        <h2>Evidență</h2>
        {(["week", "month"] as const).map(period => {
          const item = history[period];
          const label = period === "week" ? "Ultimele 7 zile" : "Luna curentă";
          return <div className="entry" key={period}>
            <div>
              <b>{label}</b>
              <span>{item.days} zile înregistrate · {Math.round(item.calories / Math.max(1, item.days))} kcal/zi · {Math.round(item.protein / Math.max(1, item.days))} g proteine/zi · {Math.round(item.steps).toLocaleString("ro-RO")} pași total</span>
            </div>
          </div>;
        })}
      </section>

      <section className="card">
        <div className="sectionHead"><h2>Mese / alimente</h2><button className="smallBtn" onClick={() => setShowAdd(v=>!v)}>+ Adaugă</button></div>
        {showAdd && <div className="form">
          <input placeholder="Nume aliment / masă" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/>
          <div className="formGrid">
            <input type="number" placeholder="kcal" value={form.calories} onChange={e=>setForm({...form,calories:e.target.value})}/>
            <input type="number" placeholder="Proteine g" value={form.protein} onChange={e=>setForm({...form,protein:e.target.value})}/>
            <input type="number" placeholder="Carbo g" value={form.carbs} onChange={e=>setForm({...form,carbs:e.target.value})}/>
            <input type="number" placeholder="Grăsimi g" value={form.fat} onChange={e=>setForm({...form,fat:e.target.value})}/>
            <input type="number" placeholder="Fibre g" value={form.fiber} onChange={e=>setForm({...form,fiber:e.target.value})}/>
          </div>
          <button onClick={addEntry}>Salvează</button>
        </div>}
        <div className="entries">
          {state.entries.length === 0 && <div className="muted">Nu ai adăugat nimic astăzi.</div>}
          {state.entries.map(e => <div className="entry" key={e.id}>
            <div><b>{e.name}</b><span>{Math.round(e.calories)} kcal · P {e.protein_g} · C {e.carbs_g} · G {e.fat_g} · Fibră {e.fiber_g}</span></div>
            <button className="delete" onClick={()=>removeEntry(e.id)}>×</button>
          </div>)}
        </div>
      </section>

      <section className="card">
        <h2>Setări rapide</h2>
        <div className="formGrid">
          <label>Țintă kcal<input type="number" value={state.calorieGoal} onChange={e=>setState(s=>({...s,calorieGoal:Number(e.target.value||1800)}))}/></label>
          <label>Proteine g<input type="number" value={state.proteinGoal} onChange={e=>setState(s=>({...s,proteinGoal:Number(e.target.value||0)}))}/></label>
          <label>Fibre g<input type="number" value={state.fiberGoal} onChange={e=>setState(s=>({...s,fiberGoal:Number(e.target.value||0)}))}/></label>
          <label>Țintă pași<input type="number" value={state.stepsGoal} onChange={e=>setState(s=>({...s,stepsGoal:Number(e.target.value||0)}))}/></label>
        </div>
      </section>

      <section className="card">
        <h2>Cloud</h2>
        {sessionEmail ? <>
          <div className="muted">Conectat: {sessionEmail}</div>
          <button onClick={syncNow}>Sincronizează acum</button>
          <button className="secondary" onClick={()=>supabase.auth.signOut()}>Deconectează</button>
        </> : <>
          <input type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} />
          <button onClick={sendMagicLink}>Trimite link de conectare</button>
          <div className="muted small">Datele rămân salvate local și fără internet. După conectare le poți sincroniza în Supabase.</div>
        </>}
      </section>

      <footer>Datele Health Connect trimise în cloud: doar totalul zilnic de pași.<br />Versiunea aplicației: 1.3</footer>
    </main>
  );
}
