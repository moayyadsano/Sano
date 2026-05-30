import { useState } from "react";

const C = {
  bg:"#F5F2EC", surface:"#FDFBF8", border:"#E2DDD5", borderDk:"#C9C2B6",
  ink:"#1A1916", inkMid:"#5A554D", inkLight:"#9A9489",
  accent:"#1E3A2F", accentMid:"#2D5441", accentLt:"#4A7C65",
  gold:"#8B6914", goldLt:"#B8913A", red:"#8B2020", amber:"#8B5E14", green:"#1A5C35",
};

const STEPS = [
  { id:"patient",   label:"Patient Profile",  icon:"◎" },
  { id:"labs",      label:"Lab Biomarkers",    icon:"⬡" },
  { id:"lifestyle", label:"Lifestyle",         icon:"◈" },
  { id:"body",      label:"Body Composition",  icon:"◉" },
];

// PREVENT score inputs (AHA 2026 guidelines)
const PREVENT_FIELDS = [
  "preventAge","preventSex","preventSystolic","preventTotalChol","preventHDL",
  "preventDiabetes","preventSmoking","preventBMI","preventEGFR","preventSBPtreated",
  "preventClinicalASCVD","preventLDL","preventCKDStage","preventCAC",
  "preventFamilyHistory","preventLpa","preventApoBprev","preventHsCRPprev",
  "preventMetSyndrome","preventInflamDisease","preventSouthAsian","preventHighTG",
];

const LAB_GROUPS = {
  "Cardiovascular":  ["apoB","lpA","ldl","hdl","triglycerides","hsCRP"],
  "Metabolic":       ["fastingGlucose","fastingInsulin","homaIR","hba1c"],
  "Hormonal (Male & Female)": ["tsh","freeT3","freeT4","totalTestosterone","freeTestosterone","dheas","morningCortisol","estradiol","progesterone","lh","fsh","shbg","prolactin"],
  "Micronutrients":  ["vitD","b12","ferritin"],
  "Organ Function":  ["creatinine","alt","ast"],
};

const FM = {
  // Patient
  name:{label:"Full Name",type:"text"},
  age:{label:"Age",type:"number",placeholder:"e.g. 42"},
  sex:{label:"Sex",type:"select",options:["Male","Female"]},
  chiefGoal:{label:"Primary Health Goal",type:"select",options:["Longevity & Prevention","Energy & Performance","Cardiovascular Health","Metabolic Optimization","Hormonal Balance","Weight & Body Composition","Cognitive Performance"]},
  // PREVENT
  preventAge:{label:"Age",type:"number",placeholder:"e.g. 50"},
  preventSex:{label:"Sex",type:"select",options:["Male","Female"]},
  preventSystolic:{label:"Systolic BP",unit:"mmHg",type:"number"},
  preventTotalChol:{label:"Total Cholesterol",unit:"mmol/L",type:"number"},
  preventHDL:{label:"HDL Cholesterol",unit:"mmol/L",type:"number"},
  preventDiabetes:{label:"Diabetes",type:"select",options:["No","Yes"]},
  preventSmoking:{label:"Current Smoker",type:"select",options:["No","Yes"]},
  preventBMI:{label:"BMI",unit:"kg/m2",type:"number"},
  preventEGFR:{label:"eGFR",unit:"mL/min/1.73m2",type:"number"},
  preventSBPtreated:{label:"On BP Medication",type:"select",options:["No","Yes"]},
  // PREVENT 2026 — Step 1 overrides & risk enhancers
  preventClinicalASCVD:{label:"Clinical ASCVD",type:"select",options:["No","Yes"]},
  preventLDL:{label:"LDL-C",unit:"mg/dL",type:"number"},
  preventCKDStage:{label:"CKD Stage",type:"select",options:["None","1","2","3","4","5"]},
  preventCAC:{label:"CAC Score",unit:"Agatston",type:"number"},
  preventFamilyHistory:{label:"Family Hx Premature ASCVD",type:"select",options:["No","Yes"]},
  preventLpa:{label:"Lp(a) elevated (>50 mg/dL)",type:"select",options:["No","Yes"]},
  preventApoBprev:{label:"ApoB elevated (>=80 mg/dL)",type:"select",options:["No","Yes"]},
  preventHsCRPprev:{label:"hsCRP elevated (>3 mg/L)",type:"select",options:["No","Yes"]},
  preventMetSyndrome:{label:"Metabolic Syndrome",type:"select",options:["No","Yes"]},
  preventInflamDisease:{label:"Chronic Inflammatory Disease",type:"select",options:["No","Yes"]},
  preventSouthAsian:{label:"South Asian Ancestry",type:"select",options:["No","Yes"]},
  preventHighTG:{label:"Hypertriglyceridemia",type:"select",options:["No","Yes"]},
  // Labs
  apoB:{label:"ApoB",unit:"mg/dL"}, lpA:{label:"Lp(a)",unit:"nmol/L"},
  ldl:{label:"LDL",unit:"mmol/L"}, hdl:{label:"HDL",unit:"mmol/L"},
  triglycerides:{label:"Triglycerides",unit:"mmol/L"}, hsCRP:{label:"hs-CRP",unit:"mg/L"},
  fastingGlucose:{label:"Fasting Glucose",unit:"mg/dL"}, fastingInsulin:{label:"Fasting Insulin",unit:"uIU/mL"},
  homaIR:{label:"HOMA-IR",unit:""}, hba1c:{label:"HbA1c",unit:"%"},
  // Hormonal
  tsh:{label:"TSH",unit:"mIU/L"}, freeT3:{label:"Free T3",unit:"pg/mL"}, freeT4:{label:"Free T4",unit:"ng/dL"},
  totalTestosterone:{label:"Total Testosterone",unit:"ng/dL"}, freeTestosterone:{label:"Free Testosterone",unit:"pg/mL"},
  dheas:{label:"DHEA-S",unit:"ug/dL"}, morningCortisol:{label:"Morning Cortisol",unit:"ug/dL"},
  estradiol:{label:"Estradiol (E2)",unit:"pg/mL"}, progesterone:{label:"Progesterone",unit:"ng/mL"},
  lh:{label:"LH",unit:"IU/L"}, fsh:{label:"FSH",unit:"IU/L"},
  shbg:{label:"SHBG",unit:"nmol/L"}, prolactin:{label:"Prolactin",unit:"ng/mL"},
  // Micronutrients
  vitD:{label:"Vitamin D",unit:"nmol/L"}, b12:{label:"Vitamin B12",unit:"pg/mL"}, ferritin:{label:"Ferritin",unit:"ng/mL"},
  // Organ
  creatinine:{label:"Creatinine",unit:"mg/dL"}, alt:{label:"ALT",unit:"U/L"}, ast:{label:"AST",unit:"U/L"},
  // Lifestyle
  sleepHours:{label:"Avg Sleep",unit:"hrs/night",type:"number"},
  sleepQuality:{label:"Sleep Quality",type:"select",options:["Excellent","Good","Fair","Poor"]},
  stressLevel:{label:"Stress Level",type:"select",options:["1 - Minimal","2","3 - Moderate","4","5 - Severe"]},
  exerciseDays:{label:"Exercise Frequency",unit:"days/week",type:"number"},
  exerciseType:{label:"Exercise Type",type:"text",placeholder:"e.g. Weights, Running"},
  exerciseMinutes:{label:"Session Duration",unit:"min",type:"number"},
  smokingStatus:{label:"Smoking Status",type:"select",options:["Never","Former","Current"]},
  alcoholUnits:{label:"Alcohol",unit:"units/week",type:"number"},
  dietPattern:{label:"Diet Pattern",type:"select",options:["Mixed","Mediterranean","Low-carb Keto","Plant-based","Carnivore","Intermittent Fasting"]},
  // Body
  weightKg:{label:"Weight",unit:"kg",type:"number"}, heightCm:{label:"Height",unit:"cm",type:"number"},
  bmi:{label:"BMI",unit:"",type:"number"}, bodyFatPct:{label:"Body Fat",unit:"%",type:"number"},
  muscleMassKg:{label:"Muscle Mass",unit:"kg",type:"number"}, visceralFatScore:{label:"Visceral Fat Score",unit:"",type:"number"},
  waistCm:{label:"Waist",unit:"cm",type:"number"}, systolicBP:{label:"Systolic BP",unit:"mmHg",type:"number"},
  diastolicBP:{label:"Diastolic BP",unit:"mmHg",type:"number"}, restingHR:{label:"Resting HR",unit:"bpm",type:"number"},
};

const PATIENT_FIELDS   = ["name","age","sex","chiefGoal"];
const LIFESTYLE_FIELDS = ["sleepHours","sleepQuality","stressLevel","exerciseDays","exerciseType","exerciseMinutes","smokingStatus","alcoholUnits","dietPattern"];
const BODY_FIELDS      = ["weightKg","heightCm","bmi","bodyFatPct","muscleMassKg","visceralFatScore","waistCm","systolicBP","diastolicBP","restingHR"];

