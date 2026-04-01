export type TemplateFieldType = "string" | "number" | "boolean";
export type FieldFallbackPolicy = "empty" | "not_documented" | "omit_if_optional";

export type TemplateField = {
  key: string;
  label: string;
  type: TemplateFieldType;
  required: boolean;
  guidance?: string;
  hint?: string;
  fallbackPolicy?: FieldFallbackPolicy;
};

export type NoteNormalizationSettings = {
  trimText: boolean;
  collapseWhitespace: boolean;
  collapseLineBreaks: boolean;
  normalizeNotDocumented: boolean;
};

export const defaultNoteNormalizationSettings: NoteNormalizationSettings = {
  trimText: true,
  collapseWhitespace: true,
  collapseLineBreaks: true,
  normalizeNotDocumented: true,
};

export type TemplateBodySchema = {
  title: string;
  fields: TemplateField[];
};

export type TemplateSource = "mine" | "library";

export type HeaderTextAlign = "left" | "center" | "right";
export type HeaderFooterStyle = "default";

export type PdfLayoutControls = {
  headerX: number;
  headerY: number;
  logoX: number;
  logoY: number;
  logoScale: number;
  patientY: number;
  bodyY: number;
  footerY: number;
  signatureX: number;
  signatureY: number;
  dateX: number;
  dateY: number;
};

export const defaultPdfLayoutControls: PdfLayoutControls = {
  headerX: 0,
  headerY: 0,
  logoX: 0,
  logoY: 0,
  logoScale: 1,
  patientY: 0,
  bodyY: 0,
  footerY: 0,
  signatureX: 0,
  signatureY: 0,
  dateX: 0,
  dateY: 0,
};

export type TemplateProfileContext = {
  hospitalName: string;
  hospitalLogoUrl?: string;
  headerIconUrl?: string;
  hospitalAddressLine1: string;
  hospitalAddressLine2?: string;
  hospitalContact: string;
  doctorName: string;
  doctorCredentials?: string;
  doctorLicenseNo?: string;
  doctorSignature?: string;
  doctorSignatureImageUrl?: string;
};

export type SoapTemplate = {
  id: string;
  name: string;
  description: string;
  promptDirectives?: string;
  source: TemplateSource;
  isActive: boolean;
  headerFooterStyle: HeaderFooterStyle;
  headerTextAlign: HeaderTextAlign;
  pdfLayout?: PdfLayoutControls;
  normalization?: NoteNormalizationSettings;
  profileContext: TemplateProfileContext;
  header: string;
  footer: string;
  bodySchema: TemplateBodySchema;
};
