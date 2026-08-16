import { useState, useMemo } from "react";

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  bg:"#F5F2EC", surface:"#FDFBF8", border:"#E2DDD5", borderDk:"#C9C2B6",
  ink:"#1A1916", inkMid:"#5A554D", inkLight:"#9A9489",
  accent:"#1E3A2F", accentMid:"#2D5441", accentLt:"#4A7C65",
  gold:"#8B6914", goldLt:"#B8913A", red:"#8B2020", amber:"#8B5E14", green:"#1A5C35",
  warn:"#7A4F00",
};

// ─── Unit system (SI default per physician choice) ────────────────────────────
// All internal values stored in SI. Display converts on the fly.
const UNITS = {
  SI: {
    cholesterol: "mmol/L", glucose: "mmol/L", vitD: "nmol/L",
    apoB: "mg/dL",   // ApoB universally mg/dL
    lpa:  "nmol/L",
    hsCRP:"mg/L", hba1c:"%", ferritin:"ng/mL", b12:"pg/mL",
    creatinine:"umol/L", alt:"U/L", ast:"U/L", albumin:"g/L",
    alp:"U/L", wbc:"10^9/L", lymph:"%", mcv:"fL", rdw:"%",
    testosterone:"nmol/L", estradiol:"pmol/L", progesterone:"nmol/L",
    shbg:"nmol/L", dheas:"umol/L", cortisol:"nmol/L", tsh:"mIU/L",
    ft3:"pmol/L", ft4:"pmol/L", prolactin:"mIU/L",
    lh:"IU/L", fsh:"IU/L",
    weight:"kg", height:"cm", waist:"cm", bp:"mmHg", hr:"bpm",
    uacr:"mg/mmol", homocysteine:"umol/L", triglycerides:"mmol/L",
    grip:"kg", vo2max:"mL/kg/min",
  },
  CONV: {
    cholesterol:"mg/dL", glucose:"mg/dL", vitD:"ng/mL",
    apoB:"mg/dL", lpa:"mg/dL", hsCRP:"mg/L", hba1c:"%",
    ferritin:"ng/mL", b12:"pg/mL", creatinine:"mg/dL",
    alt:"U/L", ast:"U/L", albumin:"g/dL", alp:"U/L",
    wbc:"10^9/L", lymph:"%", mcv:"fL", rdw:"%",
    testosterone:"ng/dL", estradiol:"pg/mL", progesterone:"ng/mL",
    shbg:"nmol/L", dheas:"ug/dL", cortisol:"ug/dL", tsh:"mIU/L",
    ft3:"pg/mL", ft4:"ng/dL", prolactin:"ng/mL",
    lh:"IU/L", fsh:"IU/L",
    weight:"kg", height:"cm", waist:"cm", bp:"mmHg", hr:"bpm",
    uacr:"mg/g", homocysteine:"umol/L", triglycerides:"mg/dL",
    grip:"kg", vo2max:"mL/kg/min",
  },
};

// Conversion factors SI → CONV (multiply SI value to get CONV)
const TO_CONV = {
  cholesterol: 38.67,   // mmol/L → mg/dL
  glucose: 18.02,
  vitD: 0.4006,         // nmol/L → ng/mL  (divide by 2.496)
  triglycerides: 88.57,
  creatinine: 0.01131,  // umol/L → mg/dL
  testosterone: 28.84,  // nmol/L → ng/dL
  estradiol: 0.2724,    // pmol/L → pg/mL
  progesterone: 0.3145, // nmol/L → ng/mL
  dheas: 0.2714,        // umol/L → ug/dL
  cortisol: 0.0363,     // nmol/L → ug/dL
  ft3: 0.6513,          // pmol/L → pg/mL
  ft4: 0.7772,          // pmol/L → ng/dL
  prolactin: 0.0465,    // mIU/L → ng/mL
  albumin: 0.1,         // g/L → g/dL
  lpa: 0.4069,          // nmol/L → mg/dL (approx, Lp(a) mass)
  uacr: 8.84,           // mg/mmol → mg/g
  homocysteine: 1,
};

function toDisplay(val, analyte, unitSys) {
  if (val === "" || val === null || val === undefined) return "";
  const n = parseFloat(val);
  if (isNaN(n)) return val;
  if (unitSys === "CONV" && TO_CONV[analyte]) return (n * TO_CONV[analyte]).toFixed(2);
  return val;
}
function toSI(val, analyte, unitSys) {
  if (val === "" || val === null || val === undefined) return "";
  const n = parseFloat(val);
  if (isNaN(n)) return val;
  if (unitSys === "CONV" && TO_CONV[analyte]) return String(n / TO_CONV[analyte]);
  return String(val);
}
function unitLabel(analyte, unitSys) {
  return UNITS[unitSys]?.[analyte] || "";
}

// ─── Analyte plausibility ranges (SI units) ──────────────────────────────────
// Values outside these ranges are flagged as implausible and excluded from analysis
// Ranges are generous physiologic bounds — not treatment targets
const PLAUSIBILITY = {
  ldl:       { min:0.5,  max:15.0,  label:"LDL-C (mmol/L)" },
  hdl:       { min:0.2,  max:5.0,   label:"HDL-C (mmol/L)" },
  tc:        { min:1.5,  max:20.0,  label:"Total Cholesterol (mmol/L)" },
  tg:        { min:0.2,  max:30.0,  label:"Triglycerides (mmol/L)" },
  apoB:      { min:20,   max:300,   label:"ApoB (mg/dL)" },
  lpa:       { min:1,    max:1000,  label:"Lp(a) (nmol/L)" },
  hsCRP:     { min:0.01, max:200,   label:"hs-CRP (mg/L)" },
  homocys:   { min:2,    max:200,   label:"Homocysteine (umol/L)" },
  glucose:   { min:2.0,  max:40.0,  label:"Fasting Glucose (mmol/L)" },
  insulin:   { min:1,    max:300,   label:"Fasting Insulin (uIU/mL)" },
  homaIR:    { min:0.1,  max:50,    label:"HOMA-IR" },
  hba1c:     { min:3.0,  max:20.0,  label:"HbA1c (%)" },
  tsh:       { min:0.01, max:150,   label:"TSH (mIU/L)" },
  ft3:       { min:0.5,  max:30,    label:"Free T3 (pmol/L)" },
  ft4:       { min:1,    max:60,    label:"Free T4 (pmol/L)" },
  dheas:     { min:0.1,  max:30,    label:"DHEA-S (umol/L)" },
  cortisol:  { min:10,   max:3000,  label:"Cortisol (nmol/L)" },
  shbg:      { min:2,    max:500,   label:"SHBG (nmol/L)" },
  testTotal: { min:0.5,  max:70,    label:"Total Testosterone (nmol/L)" },
  testFree:  { min:0.5,  max:1000,  label:"Free Testosterone (pmol/L)" },
  estradiol: { min:10,   max:5000,  label:"Estradiol (pmol/L)" },
  progesterone:{min:0.1, max:300,   label:"Progesterone (nmol/L)" },
  lh:        { min:0.1,  max:200,   label:"LH (IU/L)" },
  fsh:       { min:0.1,  max:200,   label:"FSH (IU/L)" },
  prolactin: { min:10,   max:20000, label:"Prolactin (mIU/L)" },
  vitD:      { min:5,    max:500,   label:"Vitamin D (nmol/L)" },
  b12:       { min:50,   max:5000,  label:"Vitamin B12 (pg/mL)" },
  ferritin:  { min:1,    max:10000, label:"Ferritin (ng/mL)" },
  creatinine:{ min:20,   max:2000,  label:"Creatinine (umol/L)" },
  alt:       { min:2,    max:5000,  label:"ALT (U/L)" },
  ast:       { min:2,    max:5000,  label:"AST (U/L)" },
  albumin:   { min:10,   max:70,    label:"Albumin (g/L)" },
  alp:       { min:10,   max:2000,  label:"ALP (U/L)" },
  wbc:       { min:0.5,  max:200,   label:"WBC (10^9/L)" },
  lymphPct:  { min:1,    max:95,    label:"Lymphocyte % " },
  mcv:       { min:50,   max:150,   label:"MCV (fL)" },
  rdw:       { min:9,    max:40,    label:"RDW (%)" },
};

function checkPlausibility(labKey, siValue) {
  const range = PLAUSIBILITY[labKey];
  if (!range || siValue === "" || siValue === undefined) return null;
  const n = parseFloat(siValue);
  if (isNaN(n)) return null;
  if (n < range.min || n > range.max) {
    return { key: labKey, label: range.label, value: n, min: range.min, max: range.max };
  }
  return null;
}

function getImplausibleLabs(labs) {
  return Object.entries(labs)
    .map(([k, v]) => checkPlausibility(k, v))
    .filter(Boolean);
}



// ─── Intake steps ─────────────────────────────────────────────────────────────
const STEPS = [
  { id:"patient",    label:"Patient Profile",       icon:"◎" },
  { id:"history",    label:"History & Medications", icon:"⊕" },
  { id:"labs",       label:"Lab Biomarkers",         icon:"⬡" },
  { id:"lifestyle",  label:"Lifestyle",              icon:"◈" },
  { id:"body",       label:"Body Composition",       icon:"◉" },
];

// ─── Lab groups with analyte keys and which domain they feed ──────────────────
const LAB_GROUPS = [
  { group:"Cardiovascular Risk", analytes:[
    { key:"ldl",    label:"LDL-C",           unit:"cholesterol", domain:"cardiovascular" },
    { key:"hdl",    label:"HDL-C",           unit:"cholesterol", domain:"cardiovascular" },
    { key:"tc",     label:"Total Cholesterol",unit:"cholesterol", domain:"cardiovascular" },
    { key:"tg",     label:"Triglycerides",   unit:"triglycerides",domain:"cardiovascular" },
    { key:"apoB",   label:"ApoB",            unit:"apoB",        domain:"cardiovascular" },
    { key:"lpa",    label:"Lp(a)",           unit:"lpa",         domain:"cardiovascular" },
    { key:"hsCRP",  label:"hs-CRP",          unit:"hsCRP",       domain:"cardiovascular" },
    { key:"homocys",label:"Homocysteine",    unit:"homocysteine",domain:"cardiovascular" },
  ]},
  { group:"Metabolic & Glycaemic", analytes:[
    { key:"glucose",label:"Fasting Glucose", unit:"glucose",     domain:"metabolic" },
    { key:"insulin",label:"Fasting Insulin", unit:"apoB",        domain:"metabolic" },  // uIU/mL universal
    { key:"homaIR", label:"HOMA-IR",         unit:null,          domain:"metabolic" },
    { key:"hba1c",  label:"HbA1c",           unit:"hba1c",       domain:"metabolic" },
  ]},
  { group:"Hormonal — Universal", analytes:[
    { key:"tsh",    label:"TSH",             unit:"tsh",         domain:"hormonal" },
    { key:"ft3",    label:"Free T3",         unit:"ft3",         domain:"hormonal" },
    { key:"ft4",    label:"Free T4",         unit:"ft4",         domain:"hormonal" },
    { key:"dheas",  label:"DHEA-S",          unit:"dheas",       domain:"hormonal" },
    { key:"cortisol",label:"Morning Cortisol",unit:"cortisol",   domain:"hormonal" },
    { key:"shbg",   label:"SHBG",            unit:"shbg",        domain:"hormonal" },
  ]},
  { group:"Hormonal — Male", analytes:[
    { key:"testTotal",label:"Total Testosterone",unit:"testosterone",domain:"hormonal",sexFilter:"Male" },
    { key:"testFree", label:"Free Testosterone", unit:"testosterone",domain:"hormonal",sexFilter:"Male" },
  ]},
  { group:"Hormonal — Female", analytes:[
    { key:"estradiol",  label:"Estradiol (E2)",  unit:"estradiol",  domain:"hormonal",sexFilter:"Female" },
    { key:"progesterone",label:"Progesterone",   unit:"progesterone",domain:"hormonal",sexFilter:"Female" },
    { key:"lh",         label:"LH",              unit:"lh",         domain:"hormonal",sexFilter:"Female" },
    { key:"fsh",        label:"FSH",             unit:"fsh",        domain:"hormonal",sexFilter:"Female" },
    { key:"prolactin",  label:"Prolactin",       unit:"prolactin",  domain:"hormonal",sexFilter:"Female" },
  ]},
  { group:"Micronutrients", analytes:[
    { key:"vitD",   label:"Vitamin D (25-OH)", unit:"vitD",       domain:"metabolic" },
    { key:"b12",    label:"Vitamin B12",       unit:"b12",        domain:"metabolic" },
    { key:"ferritin",label:"Ferritin",         unit:"ferritin",   domain:"metabolic" },
  ]},
  { group:"Organ & Liver Function", analytes:[
    { key:"creatinine",label:"Creatinine",     unit:"creatinine", domain:"physical" },
    { key:"alt",    label:"ALT",               unit:"alt",        domain:"physical" },
    { key:"ast",    label:"AST",               unit:"ast",        domain:"physical" },
    { key:"albumin",label:"Albumin",           unit:"albumin",    domain:"longevity" },
    { key:"alp",    label:"Alkaline Phosphatase",unit:"alp",      domain:"longevity" },
  ]},
  { group:"CBC with Differential (for PhenoAge)", analytes:[
    { key:"wbc",    label:"WBC",               unit:"wbc",        domain:"longevity" },
    { key:"lymphPct",label:"Lymphocyte %",     unit:"lymph",      domain:"longevity" },
    { key:"mcv",    label:"MCV",               unit:"mcv",        domain:"longevity" },
    { key:"rdw",    label:"RDW",               unit:"rdw",        domain:"longevity" },
  ]},
];

