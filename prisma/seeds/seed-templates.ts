/* eslint-disable no-console */
import { closeSeedConnections, prisma } from "./seed-utils";

type TemplateFieldSeed = {
  key: string;
  label: string;
  type: "STRING" | "NUMBER" | "BOOLEAN";
  required: boolean;
  guidance?: string;
  hint?: string;
  fallbackPolicy?: "EMPTY" | "NOT_DOCUMENTED" | "OMIT_IF_OPTIONAL";
};

type LibraryTemplateSeed = {
  slug: string;
  name: string;
  description: string;
  headerFooterStyle: "DEFAULT";
  headerTextAlign: "LEFT" | "CENTER" | "RIGHT";
  promptDirectives?: string;
  profileContext: Record<string, string>;
  header: string;
  footer: string;
  fields: TemplateFieldSeed[];
};

const defaultNormalization = {
  trimText: true,
  collapseWhitespace: true,
  collapseLineBreaks: true,
  normalizeNotDocumented: true,
};

const libraryTemplates: LibraryTemplateSeed[] = [
  {
    slug: "lib-primary-care",
    name: "Primary Care SOAP",
    description: "Balanced SOAP layout for routine outpatient follow-up visits.",
    headerFooterStyle: "DEFAULT",
    headerTextAlign: "CENTER",
    promptDirectives:
      "Prioritize concise, clinically neutral wording. Keep each section evidence-grounded.",
    profileContext: {
      hospitalName: "Riverbend Medical Center",
      hospitalLogoUrl: "/branding/clinic-logo.png",
      headerIconUrl: "https://placehold.co/48x48?text=+",
      hospitalAddressLine1: "21 Clinic Street",
      hospitalAddressLine2: "Lahore",
      hospitalContact: "+92 300 0000000",
      doctorName: "Dr. Qamar",
      doctorCredentials: "MBBS, FCPS",
      doctorLicenseNo: "LIC-120987",
      doctorSignature: "Dr. Qamar",
      doctorSignatureImageUrl: "https://placehold.co/180x64?text=Signature",
    },
    header:
      "{{hospital_logo}}\n{{hospital_name}}\nPrimary Care Department\n{{hospital_address_line_1}}\n{{hospital_address_line_2}}\nPhone: {{hospital_contact}}",
    footer:
      "Prepared by {{doctor_name}} {{doctor_credentials}}\nSignature: {{doctor_signature}}\nFor clinical continuity only.",
    fields: [
      {
        key: "chief_complaint",
        label: "Chief Complaint",
        type: "STRING",
        required: true,
        guidance: "Capture the primary patient concern in one short sentence.",
        fallbackPolicy: "NOT_DOCUMENTED",
      },
      {
        key: "subjective_summary",
        label: "Subjective Summary",
        type: "STRING",
        required: true,
        guidance: "Include symptom history and patient-reported progression only.",
        fallbackPolicy: "NOT_DOCUMENTED",
      },
      {
        key: "objective_findings",
        label: "Objective Findings",
        type: "STRING",
        required: true,
        guidance: "Only include exam findings, measurements, and test-derived observations.",
        fallbackPolicy: "NOT_DOCUMENTED",
      },
      {
        key: "assessment",
        label: "Assessment",
        type: "STRING",
        required: true,
        guidance: "Summarize clinical reasoning and likely diagnosis from available evidence.",
        fallbackPolicy: "NOT_DOCUMENTED",
      },
      {
        key: "plan",
        label: "Plan",
        type: "STRING",
        required: true,
        guidance: "List treatment decisions, instructions, and follow-up actions.",
        fallbackPolicy: "NOT_DOCUMENTED",
      },
    ],
  },
  {
    slug: "lib-cardiology",
    name: "Cardiology Focused SOAP",
    description: "Adds focused fields for chest pain and risk-factor tracking.",
    headerFooterStyle: "DEFAULT",
    headerTextAlign: "CENTER",
    promptDirectives:
      "Prefer cardiovascular terms as spoken in transcript. Avoid adding unstated risk factors.",
    profileContext: {
      hospitalName: "Riverbend Medical Center",
      hospitalLogoUrl: "/branding/clinic-logo.png",
      headerIconUrl: "https://placehold.co/48x48?text=+",
      hospitalAddressLine1: "21 Clinic Street",
      hospitalAddressLine2: "Lahore",
      hospitalContact: "+92 300 0000000",
      doctorName: "Dr. Qamar",
      doctorCredentials: "MBBS, FCPS",
      doctorLicenseNo: "LIC-120987",
      doctorSignature: "Dr. Qamar",
      doctorSignatureImageUrl: "https://placehold.co/180x64?text=Signature",
    },
    header:
      "{{hospital_logo}}\n{{hospital_name}}\nCardiology Service\n{{hospital_address_line_1}}\nEmergency Contact: {{hospital_contact}}",
    footer:
      "Dictated and electronically signed by {{doctor_name}} {{doctor_credentials}}.\nSignature: {{doctor_signature}}",
    fields: [
      {
        key: "presenting_symptoms",
        label: "Presenting Symptoms",
        type: "STRING",
        required: true,
        guidance: "Focus on symptom type, onset, duration, and aggravating/relieving factors.",
        fallbackPolicy: "NOT_DOCUMENTED",
      },
      {
        key: "vitals_summary",
        label: "Vitals Summary",
        type: "STRING",
        required: true,
        guidance: "Include blood pressure, pulse, oxygen saturation, and relevant bedside values.",
        fallbackPolicy: "NOT_DOCUMENTED",
      },
      {
        key: "ecg_summary",
        label: "ECG Summary",
        type: "STRING",
        required: false,
        guidance: "Document ECG findings only if explicitly available.",
        fallbackPolicy: "OMIT_IF_OPTIONAL",
      },
      {
        key: "assessment",
        label: "Assessment",
        type: "STRING",
        required: true,
        guidance: "Summarize likely cardiovascular diagnosis and differential rationale.",
        fallbackPolicy: "NOT_DOCUMENTED",
      },
      {
        key: "management_plan",
        label: "Management Plan",
        type: "STRING",
        required: true,
        guidance: "Record treatment, investigations, referrals, and safety-net advice.",
        fallbackPolicy: "NOT_DOCUMENTED",
      },
    ],
  },
  {
    slug: "lib-mental-health",
    name: "Initial Clinical Interview",
    description: "Structured interview template for first-time mental health consults.",
    headerFooterStyle: "DEFAULT",
    headerTextAlign: "CENTER",
    promptDirectives:
      "Use non-judgmental language and avoid assumptions beyond transcript evidence.",
    profileContext: {
      hospitalName: "Riverbend Medical Center",
      hospitalLogoUrl: "/branding/clinic-logo.png",
      headerIconUrl: "https://placehold.co/48x48?text=+",
      hospitalAddressLine1: "21 Clinic Street",
      hospitalAddressLine2: "Lahore",
      hospitalContact: "+92 300 0000000",
      doctorName: "Dr. Qamar",
      doctorCredentials: "MBBS, FCPS",
      doctorLicenseNo: "LIC-120987",
      doctorSignature: "Dr. Qamar",
      doctorSignatureImageUrl: "https://placehold.co/180x64?text=Signature",
    },
    header:
      "{{hospital_logo}}\n{{hospital_name}}\nBehavioral Health Unit\n{{hospital_address_line_1}}\n{{hospital_contact}}",
    footer:
      "Prepared by {{doctor_name}} {{doctor_credentials}}\nSignature: {{doctor_signature}}\nConfidential clinical document.",
    fields: [
      {
        key: "presenting_issue",
        label: "Presenting Issue",
        type: "STRING",
        required: true,
        guidance: "Summarize the primary reason for consultation in patient-centered wording.",
        fallbackPolicy: "NOT_DOCUMENTED",
      },
      {
        key: "history",
        label: "Relevant History",
        type: "STRING",
        required: true,
        guidance: "Include mental health, psychosocial, and prior treatment context if discussed.",
        fallbackPolicy: "NOT_DOCUMENTED",
      },
      {
        key: "risk_flags",
        label: "Risk Flags",
        type: "STRING",
        required: false,
        guidance: "Only include explicit safety concerns, self-harm, or harm-to-others indicators.",
        fallbackPolicy: "OMIT_IF_OPTIONAL",
      },
      {
        key: "assessment",
        label: "Assessment",
        type: "STRING",
        required: true,
        guidance: "Capture diagnostic impression and functional impact where evidence exists.",
        fallbackPolicy: "NOT_DOCUMENTED",
      },
      {
        key: "plan",
        label: "Care Plan",
        type: "STRING",
        required: true,
        guidance: "List therapy, medication, support resources, and follow-up timing.",
        fallbackPolicy: "NOT_DOCUMENTED",
      },
    ],
  },
];

