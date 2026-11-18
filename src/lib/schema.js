/**
 * schema.js — the shape of a Sano patient record
 * ---------------------------------------------------------------------------
 * PURE MODULE. No React. No DOM. No side effects.
 *
 * This is the single source of truth for what the tool collects: which labs,
 * which body and lifestyle fields, which PREVENT inputs, and what an empty
 * record looks like. The UI renders from it, buildContext() walks it to
 * assemble the AI context, and the evaluation fixtures are validated against
 * it, so a field added here reaches all three without being re-declared.
 *
 * Extracted from App.jsx in PH1-EVAL-01. Nothing here was rewritten: the
 * definitions are the originals, moved verbatim, so the extraction could be
 * proved output-identical before it shipped.
 *
 * `domain` on each analyte feeds the coverage dials in algorithms/completeness.js.
 * `unit` names a conversion in algorithms/units.js; null means the value is
 * unit-free (a ratio or a score) and `placeholder` carries any display hint.
 */

export const SCHEMA_VERSION = "1.0.0";

// ─── Intake steps ─────────────────────────────────────────────────────────────
export const STEPS = [
  { id:"patient",    label:"Patient Profile",       icon:"◎" },
  { id:"history",    label:"History & Medications", icon:"⊕" },
  { id:"labs",       label:"Lab Biomarkers",         icon:"⬡" },
  { id:"lifestyle",  label:"Lifestyle",              icon:"◈" },
  { id:"body",       label:"Body Composition",       icon:"◉" },
];

// ─── Lab groups with analyte keys and which domain they feed ──────────────────
export const LAB_GROUPS = [
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
export const PREVENT_BASE = [
  { key:"pAge",    label:"Age",                    type:"number", range:"30–79" },
  { key:"pSex",    label:"Sex",                    type:"select", options:["Male","Female"] },
  { key:"pTC",     label:"Total Cholesterol",      unit:"cholesterol" },
  { key:"pHDL",    label:"HDL-C",                  unit:"cholesterol" },
  { key:"pSBP",    label:"Systolic BP",             unit:"bp" },
  { key:"pBPtx",   label:"On BP medication",        type:"select", options:["No","Yes"] },
  { key:"pDM",     label:"Diabetes",               type:"select", options:["No","Yes"] },
  { key:"pSmoke",  label:"Current smoker",          type:"select", options:["No","Yes"] },
  // unit:null, not "alt" — "alt" is the ALT enzyme and rendered eGFR as "U/L".
  { key:"pEGFR",   label:"eGFR",                   unit:null, placeholder:"mL/min/1.73m²" },
  { key:"pBMI",    label:"BMI",                    unit:null, placeholder:"kg/m²" },
  { key:"pHbA1c",  label:"HbA1c (optional)",       unit:"hba1c", placeholder:"extended model" },
  { key:"pUACR",   label:"UACR (optional)",         unit:"uacr",  placeholder:"extended model" },
];

// Risk enhancers (ACC/AHA — NOT part of PREVENT calculation)
export const RISK_ENHANCERS = [
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

// ─── Lifestyle ────────────────────────────────────────────────────────────────
export const LIFESTYLE_FIELDS = [
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

// ─── Body composition ─────────────────────────────────────────────────────────
export const BODY_FIELDS = [
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

// ─── An empty patient record ──────────────────────────────────────────────────
// Returns a fresh object every call — callers mutate their copy, so a shared
// constant here would leak one patient's data into the next.
export const blank = () => ({
  patient:  { name:"", age:"", sex:"Male", chiefGoal:"Longevity & Prevention", targetPhilosophy:"Guideline-based" },
  history:  { conditions:"", medications:"", supplements:"", allergies:"", familyHx:"", femaleRepro:"", sleepApneaScreen:"No" },
  labs:     {},
  prevent:  { enabled:false, pSex:"Male", pBPtx:"No", pDM:"No", pSmoke:"No" },
  enhancers:{},
  lifestyle:{ sleepQ:"Good", stress:"3 – Moderate", smoking:"Never", diet:"Mixed" },
  body:     {},
});