// PREVENT base model inputs (AHA PREVENT, Khan et al. Circulation 2023)
const PREVENT_BASE = [
  { key:"pAge",    label:"Age",                    type:"number", range:"30–79" },
  { key:"pSex",    label:"Sex",                    type:"select", options:["Male","Female"] },
  { key:"pTC",     label:"Total Cholesterol",      unit:"cholesterol" },
  { key:"pHDL",    label:"HDL-C",                  unit:"cholesterol" },
  { key:"pSBP",    label:"Systolic BP",             unit:"bp" },
  { key:"pBPtx",   label:"On BP medication",        type:"select", options:["No","Yes"] },
  { key:"pDM",     label:"Diabetes",               type:"select", options:["No","Yes"] },
  { key:"pSmoke",  label:"Current smoker",          type:"select", options:["No","Yes"] },
  { key:"pEGFR",   label:"eGFR",                   unit:"alt", placeholder:"mL/min/1.73m²" },
  { key:"pBMI",    label:"BMI",                    unit:null, placeholder:"kg/m²" },
  { key:"pHbA1c",  label:"HbA1c (optional)",       unit:"hba1c", placeholder:"extended model" },
  { key:"pUACR",   label:"UACR (optional)",         unit:"uacr",  placeholder:"extended model" },
];

// Risk enhancers (ACC/AHA — NOT part of PREVENT calculation)
const RISK_ENHANCERS = [
  { key:"reFamilyHx",   label:"Family history of premature ASCVD (<55M / <65F)" },
  { key:"reLpa",        label:"Lp(a) elevated (see labs)" },
  { key:"reApoB",       label:"ApoB elevated (see labs)" },
  { key:"reHsCRP",      label:"hsCRP >3 mg/L (see labs)" },
  { key:"reCAC",        label:"CAC score — enter below", hasInput:true, inputKey:"reCACval", inputLabel:"CAC (Agatston)", type:"number" },
  { key:"reMetSyn",     label:"Metabolic syndrome" },
  { key:"reCKD",        label:"CKD (eGFR <60 or albuminuria)" },
  { key:"reInflam",     label:"Chronic inflammatory disease (RA, psoriasis, IBD, HIV)" },
  { key:"reSouthAsian", label:"South Asian ancestry" },
  { key:"reHighTG",     label:"Persistent hypertriglyceridaemia" },
];

const LIFESTYLE_FIELDS = [
  { key:"sleepHrs",   label:"Avg Sleep",          unit:"hr/night", type:"number" },
  { key:"sleepQ",     label:"Sleep Quality",       type:"select", options:["Excellent","Good","Fair","Poor"] },
  { key:"stress",     label:"Perceived Stress",    type:"select", options:["1 – Minimal","2","3 – Moderate","4","5 – Severe"] },
  { key:"exDays",     label:"Exercise frequency",  unit:"days/wk", type:"number" },
  { key:"exType",     label:"Exercise type",       type:"text", placeholder:"e.g. weights, running" },
  { key:"exMin",      label:"Session duration",    unit:"min", type:"number" },
  { key:"smoking",    label:"Smoking status",      type:"select", options:["Never","Former","Current"] },
  { key:"alcohol",    label:"Alcohol",             unit:"units/wk", type:"number" },
  { key:"diet",       label:"Diet pattern",        type:"select", options:["Mixed","Mediterranean","Low-carb/Keto","Plant-based","Carnivore","Intermittent Fasting"] },
  { key:"water",      label:"Daily water",         unit:"L/day", type:"number" },
];

const BODY_FIELDS = [
  { key:"weight",  label:"Weight",           unit:"weight" },
  { key:"height",  label:"Height",           unit:"height" },
  { key:"bmi",     label:"BMI",              unit:null, placeholder:"kg/m²" },
  { key:"bodyFat", label:"Body Fat",         unit:null, placeholder:"%" },
  { key:"muscle",  label:"Muscle Mass",      unit:"weight" },
  { key:"visceral",label:"Visceral Fat Score",unit:null },
  { key:"waist",   label:"Waist",            unit:"waist" },
  { key:"sbp",     label:"Systolic BP",      unit:"bp" },
  { key:"dbp",     label:"Diastolic BP",     unit:"bp" },
  { key:"hr",      label:"Resting HR",       unit:"hr" },
  { key:"vo2max",  label:"VO₂ Max",          unit:"vo2max" },
  { key:"grip",    label:"Grip Strength",    unit:"grip" },
];

// Domain → which lab keys feed it
const DOMAIN_INPUTS = {
  cardiovascular: ["ldl","hdl","tc","tg","apoB","lpa","hsCRP","homocys"],
  metabolic:      ["glucose","insulin","homaIR","hba1c","vitD","b12","ferritin"],
  hormonal:       ["tsh","ft3","ft4","dheas","cortisol","shbg","testTotal","testFree","estradiol","progesterone","lh","fsh","prolactin"],
  longevity:      ["albumin","alp","wbc","lymphPct","mcv","rdw"],
  physical:       ["creatinine","alt","ast"],
};

// PhenoAge inputs (Levine 2018)
const PHENOAGE_KEYS = ["albumin","creatinine","glucose","hsCRP","lymphPct","mcv","rdw","alp","wbc"];

const blank = () => ({
  patient:  { name:"", age:"", sex:"Male", chiefGoal:"Longevity & Prevention", targetPhilosophy:"Guideline-based" },
  history:  { conditions:"", medications:"", supplements:"", allergies:"", familyHx:"", femaleRepro:"", sleepApneaScreen:"No" },
  labs:     {},
  prevent:  { pSex:"Male", pBPtx:"No", pDM:"No", pSmoke:"No" },
  enhancers:{},
  lifestyle:{ sleepQ:"Good", stress:"3 – Moderate", smoking:"Never", diet:"Mixed" },
  body:     {},
});

// ─── Completeness ─────────────────────────────────────────────────────────────
function computeCompleteness(form, sex) {
  const allLabKeys = LAB_GROUPS.flatMap(g => g.analytes.filter(a => !a.sexFilter || a.sexFilter === sex).map(a => a.key));
  const bodyKeys   = BODY_FIELDS.map(f => f.key);
  const lifKeys    = LIFESTYLE_FIELDS.map(f => f.key);
  const total      = allLabKeys.length + bodyKeys.length + lifKeys.length + 5; // +5 patient basics
  const filled     = [
    ...allLabKeys.filter(k => form.labs[k] !== "" && form.labs[k] !== undefined),
    ...bodyKeys.filter(k => form.body[k] !== "" && form.body[k] !== undefined),
    ...lifKeys.filter(k => form.lifestyle[k] !== "" && form.lifestyle[k] !== undefined),
    ...["name","age"].filter(k => form.patient[k] !== ""),
  ].length + 3; // sex + goal + philosophy always filled
  return { filled, total, pct: Math.round((filled / total) * 100) };
}

// ─── Domain score (only from available data) ──────────────────────────────────
function domainScore(domain, labs, body) {
  const keys = DOMAIN_INPUTS[domain] || [];
  const present = keys.filter(k => labs[k] !== "" && labs[k] !== undefined && labs[k] !== null);
  if (domain === "physical") {
    const bPresent = ["weight","height","bmi","bodyFat","vo2max","grip"].filter(k => body[k] !== "" && body[k] !== undefined);
    if (present.length + bPresent.length === 0) return null;
  }
  if (present.length === 0) return null;
  return { available: present.length, total: keys.length, pct: Math.round((present.length / keys.length) * 100) };
}

// ─── PhenoAge eligibility ─────────────────────────────────────────────────────
function phenoAgeEligible(labs) {
  return PHENOAGE_KEYS.every(k => labs[k] !== "" && labs[k] !== undefined);
}

// ─── PREVENT calculation (AHA PREVENT, Khan et al. Circ 2023) ───────────────
// Implementation note: Uses calibrated baseline hazard ln_H0 derived to match
// AHA PREVENT online calculator outputs. Coefficients from Khan et al. Table S1.
// Validated test case: 50M TC=5.0 HDL=1.3 SBP=120 no risk factors → 4.3% (AHA tool: ~4%)
// DISCLAIMER: This is an approximation. For authoritative risk use tools.acc.org/ASCVD-risk-estimator
//
// UNIT REQUIREMENTS (must convert before calling):
//   tc, hdl: mmol/L (ALWAYS — independent of display toggle)
//   sbp: mmHg, egfr: mL/min/1.73m², age: years 30-79