const blank = () => {
  const f = { patient:{}, prevent:{}, labs:{}, lifestyle:{}, body:{} };
  PATIENT_FIELDS.forEach(k => f.patient[k] = FM[k]?.options?.[0] ?? "");
  PREVENT_FIELDS.forEach(k => f.prevent[k] = FM[k]?.options?.[0] ?? "");
  // Default the new Yes/No selects explicitly to "No"
  ["preventClinicalASCVD","preventFamilyHistory","preventLpa","preventApoBprev",
   "preventHsCRPprev","preventMetSyndrome","preventInflamDisease","preventSouthAsian","preventHighTG"
  ].forEach(k => f.prevent[k] = "No");
  Object.values(LAB_GROUPS).flat().forEach(k => f.labs[k] = "");
  LIFESTYLE_FIELDS.forEach(k => f.lifestyle[k] = FM[k]?.options?.[0] ?? "");
  BODY_FIELDS.forEach(k => f.body[k] = "");
  return f;
};

// ── AHA PREVENT Score Engine (2026) ─────────────────────────────────────────
// Based on Khan et al., Circulation 2023 equations + 2026 risk category thresholds

function calcPREVENT(p) {
  // ── STEP 1: HIGH-RISK OVERRIDES ──
  const clinicalASCVD = p.preventClinicalASCVD === "Yes";
  const ldl_mgdl      = parseFloat(p.preventLDL);
  const ckdStage      = parseInt(p.preventCKDStage) || 0;
  const dm            = p.preventDiabetes === "Yes";
  const age           = parseFloat(p.preventAge);

  if (clinicalASCVD) {
    return {
      risk: null, override: true,
      category: "Very High Risk",
      color: C.red,
      lipidGoal: "LDL-C <70 mg/dL · ApoB <65 mg/dL",
      recommendation: "Established ASCVD. Secondary prevention strategy required. Intensive lipid lowering, BP management, diabetes optimization, smoking cessation, weight optimization, cardiology follow-up.",
      riskEnhancers: [],
    };
  }

  if (!isNaN(ldl_mgdl) && ldl_mgdl >= 190) {
    return {
      risk: null, override: true,
      category: "Severe Hypercholesterolaemia",
      color: C.red,
      lipidGoal: "LDL-C <70 mg/dL · ApoB <65 mg/dL",
      recommendation: "Marked elevation in lifetime ASCVD risk. Lipid-lowering therapy indicated. Evaluate for familial hypercholesterolaemia. Assess family history. Monitor treatment response.",
      riskEnhancers: [],
    };
  }

  // ── STEP 2: CALCULATE 10-YEAR PREVENT SCORE ──
  const sbp  = parseFloat(p.preventSystolic);
  const tc   = parseFloat(p.preventTotalChol);  // mmol/L
  const hdl  = parseFloat(p.preventHDL);         // mmol/L
  const bmi  = parseFloat(p.preventBMI);
  const egfr = parseFloat(p.preventEGFR);
  const smk  = p.preventSmoking === "Yes" ? 1 : 0;
  const bpt  = p.preventSBPtreated === "Yes" ? 1 : 0;
  const sex  = p.preventSex;

  let riskVal = null;
  let scoreAvailable = false;

  if (![age,sbp,tc,hdl,bmi].some(isNaN) && age >= 30 && age <= 79) {
    scoreAvailable = true;
    const egfrVal = isNaN(egfr) ? 90 : egfr;
    const nonHDL  = tc - hdl;
    const dmNum   = dm ? 1 : 0;
    let lp;
    if (sex === "Male") {
      lp = -0.9119
        + 0.0168 * (age - 55)
        + 0.4620 * Math.log(sbp / 110)
        + 0.0850 * bpt
        + 0.2813 * Math.log(Math.max(nonHDL, 0.5))
        - 0.1157 * Math.log(Math.max(hdl, 0.3))
        + 0.5180 * dmNum
        + 0.3580 * smk
        - 0.0010 * (age - 55) * (sbp - 110)
        - 0.0261 * Math.max(0, Math.log(egfrVal / 60));
    } else {
      lp = -1.1888
        + 0.0196 * (age - 55)
        + 0.4312 * Math.log(sbp / 110)
        + 0.0897 * bpt
        + 0.2461 * Math.log(Math.max(nonHDL, 0.5))
        - 0.1209 * Math.log(Math.max(hdl, 0.3))
        + 0.5100 * dmNum
        + 0.3580 * smk
        - 0.0009 * (age - 55) * (sbp - 110)
        - 0.0261 * Math.max(0, Math.log(egfrVal / 60));
    }
    riskVal = Math.min(Math.max((1 - Math.exp(-Math.exp(lp))) * 100, 0.1), 99.9);
  }

  // ── STEP 3: RISK ENHANCERS ──
  const enhancers = [];
  if (p.preventFamilyHistory   === "Yes") enhancers.push("Family history of premature ASCVD");
  if (p.preventApoBprev        === "Yes") enhancers.push("ApoB elevated");
  if (p.preventLpa             === "Yes") enhancers.push("Lp(a) elevated");
  if (p.preventHsCRPprev       === "Yes") enhancers.push("hsCRP elevated");
  if (ckdStage >= 3)                      enhancers.push("CKD stage " + ckdStage);
  if (p.preventMetSyndrome     === "Yes") enhancers.push("Metabolic syndrome");
  if (p.preventInflamDisease   === "Yes") enhancers.push("Chronic inflammatory disease");
  if (p.preventSouthAsian      === "Yes") enhancers.push("South Asian ancestry");
  if (p.preventHighTG          === "Yes") enhancers.push("Persistent hypertriglyceridaemia");

  // ── STEP 4: CAC INTERPRETATION ──
  const cacRaw = parseFloat(p.preventCAC);
  let cacNote = null;
  if (!isNaN(cacRaw)) {
    if (cacRaw === 0)          cacNote = "CAC 0: Very low short-term ASCVD risk. Absence of detectable coronary calcified plaque.";
    else if (cacRaw < 100)     cacNote = "CAC 1–99: Mild plaque burden. Risk may be higher than predicted by biomarkers alone.";
    else if (cacRaw < 300)     cacNote = "CAC 100–299: Moderate atherosclerotic burden. Supports aggressive preventive intervention.";
    else if (cacRaw < 1000)    cacNote = "CAC 300–999: High plaque burden. Associated with substantially elevated cardiovascular risk.";
    else                       cacNote = "CAC ≥1000: Very high cardiovascular risk. Management should approach secondary prevention intensity.";
  }

  // ── STEP 5: RISK CATEGORY + LIPID GOALS ──
  let category, color, recommendation, lipidGoal;

  // Additional flags from step 1 (not overrides but affect therapy)
  const dmTherapyIndicated = dm && !isNaN(age) && age >= 40 && age <= 75;
  const ckdTherapyIndicated = ckdStage >= 3;

  if (!scoreAvailable) {
    // Can't calculate — still provide enhancer/CAC output
    category = "Score Unavailable";
    color = C.inkMid;
    lipidGoal = "Enter age (30–79), SBP, total cholesterol, HDL, and BMI to calculate";
    recommendation = "Insufficient data for 10-year PREVENT calculation. Risk enhancer and CAC assessment still provided below.";
  } else if (riskVal < 3) {
    category = "Low Risk";
    color = C.green;
    lipidGoal = "LDL-C <100 mg/dL · Non-HDL-C <130 mg/dL";
    recommendation = "Low predicted 10-year CVD risk. Focus on lifestyle optimisation: regular exercise, Mediterranean-style nutrition, sleep, weight management, tobacco avoidance. Periodic reassessment.";
  } else if (riskVal < 5) {
    category = "Borderline Risk";
    color = C.gold;
    lipidGoal = "LDL-C <100 mg/dL · Non-HDL-C <130 mg/dL";
    recommendation = "Mildly elevated cardiovascular risk. Assess risk enhancers. Shared decision-making regarding lipid lowering. Consider CAC scoring if treatment decision uncertain.";
  } else if (riskVal < 10) {
    category = "Intermediate Risk";
    color = C.amber;
    lipidGoal = "LDL-C <100 mg/dL · Non-HDL-C <130 mg/dL";
    recommendation = "Clinically meaningful elevation in CVD risk. Intensive lifestyle optimisation. Consider moderate- to high-intensity statin therapy. Evaluate risk enhancers. Consider CAC scoring if uncertainty remains. Optimise BP and metabolic health.";
  } else {
    category = "High Risk";
    color = C.red;
    lipidGoal = "LDL-C <70 mg/dL · ApoB <65 mg/dL";
    recommendation = "High predicted cardiovascular risk. Intensive preventive therapy indicated. Lipid lowering recommended. Aggressive BP management, diabetes optimisation, smoking cessation, weight reduction. Specialist referral when appropriate.";
  }

  // ── STEP 5: FINAL OPTIMISATION LOGIC (composite output note) ──
  let compositeNote = null;
  if (scoreAvailable) {
    const apoBHigh = p.preventApoBprev === "Yes";
    const crpLow   = p.preventHsCRPprev !== "Yes";
    const cac0     = !isNaN(cacRaw) && cacRaw === 0;
    const cacHigh  = !isNaN(cacRaw) && cacRaw > 100;

    if (riskVal < 3 && !apoBHigh && crpLow && cac0) {
      compositeNote = "Excellent cardiovascular risk profile. Continue focusing on exercise, nutrition, sleep quality, body composition, and routine monitoring.";
    } else if (riskVal < 3 && apoBHigh) {
      compositeNote = "Short-term cardiovascular risk is low; however ApoB is substantially elevated and may indicate increased lifetime atherosclerotic risk. Further lipid optimisation and risk stratification should be considered.";
    } else if (riskVal >= 5 && riskVal < 10 && cacHigh) {
      compositeNote = "Intermediate cardiovascular risk with objective evidence of coronary atherosclerosis. Preventive pharmacologic therapy and aggressive risk-factor modification should be strongly considered.";
    } else if (riskVal >= 10) {
      compositeNote = "High cardiovascular risk. Intensive lifestyle intervention and evidence-based preventive therapies are recommended to reduce future cardiovascular events.";
    }
  }

  return {
    risk: riskVal !== null ? riskVal.toFixed(1) : null,
    override: false,
    category, color, recommendation, lipidGoal,
    riskEnhancers: enhancers,
    cacNote,
    compositeNote,
    dmTherapyIndicated,
    ckdTherapyIndicated,
  };
}

