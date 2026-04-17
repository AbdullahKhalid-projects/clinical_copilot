export interface CanonicalMetricDefinition {
  canonicalKey: string;
  aliases: string[];
  unitHints?: string[];
  regexPatterns?: RegExp[];
}

export const METRIC_STOP_WORDS = new Set([
  "serum",
  "plasma",
  "whole",
  "blood",
  "level",
  "levels",
  "test",
  "result",
  "value",
  "panel",
]);

export const CANONICAL_METRICS: CanonicalMetricDefinition[] = [
  {
    canonicalKey: "blood pressure",
    aliases: ["bp", "blood pressure", "arterial pressure", "nibp"],
    unitHints: ["MMHG"],
    regexPatterns: [/\bbp\b/, /blood\s*pressure/],
  },
  {
    canonicalKey: "blood pressure systolic",
    aliases: ["sbp", "systolic", "systolic blood pressure", "systolic bp"],
    unitHints: ["MMHG"],
  },
  {
    canonicalKey: "blood pressure diastolic",
    aliases: ["dbp", "diastolic", "diastolic blood pressure", "diastolic bp"],
    unitHints: ["MMHG"],
  },
  {
    canonicalKey: "heart rate",
    aliases: ["pulse", "hr", "heart rate", "pulse rate"],
    unitHints: ["BPM"],
  },
  {
    canonicalKey: "respiratory rate",
    aliases: ["rr", "respiratory rate", "resp rate"],
  },
  {
    canonicalKey: "oxygen saturation",
    aliases: ["spo2", "o2 saturation", "oxygen saturation"],
    unitHints: ["%"],
  },
  {
    canonicalKey: "white blood cell count",
    aliases: ["wbc", "wbc count", "white blood cells", "leukocytes"],
  },
  {
    canonicalKey: "red blood cell count",
    aliases: ["rbc", "rbc count", "red blood cells", "erythrocytes"],
  },
  {
    canonicalKey: "hemoglobin",
    aliases: ["hb", "hgb", "haemoglobin", "hemoglobin"],
  },
  {
    canonicalKey: "hematocrit",
    aliases: ["hct", "haematocrit", "hematocrit", "pcv"],
  },
  {
    canonicalKey: "platelet count",
    aliases: ["platelets", "platelet", "plt", "platelet count"],
  },
  {
    canonicalKey: "blood glucose",
    aliases: [
      "glucose",
      "blood glucose",
      "fasting glucose",
      "random glucose",
      "fbs",
      "rbs",
    ],
  },
  {
    canonicalKey: "hba1c",
    aliases: [
      "hba1c",
      "hb a1c",
      "a1c",
      "glycated hemoglobin",
      "glycosylated hemoglobin",
    ],
    unitHints: ["%"],
  },
  {
    canonicalKey: "creatinine",
    aliases: ["creatinine", "serum creatinine", "cr"],
  },
  {
    canonicalKey: "blood urea nitrogen",
    aliases: ["bun", "blood urea nitrogen", "urea nitrogen"],
  },
  {
    canonicalKey: "egfr",
    aliases: ["egfr", "e gfr", "estimated gfr", "glomerular filtration rate"],
  },
  {
    canonicalKey: "sodium",
    aliases: ["sodium", "na", "na+"],
  },
  {
    canonicalKey: "potassium",
    aliases: ["potassium", "k", "k+"],
  },
  {
    canonicalKey: "chloride",
    aliases: ["chloride", "cl", "cl-"],
  },
  {
    canonicalKey: "bilirubin total",
    aliases: ["total bilirubin", "bilirubin total", "tbil", "t bilirubin"],
  },
  {
    canonicalKey: "bilirubin direct",
    aliases: ["direct bilirubin", "bilirubin direct", "dbil"],
  },
  {
    canonicalKey: "alanine aminotransferase",
    aliases: ["alt", "sgpt", "alanine transaminase", "alanine aminotransferase"],
  },
  {
    canonicalKey: "aspartate aminotransferase",
    aliases: ["ast", "sgot", "aspartate transaminase", "aspartate aminotransferase"],
  },
  {
    canonicalKey: "alkaline phosphatase",
    aliases: ["alp", "alkaline phosphatase"],
  },
  {
    canonicalKey: "thyroid stimulating hormone",
    aliases: ["tsh", "thyroid stimulating hormone"],
  },
  {
    canonicalKey: "free t3",
    aliases: ["ft3", "free t3", "free triiodothyronine"],
  },
  {
    canonicalKey: "free t4",
    aliases: ["ft4", "free t4", "free thyroxine"],
  },
  {
    canonicalKey: "total cholesterol",
    aliases: ["cholesterol", "total cholesterol", "chol"],
  },
  {
    canonicalKey: "ldl cholesterol",
    aliases: ["ldl", "ldl c", "ldl cholesterol"],
  },
  {
    canonicalKey: "hdl cholesterol",
    aliases: ["hdl", "hdl c", "hdl cholesterol"],
  },
  {
    canonicalKey: "triglycerides",
    aliases: ["triglycerides", "tg", "trigs"],
  },
  {
    canonicalKey: "c reactive protein",
    aliases: ["crp", "c reactive protein", "c-reactive protein"],
  },
  {
    canonicalKey: "erythrocyte sedimentation rate",
    aliases: ["esr", "erythrocyte sedimentation rate", "sedimentation rate"],
  },
  {
    canonicalKey: "vitamin d",
    aliases: ["vitamin d", "vit d", "25 oh vitamin d", "25 hydroxy vitamin d"],
  },
  {
    canonicalKey: "vitamin b12",
    aliases: ["vitamin b12", "vit b12", "cobalamin", "b12"],
  },
  {
    canonicalKey: "ferritin",
    aliases: ["ferritin", "serum ferritin"],
  },
  {
    canonicalKey: "uric acid",
    aliases: ["uric acid", "serum uric acid"],
  },
];

export function listCanonicalMetricKeys(): string[] {
  return CANONICAL_METRICS.map((item) => item.canonicalKey).sort();
}