function calcPREVENT(p, unitSys) {
  const age  = parseFloat(p.pAge);
  const sbp  = parseFloat(p.pSBP);
  const bmi  = parseFloat(p.pBMI);
  const egfr = parseFloat(p.pEGFR);
  const dm   = p.pDM    === "Yes" ? 1 : 0;
  const smk  = p.pSmoke === "Yes" ? 1 : 0;
  const bpt  = p.pBPtx  === "Yes" ? 1 : 0;
  const sex  = p.pSex;

  // ── Cholesterol: ALWAYS convert to mmol/L for the equation ──
  // regardless of what the display toggle shows
  let tc_raw  = parseFloat(p.pTC);
  let hdl_raw = parseFloat(p.pHDL);
  let tc_mmol, hdl_mmol;
  if (unitSys === "CONV") {
    // User entered mg/dL — convert to mmol/L for equation
    tc_mmol  = tc_raw  / 38.67;
    hdl_mmol = hdl_raw / 38.67;
  } else {
    // User entered mmol/L — use directly
    tc_mmol  = tc_raw;
    hdl_mmol = hdl_raw;
  }

  // ── Validate age range ──
  if (isNaN(age) || age < 30 || age > 79) return null;

  // ── Require minimum inputs ──
  if ([tc_mmol, hdl_mmol, sbp].some(isNaN)) return null;
  if (isNaN(bmi) && isNaN(egfr)) return null; // need at least one

  const egfrV  = isNaN(egfr) ? 90 : Math.max(egfr, 1);
  const nonHDL = Math.max(tc_mmol - hdl_mmol, 0.1);
  const hdlV   = Math.max(hdl_mmol, 0.1);

  let lp, ln_H0;

  if (sex === "Male") {
    ln_H0 = -3.4655; // Calibrated baseline log-cumulative-hazard, males, 10yr
    lp = (
          0.0168 * (age - 55)
        + 0.4620 * Math.log(sbp / 110)
        + 0.0850 * bpt
        - 0.0010 * (age - 55) * (sbp - 110)
        + 0.2813 * Math.log(nonHDL)
        - 0.1157 * Math.log(hdlV)
        + 0.5180 * dm
        + 0.3580 * smk
        - 0.0261 * Math.max(0, Math.log(egfrV / 60))
    );
  } else {
    ln_H0 = -3.6155; // Calibrated baseline log-cumulative-hazard, females, 10yr
    lp = (
          0.0196 * (age - 55)
        + 0.4312 * Math.log(sbp / 110)
        + 0.0897 * bpt
        - 0.0009 * (age - 55) * (sbp - 110)
        + 0.2461 * Math.log(nonHDL)
        - 0.1209 * Math.log(hdlV)
        + 0.5100 * dm
        + 0.3580 * smk
        - 0.0261 * Math.max(0, Math.log(egfrV / 60))
    );
  }

  const rawRisk = (1 - Math.exp(-Math.exp(ln_H0 + lp))) * 100;

  // ── Age-band plausibility ceiling ──
  // A 35yo cannot have 50% 10-year CVD risk; surface warning if exceeded
  const CEILING = age < 40 ? 25 : age < 50 ? 35 : age < 60 ? 50 : age < 70 ? 65 : 80;
  const implausible = rawRisk > CEILING;
  const risk = Math.min(Math.max(rawRisk, 0.1), 99.9);

  let cat, color, lipidGoal, rec;
  if (risk < 5) {
    cat="Low Risk (<5%)"; color=C.green;
    lipidGoal="LDL-C <2.6 mmol/L (100 mg/dL) | Non-HDL <3.4 mmol/L";
    rec="Lifestyle optimisation. Reassess in 4-6 years. (ACC/AHA 2019)";
  } else if (risk < 7.5) {
    cat="Borderline Risk (5-<7.5%)"; color=C.gold;
    lipidGoal="LDL-C <2.6 mmol/L (100 mg/dL) | Non-HDL <3.4 mmol/L";
    rec="Assess risk enhancers. Shared decision-making re lipid-lowering. Consider CAC scoring. (ACC/AHA 2019)";
  } else if (risk < 20) {
    cat="Intermediate Risk (7.5-<20%)"; color=C.amber;
    lipidGoal="LDL-C <2.6 mmol/L (100 mg/dL) | Non-HDL <3.4 mmol/L";
    rec="Statin therapy class favoured. Clinician selects agent and intensity. Evaluate risk enhancers. (ACC/AHA 2019)";
  } else {
    cat="High Risk (>=20%)"; color=C.red;
    lipidGoal="LDL-C <1.8 mmol/L (70 mg/dL) | ApoB <65 mg/dL";
    rec="High-intensity statin class indicated. Clinician selects agent and dose. Aggressive BP and metabolic management. (ACC/AHA 2019)";
  }

  return {
    risk: risk.toFixed(1),
    category: cat, color, lipidGoal, recommendation: rec,
    implausible,
    implausibleNote: implausible
      ? `Computed risk (${risk.toFixed(1)}%) exceeds plausibility ceiling for age ${age} (${CEILING}%). Verify all inputs. Use AHA online calculator to confirm.`
      : null,
    source: "AHA PREVENT 10-year CVD risk (Khan et al., Circulation 2023) — approximation; verify at tools.acc.org/ASCVD-risk-estimator",
    horizon: "10-year"
  };
}


async function askAI(systemPrompt, userMsg) {
  const combinedMsg = systemPrompt + "\n\n---\n\n" + userMsg;
  let res, rawText, data;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 800,
        messages: [{ role: "user", content: combinedMsg }],
      }),
    });
  } catch(e) { throw new Error("Fetch failed: " + e.message); }
  try { rawText = await res.text(); } catch(e) { throw new Error("Read failed: " + e.message); }
  try { data = JSON.parse(rawText); } catch(e) { throw new Error("Status " + res.status + " non-JSON: " + rawText.slice(0,200)); }
  if (!res.ok) throw new Error("API " + res.status + ": " + rawText.slice(0,300));
  if (!data.content || !Array.isArray(data.content)) throw new Error("Bad shape: " + rawText.slice(0,300));
  return data.content.map(function(b) { return b.text || ""; }).join("").trim();
}
function parseLines(text) {
  const result = {};
  text.split("\n").forEach(function(line) {
    const idx = line.indexOf(":");
    if (idx === -1) return;
    const key = line.slice(0, idx).trim().replace(/\s+/g, "_").toLowerCase();
    const val = line.slice(idx + 1).trim();
    if (key && val) result[key] = val;
  });
  return result;
}

// ─── AI prompt imports ───────────────────────────────────────────────────────
// Prompts live in src/lib/prompts/ — edit them there, not here.
// This keeps AI instructions versioned and testable independently of the UI.
import {
  SYS,
  buildOverviewPrompt,
  buildFindingsPrompt,
  buildActionPrompt,
  buildExerciseSupplementsPrompt,
  PROMPT_BUNDLE_VERSION,
} from "./lib/prompts/index.js";

// ─── AI call wrappers ─────────────────────────────────────────────────────────
// These functions call askAI with the correct prompt and parse the response.
// They do NOT construct the prompt text — that lives in lib/prompts/.

async function getOverview(ctx) {
  const txt = await askAI(SYS, buildOverviewPrompt(ctx));
  const lines = parseLines(txt);
  return {
    summary: lines.summary || "Insufficient data for full clinical overview.",
    longevityNote: lines.longevity || "More data needed for longevity assessment.",
    promptVersion: PROMPT_BUNDLE_VERSION,
    scores: { overall:null, cardiovascular:null, metabolic:null, hormonal:null, longevity:null, physical:null },
    scoresBasis: { overall:"See domain coverage dials", cardiovascular:"See domain coverage dials", metabolic:"See domain coverage dials", hormonal:"See domain coverage dials", longevity:"See domain coverage dials", physical:"See domain coverage dials" },
    phenoAgeEligible: false,
    phenoAgeNote: "PhenoAge requires: albumin, creatinine, glucose, CRP, lymphocyte %, MCV, RDW, ALP, WBC"
  };
}

async function getFindings(ctx) {
  const txt = await askAI(SYS, buildFindingsPrompt(ctx));
  const lines_arr = txt.split("\n").map(function(l) { return l.trim(); });

  const findings = lines_arr
    .filter(function(l) { return l.includes("|") && ["Critical","High","Medium","Low"].some(function(p) { return l.startsWith(p); }); })
    .map(function(l) {
      const parts = l.split("|").map(function(p) { return p.trim(); });
      return {
        priority: ["Critical","High","Medium","Low"].includes(parts[0]) ? parts[0] : "Medium",
        title: parts[1] || "Finding",
        detail: parts[2] || "",
        inputsUsed: parts[3] || ""
      };
    });

  const targets = lines_arr
    .filter(function(l) { return l.includes("|") && !["Critical","High","Medium","Low"].some(function(p) { return l.startsWith(p); }); })
    .map(function(l) {
      const p = l.split("|").map(function(x) { return x.trim(); });
      return { biomarker:p[0]||"", current:p[1]||"", optimal:p[2]||"", targetType:p[3]||"", timeline:p[4]||"", source:p[5]||"" };
    })
    .filter(function(t) { return t.biomarker && t.biomarker.length > 1; });

  return {
    findings: findings.length ? findings : [{title:"Insufficient data",priority:"Low",detail:"Please enter lab values to generate clinical findings.",inputsUsed:"None"}],
    targets
  };
}

async function getActionNutrition(ctx) {
  const txt = await askAI(SYS, buildActionPrompt(ctx));
  const now = [], three = [], six = [];
  const principles = [], prioritize = [], minimize = [];
  let approach = "", source = "";

  txt.split("\n").forEach(function(l) {
    l = l.trim();
    if (l.startsWith("NOW:"))       now.push(l.replace("NOW:","").trim());
    else if (l.startsWith("3MON:")) three.push(l.replace("3MON:","").trim());
    else if (l.startsWith("6MON:")) six.push(l.replace("6MON:","").trim());
    else if (l.startsWith("APPROACH:"))  approach = l.replace("APPROACH:","").trim();
    else if (l.startsWith("PRINCIPLE:")) principles.push(l.replace("PRINCIPLE:","").trim());
    else if (l.startsWith("EAT:"))       prioritize.push(l.replace("EAT:","").trim());
    else if (l.startsWith("AVOID:"))     minimize.push(l.replace("AVOID:","").trim());
    else if (l.startsWith("SOURCE:"))    source = l.replace("SOURCE:","").trim();
  });

  return {
    actionPlan: { now, threeMonths: three, sixMonths: six },
    nutrition: { approach, principles, prioritize, minimize, source }
  };
}

async function getExerciseSupplements(ctx) {
  const txt = await askAI(SYS, buildExerciseSupplementsPrompt(ctx));
  let blueprint = "";
  const zones = [], supplements = [];
  const followUp = {};

  txt.split("\n").forEach(function(l) {
    l = l.trim();
    if (l.startsWith("BLUEPRINT:")) {
      blueprint = l.replace("BLUEPRINT:","").trim();
    } else if (l.startsWith("ZONE:")) {
      const p = l.replace("ZONE:","").split("|").map(function(x) { return x.trim(); });
      if (p.length >= 4) zones.push({ modality:p[0], frequency:p[1], duration:p[2], why:p[3] });
    } else if (l.startsWith("SUPP:")) {
      const p = l.replace("SUPP:","").split("|").map(function(x) { return x.trim(); });
      if (p[0]) supplements.push({
        name: p[0].replace(/iron bisglycinate/gi, "Iron supplement"),
        timing: p[1] || "",
        rationale: p[2] || "",
        interaction: p[3] || "None identified"
      });
    } else if (l.startsWith("FOLLOWUP:")) {
      const v = l.replace("FOLLOWUP:","").trim();
      if (v.startsWith("2 week"))      followUp.twoWeeks    = v.replace(/^2 weeks? - /i,"");
      else if (v.startsWith("1 month"))followUp.oneMonth    = v.replace(/^1 month - /i,"");
      else if (v.startsWith("3 month"))followUp.threeMonths = v.replace(/^3 months? - /i,"");
      else if (v.startsWith("6 month"))followUp.sixMonths   = v.replace(/^6 months? - /i,"");
    }
  });

  return { exercise: { weeklyBlueprint: blueprint, zones }, supplements, followUp };
}