// ── API helper ────────────────────────────────────────────────────────────────
async function askAI(prompt) {
  const res = await fetch("/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const data = await res.json();
  return data.text;
}

function safeJSON(text) {
  let s = text.replace(/```json|```/gi, "").trim();
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a !== -1 && b !== -1) s = s.slice(a, b + 1);
  s = s.replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "");
  s = s.replace(/,\s*([}\]])/g, "$1");
  return JSON.parse(s);
}

// ── 4 small AI prompts ────────────────────────────────────────────────────────
const unitNote = "Use mmol/L for LDL/HDL/Triglycerides, nmol/L for Vitamin D.";

function p1(filled) {
  return `Longevity physician AI. Patient data: ${JSON.stringify(filled)}. ${unitNote}
Return ONLY raw JSON, no markdown, ASCII only:
{"summary":"one sentence clinical overview","biologicalAge":40,"longevityNote":"one sentence longevity leverage","scores":{"overall":70,"cardiovascular":70,"metabolic":70,"hormonal":70,"longevity":70,"physical":70}}`;
}
function p2(filled) {
  return `Longevity physician AI. Patient data: ${JSON.stringify(filled)}. ${unitNote} Keep each string under 100 chars. Return ONLY raw JSON, no markdown, ASCII only:
{"findings":[{"title":"string","priority":"Critical","detail":"string"},{"title":"string","priority":"High","detail":"string"},{"title":"string","priority":"Medium","detail":"string"},{"title":"string","priority":"Low","detail":"string"}],"targets":[{"biomarker":"string","current":"string","optimal":"string","timeline":"string"},{"biomarker":"string","current":"string","optimal":"string","timeline":"string"},{"biomarker":"string","current":"string","optimal":"string","timeline":"string"}]}`;
}
function p3(filled, smokingStatus) {
  const smokingNote = smokingStatus === "Current"
    ? 'IMPORTANT: Include "Smoking cessation" as the first item in actionPlan.now. Do NOT mention NRT.'
    : '';
  return `Longevity physician AI. Patient data: ${JSON.stringify(filled)}. ${unitNote} ${smokingNote} Keep each string under 100 chars. Return ONLY raw JSON, no markdown, ASCII only:
{"actionPlan":{"now":["string","string","string"],"threeMonths":["string","string","string"],"sixMonths":["string","string","string"]},"nutrition":{"approach":"string","principles":["string","string","string"],"prioritize":["string","string","string","string"],"minimize":["string","string","string"]}}`;
}
function p4(filled) {
  return `Longevity physician AI. Patient data: ${JSON.stringify(filled)}. ${unitNote}
SUPPLEMENT RULES: No dosages. No iron bisglycinate - use "Iron supplement" instead. No NRT. Keep each string under 100 chars. Return ONLY raw JSON, no markdown, ASCII only:
{"exercise":{"weeklyBlueprint":"string","zones":[{"modality":"string","frequency":"string","duration":"string","why":"string"},{"modality":"string","frequency":"string","duration":"string","why":"string"},{"modality":"string","frequency":"string","duration":"string","why":"string"}]},"supplements":[{"name":"string","timing":"string","rationale":"string"},{"name":"string","timing":"string","rationale":"string"},{"name":"string","timing":"string","rationale":"string"},{"name":"string","timing":"string","rationale":"string"},{"name":"string","timing":"string","rationale":"string"}],"followUp":{"twoWeeks":"string","oneMonth":"string","threeMonths":"string","sixMonths":"string"}}`;
}

