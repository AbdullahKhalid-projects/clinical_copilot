export type EvalLang = "en" | "ur-roman" | "ur";

export type EvalCase =
  | {
      id: string;
      lang: EvalLang;
      prompt: string;
      expectedTool: string;
      expectedArgs?: Record<string, unknown>;
      notExpectedTools?: string[];
    }
  | {
      id: string;
      lang: EvalLang;
      prompt: string;
      expectedTools: string[];
      notExpectedTools?: string[];
    };

export const cases: EvalCase[] = [
  // ═══════════════════════════════════════════════════════════════════════
  //  SINGLE-TOOL TESTS — English
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: "en-01-latest-hemoglobin",
    lang: "en",
    prompt: "What is the patient's latest hemoglobin?",
    expectedTool: "structuredLatestMetric",
    expectedArgs: { metricQuery: "hemoglobin" },
  },
  {
    id: "en-02-creatinine-history",
    lang: "en",
    prompt: "Show me the creatinine history for the last 90 days",
    expectedTool: "structuredRetrieval",
    expectedArgs: { intent: "GET_METRIC_HISTORY", metricQuery: "creatinine" },
  },
  {
    id: "en-03-abnormal-labs",
    lang: "en",
    prompt: "Are there any abnormal lab results?",
    expectedTool: "structuredRetrieval",
    expectedArgs: { intent: "GET_ABNORMAL_READINGS" },
  },
  {
    id: "en-04-prescribe-metformin",
    lang: "en",
    prompt: "Is it safe to prescribe metformin?",
    expectedTool: "verify_prescription_safety",
    expectedArgs: { proposedDrug: "metformin" },
  },
  {
    id: "en-05-ace-alternatives",
    lang: "en",
    prompt: "What are alternatives to ACE inhibitors for hypertension?",
    expectedTool: "suggest_safe_alternatives",
    expectedArgs: { diseaseName: "hypertension" },
  },
  {
    id: "en-06-latest-reports",
    lang: "en",
    prompt: "Show me the patient's most recent lab reports",
    expectedTool: "getLatestReports",
  },
  {
    id: "en-07-last-soap",
    lang: "en",
    prompt: "What did I note in the previous SOAP note?",
    expectedTool: "getLastSoapNote",
  },
  {
    id: "en-08-last-visit-summary",
    lang: "en",
    prompt: "Summarize what happened in the last visit",
    expectedTool: "retrieveLastSession",
  },
  {
    id: "en-09-clinical-overview",
    lang: "en",
    prompt: "Give me a clinical overview of this patient",
    expectedTool: "get_patient_clinical_summary",
  },
  {
    id: "en-10-hemoglobin-trend",
    lang: "en",
    prompt: "What's the hemoglobin trend over the past 3 months?",
    expectedTool: "structuredRetrieval",
    expectedArgs: { intent: "GET_METRIC_TREND", metricQuery: "hemoglobin" },
  },
  {
    id: "en-11-wbc-latest",
    lang: "en",
    prompt: "Can you check the latest WBC count?",
    expectedTool: "structuredLatestMetric",
    expectedArgs: { metricQuery: "WBC" },
  },
  {
    id: "en-12-current-medications",
    lang: "en",
    prompt: "What medications is the patient currently on?",
    expectedTool: "get_patient_clinical_summary",
  },
  {
    id: "en-13-platelet-history-dated",
    lang: "en",
    prompt: "Show me the platelet count history from January to March",
    expectedTool: "structuredRetrieval",
    expectedArgs: { intent: "GET_METRIC_HISTORY", metricQuery: "platelet count" },
  },
  {
    id: "en-14-prescribe-ibuprofen",
    lang: "en",
    prompt: "Can I prescribe ibuprofen to this patient?",
    expectedTool: "verify_prescription_safety",
    expectedArgs: { proposedDrug: "ibuprofen" },
  },
  {
    id: "en-15-diabetes-alternatives",
    lang: "en",
    prompt: "What else can I give for diabetes instead of metformin?",
    expectedTool: "suggest_safe_alternatives",
    expectedArgs: { diseaseName: "diabetes" },
  },

  // ─── Single-tool — Romanized Urdu ─────────────────────────────────────
  {
    id: "ur-roman-01-hemoglobin",
    lang: "ur-roman",
    prompt: "Patient ka hemoglobin kya hai?",
    expectedTool: "structuredLatestMetric",
    expectedArgs: { metricQuery: "hemoglobin" },
  },
  {
    id: "ur-roman-02-creatinine-history",
    lang: "ur-roman",
    prompt: "Pichle 90 dinon ka creatinine history dikhao",
    expectedTool: "structuredRetrieval",
    expectedArgs: { intent: "GET_METRIC_HISTORY", metricQuery: "creatinine" },
  },
  {
    id: "ur-roman-03-abnormal-results",
    lang: "ur-roman",
    prompt: "Kya koi abnormal lab results hain?",
    expectedTool: "structuredRetrieval",
    expectedArgs: { intent: "GET_ABNORMAL_READINGS" },
  },
  {
    id: "ur-roman-04-metformin-safe",
    lang: "ur-roman",
    prompt: "Kya metformin dena safe hai?",
    expectedTool: "verify_prescription_safety",
    expectedArgs: { proposedDrug: "metformin" },
  },
  {
    id: "ur-roman-05-ace-alternatives",
    lang: "ur-roman",
    prompt: "Hypertension ke liye ACE inhibitors ke kya alternatives hain?",
    expectedTool: "suggest_safe_alternatives",
    expectedArgs: { diseaseName: "hypertension" },
  },
  {
    id: "ur-roman-06-latest-reports",
    lang: "ur-roman",
    prompt: "Patient ki latest reports dikhao",
    expectedTool: "getLatestReports",
  },
  {
    id: "ur-roman-07-soap-note",
    lang: "ur-roman",
    prompt: "Pichli session ki SOAP note kya thi?",
    expectedTool: "getLastSoapNote",
  },
  {
    id: "ur-roman-08-last-visit",
    lang: "ur-roman",
    prompt: "Pichli visit mein kya hua tha, batao",
    expectedTool: "retrieveLastSession",
  },
  {
    id: "ur-roman-09-clinical-overview",
    lang: "ur-roman",
    prompt: "Is patient ka clinical overview do",
    expectedTool: "get_patient_clinical_summary",
  },
  {
    id: "ur-roman-10-hemoglobin-trend",
    lang: "ur-roman",
    prompt: "Hemoglobin ka trend kya raha pichle 3 mahino mein?",
    expectedTool: "structuredRetrieval",
    expectedArgs: { intent: "GET_METRIC_TREND", metricQuery: "hemoglobin" },
  },
  {
    id: "ur-roman-11-wbc-latest",
    lang: "ur-roman",
    prompt: "WBC count ki latest value kya hai?",
    expectedTool: "structuredLatestMetric",
    expectedArgs: { metricQuery: "WBC" },
  },
  {
    id: "ur-roman-12-medications",
    lang: "ur-roman",
    prompt: "Patient ko kon si dawaiyan chal rahi hain?",
    expectedTool: "get_patient_clinical_summary",
  },
  {
    id: "ur-roman-13-platelet-history",
    lang: "ur-roman",
    prompt: "Platelet count ka history dikhao January se March tak",
    expectedTool: "structuredRetrieval",
    expectedArgs: { intent: "GET_METRIC_HISTORY", metricQuery: "platelet count" },
  },
  {
    id: "ur-roman-14-ibuprofen",
    lang: "ur-roman",
    prompt: "Kya main is patient ko ibuprofen de sakta hoon?",
    expectedTool: "verify_prescription_safety",
    expectedArgs: { proposedDrug: "ibuprofen" },
  },
  {
    id: "ur-roman-15-diabetes-alt",
    lang: "ur-roman",
    prompt: "Diabetes ke liye metformin ki jagah kya de sakte hain?",
    expectedTool: "suggest_safe_alternatives",
    expectedArgs: { diseaseName: "diabetes" },
  },

  // ─── Single-tool — Urdu Script ────────────────────────────────────────
  {
    id: "ur-script-01-hemoglobin",
    lang: "ur",
    prompt: "مریض کا ہیموگلوبن کیا ہے؟",
    expectedTool: "structuredLatestMetric",
    expectedArgs: { metricQuery: "hemoglobin" },
  },
  {
    id: "ur-script-02-creatinine-history",
    lang: "ur",
    prompt: "پچھلے 90 دنوں کا کریٹینائن ہسٹری دکھاؤ",
    expectedTool: "structuredRetrieval",
    expectedArgs: { intent: "GET_METRIC_HISTORY", metricQuery: "creatinine" },
  },
  {
    id: "ur-script-03-abnormal-results",
    lang: "ur",
    prompt: "کیا کوئی غیر معمولی لیب رزلٹ ہیں؟",
    expectedTool: "structuredRetrieval",
    expectedArgs: { intent: "GET_ABNORMAL_READINGS" },
  },
  {
    id: "ur-script-04-metformin-safe",
    lang: "ur",
    prompt: "کیا میٹفارمین دینا محفوظ ہے؟",
    expectedTool: "verify_prescription_safety",
    expectedArgs: { proposedDrug: "metformin" },
  },
  {
    id: "ur-script-05-ace-alternatives",
    lang: "ur",
    prompt: "ہائی بلڈ پریشر کے لیے اے سی ای انہیبیٹرز کے متبادل کیا ہیں؟",
    expectedTool: "suggest_safe_alternatives",
    expectedArgs: { diseaseName: "hypertension" },
  },
  {
    id: "ur-script-06-latest-reports",
    lang: "ur",
    prompt: "مریض کی تازہ ترین رپورٹس دکھاؤ",
    expectedTool: "getLatestReports",
  },
  {
    id: "ur-script-07-soap-note",
    lang: "ur",
    prompt: "پچھلی سیشن کی SOAP نوٹ کیا تھی؟",
    expectedTool: "getLastSoapNote",
  },
  {
    id: "ur-script-08-last-visit",
    lang: "ur",
    prompt: "پچھلے وزٹ میں کیا ہوا تھا بتاؤ",
    expectedTool: "retrieveLastSession",
  },
  {
    id: "ur-script-09-clinical-overview",
    lang: "ur",
    prompt: "اس مریض کا کلینیکل آویریو دو",
    expectedTool: "get_patient_clinical_summary",
  },
  {
    id: "ur-script-10-hemoglobin-trend",
    lang: "ur",
    prompt: "ہیموگلوبن کا رجحان کیا رہا پچھلے 3 مہینوں میں؟",
    expectedTool: "structuredRetrieval",
    expectedArgs: { intent: "GET_METRIC_TREND", metricQuery: "hemoglobin" },
  },
  {
    id: "ur-script-11-wbc-latest",
    lang: "ur",
    prompt: "WBC کاؤنٹ کی تازہ ترین قیمت کیا ہے؟",
    expectedTool: "structuredLatestMetric",
    expectedArgs: { metricQuery: "WBC" },
  },
  {
    id: "ur-script-12-medications",
    lang: "ur",
    prompt: "مریض کون سی دوائیں استعمال کر رہا ہے؟",
    expectedTool: "get_patient_clinical_summary",
  },
  {
    id: "ur-script-13-platelet-history",
    lang: "ur",
    prompt: "پلیٹلیٹ کاؤنٹ کی ہسٹری دکھاؤ جنوری سے مارچ تک",
    expectedTool: "structuredRetrieval",
    expectedArgs: { intent: "GET_METRIC_HISTORY", metricQuery: "platelet count" },
  },
  {
    id: "ur-script-14-ibuprofen",
    lang: "ur",
    prompt: "کیا میں اس مریض کو ایبوپروفن دے سکتا ہوں؟",
    expectedTool: "verify_prescription_safety",
    expectedArgs: { proposedDrug: "ibuprofen" },
  },
  {
    id: "ur-script-15-diabetes-alt",
    lang: "ur",
    prompt: "شوگر کے لیے میٹفارمین کی جگہ کیا دے سکتے ہیں؟",
    expectedTool: "suggest_safe_alternatives",
    expectedArgs: { diseaseName: "diabetes" },
  },

  // ═══════════════════════════════════════════════════════════════════════
  //  AMBIGUOUS SINGLE-TOOL TESTS — English
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: "en-amb-01-whats-the-story",
    lang: "en",
    prompt: "What's the story with this patient?",
    expectedTool: "get_patient_clinical_summary",
  },
  {
    id: "en-amb-02-anything-wrong",
    lang: "en",
    prompt: "Anything I should be worried about in their labs?",
    expectedTool: "structuredRetrieval",
    expectedArgs: { intent: "GET_ABNORMAL_READINGS" },
  },
  {
    id: "en-amb-03-last-time",
    lang: "en",
    prompt: "Did anything come up last time?",
    expectedTool: "retrieveLastSession",
  },
  {
    id: "en-amb-04-prescribe-something",
    lang: "en",
    prompt: "Can I prescribe this patient something for the pain?",
    expectedTool: "verify_prescription_safety",
  },
  {
    id: "en-amb-05-diabetic-options",
    lang: "en",
    prompt: "They're diabetic. What are my options here?",
    expectedTool: "suggest_safe_alternatives",
    expectedArgs: { diseaseName: "diabetes" },
  },

  // ─── Ambiguous single-tool — Romanized Urdu ───────────────────────────
  {
    id: "ur-roman-amb-01-scene",
    lang: "ur-roman",
    prompt: "Kya scene hai is patient ka?",
    expectedTool: "get_patient_clinical_summary",
  },
  {
    id: "ur-roman-amb-02-gadbad",
    lang: "ur-roman",
    prompt: "Kuch gadbad hai kya labs mein?",
    expectedTool: "structuredRetrieval",
    expectedArgs: { intent: "GET_ABNORMAL_READINGS" },
  },
  {
    id: "ur-roman-amb-03-pichle-baar",
    lang: "ur-roman",
    prompt: "Pichle baar kya hua tha?",
    expectedTool: "retrieveLastSession",
  },
  {
    id: "ur-roman-amb-04-dawai-de",
    lang: "ur-roman",
    prompt: "Is patient ko kya koi dawai de sakte hain?",
    expectedTool: "verify_prescription_safety",
  },
  {
    id: "ur-roman-amb-05-options",
    lang: "ur-roman",
    prompt: "Yeh diabetic hai. Kya options hain?",
    expectedTool: "suggest_safe_alternatives",
    expectedArgs: { diseaseName: "diabetes" },
  },

  // ─── Ambiguous single-tool — Urdu Script ──────────────────────────────
  {
    id: "ur-script-amb-01-kya-hal",
    lang: "ur",
    prompt: "اس مریض کا کیا بن رہا ہے؟",
    expectedTool: "get_patient_clinical_summary",
  },
  {
    id: "ur-script-amb-02-khoon-masla",
    lang: "ur",
    prompt: "خون میں کچھ مسئلہ ہے کیا؟",
    expectedTool: "structuredRetrieval",
    expectedArgs: { intent: "GET_ABNORMAL_READINGS" },
  },
  {
    id: "ur-script-amb-03-pichli-baar",
    lang: "ur",
    prompt: "پچھلی بار کیا ہوا تھا؟",
    expectedTool: "retrieveLastSession",
  },
  {
    id: "ur-script-amb-04-koi-awa",
    lang: "ur",
    prompt: "کوئی دوا دے سکتے ہیں؟",
    expectedTool: "verify_prescription_safety",
  },
  {
    id: "ur-script-amb-05-shoogar",
    lang: "ur",
    prompt: "یہ شوگر کا مریض ہے۔ کیا کریں؟",
    expectedTool: "suggest_safe_alternatives",
    expectedArgs: { diseaseName: "diabetes" },
  },

  // ═══════════════════════════════════════════════════════════════════════
  //  AMBIGUOUS MULTI-TOOL TESTS — English
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: "en-amb-multi-01-rush-prep",
    lang: "en",
    prompt:
      "Patient's walking in any minute — just give me the highlights: anything off in the labs, and what happened at the last visit?",
    expectedTools: ["structuredRetrieval", "retrieveLastSession"],
  },
  {
    id: "en-amb-multi-02-prescribe-and-check",
    lang: "en",
    prompt:
      "I'm about to write a script — pull up what they're currently on and check if there's anything I should watch out for.",
    expectedTools: [
      "get_patient_clinical_summary",
      "verify_prescription_safety",
    ],
  },
  {
    id: "en-amb-multi-03-need-the-full-picture",
    lang: "en",
    prompt:
      "I need the full picture before I decide — show me everything: conditions, meds, allergies, abnormal labs, and recent reports.",
    expectedTools: [
      "get_patient_clinical_summary",
      "structuredRetrieval",
      "getLatestReports",
    ],
  },
  {
    id: "en-amb-multi-04-diabetes-decision",
    lang: "en",
    prompt:
      "This patient is diabetic and I'm not sure what to prescribe. What are my options, and are there any contraindications I should know about?",
    expectedTools: [
      "suggest_safe_alternatives",
      "verify_prescription_safety",
    ],
  },
  {
    id: "en-amb-multi-05-brief-me",
    lang: "en",
    prompt:
      "Brief me before the consult — last visit notes, latest reports, and anything abnormal in their blood work.",
    expectedTools: [
      "getLastSoapNote",
      "getLatestReports",
      "structuredRetrieval",
    ],
  },

  // ─── Ambiguous multi-tool — Romanized Urdu ────────────────────────────
  {
    id: "ur-roman-amb-multi-01-jaldi",
    lang: "ur-roman",
    prompt:
      "Patient aa raha hai jaldi — bas bata do: labs mein kuch kharab hai, aur pichli visit mein kya hua tha?",
    expectedTools: ["structuredRetrieval", "retrieveLastSession"],
  },
  {
    id: "ur-roman-amb-multi-02-likhne-se-pehle",
    lang: "ur-roman",
    prompt:
      "Main dawai likhne wala hoon — dekho kya kya chal rahi hai aur koi masla to nahi hai.",
    expectedTools: [
      "get_patient_clinical_summary",
      "verify_prescription_safety",
    ],
  },
  {
    id: "ur-roman-amb-multi-03-poori-picture",
    lang: "ur-roman",
    prompt:
      "Mujhe poori picture chahiye faisla karne se pehle — sab dikhao: conditions, dawaiyan, allergies, abnormal labs, aur recent reports.",
    expectedTools: [
      "get_patient_clinical_summary",
      "structuredRetrieval",
      "getLatestReports",
    ],
  },
  {
    id: "ur-roman-amb-multi-04-kya-karein",
    lang: "ur-roman",
    prompt:
      "Yeh patient diabetic hai, samajh nahi aa raha kya dein. Kya options hain, aur koi cheez hai jo nahi deni chahiye?",
    expectedTools: [
      "suggest_safe_alternatives",
      "verify_prescription_safety",
    ],
  },
  {
    id: "ur-roman-amb-multi-05-brief-karo",
    lang: "ur-roman",
    prompt:
      "Consult se pehle brief karo — pichli visit ki notes, latest reports, aur blood mein kuch gadbad hai to wo bhi.",
    expectedTools: [
      "getLastSoapNote",
      "getLatestReports",
      "structuredRetrieval",
    ],
  },

  // ─── Ambiguous multi-tool — Urdu Script ───────────────────────────────
  {
    id: "ur-script-amb-multi-01-jaldi",
    lang: "ur",
    prompt:
      "مریض آ رہا ہے جلدی — بس بتا دو: لیبز میں کچھ خراب ہے، اور پچھلے وزٹ میں کیا ہوا تھا؟",
    expectedTools: ["structuredRetrieval", "retrieveLastSession"],
  },
  {
    id: "ur-script-amb-multi-02-likhne-se-pehle",
    lang: "ur",
    prompt:
      "میں دوا لکھنے والا ہوں — دیکھو کیا کیا چل رہی ہے اور کوئی مسئلہ تو نہیں ہے۔",
    expectedTools: [
      "get_patient_clinical_summary",
      "verify_prescription_safety",
    ],
  },
  {
    id: "ur-script-amb-multi-03-mukammal-tasveer",
    lang: "ur",
    prompt:
      "مجھے مکمل تصویر چاہیے فیصلہ کرنے سے پہلے — سب دکھاؤ: حالات، دوائیں، الرجیز، غیر معمولی لیبز، اور تازہ ترین رپورٹس۔",
    expectedTools: [
      "get_patient_clinical_summary",
      "structuredRetrieval",
      "getLatestReports",
    ],
  },
  {
    id: "ur-script-amb-multi-04-kya-karein",
    lang: "ur",
    prompt:
      "یہ مریض شوگر کا ہے، سمجھ نہیں آ رہا کیا دیں۔ کیا اختیارات ہیں، اور کوئی چیز ہے جو نہیں دینی چاہیے؟",
    expectedTools: [
      "suggest_safe_alternatives",
      "verify_prescription_safety",
    ],
  },
  {
    id: "ur-script-amb-multi-05-brief-karo",
    lang: "ur",
    prompt:
      "کنسٹ سے پہلے بریف کرو — پچھلے وزٹ کی نوٹس، تازہ ترین رپورٹس، اور خون میں کچھ خرابی ہے تو وہ بھی۔",
    expectedTools: [
      "getLastSoapNote",
      "getLatestReports",
      "structuredRetrieval",
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════
  //  MULTI-TOOL TESTS — English
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: "en-multi-01-pre-consult-brief",
    lang: "en",
    prompt:
      "Before I see this patient, give me a full pre-consult brief: pull their known conditions, active medications, and allergy list then surface every abnormal lab reading on record, and pull their three most recent uploaded reports so I can review what was last documented.",
    expectedTools: [
      "get_patient_clinical_summary",
      "structuredRetrieval",
      "getLatestReports",
    ],
  },
  {
    id: "en-multi-02-prescribe-with-context",
    lang: "en",
    prompt:
      "I want to prescribe amoxicillin — first pull up the patient's full clinical summary so I can see their allergies, then run a safety check on amoxicillin for this patient.",
    expectedTools: [
      "get_patient_clinical_summary",
      "verify_prescription_safety",
    ],
  },
  {
    id: "en-multi-03-history-and-safety",
    lang: "en",
    prompt:
      "Show me the patient's creatinine trend over the last 6 months and tell me if it's safe to prescribe ibuprofen given their current profile.",
    expectedTools: ["structuredRetrieval", "verify_prescription_safety"],
  },
  {
    id: "en-multi-04-safety-and-alternatives",
    lang: "en",
    prompt:
      "I'm considering prescribing metformin. Check if it's safe for this patient, and if there are any issues suggest safe alternatives for diabetes.",
    expectedTools: [
      "verify_prescription_safety",
      "suggest_safe_alternatives",
    ],
  },
  {
    id: "en-multi-05-alternatives-with-allergies",
    lang: "en",
    prompt:
      "This patient needs treatment for hypertension but I'm worried about drug interactions. Pull up their allergy and medication list, then suggest safe alternatives for hypertension.",
    expectedTools: [
      "get_patient_clinical_summary",
      "suggest_safe_alternatives",
    ],
  },
  {
    id: "en-multi-06-labs-and-reports",
    lang: "en",
    prompt:
      "Pull up every abnormal lab result on file and also fetch the three most recent reports so I can cross-reference what was documented.",
    expectedTools: ["structuredRetrieval", "getLatestReports"],
  },
  {
    id: "en-multi-07-overview-and-last-visit",
    lang: "en",
    prompt:
      "Give me the patient's clinical overview with conditions and medications, and also pull the transcript from the last visit so I know what was discussed previously.",
    expectedTools: [
      "get_patient_clinical_summary",
      "retrieveLastSession",
    ],
  },
  {
    id: "en-multi-08-trend-soap-reports",
    lang: "en",
    prompt:
      "I need a quick picture before the consult: show me the hemoglobin trend, pull the last SOAP note, and grab the most recent reports.",
    expectedTools: [
      "structuredRetrieval",
      "getLastSoapNote",
      "getLatestReports",
    ],
  },
  {
    id: "en-multi-09-safety-with-alternatives",
    lang: "en",
    prompt:
      "I'm thinking about prescribing ciprofloxacin. Run a safety check for this patient, and at the same time suggest safe alternatives for their bacterial infection in case ciprofloxacin doesn't work out.",
    expectedTools: [
      "verify_prescription_safety",
      "suggest_safe_alternatives",
    ],
  },
  {
    id: "en-multi-10-full-consult-prep",
    lang: "en",
    prompt:
      "Pull the latest hemoglobin value, get me the SOAP note from the last visit, and fetch the three most recent reports — I want everything ready before the patient walks in.",
    expectedTools: [
      "structuredLatestMetric",
      "getLastSoapNote",
      "getLatestReports",
    ],
  },

  // ─── Multi-tool — Romanized Urdu ──────────────────────────────────────
  {
    id: "ur-roman-multi-01-pre-consult",
    lang: "ur-roman",
    prompt:
      "Patient ko dekhne se pehle mujhe sab kuch chahiye: unki medical conditions, dawaiyon ki list, allergies, saari abnormal lab readings, aur teen latest reports bhi dikhao.",
    expectedTools: [
      "get_patient_clinical_summary",
      "structuredRetrieval",
      "getLatestReports",
    ],
  },
  {
    id: "ur-roman-multi-02-prescribe-with-context",
    lang: "ur-roman",
    prompt:
      "Main amoxicillin prescribe karna chahta hoon — pehle patient ki clinical summary nikalo taake main allergies dekh sakun, phir amoxicillin ki safety check karo.",
    expectedTools: [
      "get_patient_clinical_summary",
      "verify_prescription_safety",
    ],
  },
  {
    id: "ur-roman-multi-03-history-and-safety",
    lang: "ur-roman",
    prompt:
      "Mujhe pichle 6 mahine ka creatinine trend dikhao aur batao kya is patient ko ibuprofen dena safe hai.",
    expectedTools: ["structuredRetrieval", "verify_prescription_safety"],
  },
  {
    id: "ur-roman-multi-04-safety-and-alternatives",
    lang: "ur-roman",
    prompt:
      "Main metformin prescribe karna soch raha hoon. Pehle check karo kya safe hai, aur agar koi problem ho to diabetes ke liye safe alternatives suggest karo.",
    expectedTools: [
      "verify_prescription_safety",
      "suggest_safe_alternatives",
    ],
  },
  {
    id: "ur-roman-multi-05-alternatives-with-allergies",
    lang: "ur-roman",
    prompt:
      "Is patient ko hypertension ka ilaaj chahiye lekin mujhe drug interactions ki fikr hai. Unki allergy aur dawaiyon ki list nikalo, phir hypertension ke liye safe alternatives batao.",
    expectedTools: [
      "get_patient_clinical_summary",
      "suggest_safe_alternatives",
    ],
  },
  {
    id: "ur-roman-multi-06-labs-and-reports",
    lang: "ur-roman",
    prompt:
      "Saari abnormal lab results dikhao aur teen latest reports bhi nikalo taake main cross-check kar sakun.",
    expectedTools: ["structuredRetrieval", "getLatestReports"],
  },
  {
    id: "ur-roman-multi-07-overview-and-last-visit",
    lang: "ur-roman",
    prompt:
      "Patient ka clinical overview do jismein conditions aur medications hon, aur pichle visit ka transcript bhi nikalo taake pata chale kya baat hui thi.",
    expectedTools: [
      "get_patient_clinical_summary",
      "retrieveLastSession",
    ],
  },
  {
    id: "ur-roman-multi-08-trend-soap-reports",
    lang: "ur-roman",
    prompt:
      "Consult se pehle sab ready karo: hemoglobin ka trend dikhao, pichli SOAP note nikalo, aur latest reports bhi lao.",
    expectedTools: [
      "structuredRetrieval",
      "getLastSoapNote",
      "getLatestReports",
    ],
  },
  {
    id: "ur-roman-multi-09-safety-with-alternatives",
    lang: "ur-roman",
    prompt:
      "Main ciprofloxacin prescribe karna chahta hoon. Is patient ke liye safety check karo, aur saath hi bacterial infection ke liye safe alternatives bhi suggest karo agar ciprofloxacin na chale to.",
    expectedTools: [
      "verify_prescription_safety",
      "suggest_safe_alternatives",
    ],
  },
  {
    id: "ur-roman-multi-10-full-consult-prep",
    lang: "ur-roman",
    prompt:
      "Latest hemoglobin ki value nikalo, pichli visit ki SOAP note dikhao, aur teen latest reports bhi lao — patient aane se pehle sab kuch ready chahiye.",
    expectedTools: [
      "structuredLatestMetric",
      "getLastSoapNote",
      "getLatestReports",
    ],
  },

  // ─── Multi-tool — Urdu Script ─────────────────────────────────────────
  {
    id: "ur-script-multi-01-pre-consult",
    lang: "ur",
    prompt:
      "مریض کو دیکھنے سے پہلے مجھے سب کچھ چاہیے: ان کی طبی حالات، دوائیوں کی فہرست، الرجیز، سب غیر معمولی لیب رزلٹس، اور تین تازہ ترین رپورٹس بھی دکھاؤ۔",
    expectedTools: [
      "get_patient_clinical_summary",
      "structuredRetrieval",
      "getLatestReports",
    ],
  },
  {
    id: "ur-script-multi-02-prescribe-with-context",
    lang: "ur",
    prompt:
      "میں اموکسی سلین تجویز کرنا چاہتا ہوں — پہلے مریض کی کلینیکل خلاصہ نکالو تاکہ میں الرجیز دیکھ سکوں، پھر اموکسی سلین کی حفاظتی جانچ کرو۔",
    expectedTools: [
      "get_patient_clinical_summary",
      "verify_prescription_safety",
    ],
  },
  {
    id: "ur-script-multi-03-history-and-safety",
    lang: "ur",
    prompt:
      "مجھے پچھلے 6 مہینے کا کریٹینائن رجحان دکھاؤ اور بتاؤ کیا اس مریض کو ایبوپروفن دینا محفوظ ہے۔",
    expectedTools: ["structuredRetrieval", "verify_prescription_safety"],
  },
  {
    id: "ur-script-multi-04-safety-and-alternatives",
    lang: "ur",
    prompt:
      "میں میٹفارمین تجویز کرنے کا سوچ رہا ہوں۔ پہلے جانچو کیا محفوظ ہے، اور اگر کوئی مسئلہ ہو تو شوگر کے لیے محفوظ متبادل تجویز کرو۔",
    expectedTools: [
      "verify_prescription_safety",
      "suggest_safe_alternatives",
    ],
  },
  {
    id: "ur-script-multi-05-alternatives-with-allergies",
    lang: "ur",
    prompt:
      "اس مریض کو بلڈ پریشر کا علاج چاہیے لیکن مجھے دوائی کے تعامل کی فکر ہے۔ ان کی الرجی اور دوائیوں کی فہرست نکالو، پھر بلڈ پریشر کے لیے محفوظ متبادل بتاؤ۔",
    expectedTools: [
      "get_patient_clinical_summary",
      "suggest_safe_alternatives",
    ],
  },
  {
    id: "ur-script-multi-06-labs-and-reports",
    lang: "ur",
    prompt:
      "سب غیر معمولی لیب رزلٹس دکھاؤ اور تین تازہ ترین رپورٹس بھی نکالو تاکہ میں متقابلہ جانچ کر سکوں۔",
    expectedTools: ["structuredRetrieval", "getLatestReports"],
  },
  {
    id: "ur-script-multi-07-overview-and-last-visit",
    lang: "ur",
    prompt:
      "مریض کا کلینیکل آویریو دو جس میں حالات اور دوائیں ہوں، اور پچھلے وزٹ کا ٹرانسکرپٹ بھی نکالو تاکہ پتا چلے کیا بات ہوئی تھی۔",
    expectedTools: [
      "get_patient_clinical_summary",
      "retrieveLastSession",
    ],
  },
  {
    id: "ur-script-multi-08-trend-soap-reports",
    lang: "ur",
    prompt:
      "کنسٹ سے پہلے سب تیار کرو: ہیموگلوبن کا رجحان دکھاؤ، پچھلی SOAP نوٹ نکالو، اور تازہ ترین رپورٹس بھی لاؤ۔",
    expectedTools: [
      "structuredRetrieval",
      "getLastSoapNote",
      "getLatestReports",
    ],
  },
  {
    id: "ur-script-multi-09-safety-with-alternatives",
    lang: "ur",
    prompt:
      "میں سپروفلاکساسین تجویز کرنا چاہتا ہوں۔ اس مریض کے لیے حفاظتی جانچ کرو، اور ساتھ ہی بیکٹیریل انفیکشن کے لیے محفوظ متبادل بھی تجویز کرو اگر سپروفلاکساسین نہ چلے تو۔",
    expectedTools: [
      "verify_prescription_safety",
      "suggest_safe_alternatives",
    ],
  },
  {
    id: "ur-script-multi-10-full-consult-prep",
    lang: "ur",
    prompt:
      "تازہ ترین ہیموگلوبن کی قیمت نکالو، پچھلے وزٹ کی SOAP نوٹ دکھاؤ، اور تین تازہ ترین رپورٹس بھی لاؤ — مریض آنے سے پہلے سب کچھ تیار چاہیے۔",
    expectedTools: [
      "structuredLatestMetric",
      "getLastSoapNote",
      "getLatestReports",
    ],
  },
];