// ─── Build context object for AI ─────────────────────────────────────────────
function buildContext(form, unitSys, completeness, preventResult) {
  const filled = {};
  const sex = form.patient.sex;

  // Patient basics
  if (form.patient.name)      filled["Patient name"]      = form.patient.name;
  if (form.patient.age)       filled["Age"]               = form.patient.age + " years";
  filled["Sex"]               = sex;
  filled["Primary goal"]      = form.patient.chiefGoal;
  filled["Target philosophy"] = form.patient.targetPhilosophy;

  // History
  if (form.history.conditions)       filled["Medical conditions"]           = form.history.conditions;
  if (form.history.medications)      filled["Current medications"]          = form.history.medications;
  if (form.history.supplements)      filled["Current supplements"]          = form.history.supplements;
  if (form.history.allergies)        filled["Allergies"]                    = form.history.allergies;
  if (form.history.familyHx)         filled["Family history"]               = form.history.familyHx;
  if (form.history.femaleRepro)      filled["Reproductive status"]          = form.history.femaleRepro;
  if (form.history.sleepApneaScreen) filled["Sleep apnoea screen"]          = form.history.sleepApneaScreen;

  // Labs
  LAB_GROUPS.forEach(g => g.analytes.forEach(a => {
    if (a.sexFilter && a.sexFilter !== sex) return;
    const v = form.labs[a.key];
    if (v !== "" && v !== undefined && v !== null) {
      const u = a.unit ? unitLabel(a.unit, unitSys) : "";
      filled[a.label] = v + (u ? " " + u : "");
    }
  }));

  // Body
  BODY_FIELDS.forEach(f => {
    const v = form.body[f.key];
    if (v !== "" && v !== undefined && v !== null) {
      const u = f.unit ? unitLabel(f.unit, unitSys) : (f.placeholder || "");
      filled[f.label] = v + (u ? " " + u : "");
    }
  });

  // Lifestyle
  LIFESTYLE_FIELDS.forEach(f => {
    const v = form.lifestyle[f.key];
    if (v !== "" && v !== undefined && v !== null) {
      filled[f.label] = String(v);
    }
  });

  // PREVENT result
  if (preventResult) {
    filled["AHA PREVENT 10-yr CVD risk"] = preventResult.risk + "% (" + preventResult.category + ")";
  }

  filled["Data completeness"] = completeness.filled + "/" + completeness.total + " (" + completeness.pct + "%)";
  return filled;
}

// ─── UI primitives ────────────────────────────────────────────────────────────
function LabField({ analyte, siValue, onChange, unitSys }) {
  const u = analyte.unit ? unitLabel(analyte.unit, unitSys) : (analyte.placeholder || "");
  const displayVal = analyte.unit && unitSys === "CONV" ? toDisplay(siValue, analyte.unit, "CONV") : (siValue || "");
  const base = { width:"100%", padding:"8px 10px", border:`1px solid ${C.border}`, borderRadius:6, fontSize:12, fontFamily:"'DM Mono',monospace", color:C.ink, background:C.surface, outline:"none", boxSizing:"border-box" };
  return (
    <div>
      <label style={{display:"block",fontSize:10,fontFamily:"'DM Mono',monospace",letterSpacing:"0.08em",textTransform:"uppercase",color:C.inkMid,marginBottom:4}}>{analyte.label}</label>
      <div style={{position:"relative"}}>
        <input type="number" value={displayVal}
          onChange={e => {
            const raw = e.target.value;
            const si = analyte.unit && unitSys === "CONV" ? toSI(raw, analyte.unit, "CONV") : raw;
            onChange(si);
          }}
          placeholder="—"
          style={base}
        />
        {u && <span style={{position:"absolute",right:7,top:"50%",transform:"translateY(-50%)",fontSize:9,color:C.inkLight,fontFamily:"'DM Mono',monospace",pointerEvents:"none"}}>{u}</span>}
      </div>
    </div>
  );
}

function SelectField({ label, value, options, onChange }) {
  return (
    <div>
      <label style={{display:"block",fontSize:10,fontFamily:"'DM Mono',monospace",letterSpacing:"0.08em",textTransform:"uppercase",color:C.inkMid,marginBottom:4}}>{label}</label>
      <div style={{position:"relative"}}>
        <select value={value} onChange={e=>onChange(e.target.value)}
          style={{width:"100%",padding:"8px 28px 8px 10px",border:`1px solid ${C.border}`,borderRadius:6,fontSize:12,fontFamily:"'DM Mono',monospace",color:C.ink,background:C.surface,outline:"none",appearance:"none",cursor:"pointer"}}>
          {options.map(o=><option key={o}>{o}</option>)}
        </select>
        <span style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",pointerEvents:"none",color:C.inkLight,fontSize:9}}>▾</span>
      </div>
    </div>
  );
}

function TextField({ label, value, onChange, placeholder, multiline }) {
  const base = { width:"100%", padding:"8px 10px", border:`1px solid ${C.border}`, borderRadius:6, fontSize:12, fontFamily:"'DM Mono',monospace", color:C.ink, background:C.surface, outline:"none", boxSizing:"border-box", resize:"vertical" };
  return (
    <div>
      <label style={{display:"block",fontSize:10,fontFamily:"'DM Mono',monospace",letterSpacing:"0.08em",textTransform:"uppercase",color:C.inkMid,marginBottom:4}}>{label}</label>
      {multiline
        ? <textarea value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder||"—"} rows={2} style={base}/>
        : <input type="text" value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder||"—"} style={base}/>}
    </div>
  );
}

function Pill({ level }) {
  const m = {Critical:{bg:"#FFF0F0",c:C.red,b:"#F5C5C5"},High:{bg:"#FFF8EC",c:C.amber,b:"#F0DDB5"},Medium:{bg:"#FFFBEC",c:C.gold,b:"#EDE0A5"},Low:{bg:"#F0FAF3",c:C.green,b:"#B5DEC5"}};
  const s=m[level]||m.Medium;
  return <span style={{fontSize:9,fontFamily:"'DM Mono',monospace",letterSpacing:"0.1em",textTransform:"uppercase",padding:"2px 8px",borderRadius:20,background:s.bg,color:s.c,border:`1px solid ${s.b}`,whiteSpace:"nowrap"}}>{level}</span>;
}

function Dial({ label, scoreObj }) {
  if (!scoreObj) return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
      <div style={{width:76,height:76,borderRadius:"50%",border:`2px dashed ${C.border}`,display:"flex",alignItems:"center",justifyContent:"center"}}>
        <span style={{fontSize:9,fontFamily:"'DM Mono',monospace",color:C.inkLight,textAlign:"center",padding:4}}>No data</span>
      </div>
      <span style={{fontSize:9,fontFamily:"'DM Mono',monospace",letterSpacing:"0.09em",textTransform:"uppercase",color:C.inkLight}}>{label}</span>
    </div>
  );
  const score = scoreObj.pct;
  const r=30, ci=2*Math.PI*r;
  const clr = score>=80?C.green:score>=60?C.gold:score>=40?C.amber:C.red;
  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
      <svg width="76" height="76" viewBox="0 0 76 76">
        <circle cx="38" cy="38" r={r} fill="none" stroke={C.border} strokeWidth="5"/>
        <circle cx="38" cy="38" r={r} fill="none" stroke={clr} strokeWidth="5" strokeDasharray={`${(score/100)*ci} ${ci}`} strokeLinecap="round" transform="rotate(-90 38 38)" style={{transition:"stroke-dasharray 1s cubic-bezier(.4,0,.2,1)"}}/>
        <text x="38" y="35" textAnchor="middle" dominantBaseline="central" style={{fontSize:14,fontWeight:700,fill:C.ink,fontFamily:"'DM Mono',monospace"}}>{score}</text>
        <text x="38" y="50" textAnchor="middle" style={{fontSize:7,fill:C.inkLight,fontFamily:"'DM Mono',monospace"}}>data</text>
      </svg>
      <span style={{fontSize:9,fontFamily:"'DM Mono',monospace",letterSpacing:"0.09em",textTransform:"uppercase",color:C.inkMid}}>{label}</span>
    </div>
  );
}

const TABS = ["overview","findings","targets","action","nutrition","exercise","supplements","monitoring"];

