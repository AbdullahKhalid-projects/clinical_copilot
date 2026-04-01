import type { SoapTemplate } from "./types";

export const initialLibraryTemplates: SoapTemplate[] = [
  {
    id: "lib-primary-care",
    name: "Primary Care SOAP",
    description: "Balanced SOAP layout for routine outpatient follow-up visits.",
    source: "library",
    isActive: false,
    headerFooterStyle: "default",
    headerTextAlign: "center",
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
    bodySchema: {
      title: "SOAP Body",
      fields: [
        { key: "chief_complaint", label: "Chief Complaint", type: "string", required: true },
        { key: "subjective_summary", label: "Subjective Summary", type: "string", required: true },
        { key: "objective_findings", label: "Objective Findings", type: "string", required: true },
        { key: "assessment", label: "Assessment", type: "string", required: true },
        { key: "plan", label: "Plan", type: "string", required: true },
      ],
    },
  },
  {
    id: "lib-cardiology",
    name: "Cardiology Focused SOAP",
    description: "Adds focused fields for chest pain and risk-factor tracking.",
    source: "library",
    isActive: false,
    headerFooterStyle: "default",
    headerTextAlign: "center",
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
    bodySchema: {
      title: "Cardiology SOAP Body",
      fields: [
        { key: "presenting_symptoms", label: "Presenting Symptoms", type: "string", required: true },
        { key: "vitals_summary", label: "Vitals Summary", type: "string", required: true },
        { key: "ecg_summary", label: "ECG Summary", type: "string", required: false },
        { key: "assessment", label: "Assessment", type: "string", required: true },
        { key: "management_plan", label: "Management Plan", type: "string", required: true },
      ],
    },
  },
  {
    id: "lib-mental-health",
    name: "Initial Clinical Interview",
    description: "Structured interview template for first-time mental health consults.",
    source: "library",
    isActive: false,
    headerFooterStyle: "default",
    headerTextAlign: "center",
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
    bodySchema: {
      title: "Interview Body",
      fields: [
        { key: "presenting_issue", label: "Presenting Issue", type: "string", required: true },
        { key: "history", label: "Relevant History", type: "string", required: true },
        { key: "risk_flags", label: "Risk Flags", type: "string", required: false },
        { key: "assessment", label: "Assessment", type: "string", required: true },
        { key: "plan", label: "Care Plan", type: "string", required: true },
      ],
    },
  },
];

export const initialPersonalTemplates: SoapTemplate[] = [
  {
    id: "mine-default-1",
    name: "Main template GP consult",
    description: "My default structure for daily clinic consults.",
    source: "mine",
    isActive: true,
    headerFooterStyle: "default",
    headerTextAlign: "center",
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
      "{{hospital_logo}}\n{{hospital_name}}\n{{doctor_name}} {{doctor_credentials}}\n{{hospital_address_line_1}}, {{hospital_address_line_2}}\n{{hospital_contact}}",
    footer: "Doctor: {{doctor_name}}\nSignature: {{doctor_signature}}",
    bodySchema: {
      title: "Session SOAP Body",
      fields: [
        { key: "subjective", label: "Subjective", type: "string", required: true },
        { key: "objective", label: "Objective", type: "string", required: true },
        { key: "assessment", label: "Assessment", type: "string", required: true },
        { key: "plan", label: "Plan", type: "string", required: true },
      ],
    },
  },
  {
    id: "mine-follow-up",
    name: "Follow-up quick review",
    description: "Lean structure for brief follow-up visits.",
    source: "mine",
    isActive: true,
    headerFooterStyle: "default",
    headerTextAlign: "center",
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
      "{{hospital_logo}}\n{{hospital_name}}\nFollow-up Clinic\n{{doctor_name}} {{doctor_credentials}}\n{{hospital_contact}}",
    footer:
      "Follow-up in 1-2 weeks unless symptoms worsen.\nDoctor: {{doctor_name}}\nSignature: {{doctor_signature}}",
    bodySchema: {
      title: "Follow-up SOAP",
      fields: [
        { key: "progress", label: "Progress Since Last Visit", type: "string", required: true },
        { key: "findings", label: "Current Findings", type: "string", required: true },
        { key: "assessment", label: "Assessment", type: "string", required: true },
        { key: "next_steps", label: "Next Steps", type: "string", required: true },
      ],
    },
  },
];

export function cloneForDoctor(template: SoapTemplate): SoapTemplate {
  return {
    ...template,
    id: `mine-${Date.now()}`,
    source: "mine",
    isActive: true,
    name: `${template.name} (Copy)`,
    description: `Cloned from library template: ${template.name}`,
  };
}

export function buildEmptyTemplate(): SoapTemplate {
  const id = `mine-${Date.now()}`;

  return {
    id,
    source: "mine",
    isActive: true,
    headerFooterStyle: "default",
    headerTextAlign: "center",
    profileContext: {
      hospitalName: "Hospital Name",
      hospitalLogoUrl: "/branding/clinic-logo.png",
      headerIconUrl: "",
      hospitalAddressLine1: "Address line 1",
      hospitalAddressLine2: "Address line 2",
      hospitalContact: "Phone",
      doctorName: "Doctor Name",
      doctorCredentials: "Credentials",
      doctorLicenseNo: "License No.",
      doctorSignature: "Doctor Signature",
      doctorSignatureImageUrl: "",
    },
    name: "Untitled Template",
    description: "New custom template",
    header:
      "{{hospital_logo}}\n{{hospital_name}}\n{{doctor_name}} {{doctor_credentials}}\n{{hospital_address_line_1}} {{hospital_address_line_2}}\n{{hospital_contact}}",
    footer: "Doctor: {{doctor_name}}\nSignature: {{doctor_signature}}",
    bodySchema: {
      title: "SOAP Body",
      fields: [{ key: "subjective", label: "Subjective", type: "string", required: true }],
    },
  };
}