async function upsertLibraryTemplate(template: LibraryTemplateSeed) {
  const fieldRows = template.fields.map((field, index) => ({
    fieldOrder: index,
    key: field.key,
    label: field.label,
    type: field.type,
    required: field.required,
    guidance: field.guidance ?? null,
    hint: field.hint ?? null,
    fallbackPolicy: field.fallbackPolicy ?? "EMPTY",
  }));

  return prisma.noteTemplate.upsert({
    where: { slug: template.slug },
    create: {
      slug: template.slug,
      name: template.name,
      description: template.description,
      source: "LIBRARY",
      isActive: false,
      headerFooterStyle: template.headerFooterStyle,
      headerTextAlign: template.headerTextAlign,
      promptDirectives: template.promptDirectives ?? null,
      profileContext: template.profileContext,
      header: template.header,
      footer: template.footer,
      normalization: defaultNormalization,
      fields: {
        createMany: {
          data: fieldRows,
        },
      },
    },
    update: {
      name: template.name,
      description: template.description,
      source: "LIBRARY",
      isActive: false,
      headerFooterStyle: template.headerFooterStyle,
      headerTextAlign: template.headerTextAlign,
      promptDirectives: template.promptDirectives ?? null,
      profileContext: template.profileContext,
      header: template.header,
      footer: template.footer,
      normalization: defaultNormalization,
      fields: {
        deleteMany: {},
        createMany: {
          data: fieldRows,
        },
      },
    },
  });
}

async function main() {
  for (const template of libraryTemplates) {
    await upsertLibraryTemplate(template);
  }

  console.log(`Seeded ${libraryTemplates.length} Note Studio library templates.`);
}

main()
  .catch((error) => {
    console.error("Template seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await closeSeedConnections();
  });