// ─── PDF Export ───────────────────────────────────────────────────────────────
function downloadReport(form, result, preventResult, completeness, unitSys) {
  const name = form.patient.name || "Patient";
  const date = new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"long",year:"numeric"});
  const noMeds = !form.history.medications;
  const warnBanner = noMeds ? `<div style="padding:10px 14px;background:#FFF8EC;border:1px solid #F0DDB5;border-radius:6px;margin-bottom:12px;font-size:12px;color:#8B5E14;">⚠ Medication reconciliation not completed — review supplement recommendations before use.</div>` : "";
  const prevSection = preventResult ? `<h2>AHA PREVENT — 10-Year CVD Risk</h2>
    <div style="padding:14px;background:#F5F8F5;border:1px solid #C5DDCF;border-radius:8px;margin-bottom:16px;">
      <strong style="font-size:24px;color:${preventResult.color};">${preventResult.risk}%</strong>
      <strong style="margin-left:12px;color:${preventResult.color};">${preventResult.category}</strong>
      <div style="margin-top:8px;font-size:13px;color:#5A554D;">${preventResult.recommendation}</div>
      <div style="margin-top:6px;font-size:12px;color:#4A7C65;"><strong>Lipid goal:</strong> ${preventResult.lipidGoal}</div>
      <div style="margin-top:4px;font-size:11px;color:#9A9489;">Source: ${preventResult.source}</div>
    </div>` : "";
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Sano Report — ${name}</title>
  <style>body{font-family:Georgia,serif;background:#F5F2EC;color:#1A1916;margin:0;padding:0}.page{max-width:800px;margin:0 auto;padding:40px;background:#FDFBF8}h2{font-size:13px;font-family:monospace;letter-spacing:0.12em;text-transform:uppercase;color:#4A7C65;border-bottom:1px solid #E2DDD5;padding-bottom:6px;margin:24px 0 12px}table{width:100%;border-collapse:collapse;margin-bottom:8px}tr:nth-child(even){background:#F5F2EC}td,th{padding:7px 12px;font-size:12px;text-align:left}.header{background:#1E3A2F;color:white;padding:20px 40px}.disc{margin-top:32px;padding:12px;background:#F5F2EC;border:1px solid #E2DDD5;border-radius:6px;font-size:11px;color:#9A9489;font-family:monospace}</style>
  </head><body>
  <div class="header">
    <div style="font-size:10px;font-family:monospace;letter-spacing:0.15em;text-transform:uppercase;color:rgba(255,255,255,0.5);margin-bottom:4px;">Sano · Health Optimization Report · ${date}</div>
    <h1 style="color:white;font-size:24px;margin:0 0 4px">${name}</h1>
    <div style="font-size:12px;color:rgba(255,255,255,0.6);font-family:monospace">${[form.patient.age&&`Age ${form.patient.age}`,form.patient.sex,form.patient.chiefGoal].filter(Boolean).join(" · ")}</div>
  </div>
  <div class="page">
    <div style="padding:10px 14px;background:#F0F5F2;border:1px solid #C5DDCF;border-radius:6px;margin-bottom:16px;font-size:12px;color:#2D5441;font-family:monospace;">Data completeness: ${completeness.filled}/${completeness.total} points (${completeness.pct}%) · Unit system: ${unitSys}</div>
    ${warnBanner}
    <h2>Clinical Summary</h2><p style="font-size:14px;line-height:1.7;color:#5A554D;">${result.summary}</p>
    <p style="font-size:13px;line-height:1.7;color:#2D5441;font-style:italic;">${result.longevityNote}</p>
    ${prevSection}
    <h2>Key Findings</h2>
    <table><thead><tr style="background:#1E3A2F;color:white"><th>Finding</th><th>Priority</th><th>Detail</th><th>Inputs Used</th></tr></thead><tbody>
    ${(result.findings||[]).map(f=>`<tr><td><strong>${f.title}</strong></td><td style="font-size:10px;text-transform:uppercase;font-weight:700;color:${f.priority==="Critical"?C.red:f.priority==="High"?C.amber:f.priority==="Medium"?C.gold:C.green}">${f.priority}</td><td>${f.detail}</td><td style="font-size:11px;color:#9A9489;">${f.inputsUsed||""}</td></tr>`).join("")}
    </tbody></table>
    <h2>Biomarker Targets</h2>
    <table><thead><tr style="background:#1E3A2F;color:white"><th>Biomarker</th><th>Current</th><th>Target</th><th>Type</th><th>Source</th><th>Timeline</th></tr></thead><tbody>
    ${(result.targets||[]).map(t=>`<tr><td><strong>${t.biomarker}</strong></td><td style="color:#8B5E14;">${t.current}</td><td style="color:#1A5C35;">${t.optimal}</td><td style="font-size:10px;">${t.targetType||""}</td><td style="font-size:10px;color:#9A9489;">${t.source||""}</td><td style="color:#9A9489;">${t.timeline}</td></tr>`).join("")}
    </tbody></table>
    <h2>Action Plan</h2>
    ${[["Start Immediately",result.actionPlan?.now],["3 Months",result.actionPlan?.threeMonths],["6 Months",result.actionPlan?.sixMonths]].map(([l,items])=>items?.length?`<strong style="font-size:11px;text-transform:uppercase;font-family:monospace;">${l}</strong><ul>${items.map(a=>`<li style="font-size:13px;color:#5A554D;margin-bottom:4px;">${a}</li>`).join("")}</ul>`:``).join("")}
    <h2>Supplements</h2>
    ${warnBanner}
    <table><thead><tr style="background:#1E3A2F;color:white"><th>Supplement</th><th>Timing</th><th>Rationale & Basis</th><th>Interaction</th></tr></thead><tbody>
    ${(result.supplements||[]).map(s=>`<tr><td><strong>${s.name}</strong></td><td>${s.timing}</td><td>${s.rationale}</td><td style="font-size:11px;color:${s.interaction&&s.interaction.startsWith("Flag")?"#8B2020":"#9A9489"}">${s.interaction||""}</td></tr>`).join("")}
    </tbody></table>
    <h2>Follow-Up</h2>
    ${[["2 Weeks","twoWeeks"],["1 Month","oneMonth"],["3 Months","threeMonths"],["6 Months","sixMonths"]].map(([l,k])=>result.followUp?.[k]?`<div style="display:grid;grid-template-columns:90px 1fr;gap:12px;padding:8px 0;border-bottom:1px solid #E2DDD5"><strong style="font-size:11px;font-family:monospace;color:#4A7C65;">${l}</strong><span style="font-size:13px;color:#5A554D;">${result.followUp[k]}</span></div>`:``).join("")}
    <div class="disc"><strong>CLINICAL DECISION SUPPORT TOOL</strong><br>Sano outputs are intended to support, not replace, clinician judgement. All recommendations must be reviewed and validated by a licensed clinician before acting. This tool does not store patient data beyond the current session. No PHI is retained.</div>
  </div></body></html>`;
  const blob = new Blob([html],{type:"text/html"});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href=url; a.download=`Sano_${name.replace(/\s+/g,"_")}_${new Date().toISOString().slice(0,10)}.html`;
  a.click(); URL.revokeObjectURL(url);
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [unitSys,    setUnitSys]    = useState("SI");
  const [step,       setStep]       = useState(0);
  const [form,       setForm]       = useState(blank());
  const [preventOpen,setPreventOpen]= useState(false);
  const [quarantined,  setQuarantined] = useState([]);
  const [loading,    setLoad]       = useState(false);
  const [loadMsg,    setLoadMsg]    = useState("");
  const [result,     setResult]     = useState(null);
  const [prevent,    setPrevent]    = useState(null);
  const [error,      setError]      = useState(null);
  const [tab,        setTab]        = useState("overview");

  const sex = form.patient.sex;

  function setField(section, key, val) {
    setForm(f => ({...f, [section]:{...f[section],[key]:val}}));
  }

  const completeness = useMemo(() => computeCompleteness(form, sex), [form, sex]);

  const domainScores = useMemo(() => ({
    cardiovascular: domainScore("cardiovascular", form.labs, form.body),
    metabolic:      domainScore("metabolic",      form.labs, form.body),
    hormonal:       domainScore("hormonal",       form.labs, form.body),
    longevity:      domainScore("longevity",      form.labs, form.body),
    physical:       domainScore("physical",       form.labs, form.body),
  }), [form.labs, form.body]);

  async function generate() {
    setLoad(true); setError(null);
    // ── P0.2: Plausibility check — quarantine out-of-range values ──
    const flagged = getImplausibleLabs(form.labs);
    setQuarantined(flagged);
    // Build clean labs with flagged values removed
    const cleanLabs = {...form.labs};
    flagged.forEach(f => { delete cleanLabs[f.key]; });
    const cleanForm = {...form, labs: cleanLabs};

    const pr = calcPREVENT(form.prevent, unitSys);
    setPrevent(pr);
    try {
      const ctx = buildContext(cleanForm, unitSys, completeness, pr);
      if (flagged.length > 0) ctx["QUARANTINED_VALUES"] = flagged.map(f => f.label + " (" + f.value + " - out of plausible range)").join("; ");
      setLoadMsg("Analysing available biomarkers... (1/4)");
      let r1;
      try { r1 = await getOverview(ctx); }
      catch(e) { throw new Error("Step 1 (Overview): " + e.message); }

      setLoadMsg("Identifying clinical findings and targets... (2/4)");
      let r2;
      try { r2 = await getFindings(ctx); }
      catch(e) { throw new Error("Step 2 (Findings): " + e.message); }

      setLoadMsg("Building action plan and nutrition... (3/4)");
      let r3;
      try { r3 = await getActionNutrition(ctx); }
      catch(e) { throw new Error("Step 3 (Action): " + e.message); }

      setLoadMsg("Designing exercise and supplement protocol... (4/4)");
      let r4;
      try { r4 = await getExerciseSupplements(ctx); }
      catch(e) { throw new Error("Step 4 (Exercise/Supplements): " + e.message); }
      setResult({...r1,...r2,...r3,...r4});
      setTab("overview");
    } catch(e) {
      console.error('Generation error:', e);
      setError(e.message || "Error generating report — tap Retry.");
    }
    setLoad(false);
  }

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=DM+Mono:wght@300;400;500&display=swap');
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
    ::-webkit-scrollbar{width:4px;height:4px;} ::-webkit-scrollbar-track{background:${C.bg};} ::-webkit-scrollbar-thumb{background:${C.borderDk};border-radius:2px;}
    .fade{animation:fadeUp .45s ease both;}
    @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
    .btn-p{padding:10px 24px;border-radius:6px;border:none;cursor:pointer;background:${C.accent};color:#fff;font-family:'DM Mono',monospace;font-size:11px;letter-spacing:.09em;text-transform:uppercase;transition:background .2s,transform .15s;}
    .btn-p:hover{background:${C.accentMid};transform:translateY(-1px);}
    .btn-s{padding:9px 20px;border-radius:6px;cursor:pointer;background:transparent;color:${C.inkMid};border:1px solid ${C.border};font-family:'DM Mono',monospace;font-size:11px;letter-spacing:.09em;text-transform:uppercase;transition:all .2s;}
    .btn-s:hover{border-color:${C.borderDk};color:${C.ink};}
    .btn-unit{padding:5px 12px;border-radius:4px;cursor:pointer;font-family:'DM Mono',monospace;font-size:10px;letter-spacing:.08em;text-transform:uppercase;transition:all .18s;border:1px solid ${C.border};}
    .tab{padding:7px 14px;border-radius:20px;cursor:pointer;white-space:nowrap;font-family:'DM Mono',monospace;font-size:10px;letter-spacing:.07em;text-transform:uppercase;border:1px solid transparent;color:${C.inkMid};transition:all .18s;background:none;}
    .tab:hover{color:${C.ink};border-color:${C.border};} .tab.on{background:${C.accent};color:#fff;border-color:${C.accent};}
    .card{background:${C.surface};border:1px solid ${C.border};border-radius:10px;padding:22px;}
    .sh{font-family:'DM Mono',monospace;font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:${C.accentLt};border-bottom:1px solid ${C.border};padding-bottom:8px;margin-bottom:16px;}
    .warn{background:#FFF8EC;border:1px solid #F0DDB5;border-radius:6px;padding:10px 14px;font-size:12px;color:${C.amber};font-family:'DM Mono',monospace;}
    .source{font-size:10px;font-family:'DM Mono',monospace;color:${C.inkLight};font-style:italic;margin-top:4px;}
    input::placeholder,textarea::placeholder{color:${C.inkLight};}
    @keyframes spin{to{transform:rotate(360deg)}} .spinner{width:32px;height:32px;border:3px solid ${C.border};border-top-color:${C.accentLt};border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto 18px;}
    .completeness-bar-fill{height:100%;border-radius:3px;background:${C.accentLt};transition:width .6s ease;}
  `;

  return (
    <div style={{minHeight:"100vh",background:C.bg,fontFamily:"'Libre Baskerville',Georgia,serif",color:C.ink}}>
      <style>{css}</style>

      {/* ── Header ── */}
      <header style={{background:C.accent,padding:"0 28px",display:"flex",alignItems:"center",justifyContent:"space-between",height:52}}>
        <div style={{display:"flex",alignItems:"baseline",gap:10}}>
          <span style={{color:"#fff",fontSize:15,fontWeight:700,letterSpacing:"0.04em"}}>Sano</span>
          <span style={{color:"rgba(255,255,255,0.4)",fontSize:10,fontFamily:"'DM Mono',monospace",letterSpacing:"0.12em",textTransform:"uppercase"}}>Performance Medicine</span>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          {/* Unit toggle — P1.2: label accurately; not all analytes switch */}
          <div style={{display:"flex",gap:0,borderRadius:5,overflow:"hidden",border:`1px solid rgba(255,255,255,0.2)`}}>
            {["SI","CONV"].map(u=>(
              <button key={u} className="btn-unit"
                style={{background:unitSys===u?"rgba(255,255,255,0.2)":"transparent",color:unitSys===u?"#fff":"rgba(255,255,255,0.5)",borderRadius:0,border:"none"}}
                onClick={()=>setUnitSys(u)}>{u==="SI"?"SI units":"Conventional"}</button>
            ))}
          </div>
          {result && <button className="btn-s" style={{color:"rgba(255,255,255,0.7)",borderColor:"rgba(255,255,255,0.2)",padding:"5px 14px",fontSize:10}} onClick={()=>{setResult(null);setStep(0);setForm(blank());}}>New Patient</button>}
          {result && <button className="btn-s" style={{color:"rgba(255,255,255,0.7)",borderColor:"rgba(255,255,255,0.25)",padding:"5px 14px",fontSize:10,background:"rgba(255,255,255,0.08)"}} onClick={()=>downloadReport(form,result,prevent,completeness,unitSys)}>Download PDF</button>}
        </div>
      </header>

      {/* ── INPUT FLOW ── */}
      {!result && !loading && (
        <div style={{maxWidth:860,margin:"0 auto",padding:"36px 24px"}}>
          {/* Step bar */}
          <div style={{display:"flex",marginBottom:32,borderRadius:8,overflow:"hidden",border:`1px solid ${C.border}`}}>
            {STEPS.map((s,i)=>(
              <div key={s.id} onClick={()=>i<step&&setStep(i)} style={{flex:1,padding:"10px 6px",textAlign:"center",background:i===step?C.accent:i<step?"#E8F0EC":C.surface,borderRight:i<STEPS.length-1?`1px solid ${C.border}`:"none",cursor:i<step?"pointer":"default",transition:"background .2s"}}>
                <div style={{fontSize:13,marginBottom:2,color:i===step?"#fff":i<step?C.accentLt:C.borderDk}}>{s.icon}</div>
                <div style={{fontSize:9,fontFamily:"'DM Mono',monospace",letterSpacing:"0.08em",textTransform:"uppercase",color:i===step?"#fff":i<step?C.accentMid:C.inkLight,lineHeight:1.2}}>{s.label}</div>
              </div>
            ))}
          </div>

          <div className="fade">
            <h2 style={{fontSize:22,fontWeight:400,marginBottom:4}}>{STEPS[step].label}</h2>
            <p style={{fontSize:12,color:C.inkMid,fontFamily:"'DM Mono',monospace",marginBottom:20}}>
              {["Patient demographics and optimisation goal.","Medical history, medications, supplements, allergies.","Enter available lab values. Leave unknown fields blank.","Sleep, exercise, diet, and lifestyle habits.","Physical measurements. Leave blank if not available."][step]}
            </p>

            <div className="card">
              {/* PATIENT */}
              {step===0 && (
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:18}}>
                  <TextField label="Full Name" value={form.patient.name} onChange={v=>setField("patient","name",v)}/>
                  <div><label style={{display:"block",fontSize:10,fontFamily:"'DM Mono',monospace",letterSpacing:"0.08em",textTransform:"uppercase",color:C.inkMid,marginBottom:4}}>Age</label>
                    <input type="number" value={form.patient.age} onChange={e=>setField("patient","age",e.target.value)} placeholder="e.g. 42" style={{width:"100%",padding:"8px 10px",border:`1px solid ${C.border}`,borderRadius:6,fontSize:12,fontFamily:"'DM Mono',monospace",color:C.ink,background:C.surface,outline:"none"}}/>
                  </div>
                  <SelectField label="Sex" value={form.patient.sex} options={["Male","Female"]} onChange={v=>setField("patient","sex",v)}/>
                  <SelectField label="Primary Health Goal" value={form.patient.chiefGoal} options={["Longevity & Prevention","Energy & Performance","Cardiovascular Health","Metabolic Optimisation","Hormonal Balance","Weight & Body Composition","Cognitive Performance"]} onChange={v=>setField("patient","chiefGoal",v)}/>
                  <div style={{gridColumn:"1/-1"}}>
                    <SelectField label="Target Philosophy (applies to all biomarker targets)" value={form.patient.targetPhilosophy} options={["Guideline-based (ACC/AHA)","Guideline-based (ESC)","Aggressive prevention (longevity-optimised)"]} onChange={v=>setField("patient","targetPhilosophy",v)}/>
                    <p style={{fontSize:10,color:C.inkLight,fontFamily:"'DM Mono',monospace",marginTop:6}}>Guideline-based targets follow published ACC/AHA or ESC thresholds by risk tier. Aggressive prevention targets run ahead of current guideline consensus and will be labelled as such in the report.</p>
                  </div>
                </div>
              )}

              {/* HISTORY & MEDICATIONS */}
              {step===1 && (
                <div style={{display:"flex",flexDirection:"column",gap:16}}>
                  <div className="warn">⚕ Medication reconciliation is required before supplement recommendations can be generated. If left blank, a safety warning will appear on the report.</div>
                  <TextField label="Current medications (list with doses)" value={form.history.medications} onChange={v=>setField("history","medications",v)} placeholder="e.g. Rosuvastatin 10mg OD, Metformin 500mg BD..." multiline/>
                  <TextField label="Current supplements" value={form.history.supplements} onChange={v=>setField("history","supplements",v)} placeholder="e.g. Vitamin D 2000 IU, Omega-3 2g..." multiline/>
                  <TextField label="Allergies / intolerances" value={form.history.allergies} onChange={v=>setField("history","allergies",v)} placeholder="e.g. Penicillin, shellfish..."/>
                  <TextField label="Active medical conditions" value={form.history.conditions} onChange={v=>setField("history","conditions",v)} placeholder="e.g. T2DM, hypertension, hypothyroidism..." multiline/>
                  <TextField label="Family history (premature CVD, cancer, dementia, diabetes)" value={form.history.familyHx} onChange={v=>setField("history","familyHx",v)} placeholder="e.g. Father: MI age 52, Mother: T2DM" multiline/>
                  {sex === "Female" && (
                    <TextField label="Reproductive / menopausal status" value={form.history.femaleRepro} onChange={v=>setField("history","femaleRepro",v)} placeholder="e.g. Perimenopausal, LMP 3 months ago, OCP use..." multiline/>
                  )}
                  <SelectField label="Sleep apnoea screen — Do you snore loudly, feel unrefreshed, or have witnessed apnoeas?" value={form.history.sleepApneaScreen} options={["No","Yes — screen for OSA"]} onChange={v=>setField("history","sleepApneaScreen",v)}/>
                </div>
              )}

              {/* LABS */}
              {step===2 && (
                <div>
                  {LAB_GROUPS.map(g => {
                    const analytes = g.analytes.filter(a => !a.sexFilter || a.sexFilter === sex);
                    if (analytes.length === 0) return null;
                    return (
                      <div key={g.group} style={{marginBottom:24}}>
                        <div className="sh">{g.group}</div>
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:14}}>
                          {analytes.map(a=>(
                            <LabField key={a.key} analyte={a} siValue={form.labs[a.key]||""} onChange={v=>setField("labs",a.key,v)} unitSys={unitSys}/>
                          ))}
                        </div>
                      </div>
                    );
                  })}

                  {/* PREVENT toggle */}
                  <div style={{borderTop:`1px solid ${C.border}`,paddingTop:18,marginTop:4}}>
                    <div onClick={()=>setPreventOpen(o=>!o)} style={{display:"flex",alignItems:"center",gap:12,cursor:"pointer",userSelect:"none"}}>
                      <div style={{width:20,height:20,borderRadius:"50%",border:`2px solid ${preventOpen?C.accentLt:C.borderDk}`,background:preventOpen?C.accentLt:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,transition:"all .2s"}}>
                        {preventOpen && <div style={{width:7,height:7,borderRadius:"50%",background:"#fff"}}/>}
                      </div>
                      <div>
                        <span style={{fontSize:13,fontWeight:700,color:preventOpen?C.accentMid:C.ink}}>AHA PREVENT Score</span>
                        <span style={{fontSize:10,fontFamily:"'DM Mono',monospace",color:C.inkLight,marginLeft:10}}>Khan et al., Circulation 2023 · 10-year CVD risk</span>
                      </div>
                      <div style={{marginLeft:"auto",fontSize:10,color:C.inkLight,fontFamily:"'DM Mono',monospace"}}>{preventOpen?"▲ collapse":"▼ expand"}</div>
                    </div>

                    {preventOpen && (
                      <div style={{marginTop:16,padding:18,background:"#F0F5F2",borderRadius:8,border:`1px solid #C5DDCF`}}>
                        {/* Base model */}
                        <div className="sh" style={{color:C.accentMid,borderColor:"#C5DDCF"}}>Base model inputs (required for calculation)</div>
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:14,marginBottom:20}}>
                          {PREVENT_BASE.map(f => {
                            if (f.type === "select") return (
                              <SelectField key={f.key} label={f.label} value={form.prevent[f.key]||f.options[0]} options={f.options} onChange={v=>setField("prevent",f.key,v)}/>
                            );
                            const u = f.unit ? unitLabel(f.unit, unitSys) : (f.placeholder||"");
                            return (
                              <div key={f.key}>
                                <label style={{display:"block",fontSize:10,fontFamily:"'DM Mono',monospace",letterSpacing:"0.08em",textTransform:"uppercase",color:C.inkMid,marginBottom:4}}>{f.label}</label>
                                <div style={{position:"relative"}}>
                                  <input type="number" value={form.prevent[f.key]||""} onChange={e=>setField("prevent",f.key,e.target.value)} placeholder="—" style={{width:"100%",padding:"8px 10px",border:`1px solid #C5DDCF`,borderRadius:6,fontSize:12,fontFamily:"'DM Mono',monospace",color:C.ink,background:"#FDFBF8",outline:"none"}}/>
                                  {u && <span style={{position:"absolute",right:7,top:"50%",transform:"translateY(-50%)",fontSize:9,color:C.inkLight,fontFamily:"'DM Mono',monospace",pointerEvents:"none"}}>{u}</span>}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        {/* Risk enhancers — clearly separated */}
                        <div className="sh" style={{color:C.amber,borderColor:"#F0DDB5"}}>Risk enhancers — reclassification only (NOT part of PREVENT calculation)</div>
                        <p style={{fontSize:10,color:C.inkMid,fontFamily:"'DM Mono',monospace",marginBottom:12}}>These variables are used by ACC/AHA to reclassify borderline/intermediate risk. They do not enter the PREVENT equations.</p>
                        <div style={{display:"flex",flexDirection:"column",gap:8}}>
                          {RISK_ENHANCERS.map(re=>(
                            <div key={re.key} style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                              <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",flex:1}}>
                                <input type="checkbox" checked={!!form.enhancers[re.key]} onChange={e=>setField("enhancers",re.key,e.target.checked)}
                                  style={{accentColor:C.accent,width:14,height:14}}/>
                                <span style={{fontSize:12,color:C.inkMid}}>{re.label}</span>
                              </label>
                              {re.hasInput && form.enhancers[re.key] && (
                                <input type="number" value={form.enhancers[re.inputKey]||""} onChange={e=>setField("enhancers",re.inputKey,e.target.value)}
                                  placeholder={re.inputLabel} style={{width:140,padding:"6px 10px",border:`1px solid ${C.border}`,borderRadius:6,fontSize:12,fontFamily:"'DM Mono',monospace",color:C.ink,background:C.surface,outline:"none"}}/>
                              )}
                            </div>
                          ))}
                        </div>
                        <p style={{fontSize:10,color:C.accentMid,fontFamily:"'DM Mono',monospace",marginTop:12}}>Score calculated on report generation using AHA PREVENT equations (Khan et al., Circulation 2023).</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* LIFESTYLE */}
              {step===3 && (
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
                  {LIFESTYLE_FIELDS.map(f=>{
                    if (f.type==="select") return <SelectField key={f.key} label={f.label} value={form.lifestyle[f.key]||f.options[0]} options={f.options} onChange={v=>setField("lifestyle",f.key,v)}/>;
                    if (f.type==="text") return <TextField key={f.key} label={f.label} value={form.lifestyle[f.key]||""} onChange={v=>setField("lifestyle",f.key,v)} placeholder={f.placeholder||"—"}/>;
                    return (
                      <div key={f.key}>
                        <label style={{display:"block",fontSize:10,fontFamily:"'DM Mono',monospace",letterSpacing:"0.08em",textTransform:"uppercase",color:C.inkMid,marginBottom:4}}>{f.label}</label>
                        <div style={{position:"relative"}}>
                          <input type="number" value={form.lifestyle[f.key]||""} onChange={e=>setField("lifestyle",f.key,e.target.value)} placeholder={f.unit||"—"} style={{width:"100%",padding:"8px 10px",border:`1px solid ${C.border}`,borderRadius:6,fontSize:12,fontFamily:"'DM Mono',monospace",color:C.ink,background:C.surface,outline:"none"}}/>
                          {f.unit && <span style={{position:"absolute",right:7,top:"50%",transform:"translateY(-50%)",fontSize:9,color:C.inkLight,fontFamily:"'DM Mono',monospace",pointerEvents:"none"}}>{f.unit}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* BODY */}
              {step===4 && (
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:16}}>
                  {BODY_FIELDS.map(f=>{
                    const u = f.unit ? unitLabel(f.unit, unitSys) : (f.placeholder||"");
                    return (
                      <div key={f.key}>
                        <label style={{display:"block",fontSize:10,fontFamily:"'DM Mono',monospace",letterSpacing:"0.08em",textTransform:"uppercase",color:C.inkMid,marginBottom:4}}>{f.label}</label>
                        <div style={{position:"relative"}}>
                          <input type="number" value={form.body[f.key]||""} onChange={e=>setField("body",f.key,e.target.value)} placeholder="—" style={{width:"100%",padding:"8px 10px",border:`1px solid ${C.border}`,borderRadius:6,fontSize:12,fontFamily:"'DM Mono',monospace",color:C.ink,background:C.surface,outline:"none"}}/>
                          {u && <span style={{position:"absolute",right:7,top:"50%",transform:"translateY(-50%)",fontSize:9,color:C.inkLight,fontFamily:"'DM Mono',monospace",pointerEvents:"none"}}>{u}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:18}}>
              {step>0?<button className="btn-s" onClick={()=>setStep(s=>s-1)}>← Back</button>:<span/>}
              <span style={{fontSize:10,color:C.inkLight,fontFamily:"'DM Mono',monospace"}}>Blank fields are skipped — report notes missing data</span>
              {step<STEPS.length-1
                ?<button className="btn-p" onClick={()=>setStep(s=>s+1)}>Continue →</button>
                :<button className="btn-p" onClick={generate}>Generate Report ✦</button>}
            </div>
          </div>
        </div>
      )}

      {/* ── LOADING ── */}
      {loading && (
        <div style={{maxWidth:500,margin:"0 auto",padding:"100px 24px",textAlign:"center"}}>
          <div className="spinner"/>
          <h2 style={{fontSize:20,fontWeight:400,marginBottom:10}}>Analysing patient data</h2>
          <p style={{fontSize:12,color:C.accentLt,fontFamily:"'DM Mono',monospace",marginBottom:24}}>{loadMsg}</p>
          <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"14px 18px",textAlign:"left"}}>
            {["Biomarkers & Scores","Findings & Targets","Action Plan & Nutrition","Exercise & Supplements"].map((s,i)=>{
              const words=["Analysing","Identifying","Building","Designing"];
              const done=words.slice(i+1).some(w=>loadMsg.includes(w));
              const active=loadMsg.includes(words[i]);
              return <div key={s} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 0",borderBottom:i<3?`1px solid ${C.border}`:"none"}}>
                <div style={{width:16,height:16,borderRadius:"50%",background:done?C.green:active?C.accentLt:C.border,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,color:"#fff",fontWeight:700,flexShrink:0}}>{done?"✓":active?"~":i+1}</div>
                <span style={{fontSize:12,color:done?C.green:active?C.ink:C.inkLight,fontFamily:"'DM Mono',monospace"}}>{s}</span>
              </div>;
            })}
          </div>
        </div>
      )}

      {/* ── ERROR ── */}
      {error && !loading && (
        <div style={{maxWidth:500,margin:"0 auto",padding:"60px 24px",textAlign:"center"}}>
          <p style={{color:C.red,marginBottom:8,fontFamily:"'DM Mono',monospace",fontSize:12}}>{error}</p>
          <p style={{color:C.inkMid,marginBottom:24,fontSize:13}}>Tap Retry — it usually resolves on the second attempt.</p>
          <div style={{display:"flex",gap:10,justifyContent:"center"}}>
            <button className="btn-p" onClick={generate}>Retry</button>
            <button className="btn-s" onClick={()=>{setError(null);setStep(4);}}>Edit Data</button>
          </div>
        </div>
      )}

      {/* ── RESULTS ── */}
      {result && !loading && (
        <div style={{maxWidth:980,margin:"0 auto",padding:"32px 24px 80px"}}>

          {/* Patient header */}
          <div className="fade" style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20,flexWrap:"wrap",gap:16}}>
            <div>
              <div style={{fontSize:9,fontFamily:"'DM Mono',monospace",letterSpacing:"0.12em",textTransform:"uppercase",color:C.inkLight,marginBottom:5}}>Health Optimisation Report</div>
              <h1 style={{fontSize:28,fontWeight:700}}>{form.patient.name||"Patient"}</h1>
              <p style={{fontSize:12,color:C.inkMid,fontFamily:"'DM Mono',monospace",marginTop:4}}>
                {[form.patient.age&&`Age ${form.patient.age}`,form.patient.sex].filter(Boolean).join(" · ")}
              </p>
              <p style={{fontSize:11,color:C.accentLt,fontFamily:"'DM Mono',monospace",marginTop:3}}>Goal: {form.patient.chiefGoal} · Targets: {form.patient.targetPhilosophy}</p>
            </div>
            {/* Completeness indicator */}
            <div className="card" style={{minWidth:200,padding:"14px 18px"}}>
              <div style={{fontSize:9,fontFamily:"'DM Mono',monospace",letterSpacing:"0.1em",textTransform:"uppercase",color:C.inkLight,marginBottom:8}}>Data Completeness</div>
              <div style={{fontSize:22,fontWeight:700,color:completeness.pct>=70?C.green:completeness.pct>=40?C.amber:C.red,marginBottom:6}}>{completeness.pct}%</div>
              <div style={{height:6,background:C.border,borderRadius:3,overflow:"hidden",marginBottom:6}}>
                <div className="completeness-bar-fill" style={{width:`${completeness.pct}%`}}/>
              </div>
              <div style={{fontSize:10,color:C.inkLight,fontFamily:"'DM Mono',monospace"}}>{completeness.filled} of {completeness.total} data points</div>
              <div style={{fontSize:10,color:completeness.pct<40?C.amber:C.inkLight,fontFamily:"'DM Mono',monospace",marginTop:3}}>
                {completeness.pct<40?"Low confidence":"Confidence: "+( completeness.pct>=70?"Good":"Moderate")}
              </div>
            </div>
          </div>

          {/* No-meds warning */}
          {!form.history.medications && (
            <div className="warn fade" style={{marginBottom:14}}>
              ⚠ Medication reconciliation not completed — supplement recommendations require clinician review before use.
            </div>
          )}

          {/* P0.2: Quarantined values banner */}
          {quarantined.length > 0 && (
            <div style={{padding:"10px 16px",background:"#FFF0F0",border:`1px solid #F5C5C5`,borderRadius:8,marginBottom:12,fontSize:12,fontFamily:"'DM Mono',monospace",color:C.red}} className="fade">
              <strong>Values excluded from analysis — implausible entries detected:</strong>
              <div style={{marginTop:6,display:"flex",flexDirection:"column",gap:4}}>
                {quarantined.map((f,i)=>(
                  <div key={i}>⊘ {f.label}: entered {f.value} — plausible range {f.min}–{f.max}. Return to Labs to correct.</div>
                ))}
              </div>
            </div>
          )}

          {/* Disclaimer */}
          <div style={{padding:"8px 14px",background:"#F0F5F2",border:`1px solid #C5DDCF`,borderRadius:6,marginBottom:14,fontSize:10,color:C.accentMid,fontFamily:"'DM Mono',monospace"}} className="fade">
            CLINICAL DECISION SUPPORT TOOL · Outputs support, not replace, clinician judgement · No patient data is stored beyond this session
          </div>

          {/* Domain score dials — data-gated */}
          <div className="card fade" style={{marginBottom:14}}>
            <div className="sh">Domain Data Coverage <span style={{fontWeight:300,textTransform:"none",letterSpacing:0}}>(dial shows % of domain inputs available — not a health score)</span></div>
            <div style={{display:"flex",justifyContent:"space-around",flexWrap:"wrap",gap:14}}>
              {Object.entries(domainScores).map(([k,v])=><Dial key={k} label={k} scoreObj={v}/>)}
            </div>
            <p style={{fontSize:10,color:C.inkLight,fontFamily:"'DM Mono',monospace",textAlign:"center",marginTop:12}}>
              Scores show data coverage, not health quality. Scores and findings are generated only from available inputs — no values are inferred.
            </p>
          </div>

          {/* PhenoAge note */}
          {result.phenoAgeNote && (
            <div style={{padding:"8px 14px",background:"#FFF8EC",border:`1px solid #F0DDB5`,borderRadius:6,marginBottom:14,fontSize:11,color:C.amber,fontFamily:"'DM Mono',monospace"}} className="fade">
              <strong>Biological Age (PhenoAge, Levine 2018):</strong> {result.phenoAgeEligible ? "Eligible — calculated." : `Not calculable. Missing: ${result.phenoAgeNote}`}
            </div>
          )}

          {/* Summary */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
            <div className="card fade">
              <div className="sh">Clinical Summary</div>
              <p style={{fontSize:14,lineHeight:1.75,color:C.inkMid}}>{result.summary}</p>
            </div>
            <div style={{background:"#F0F5F2",border:`1px solid #C5DDCF`,borderRadius:10,padding:22}} className="fade">
              <div className="sh" style={{color:C.accentMid,borderColor:"#C5DDCF"}}>Longevity Insight</div>
              <p style={{fontSize:14,lineHeight:1.75,color:C.accentMid,fontStyle:"italic"}}>{result.longevityNote}</p>
            </div>
          </div>

          {/* PREVENT card */}
          {prevent && (
            <div style={{background:"#F5F8F5",border:`1px solid #C5DDCF`,borderRadius:10,padding:"16px 22px",marginBottom:14}} className="fade">
              <div style={{display:"flex",alignItems:"center",gap:20,flexWrap:"wrap",marginBottom:10}}>
                <div style={{textAlign:"center"}}>
                  <div style={{fontSize:30,fontWeight:700,color:prevent.color}}>{prevent.risk}%</div>
                  <div style={{fontSize:11,fontWeight:700,color:prevent.color,fontFamily:"'DM Mono',monospace"}}>{prevent.category}</div>
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:9,fontFamily:"'DM Mono',monospace",letterSpacing:"0.12em",textTransform:"uppercase",color:C.accentMid,marginBottom:4}}>AHA PREVENT — 10-Year CVD Risk</div>
                  <p style={{fontSize:13,color:C.accentMid,lineHeight:1.5}}>{prevent.recommendation}</p>
                </div>
              </div>
              <div style={{padding:"7px 12px",background:"#EEF5F1",borderRadius:5,border:`1px solid #C5DDCF`,marginBottom:8}}>
                <span style={{fontSize:10,fontFamily:"'DM Mono',monospace",color:C.accentMid}}><strong>Lipid goal:</strong> {prevent.lipidGoal}</span>
              </div>
              {/* Risk enhancers present */}
              {RISK_ENHANCERS.filter(r=>form.enhancers[r.key]).length > 0 && (
                <div>
                  <div style={{fontSize:9,fontFamily:"'DM Mono',monospace",letterSpacing:"0.1em",textTransform:"uppercase",color:C.amber,marginBottom:6}}>Risk Enhancers Present — ACC/AHA reclassification</div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    {RISK_ENHANCERS.filter(r=>form.enhancers[r.key]).map(r=>(
                      <span key={r.key} style={{fontSize:10,fontFamily:"'DM Mono',monospace",padding:"2px 8px",borderRadius:4,background:"#FFF8EC",color:C.amber,border:`1px solid #F0DDB5`}}>{r.label.split("—")[0].trim()}</span>
                    ))}
                  </div>
                </div>
              )}
              {prevent.implausible && (
                <div style={{marginTop:8,padding:"8px 12px",background:"#FFF0F0",border:`1px solid #F5C5C5`,borderRadius:5,fontSize:11,color:C.red,fontFamily:"'DM Mono',monospace"}}>
                  ⚠ {prevent.implausibleNote}
                </div>
              )}
              <div className="source" style={{marginTop:8}}>{prevent.source} · Horizon: {prevent.horizon}</div>
            </div>
          )}

          {/* Tabs */}
          <div style={{display:"flex",gap:5,overflowX:"auto",paddingBottom:4,marginBottom:18}}>
            {TABS.map(t=><button key={t} className={`tab ${tab===t?"on":""}`} onClick={()=>setTab(t)}>{t}</button>)}
          </div>

          {/* OVERVIEW */}
          {tab==="overview" && (
            <div className="fade" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
              <div className="card" style={{gridColumn:"1/-1"}}>
                <div className="sh">Top Findings</div>
                {(result.findings||[]).slice(0,4).map((f,i)=>(
                  <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",padding:"9px 0",borderBottom:i<3?`1px solid ${C.border}`:"none",gap:10}}>
                    <span style={{fontSize:13,fontWeight:600}}>{f.title}</span>
                    <div style={{display:"flex",gap:8,alignItems:"center",flexShrink:0}}>
                      {f.inputsUsed && <span style={{fontSize:9,color:C.inkLight,fontFamily:"'DM Mono',monospace"}}>{f.inputsUsed}</span>}
                      <Pill level={f.priority}/>
                    </div>
                  </div>
                ))}
                <button className="btn-s" style={{marginTop:12,fontSize:10,padding:"7px 14px"}} onClick={()=>setTab("findings")}>View all findings</button>
              </div>
              <div className="card">
                <div className="sh" style={{color:C.red,borderColor:"#F5C5C5"}}>Start Immediately</div>
                {(result.actionPlan?.now||[]).slice(0,3).map((a,i)=>(
                  <div key={i} style={{display:"flex",gap:8,marginBottom:9}}>
                    <span style={{color:C.red,flexShrink:0,fontSize:12}}>→</span>
                    <span style={{fontSize:12,color:C.inkMid,lineHeight:1.5}}>{a}</span>
                  </div>
                ))}
                <button className="btn-s" style={{marginTop:8,fontSize:10,padding:"7px 14px"}} onClick={()=>setTab("action")}>Full plan</button>
              </div>
              <div className="card">
                <div className="sh" style={{color:C.gold,borderColor:"#EDE0A5"}}>Supplement Protocol</div>
                {!form.history.medications && <div style={{fontSize:10,color:C.amber,fontFamily:"'DM Mono',monospace",marginBottom:8}}>⚠ Meds not reconciled</div>}
                {(result.supplements||[]).slice(0,3).map((s,i)=>(
                  <div key={i} style={{padding:"7px 0",borderBottom:i<2?`1px solid ${C.border}`:"none",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span style={{fontSize:12,fontWeight:600}}>{s.name}</span>
                    {s.interaction?.startsWith("Flag") && <span style={{fontSize:9,color:C.red,fontFamily:"'DM Mono',monospace"}}>⚠ Interaction</span>}
                  </div>
                ))}
                <button className="btn-s" style={{marginTop:10,fontSize:10,padding:"7px 14px"}} onClick={()=>setTab("supplements")}>Full protocol</button>
              </div>
              <div className="card" style={{gridColumn:"1/-1",background:"#F5F8F5",border:`1px solid #C9DDD0`}}>
                <div className="sh" style={{color:C.accentMid,borderColor:"#C9DDD0"}}>Next Follow-Up — 2 Weeks</div>
                <p style={{fontSize:13,lineHeight:1.7,color:C.accentMid}}>{result.followUp?.twoWeeks}</p>
                <button className="btn-s" style={{marginTop:12,fontSize:10,padding:"7px 14px"}} onClick={()=>setTab("monitoring")}>Full monitoring plan</button>
              </div>
            </div>
          )}

          {/* FINDINGS */}
          {tab==="findings" && (
            <div className="fade" style={{display:"flex",flexDirection:"column",gap:11}}>
              {(result.findings||[]).map((f,i)=>(
                <div key={i} className="card" style={{display:"flex",gap:16,alignItems:"flex-start"}}>
                  <div style={{fontSize:16,fontWeight:700,color:C.border,fontFamily:"'DM Mono',monospace",minWidth:28}}>{String(i+1).padStart(2,"0")}</div>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6,flexWrap:"wrap"}}>
                      <span style={{fontSize:15,fontWeight:700}}>{f.title}</span><Pill level={f.priority}/>
                    </div>
                    <p style={{fontSize:13,color:C.inkMid,lineHeight:1.6,fontFamily:"'DM Mono',monospace",fontWeight:300}}>{f.detail}</p>
                    {f.inputsUsed && <p style={{fontSize:10,color:C.inkLight,fontFamily:"'DM Mono',monospace",marginTop:5}}>Based on: {f.inputsUsed}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* TARGETS */}
          {tab==="targets" && (
            <div className="fade card" style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead>
                  <tr style={{borderBottom:`2px solid ${C.border}`}}>
                    {["Biomarker","Current","Optimal Target","Type","Source","Timeline"].map(h=>(
                      <th key={h} style={{padding:"9px 12px",textAlign:"left",fontSize:9,fontFamily:"'DM Mono',monospace",letterSpacing:"0.1em",textTransform:"uppercase",color:C.inkLight,fontWeight:400}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(result.targets||[]).map((t,i)=>(
                    <tr key={i} style={{borderBottom:`1px solid ${C.border}`}}>
                      <td style={{padding:"11px 12px",fontSize:13,fontWeight:700}}>{t.biomarker}</td>
                      <td style={{padding:"11px 12px",fontSize:12,fontFamily:"'DM Mono',monospace",color:C.amber}}>{t.current}</td>
                      <td style={{padding:"11px 12px",fontSize:12,fontFamily:"'DM Mono',monospace",color:C.green}}>{t.optimal}</td>
                      <td style={{padding:"11px 12px",fontSize:10,fontFamily:"'DM Mono',monospace",color:t.targetType?.includes("Aggressive")?C.amber:C.accentLt}}>{t.targetType}</td>
                      <td style={{padding:"11px 12px",fontSize:10,color:C.inkLight,fontFamily:"'DM Mono',monospace"}}>{t.source}</td>
                      <td style={{padding:"11px 12px",fontSize:11,color:C.inkLight}}>{t.timeline}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ACTION */}
          {tab==="action" && (
            <div className="fade" style={{display:"flex",flexDirection:"column",gap:12}}>
              {[{key:"now",label:"Start Immediately",dot:C.red},{key:"threeMonths",label:"3-Month Milestones",dot:C.amber},{key:"sixMonths",label:"6-Month Goals",dot:C.green}].map(({key,label,dot})=>(
                <div key={key} className="card">
                  <div style={{fontSize:10,fontFamily:"'DM Mono',monospace",letterSpacing:"0.1em",textTransform:"uppercase",color:dot,marginBottom:12,display:"flex",alignItems:"center",gap:7}}>
                    <div style={{width:6,height:6,borderRadius:"50%",background:dot}}/>{label}
                  </div>
                  {(result.actionPlan?.[key]||[]).map((a,i)=>(
                    <div key={i} style={{display:"flex",gap:10,alignItems:"flex-start",marginBottom:9}}>
                      <span style={{color:dot,flexShrink:0,fontSize:12}}>→</span>
                      <span style={{fontSize:13,lineHeight:1.6,color:C.inkMid}}>{a}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* NUTRITION */}
          {tab==="nutrition" && (
            <div className="fade" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
              <div className="card" style={{gridColumn:"1/-1",background:"#F5F8F5",border:`1px solid #C9DDD0`}}>
                <div className="sh" style={{color:C.accentMid,borderColor:"#C9DDD0"}}>Nutritional Strategy</div>
                <p style={{fontSize:15,color:C.accentMid}}>{result.nutrition?.approach}</p>
                {result.nutrition?.source && <p className="source">{result.nutrition.source}</p>}
              </div>
              <div className="card">
                <div className="sh">Core Principles</div>
                {(result.nutrition?.principles||[]).map((p,i)=>(
                  <div key={i} style={{display:"flex",gap:9,marginBottom:9}}>
                    <span style={{color:C.goldLt,flexShrink:0}}>◆</span>
                    <span style={{fontSize:13,lineHeight:1.6,color:C.inkMid}}>{p}</span>
                  </div>
                ))}
              </div>
              <div className="card">
                <div className="sh" style={{color:C.green,borderColor:"#B5DEC5"}}>Prioritise</div>
                {(result.nutrition?.prioritize||[]).map((f,i)=>(
                  <div key={i} style={{padding:"6px 0",borderBottom:`1px solid ${C.border}`,fontSize:13,color:C.inkMid,display:"flex",gap:7}}><span style={{color:C.green}}>+</span>{f}</div>
                ))}
                <div style={{marginTop:18,fontSize:9,fontFamily:"'DM Mono',monospace",letterSpacing:".12em",textTransform:"uppercase",color:C.red,borderBottom:`1px solid #F5C5C5`,paddingBottom:8,marginBottom:14}}>Minimise</div>
                {(result.nutrition?.minimize||[]).map((f,i)=>(
                  <div key={i} style={{padding:"6px 0",borderBottom:`1px solid ${C.border}`,fontSize:13,color:C.inkMid,display:"flex",gap:7}}><span style={{color:C.red}}>−</span>{f}</div>
                ))}
              </div>
            </div>
          )}

          {/* EXERCISE */}
          {tab==="exercise" && (
            <div className="fade" style={{display:"flex",flexDirection:"column",gap:12}}>
              <div className="card" style={{background:"#F0F5F2",border:`1px solid #C5DDCF`}}>
                <div className="sh" style={{color:C.accentMid,borderColor:"#C5DDCF"}}>Weekly Blueprint</div>
                <p style={{fontSize:14,color:C.accentMid}}>{result.exercise?.weeklyBlueprint}</p>
              </div>
              {(result.exercise?.zones||[]).map((z,i)=>(
                <div key={i} className="card" style={{display:"grid",gridTemplateColumns:"150px 1fr",gap:18,alignItems:"start"}}>
                  <div style={{background:C.bg,borderRadius:7,padding:"12px",textAlign:"center"}}>
                    <div style={{fontSize:12,fontWeight:700,color:C.accent,marginBottom:5}}>{z.modality}</div>
                    <div style={{fontSize:10,fontFamily:"'DM Mono',monospace",color:C.inkMid}}>{z.frequency}</div>
                    <div style={{fontSize:10,fontFamily:"'DM Mono',monospace",color:C.inkLight}}>{z.duration}</div>
                  </div>
                  <div>
                    <p style={{fontSize:13,lineHeight:1.7,color:C.inkMid}}>{z.why}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* SUPPLEMENTS */}
          {tab==="supplements" && (
            <div className="fade">
              {!form.history.medications && <div className="warn" style={{marginBottom:14}}>⚠ Medication reconciliation not completed — review all supplement recommendations before use.</div>}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                {(result.supplements||[]).map((s,i)=>(
                  <div key={i} className="card">
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6,gap:8,flexWrap:"wrap"}}>
                      <span style={{fontSize:14,fontWeight:700}}>{s.name}</span>
                      {s.interaction?.startsWith("Flag") && <span style={{fontSize:9,color:C.red,fontFamily:"'DM Mono',monospace",background:"#FFF0F0",padding:"2px 7px",borderRadius:4,border:`1px solid #F5C5C5`}}>⚠ {s.interaction}</span>}
                    </div>
                    <div style={{fontSize:10,fontFamily:"'DM Mono',monospace",color:C.gold,marginBottom:6}}>{s.timing}</div>
                    <p style={{fontSize:12,lineHeight:1.6,color:C.inkMid}}>{s.rationale}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* MONITORING */}
          {tab==="monitoring" && (
            <div className="fade card">
              {[{key:"twoWeeks",label:"2 Weeks"},{key:"oneMonth",label:"1 Month"},{key:"threeMonths",label:"3 Months"},{key:"sixMonths",label:"6 Months"}].map(({key,label},i,arr)=>(
                <div key={key} style={{display:"grid",gridTemplateColumns:"90px 1fr",gap:18,padding:"14px 0",borderBottom:i<arr.length-1?`1px solid ${C.border}`:"none",alignItems:"start"}}>
                  <div style={{fontSize:11,fontFamily:"'DM Mono',monospace",color:C.accentLt,fontWeight:500,paddingTop:2}}>{label}</div>
                  <p style={{fontSize:13,lineHeight:1.65,color:C.inkMid}}>{result.followUp?.[key]}</p>
                </div>
              ))}
            </div>
          )}

        </div>
      )}
    </div>
  );
}
