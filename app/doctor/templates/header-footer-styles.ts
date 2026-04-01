import type { HeaderFooterStyle, TemplateProfileContext } from "./types";

type HeaderFooterMetadataField = {
  key: keyof TemplateProfileContext;
  label: string;
  placeholder?: string;
};

type HeaderFooterStyleDefinition = {
  id: HeaderFooterStyle;
  label: string;
  description: string;
  metadataFields: HeaderFooterMetadataField[];
};

export const HEADER_FOOTER_STYLES: Record<HeaderFooterStyle, HeaderFooterStyleDefinition> = {
  default: {
    id: "default",
    label: "Default",
    description:
      "Professional medical letterhead with centered doctor title, metadata strip, compact patient info row, and signature/date footer.",
    metadataFields: [
      { key: "doctorName", label: "Doctor Name", placeholder: "Dr. Qamar" },
      { key: "doctorCredentials", label: "Doctor Credentials", placeholder: "MBBS, FCPS" },
      { key: "doctorLicenseNo", label: "Doctor License No.", placeholder: "LIC-120987" },
      { key: "hospitalName", label: "Hospital/Clinic Name", placeholder: "Riverbend Medical Center" },
      { key: "hospitalAddressLine1", label: "Address Line 1", placeholder: "21 Clinic Street" },
      { key: "hospitalAddressLine2", label: "Address Line 2", placeholder: "Lahore" },
      { key: "hospitalContact", label: "Phone/Contact", placeholder: "+92 300 0000000" },
      { key: "hospitalLogoUrl", label: "Hospital Logo Path or URL", placeholder: "/branding/clinic-logo.png" },
      { key: "doctorSignatureImageUrl", label: "Signature Image Path or URL", placeholder: "/branding/signature.png" },
    ],
  },
};