// ── PDF/Print export ──────────────────────────────────────────────────────────
function downloadReport(form, result, preventResult) {
  const patientName = form.patient.name || "Patient";
  const date = new Date().toLocaleDateString("en-GB", { day:"2-digit", month:"long", year:"numeric" });

  const scoreRows = Object.entries(result.scores || {})
    .map(([k, v]) => `<tr><td style="padding:6px 12px;text-transform:capitalize;font-size:13px;">${k}</td><td style="padding:6px 12px;font-weight:700;font-size:13px;">${v}/100</td></tr>`)
    .join("");

  const findingRows = (result.findings || [])
    .map(f => `<tr><td style="padding:8px 12px;font-weight:600;font-size:13px;">${f.title}</td><td style="padding:8px 12px;font-size:11px;font-weight:700;text-transform:uppercase;color:${f.priority==="Critical"?"#8B2020":f.priority==="High"?"#8B5E14":f.priority==="Medium"?"#8B6914":"#1A5C35"};">${f.priority}</td><td style="padding:8px 12px;font-size:12px;color:#5A554D;">${f.detail}</td></tr>`)
    .join("");

  const targetRows = (result.targets || [])
    .map(t => `<tr><td style="padding:7px 12px;font-weight:600;font-size:13px;">${t.biomarker}</td><td style="padding:7px 12px;font-size:13px;color:#8B5E14;">${t.current}</td><td style="padding:7px 12px;font-size:13px;color:#1A5C35;">${t.optimal}</td><td style="padding:7px 12px;font-size:12px;color:#9A9489;">${t.timeline}</td></tr>`)
    .join("");

  const actionSection = (label, items, color) => items?.length
    ? `<h4 style="font-size:12px;font-family:monospace;letter-spacing:0.1em;text-transform:uppercase;color:${color};margin:14px 0 8px;">${label}</h4>
       <ul style="margin:0;padding-left:18px;">${items.map(a=>`<li style="font-size:13px;color:#5A554D;margin-bottom:5px;">${a}</li>`).join("")}</ul>`
    : "";

  const suppRows = (result.supplements || [])
    .map(s => `<tr><td style="padding:7px 12px;font-weight:600;font-size:13px;">${s.name}</td><td style="padding:7px 12px;font-size:12px;color:#8B6914;">${s.timing}</td><td style="padding:7px 12px;font-size:12px;color:#5A554D;">${s.rationale}</td></tr>`)
    .join("");

  const followUpRows = [
    {key:"twoWeeks",label:"2 Weeks"},
    {key:"oneMonth",label:"1 Month"},
    {key:"threeMonths",label:"3 Months"},
    {key:"sixMonths",label:"6 Months"},
  ].map(({key,label}) => result.followUp?.[key]
    ? `<tr><td style="padding:8px 12px;font-weight:600;font-size:12px;color:#4A7C65;white-space:nowrap;">${label}</td><td style="padding:8px 12px;font-size:13px;color:#5A554D;">${result.followUp[key]}</td></tr>`
    : "").join("");

  const preventSection = preventResult ? (() => {
    const riskDisplay = preventResult.risk !== null ? preventResult.risk + "%" : preventResult.category;
    const enhancerHtml = preventResult.riskEnhancers?.length
      ? `<div style="margin-top:10px;"><div style="font-size:11px;font-family:monospace;text-transform:uppercase;color:#8B5E14;margin-bottom:6px;">Risk Enhancers Present</div><div>${preventResult.riskEnhancers.map(e=>`<span style="display:inline-block;margin:2px 4px 2px 0;padding:2px 8px;background:#FFF8EC;border:1px solid #F0DDB5;border-radius:4px;font-size:11px;color:#8B5E14;">${e}</span>`).join("")}</div></div>`
      : "";
    const cacHtml = preventResult.cacNote
      ? `<div style="margin-top:10px;padding:10px;background:#FFF8EC;border-radius:6px;border:1px solid #F0DDB5;font-size:13px;color:#5A554D;">${preventResult.cacNote}</div>`
      : "";
    const compositeHtml = preventResult.compositeNote
      ? `<div style="margin-top:10px;padding:10px;background:#F0F5F2;border-radius:6px;border:1px solid #C5DDCF;font-size:13px;color:#2D5441;font-style:italic;">${preventResult.compositeNote}</div>`
      : "";
    const lipidHtml = preventResult.lipidGoal
      ? `<div style="margin-top:10px;padding:8px 12px;background:#EEF5F1;border-radius:6px;border:1px solid #C5DDCF;font-size:13px;color:#2D5441;"><strong>Lipid Goal:</strong> ${preventResult.lipidGoal}</div>`
      : "";
    return `
    <div style="margin-bottom:28px;">
      <h2 style="font-size:15px;font-family:monospace;letter-spacing:0.12em;text-transform:uppercase;color:#4A7C65;border-bottom:1px solid #E2DDD5;padding-bottom:8px;margin-bottom:14px;">AHA PREVENT 2026 — 10-Year CVD Risk</h2>
      <div style="display:flex;align-items:flex-start;gap:20px;padding:16px;background:#F5F8F5;border-radius:8px;border:1px solid #C5DDCF;">
        <div style="text-align:center;min-width:80px;">
          <div style="font-size:36px;font-weight:700;color:${preventResult.color};">${riskDisplay}</div>
          <div style="font-size:12px;font-weight:700;color:${preventResult.color};margin-top:4px;">${preventResult.category}</div>
        </div>
        <div style="flex:1;">
          <div style="font-size:13px;color:#5A554D;line-height:1.6;">${preventResult.recommendation}</div>
          ${lipidHtml}${enhancerHtml}${cacHtml}${compositeHtml}
        </div>
      </div>
    </div>`;
  })() : "";

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Sano Report - ${patientName}</title>
<style>
  body { font-family: 'Georgia', serif; background: #F5F2EC; color: #1A1916; margin: 0; padding: 0; }
  .page { max-width: 800px; margin: 0 auto; padding: 48px 40px; background: #FDFBF8; }
  h1 { font-size: 28px; font-weight: 700; margin: 0 0 4px; }
  h2 { font-size: 15px; font-family: monospace; letter-spacing: 0.12em; text-transform: uppercase; color: #4A7C65; border-bottom: 1px solid #E2DDD5; padding-bottom: 8px; margin: 28px 0 14px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  tr:nth-child(even) { background: #F5F2EC; }
  .header { background: #1E3A2F; color: white; padding: 24px 40px; }
  .header-sub { font-family: monospace; font-size: 11px; letter-spacing: 0.15em; text-transform: uppercase; color: rgba(255,255,255,0.5); margin-bottom: 6px; }
  .bio-age { display: inline-block; text-align: center; background: #F5F2EC; border: 1px solid #E2DDD5; border-radius: 8px; padding: 12px 20px; float: right; }
  @media print { body { background: white; } .page { padding: 24px; } }
</style>
</head>
<body>
<div class="header">
  <div class="header-sub">Health Optimization Report &nbsp;·&nbsp; ${date}</div>
  <h1 style="color:white;font-size:26px;">${patientName}</h1>
  <div style="font-family:monospace;font-size:12px;color:rgba(255,255,255,0.6);margin-top:4px;">
    ${[form.patient.age && `Age ${form.patient.age}`, form.patient.sex, form.patient.chiefGoal].filter(Boolean).join(" · ")}
  </div>
</div>
<div class="page">

  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px;gap:20px;">
    <div style="flex:1;">
      <h2 style="margin-top:0;">Clinical Summary</h2>
      <p style="font-size:15px;line-height:1.7;color:#5A554D;">${result.summary}</p>
      <p style="font-size:14px;line-height:1.7;color:#2D5441;font-style:italic;margin-top:12px;">${result.longevityNote}</p>
    </div>
    <div style="text-align:center;min-width:120px;border:1px solid #E2DDD5;border-radius:10px;padding:16px 20px;background:#FDFBF8;">
      <div style="font-size:10px;font-family:monospace;letter-spacing:0.1em;text-transform:uppercase;color:#9A9489;margin-bottom:6px;">Biological Age</div>
      <div style="font-size:40px;font-weight:700;color:${result.biologicalAge<=parseInt(form.patient.age||99)?"#1A5C35":"#8B5E14"};">${result.biologicalAge}</div>
      ${form.patient.age ? `<div style="font-size:11px;color:#9A9489;font-family:monospace;margin-top:4px;">vs chrono ${form.patient.age}</div>` : ""}
    </div>
  </div>

  <h2>Domain Scores</h2>
  <table><tbody>${scoreRows}</tbody></table>

  ${preventSection}

  <h2>Key Findings</h2>
  <table>
    <thead><tr style="background:#1E3A2F;color:white;">
      <th style="padding:8px 12px;text-align:left;font-size:11px;font-family:monospace;letter-spacing:0.1em;font-weight:400;">Finding</th>
      <th style="padding:8px 12px;text-align:left;font-size:11px;font-family:monospace;letter-spacing:0.1em;font-weight:400;">Priority</th>
      <th style="padding:8px 12px;text-align:left;font-size:11px;font-family:monospace;letter-spacing:0.1em;font-weight:400;">Detail</th>
    </tr></thead>
    <tbody>${findingRows}</tbody>
  </table>

  <h2>Biomarker Targets</h2>
  <table>
    <thead><tr style="background:#1E3A2F;color:white;">
      <th style="padding:8px 12px;text-align:left;font-size:11px;font-family:monospace;letter-spacing:0.1em;font-weight:400;">Biomarker</th>
      <th style="padding:8px 12px;text-align:left;font-size:11px;font-family:monospace;letter-spacing:0.1em;font-weight:400;">Current</th>
      <th style="padding:8px 12px;text-align:left;font-size:11px;font-family:monospace;letter-spacing:0.1em;font-weight:400;">Optimal Target</th>
      <th style="padding:8px 12px;text-align:left;font-size:11px;font-family:monospace;letter-spacing:0.1em;font-weight:400;">Timeline</th>
    </tr></thead>
    <tbody>${targetRows}</tbody>
  </table>

  <h2>Action Plan</h2>
  ${actionSection("Start Immediately", result.actionPlan?.now, "#8B2020")}
  ${actionSection("3-Month Milestones", result.actionPlan?.threeMonths, "#8B5E14")}
  ${actionSection("6-Month Goals", result.actionPlan?.sixMonths, "#1A5C35")}

  <h2>Nutrition</h2>
  <p style="font-size:14px;color:#2D5441;font-weight:600;margin-bottom:10px;">${result.nutrition?.approach}</p>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
    <div>
      <div style="font-size:11px;font-family:monospace;text-transform:uppercase;color:#4A7C65;margin-bottom:8px;">Prioritize</div>
      <ul style="margin:0;padding-left:16px;">${(result.nutrition?.prioritize||[]).map(f=>`<li style="font-size:13px;color:#5A554D;margin-bottom:4px;">${f}</li>`).join("")}</ul>
    </div>
    <div>
      <div style="font-size:11px;font-family:monospace;text-transform:uppercase;color:#8B2020;margin-bottom:8px;">Minimize</div>
      <ul style="margin:0;padding-left:16px;">${(result.nutrition?.minimize||[]).map(f=>`<li style="font-size:13px;color:#5A554D;margin-bottom:4px;">${f}</li>`).join("")}</ul>
    </div>
  </div>

  <h2>Exercise Prescription</h2>
  <p style="font-size:14px;color:#2D5441;margin-bottom:12px;">${result.exercise?.weeklyBlueprint}</p>
  ${(result.exercise?.zones||[]).map(z=>`
    <div style="display:flex;gap:16px;margin-bottom:10px;padding:10px;background:#F5F2EC;border-radius:6px;">
      <div style="min-width:130px;"><strong style="font-size:13px;color:#1E3A2F;">${z.modality}</strong><br><span style="font-size:11px;font-family:monospace;color:#9A9489;">${z.frequency} · ${z.duration}</span></div>
      <div style="font-size:13px;color:#5A554D;">${z.why}</div>
    </div>`).join("")}

  <h2>Supplement Protocol</h2>
  <table>
    <thead><tr style="background:#1E3A2F;color:white;">
      <th style="padding:8px 12px;text-align:left;font-size:11px;font-family:monospace;letter-spacing:0.1em;font-weight:400;">Supplement</th>
      <th style="padding:8px 12px;text-align:left;font-size:11px;font-family:monospace;letter-spacing:0.1em;font-weight:400;">Timing</th>
      <th style="padding:8px 12px;text-align:left;font-size:11px;font-family:monospace;letter-spacing:0.1em;font-weight:400;">Rationale</th>
    </tr></thead>
    <tbody>${suppRows}</tbody>
  </table>

  <h2>Follow-Up & Monitoring</h2>
  <table><tbody>${followUpRows}</tbody></table>

  <div style="margin-top:40px;padding-top:20px;border-top:1px solid #E2DDD5;font-size:11px;color:#9A9489;font-family:monospace;text-align:center;">
    Generated by Sano · Performance Medicine · ${date}<br>
    This report is a clinical aid for licensed physicians. It does not replace professional medical judgment.
  </div>
</div>
</body>
</html>`;

  const blob = new Blob([html], { type: "text/html" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `Sano_${patientName.replace(/\s+/g,"_")}_${new Date().toISOString().slice(0,10)}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── UI Components ─────────────────────────────────────────────────────────────
function Field({ fk, value, onChange }) {
  const m = FM[fk] || {};
  const base = { width:"100%", padding:"9px 12px", border:`1px solid ${C.border}`, borderRadius:6, fontSize:13, fontFamily:"'DM Mono',monospace", color:C.ink, background:C.surface, outline:"none", appearance:"none", boxSizing:"border-box" };
  if (m.type === "select") return (
    <div style={{position:"relative"}}>
      <select value={value} onChange={e=>onChange(e.target.value)} style={{...base,paddingRight:28,cursor:"pointer",width:"100%"}}>
        {m.options.map(o=><option key={o}>{o}</option>)}
      </select>
      <span style={{position:"absolute",right:9,top:"50%",transform:"translateY(-50%)",pointerEvents:"none",color:C.inkLight,fontSize:10}}>v</span>
    </div>
  );
  return (
    <div style={{position:"relative"}}>
      <input type={m.type||"text"} value={value} onChange={e=>onChange(e.target.value)} placeholder={m.placeholder||(m.unit?`${m.unit}`:"--")} style={base}/>
      {m.unit && <span style={{position:"absolute",right:9,top:"50%",transform:"translateY(-50%)",fontSize:10,color:C.inkLight,fontFamily:"'DM Mono',monospace",pointerEvents:"none"}}>{m.unit}</span>}
    </div>
  );
}

function FB({ fk, value, onChange }) {
  return (
    <div>
      <label style={{display:"block",fontSize:10,fontFamily:"'DM Mono',monospace",letterSpacing:"0.09em",textTransform:"uppercase",color:C.inkMid,marginBottom:6}}>{FM[fk]?.label||fk}</label>
      <Field fk={fk} value={value} onChange={onChange}/>
    </div>
  );
}

function Pill({ level }) {
  const m = {Critical:{bg:"#FFF0F0",color:C.red,bd:"#F5C5C5"},High:{bg:"#FFF8EC",color:C.amber,bd:"#F0DDB5"},Medium:{bg:"#FFFBEC",color:C.gold,bd:"#EDE0A5"},Low:{bg:"#F0FAF3",color:C.green,bd:"#B5DEC5"}};
  const s = m[level]||m.Medium;
  return <span style={{fontSize:10,fontFamily:"'DM Mono',monospace",letterSpacing:"0.1em",textTransform:"uppercase",padding:"3px 9px",borderRadius:20,background:s.bg,color:s.color,border:`1px solid ${s.bd}`,whiteSpace:"nowrap"}}>{level}</span>;
}

function Dial({ label, score }) {
  const r=30, ci=2*Math.PI*r;
  const clr = score>=80?C.green:score>=60?C.gold:score>=40?C.amber:C.red;
  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:8}}>
      <svg width="76" height="76" viewBox="0 0 76 76">
        <circle cx="38" cy="38" r={r} fill="none" stroke={C.border} strokeWidth="5"/>
        <circle cx="38" cy="38" r={r} fill="none" stroke={clr} strokeWidth="5" strokeDasharray={`${(score/100)*ci} ${ci}`} strokeLinecap="round" transform="rotate(-90 38 38)" style={{transition:"stroke-dasharray 1.1s cubic-bezier(.4,0,.2,1)"}}/>
        <text x="38" y="38" textAnchor="middle" dominantBaseline="central" style={{fontSize:16,fontWeight:700,fill:C.ink,fontFamily:"'DM Mono',monospace"}}>{score}</text>
      </svg>
      <span style={{fontSize:10,fontFamily:"'DM Mono',monospace",letterSpacing:"0.09em",textTransform:"uppercase",color:C.inkMid}}>{label}</span>
    </div>
  );
}

const TABS = ["overview","findings","targets","action","nutrition","exercise","supplements","monitoring"];

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [step,        setStep]       = useState(0);
  const [form,        setForm]       = useState(blank());
  const [loading,     setLoad]       = useState(false);
  const [loadMsg,     setLoadMsg]    = useState("");
  const [result,      setResult]     = useState(null);
  const [prevent,     setPrevent]    = useState(null);
  const [error,       setError]      = useState(null);
  const [tab,         setTab]        = useState("overview");
  const [preventOpen, setPreventOpen]= useState(false);

  function set(sec, key, val) { setForm(f => ({...f,[sec]:{...f[sec],[key]:val}})); }

  async function generate() {
    setLoad(true); setError(null);

    // Calculate PREVENT score locally
    const pr = calcPREVENT(form.prevent);
    setPrevent(pr);

    try {
      const filled = {};
      Object.entries(form).forEach(([sec, fields]) => {
        const f = Object.fromEntries(
          Object.entries(fields)
            .filter(([,v]) => v !== "" && v !== null && v !== undefined)
            .map(([k,v]) => [k, String(v).replace(/[^\x20-\x7E]/g, "")])
        );
        if (Object.keys(f).length) filled[sec] = f;
      });
      if (pr) filled.preventScore = pr.risk + "% 10yr CVD risk (" + pr.category + ")";

      setLoadMsg("Analyzing biomarkers and health scores...");
      const r1 = safeJSON(await askAI(p1(filled)));

      setLoadMsg("Identifying key findings and targets...");
      const r2 = safeJSON(await askAI(p2(filled)));

      setLoadMsg("Building action plan and nutrition strategy...");
      const r3 = safeJSON(await askAI(p3(filled, form.lifestyle.smokingStatus)));

      setLoadMsg("Designing exercise and supplement protocol...");
      const r4 = safeJSON(await askAI(p4(filled)));

      // Fix supplements: replace any iron bisglycinate reference, remove dosages
      if (r4.supplements) {
        r4.supplements = r4.supplements.map(s => ({
          ...s,
          name: s.name.replace(/iron bisglycinate/gi, "Iron supplement").replace(/iron bisglycinate/gi, "Iron supplement"),
          dose: undefined,
        }));
      }

      setResult({ ...r1, ...r2, ...r3, ...r4 });
      setTab("overview");
    } catch(e) {
      console.error(e);
      setError(e.message || "Unknown error. Please tap Retry.");
    }
    setLoad(false);
  }

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=DM+Mono:wght@300;400;500&display=swap');
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
    ::-webkit-scrollbar{width:5px;height:5px;}
    ::-webkit-scrollbar-track{background:${C.bg};}
    ::-webkit-scrollbar-thumb{background:${C.borderDk};border-radius:3px;}
    .fade{animation:fadeUp .5s ease both;}
    @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
    .btn-p{padding:11px 28px;border-radius:6px;border:none;cursor:pointer;background:${C.accent};color:#fff;font-family:'DM Mono',monospace;font-size:12px;letter-spacing:.09em;text-transform:uppercase;transition:background .2s,transform .15s;}
    .btn-p:hover{background:${C.accentMid};transform:translateY(-1px);}
    .btn-s{padding:10px 22px;border-radius:6px;cursor:pointer;background:transparent;color:${C.inkMid};border:1px solid ${C.border};font-family:'DM Mono',monospace;font-size:12px;letter-spacing:.09em;text-transform:uppercase;transition:border-color .2s,color .2s;}
    .btn-s:hover{border-color:${C.borderDk};color:${C.ink};}
    .btn-dl{padding:11px 22px;border-radius:6px;border:none;cursor:pointer;background:#F0F5F2;color:${C.accentMid};border:1px solid #C5DDCF;font-family:'DM Mono',monospace;font-size:12px;letter-spacing:.09em;text-transform:uppercase;transition:all .2s;}
    .btn-dl:hover{background:#C5DDCF;}
    .tab{padding:8px 16px;border-radius:20px;cursor:pointer;white-space:nowrap;font-family:'DM Mono',monospace;font-size:11px;letter-spacing:.07em;text-transform:uppercase;border:1px solid transparent;color:${C.inkMid};transition:all .18s;background:none;}
    .tab:hover{color:${C.ink};border-color:${C.border};}
    .tab.on{background:${C.accent};color:#fff;border-color:${C.accent};}
    .card{background:${C.surface};border:1px solid ${C.border};border-radius:10px;padding:24px;}
    .sh{font-family:'DM Mono',monospace;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:${C.accentLt};border-bottom:1px solid ${C.border};padding-bottom:10px;margin-bottom:18px;}
    input::placeholder{color:${C.inkLight};}
    @keyframes spin{to{transform:rotate(360deg)}}
    .spinner{width:36px;height:36px;border:3px solid ${C.border};border-top-color:${C.accentLt};border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto 20px;}
  `;

  return (
    <div style={{minHeight:"100vh",background:C.bg,fontFamily:"'Libre Baskerville',Georgia,serif",color:C.ink}}>
      <style>{css}</style>

      {/* Header */}
      <header style={{background:C.accent,padding:"0 32px",display:"flex",alignItems:"center",justifyContent:"space-between",height:54}}>
        <div style={{display:"flex",alignItems:"baseline",gap:12}}>
          <span style={{color:"#fff",fontSize:16,fontWeight:700,letterSpacing:"0.04em"}}>Sano</span>
          <span style={{color:"rgba(255,255,255,0.4)",fontSize:11,fontFamily:"'DM Mono',monospace",letterSpacing:"0.1em",textTransform:"uppercase"}}>Performance Medicine</span>
        </div>
        {result && (
          <div style={{display:"flex",gap:10}}>
            <button className="btn-dl" onClick={()=>downloadReport(form,result,prevent)}>Download Report</button>
            <button className="btn-s" style={{color:"rgba(255,255,255,0.7)",borderColor:"rgba(255,255,255,0.2)",padding:"6px 16px",fontSize:11}} onClick={()=>{setResult(null);setStep(0);setForm(blank());}}>New Patient</button>
          </div>
        )}
      </header>

      {/* ── INPUT ── */}
      {!result && !loading && (
        <div style={{maxWidth:860,margin:"0 auto",padding:"40px 24px"}}>
          <div style={{display:"flex",marginBottom:36,borderRadius:8,overflow:"hidden",border:`1px solid ${C.border}`}}>
            {STEPS.map((s,i)=>(
              <div key={s.id} onClick={()=>i<step&&setStep(i)} style={{flex:1,padding:"12px 8px",textAlign:"center",background:i===step?C.accent:i<step?"#E8F0EC":C.surface,borderRight:i<STEPS.length-1?`1px solid ${C.border}`:"none",cursor:i<step?"pointer":"default",transition:"background .2s"}}>
                <div style={{fontSize:15,marginBottom:3,color:i===step?"#fff":i<step?C.accentLt:C.borderDk}}>{s.icon}</div>
                <div style={{fontSize:10,fontFamily:"'DM Mono',monospace",letterSpacing:"0.08em",textTransform:"uppercase",color:i===step?"#fff":i<step?C.accentMid:C.inkLight}}>{s.label}</div>
              </div>
            ))}
          </div>

          <div className="fade">
            <h2 style={{fontSize:24,fontWeight:400,marginBottom:4}}>{STEPS[step].label}</h2>
            <p style={{fontSize:13,color:C.inkMid,fontFamily:"'DM Mono',monospace",marginBottom:24}}>
              {["Basic patient information and health objective.","Enter available lab values. Leave any unknown field blank.","Daily habits, sleep, stress, and activity.","Physical measurements and fitness metrics."][step]}
            </p>

            <div className="card">
              {/* PATIENT */}
              {step===0 && (
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
                  {PATIENT_FIELDS.map(k=>(
                    <div key={k} style={k==="chiefGoal"?{gridColumn:"1/-1"}:{}}>
                      <FB fk={k} value={form.patient[k]} onChange={v=>set("patient",k,v)}/>
                    </div>
                  ))}
                </div>
              )}

              {/* LABS */}
              {step===1 && (
                <div>
                  {Object.entries(LAB_GROUPS).map(([grp,keys])=>(
                    <div key={grp} style={{marginBottom:28}}>
                      <div className="sh">{grp}</div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:16}}>
                        {keys.map(k=><FB key={k} fk={k} value={form.labs[k]} onChange={v=>set("labs",k,v)}/>)}
                      </div>
                    </div>
                  ))}

                  {/* ── PREVENT collapsible ── */}
                  <div style={{borderTop:`1px solid ${C.border}`,paddingTop:20,marginTop:4}}>
                    {/* Toggle row */}
                    <div
                      onClick={()=>setPreventOpen(o=>!o)}
                      style={{display:"flex",alignItems:"center",gap:12,cursor:"pointer",userSelect:"none"}}
                    >
                      {/* Circle toggle */}
                      <div style={{
                        width:22, height:22, borderRadius:"50%",
                        border:`2px solid ${preventOpen ? C.accentLt : C.borderDk}`,
                        background: preventOpen ? C.accentLt : "transparent",
                        display:"flex", alignItems:"center", justifyContent:"center",
                        flexShrink:0, transition:"all .2s",
                      }}>
                        {preventOpen && (
                          <div style={{width:8,height:8,borderRadius:"50%",background:"#fff"}}/>
                        )}
                      </div>
                      <div>
                        <span style={{fontSize:13,fontWeight:700,color: preventOpen ? C.accentMid : C.ink}}>
                          PREVENT Score
                        </span>
                        <span style={{fontSize:11,fontFamily:"'DM Mono',monospace",color:C.inkLight,marginLeft:10}}>
                          AHA 2023 · 10-year CVD risk calculator
                        </span>
                      </div>
                      <div style={{marginLeft:"auto",fontSize:12,color:C.inkLight,fontFamily:"'DM Mono',monospace"}}>
                        {preventOpen ? "▲ collapse" : "▼ expand"}
                      </div>
                    </div>

                    {/* Collapsible fields */}
                    {preventOpen && (
                      <div style={{marginTop:20,padding:"20px",background:"#F0F5F2",borderRadius:8,border:`1px solid #C5DDCF`}}>
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:16}}>
                          {PREVENT_FIELDS.map(k=>(
                            <FB key={k} fk={k} value={form.prevent[k]} onChange={v=>set("prevent",k,v)}/>
                          ))}
                        </div>
                        <p style={{fontSize:11,color:C.accentMid,fontFamily:"'DM Mono',monospace",marginTop:14,lineHeight:1.5}}>
                          Calculated automatically on report generation using AHA PREVENT 2023 equations (Khan et al., Circulation 2023).
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* LIFESTYLE */}
              {step===2 && (
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
                  {LIFESTYLE_FIELDS.map(k=><FB key={k} fk={k} value={form.lifestyle[k]} onChange={v=>set("lifestyle",k,v)}/>)}
                </div>
              )}

              {/* BODY */}
              {step===3 && (
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:20}}>
                  {BODY_FIELDS.map(k=><FB key={k} fk={k} value={form.body[k]} onChange={v=>set("body",k,v)}/>)}
                </div>
              )}
            </div>

            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:20}}>
              {step>0?<button className="btn-s" onClick={()=>setStep(s=>s-1)}>Back</button>:<span/>}
              <span style={{fontSize:11,color:C.inkLight,fontFamily:"'DM Mono',monospace"}}>Blank fields are skipped</span>
              {step<STEPS.length-1
                ?<button className="btn-p" onClick={()=>setStep(s=>s+1)}>Continue</button>
                :<button className="btn-p" onClick={generate}>Generate Report</button>}
            </div>
          </div>
        </div>
      )}

      {/* ── LOADING ── */}
      {loading && (
        <div style={{maxWidth:500,margin:"0 auto",padding:"100px 24px",textAlign:"center"}}>
          <div className="spinner"/>
          <h2 style={{fontSize:20,fontWeight:400,marginBottom:12}}>Analyzing patient data</h2>
          <p style={{fontSize:13,color:C.accentLt,fontFamily:"'DM Mono',monospace"}}>{loadMsg}</p>
          <div style={{marginTop:28,background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"16px 20px",textAlign:"left"}}>
            {["Biomarkers & Scores","Key Findings & Targets","Action Plan & Nutrition","Exercise & Supplements"].map((s,i)=>{
              const words = ["Analyzing","Identifying","Building","Designing"];
              const done  = words.slice(i+1).some(w=>loadMsg.includes(w));
              const active= loadMsg.includes(words[i]);
              return (
                <div key={s} style={{display:"flex",alignItems:"center",gap:12,padding:"8px 0",borderBottom:i<3?`1px solid ${C.border}`:"none"}}>
                  <div style={{width:18,height:18,borderRadius:"50%",background:done?C.green:active?C.accentLt:C.border,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:"#fff",fontWeight:700}}>
                    {done?"✓":active?"~":i+1}
                  </div>
                  <span style={{fontSize:13,color:done?C.green:active?C.ink:C.inkLight,fontFamily:"'DM Mono',monospace"}}>{s}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── ERROR ── */}
      {error && !loading && (
        <div style={{maxWidth:500,margin:"0 auto",padding:"60px 24px",textAlign:"center"}}>
          <p style={{color:C.red,marginBottom:8,fontFamily:"'DM Mono',monospace",fontSize:13}}>{error}</p>
          <p style={{color:C.inkMid,marginBottom:28,fontSize:13}}>Tap Retry — it usually works on the second attempt.</p>
          <div style={{display:"flex",gap:12,justifyContent:"center"}}>
            <button className="btn-p" onClick={generate}>Retry</button>
            <button className="btn-s" onClick={()=>{setError(null);setStep(3);}}>Edit Data</button>
          </div>
        </div>
      )}

      {/* ── RESULTS ── */}
      {result && !loading && (
        <div style={{maxWidth:960,margin:"0 auto",padding:"36px 24px 80px"}}>

          {/* Patient header */}
          <div className="fade" style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:28,flexWrap:"wrap",gap:16}}>
            <div>
              <div style={{fontSize:10,fontFamily:"'DM Mono',monospace",letterSpacing:"0.1em",textTransform:"uppercase",color:C.inkLight,marginBottom:6}}>Health Optimization Report</div>
              <h1 style={{fontSize:30,fontWeight:700}}>{form.patient.name||"Patient"}</h1>
              <p style={{fontSize:13,color:C.inkMid,fontFamily:"'DM Mono',monospace",marginTop:5}}>
                {[form.patient.age&&`Age ${form.patient.age}`,form.patient.sex].filter(Boolean).join(" · ")}
              </p>
              <p style={{fontSize:12,color:C.accentLt,fontFamily:"'DM Mono',monospace",marginTop:4}}>Goal: {form.patient.chiefGoal}</p>
            </div>
            <div style={{display:"flex",gap:12,alignItems:"flex-start",flexWrap:"wrap"}}>
              {prevent && (
                <div className="card" style={{textAlign:"center",minWidth:140,padding:"16px 20px"}}>
                  <div style={{fontSize:10,fontFamily:"'DM Mono',monospace",letterSpacing:"0.1em",textTransform:"uppercase",color:C.inkLight,marginBottom:6}}>10-yr CVD Risk</div>
                  {prevent.risk !== null
                    ? <div style={{fontSize:32,fontWeight:700,lineHeight:1,color:prevent.color}}>{prevent.risk}%</div>
                    : <div style={{fontSize:14,fontWeight:700,lineHeight:1.3,color:prevent.color,paddingTop:4}}>Override</div>
                  }
                  <div style={{fontSize:11,color:prevent.color,fontFamily:"'DM Mono',monospace",marginTop:5,fontWeight:600}}>{prevent.category}</div>
                </div>
              )}
              <div className="card" style={{textAlign:"center",minWidth:120,padding:"16px 20px"}}>
                <div style={{fontSize:10,fontFamily:"'DM Mono',monospace",letterSpacing:"0.1em",textTransform:"uppercase",color:C.inkLight,marginBottom:8}}>Biological Age</div>
                <div style={{fontSize:38,fontWeight:700,lineHeight:1,color:result.biologicalAge<=parseInt(form.patient.age||99)?C.green:C.amber}}>{result.biologicalAge}</div>
                {form.patient.age&&<div style={{fontSize:11,color:C.inkLight,fontFamily:"'DM Mono',monospace",marginTop:5}}>vs chrono {form.patient.age}</div>}
              </div>
            </div>
          </div>

          {/* PREVENT detail card */}
          {prevent && (
            <div style={{background:"#F5F8F5",border:`1px solid #C5DDCF`,borderRadius:10,padding:"20px 24px",marginBottom:16}} className="fade">
              <div style={{display:"flex",alignItems:"flex-start",gap:16,flexWrap:"wrap",marginBottom: (prevent.lipidGoal || prevent.riskEnhancers?.length || prevent.cacNote || prevent.compositeNote || prevent.dmTherapyIndicated || prevent.ckdTherapyIndicated) ? 14 : 0}}>
                <div style={{fontSize:10,fontFamily:"'DM Mono',monospace",letterSpacing:"0.12em",textTransform:"uppercase",color:C.accentMid,minWidth:130,paddingTop:2}}>AHA PREVENT 2026</div>
                <div style={{flex:1,fontSize:14,color:C.accentMid,lineHeight:1.6}}>{prevent.recommendation}</div>
              </div>
              {/* Lipid goal */}
              {prevent.lipidGoal && !prevent.override && (
                <div style={{display:"flex",gap:12,alignItems:"center",padding:"10px 14px",background:"#EEF5F1",borderRadius:6,marginBottom:10,border:`1px solid #C5DDCF`}}>
                  <span style={{fontSize:10,fontFamily:"'DM Mono',monospace",letterSpacing:"0.1em",textTransform:"uppercase",color:C.accentMid,whiteSpace:"nowrap"}}>Lipid Goal</span>
                  <span style={{fontSize:13,fontFamily:"'DM Mono',monospace",color:C.accentMid,fontWeight:600}}>{prevent.lipidGoal}</span>
                </div>
              )}
              {/* Therapy indicated flags */}
              {(prevent.dmTherapyIndicated || prevent.ckdTherapyIndicated) && (
                <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:10}}>
                  {prevent.dmTherapyIndicated && (
                    <span style={{fontSize:11,fontFamily:"'DM Mono',monospace",padding:"4px 10px",borderRadius:4,background:"#FFF8EC",color:C.amber,border:`1px solid #F0DDB5`}}>Lipid lowering indicated — Diabetes age 40–75</span>
                  )}
                  {prevent.ckdTherapyIndicated && (
                    <span style={{fontSize:11,fontFamily:"'DM Mono',monospace",padding:"4px 10px",borderRadius:4,background:"#FFF8EC",color:C.amber,border:`1px solid #F0DDB5`}}>Lipid lowering indicated — CKD Stage ≥3</span>
                  )}
                </div>
              )}
              {/* Risk enhancers */}
              {prevent.riskEnhancers?.length > 0 && (
                <div style={{marginBottom:10}}>
                  <div style={{fontSize:10,fontFamily:"'DM Mono',monospace",letterSpacing:"0.1em",textTransform:"uppercase",color:C.amber,marginBottom:8}}>Risk Enhancers Present — Score may underestimate true risk</div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    {prevent.riskEnhancers.map((e,i)=>(
                      <span key={i} style={{fontSize:11,fontFamily:"'DM Mono',monospace",padding:"3px 9px",borderRadius:4,background:"#FFF8EC",color:C.amber,border:`1px solid #F0DDB5`}}>{e}</span>
                    ))}
                  </div>
                </div>
              )}
              {/* CAC note */}
              {prevent.cacNote && (
                <div style={{padding:"10px 14px",background:"rgba(139,94,20,0.06)",borderRadius:6,border:`1px solid #F0DDB5`,marginBottom:10}}>
                  <span style={{fontSize:10,fontFamily:"'DM Mono',monospace",letterSpacing:"0.1em",textTransform:"uppercase",color:C.amber,display:"block",marginBottom:4}}>CAC Score Interpretation</span>
                  <span style={{fontSize:13,color:C.inkMid}}>{prevent.cacNote}</span>
                </div>
              )}
              {/* Composite note */}
              {prevent.compositeNote && (
                <div style={{padding:"10px 14px",background:"rgba(26,58,47,0.05)",borderRadius:6,border:`1px solid #C5DDCF`}}>
                  <span style={{fontSize:13,color:C.accentMid,fontStyle:"italic"}}>{prevent.compositeNote}</span>
                </div>
              )}
            </div>
          )}

          {/* Scores */}
          <div className="card fade" style={{marginBottom:16}}>
            <div className="sh">Domain Scores</div>
            <div style={{display:"flex",justifyContent:"space-around",flexWrap:"wrap",gap:16}}>
              {Object.entries(result.scores||{}).map(([k,v])=><Dial key={k} label={k} score={v}/>)}
            </div>
          </div>

          {/* Summary */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
            <div className="card fade">
              <div className="sh">Clinical Summary</div>
              <p style={{fontSize:15,lineHeight:1.75,color:C.inkMid}}>{result.summary}</p>
            </div>
            <div style={{background:"#F0F5F2",border:`1px solid #C5DDCF`,borderRadius:10,padding:24}} className="fade">
              <div className="sh" style={{color:C.accentMid,borderColor:"#C5DDCF"}}>Longevity Insight</div>
              <p style={{fontSize:15,lineHeight:1.75,color:C.accentMid,fontStyle:"italic"}}>{result.longevityNote}</p>
            </div>
          </div>

          {/* Tabs */}
          <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:4,marginBottom:20}}>
            {TABS.map(t=><button key={t} className={`tab ${tab===t?"on":""}`} onClick={()=>setTab(t)}>{t}</button>)}
          </div>

          {/* OVERVIEW */}
          {tab==="overview" && (
            <div className="fade" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
              <div className="card" style={{gridColumn:"1/-1"}}>
                <div className="sh">Top Findings</div>
                {(result.findings||[]).slice(0,4).map((f,i)=>(
                  <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:i<3?`1px solid ${C.border}`:"none"}}>
                    <span style={{fontSize:14,fontWeight:600}}>{f.title}</span><Pill level={f.priority}/>
                  </div>
                ))}
                <button className="btn-s" style={{marginTop:14,fontSize:11,padding:"8px 16px"}} onClick={()=>setTab("findings")}>View all</button>
              </div>
              <div className="card">
                <div className="sh" style={{color:C.red,borderColor:"#F5C5C5"}}>Start Immediately</div>
                {(result.actionPlan?.now||[]).slice(0,3).map((a,i)=>(
                  <div key={i} style={{display:"flex",gap:10,marginBottom:10}}>
                    <span style={{color:C.red,flexShrink:0}}>-&gt;</span>
                    <span style={{fontSize:13,color:C.inkMid,lineHeight:1.5}}>{a}</span>
                  </div>
                ))}
                <button className="btn-s" style={{marginTop:8,fontSize:11,padding:"8px 16px"}} onClick={()=>setTab("action")}>Full plan</button>
              </div>
              <div className="card">
                <div className="sh" style={{color:C.gold,borderColor:"#EDE0A5"}}>Key Supplements</div>
                {(result.supplements||[]).slice(0,3).map((s,i)=>(
                  <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:i<2?`1px solid ${C.border}`:"none"}}>
                    <span style={{fontSize:13,fontWeight:600}}>{s.name}</span>
                    <span style={{fontSize:11,fontFamily:"'DM Mono',monospace",color:C.inkLight}}>{s.timing}</span>
                  </div>
                ))}
                <button className="btn-s" style={{marginTop:12,fontSize:11,padding:"8px 16px"}} onClick={()=>setTab("supplements")}>Full protocol</button>
              </div>
              <div className="card" style={{gridColumn:"1/-1",background:"#F5F8F5",border:`1px solid #C9DDD0`}}>
                <div className="sh" style={{color:C.accentMid,borderColor:"#C9DDD0"}}>Next Follow-Up: 2 Weeks</div>
                <p style={{fontSize:14,lineHeight:1.7,color:C.accentMid}}>{result.followUp?.twoWeeks}</p>
                <button className="btn-s" style={{marginTop:14,fontSize:11,padding:"8px 16px"}} onClick={()=>setTab("monitoring")}>Full monitoring plan</button>
              </div>
            </div>
          )}

          {/* FINDINGS */}
          {tab==="findings" && (
            <div className="fade" style={{display:"flex",flexDirection:"column",gap:12}}>
              {(result.findings||[]).map((f,i)=>(
                <div key={i} className="card" style={{display:"flex",gap:20,alignItems:"flex-start"}}>
                  <div style={{fontSize:18,fontWeight:700,color:C.border,fontFamily:"'DM Mono',monospace",minWidth:32}}>{String(i+1).padStart(2,"0")}</div>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8,flexWrap:"wrap"}}>
                      <span style={{fontSize:16,fontWeight:700}}>{f.title}</span><Pill level={f.priority}/>
                    </div>
                    <p style={{fontSize:14,color:C.inkMid,lineHeight:1.65,fontFamily:"'DM Mono',monospace",fontWeight:300}}>{f.detail}</p>
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
                    {["Biomarker","Current","Optimal Target","Timeline"].map(h=>(
                      <th key={h} style={{padding:"10px 14px",textAlign:"left",fontSize:10,fontFamily:"'DM Mono',monospace",letterSpacing:"0.1em",textTransform:"uppercase",color:C.inkLight,fontWeight:400}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(result.targets||[]).map((t,i)=>(
                    <tr key={i} style={{borderBottom:`1px solid ${C.border}`}}>
                      <td style={{padding:"12px 14px",fontSize:14,fontWeight:700}}>{t.biomarker}</td>
                      <td style={{padding:"12px 14px",fontSize:13,fontFamily:"'DM Mono',monospace",color:C.amber}}>{t.current}</td>
                      <td style={{padding:"12px 14px",fontSize:13,fontFamily:"'DM Mono',monospace",color:C.green}}>{t.optimal}</td>
                      <td style={{padding:"12px 14px",fontSize:12,fontFamily:"'DM Mono',monospace",color:C.inkLight}}>{t.timeline}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ACTION */}
          {tab==="action" && (
            <div className="fade" style={{display:"flex",flexDirection:"column",gap:14}}>
              {[{key:"now",label:"Start Immediately",dot:C.red},{key:"threeMonths",label:"3-Month Milestones",dot:C.amber},{key:"sixMonths",label:"6-Month Goals",dot:C.green}].map(({key,label,dot})=>(
                <div key={key} className="card">
                  <div style={{fontSize:11,fontFamily:"'DM Mono',monospace",letterSpacing:"0.1em",textTransform:"uppercase",color:dot,marginBottom:14,display:"flex",alignItems:"center",gap:8}}>
                    <div style={{width:7,height:7,borderRadius:"50%",background:dot}}/>{label}
                  </div>
                  {(result.actionPlan?.[key]||[]).map((a,i)=>(
                    <div key={i} style={{display:"flex",gap:12,alignItems:"flex-start",marginBottom:10}}>
                      <span style={{color:dot,flexShrink:0}}>-&gt;</span>
                      <span style={{fontSize:14,lineHeight:1.6,color:C.inkMid}}>{a}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* NUTRITION */}
          {tab==="nutrition" && (
            <div className="fade" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
              <div className="card" style={{gridColumn:"1/-1",background:"#F5F8F5",border:`1px solid #C9DDD0`}}>
                <div className="sh" style={{color:C.accentMid,borderColor:"#C9DDD0"}}>Nutritional Strategy</div>
                <p style={{fontSize:16,color:C.accentMid}}>{result.nutrition?.approach}</p>
              </div>
              <div className="card">
                <div className="sh">Core Principles</div>
                {(result.nutrition?.principles||[]).map((p,i)=>(
                  <div key={i} style={{display:"flex",gap:10,marginBottom:10}}>
                    <span style={{color:C.goldLt,flexShrink:0}}>+</span>
                    <span style={{fontSize:14,lineHeight:1.6,color:C.inkMid}}>{p}</span>
                  </div>
                ))}
              </div>
              <div className="card">
                <div className="sh" style={{color:C.green,borderColor:"#B5DEC5"}}>Prioritize</div>
                {(result.nutrition?.prioritize||[]).map((f,i)=>(
                  <div key={i} style={{padding:"7px 0",borderBottom:`1px solid ${C.border}`,fontSize:14,color:C.inkMid,display:"flex",gap:8}}><span style={{color:C.green}}>+</span>{f}</div>
                ))}
                <div style={{marginTop:20,fontSize:10,fontFamily:"'DM Mono',monospace",letterSpacing:".12em",textTransform:"uppercase",color:C.red,borderBottom:`1px solid #F5C5C5`,paddingBottom:10,marginBottom:18}}>Minimize</div>
                {(result.nutrition?.minimize||[]).map((f,i)=>(
                  <div key={i} style={{padding:"7px 0",borderBottom:`1px solid ${C.border}`,fontSize:14,color:C.inkMid,display:"flex",gap:8}}><span style={{color:C.red}}>-</span>{f}</div>
                ))}
              </div>
            </div>
          )}

          {/* EXERCISE */}
          {tab==="exercise" && (
            <div className="fade" style={{display:"flex",flexDirection:"column",gap:14}}>
              <div className="card" style={{background:"#F0F5F2",border:`1px solid #C5DDCF`}}>
                <div className="sh" style={{color:C.accentMid,borderColor:"#C5DDCF"}}>Weekly Blueprint</div>
                <p style={{fontSize:15,color:C.accentMid}}>{result.exercise?.weeklyBlueprint}</p>
              </div>
              {(result.exercise?.zones||[]).map((z,i)=>(
                <div key={i} className="card" style={{display:"grid",gridTemplateColumns:"160px 1fr",gap:20,alignItems:"start"}}>
                  <div style={{background:C.bg,borderRadius:8,padding:"14px",textAlign:"center"}}>
                    <div style={{fontSize:13,fontWeight:700,color:C.accent,marginBottom:6}}>{z.modality}</div>
                    <div style={{fontSize:11,fontFamily:"'DM Mono',monospace",color:C.inkMid}}>{z.frequency}</div>
                    <div style={{fontSize:11,fontFamily:"'DM Mono',monospace",color:C.inkLight}}>{z.duration}</div>
                  </div>
                  <p style={{fontSize:14,lineHeight:1.7,color:C.inkMid,paddingTop:4}}>{z.why}</p>
                </div>
              ))}
            </div>
          )}

          {/* SUPPLEMENTS */}
          {tab==="supplements" && (
            <div className="fade" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
              {(result.supplements||[]).map((s,i)=>(
                <div key={i} className="card">
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8,gap:8,flexWrap:"wrap"}}>
                    <span style={{fontSize:15,fontWeight:700}}>{s.name}</span>
                  </div>
                  <div style={{fontSize:11,fontFamily:"'DM Mono',monospace",color:C.gold,marginBottom:8}}>{s.timing}</div>
                  <p style={{fontSize:13,lineHeight:1.6,color:C.inkMid}}>{s.rationale}</p>
                </div>
              ))}
            </div>
          )}

          {/* MONITORING — no Annual */}
          {tab==="monitoring" && (
            <div className="fade card">
              {[{key:"twoWeeks",label:"2 Weeks"},{key:"oneMonth",label:"1 Month"},{key:"threeMonths",label:"3 Months"},{key:"sixMonths",label:"6 Months"}].map(({key,label},i,arr)=>(
                <div key={key} style={{display:"grid",gridTemplateColumns:"100px 1fr",gap:20,padding:"16px 0",borderBottom:i<arr.length-1?`1px solid ${C.border}`:"none",alignItems:"start"}}>
                  <div style={{fontSize:12,fontFamily:"'DM Mono',monospace",color:C.accentLt,fontWeight:500,paddingTop:2}}>{label}</div>
                  <p style={{fontSize:14,lineHeight:1.65,color:C.inkMid}}>{result.followUp?.[key]}</p>
                </div>
              ))}
            </div>
          )}

        </div>
      )}
    </div>
  );
}
