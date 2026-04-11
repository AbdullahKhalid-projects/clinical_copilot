"use client";

import * as React from "react";
import {
  Document,
  Page,
  PDFViewer,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";

import { defaultPdfLayoutControls, type SoapTemplate } from "../types";

const COLORS = {
  primary: "#1e293b",    // Deep Slate
  accent: "#64748b",     // Cool Gray
  subtle: "#94a3b8",     // Muted Gray
  border: "#e2e8f0",     // Light Divider
  bg: "#f8fafc",         // Very Light Blue/Gray tint
  white: "#ffffff",
};

const styles = StyleSheet.create({
  page: {
    fontSize: 9,
    fontFamily: "Helvetica",
    color: COLORS.primary,
    backgroundColor: COLORS.white,
    paddingTop: 25,        // Moved header higher (was 40)
    paddingBottom: 40,
    paddingHorizontal: 45,
    lineHeight: 1.6,
  },
  // --- HEADER SECTION ---
  headerContainer: {
    marginBottom: 20,
    alignItems: "center",
  },
  doctorName: {
    fontSize: 22,
    fontWeight: "bold",
    letterSpacing: 1.5,
    color: COLORS.primary,
    textTransform: "uppercase",
    marginBottom: 8,       // Increased margin to stop overlap (was 2)
  },
  clinicAddress: {
    fontSize: 10,
    letterSpacing: 0.8,
    color: COLORS.accent,
    textTransform: "uppercase",
    marginBottom: 15,
  },
  metaRow: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTop: 0.5,
    borderBottom: 0.5,
    borderColor: COLORS.border,
    paddingVertical: 6,
  },
  metaItem: {
    fontSize: 8,
    fontWeight: "bold",
    color: COLORS.accent,
    textTransform: "uppercase",
  },

  // --- CONDENSED PATIENT BAR ---
  patientInfoBar: {
    flexDirection: "row",
    backgroundColor: COLORS.bg,
    borderRadius: 4,
    padding: 10,
    marginBottom: 25,
    justifyContent: "space-between",
    borderWidth: 0.5,
    borderColor: COLORS.border,
  },
  patientGroup: {
    flexDirection: "column",
    flex: 1,
    alignItems: "center",
  },
  label: {
    fontSize: 7,
    color: COLORS.subtle,
    fontWeight: "bold",
    textTransform: "uppercase",
    marginBottom: 2,
    letterSpacing: 0.5,
  },
  value: {
    fontSize: 9,
    fontWeight: "bold",
    color: COLORS.primary,
  },
  verticalDivider: {
    width: 0.5,
    height: "100%",
    backgroundColor: COLORS.border,
  },

  // --- CONTENT ---
  section: {
    marginBottom: 18,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: "bold",
    color: COLORS.primary,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginRight: 10,
  },
  sectionLine: {
    flex: 1,
    height: 0.5,
    backgroundColor: COLORS.border,
  },
  sectionContent: {
    paddingLeft: 4,
    fontSize: 10,
    color: "#334155",
    textAlign: "justify",
  },

  // --- FOOTER & SIGNATURE ---
  footer: {
    marginTop: "auto",
    borderTop: 1,
    borderColor: COLORS.primary,
    paddingTop: 15,
  },
  footerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  sigBlock: {
    width: 140,
    textAlign: "center",
    alignItems: "center",
  },
  placeholderSig: {
    fontSize: 12,
    color: COLORS.subtle,
    fontStyle: "italic",
    marginBottom: 4,
  },
  sigLine: {
    width: "100%",
    borderBottom: 0.5,
    borderColor: COLORS.primary,
    marginBottom: 4,
  },
  footerText: {
    fontSize: 8,
    color: COLORS.subtle,
    textTransform: "uppercase",
  }
});

type PdfNotePreviewProps = {
  template: SoapTemplate;
  llmObject: Record<string, unknown>;
};

export function NoteDocument({ template, llmObject }: PdfNotePreviewProps) {
  const doctorIdentity = `${template.profileContext.doctorName}${
    template.profileContext.doctorCredentials ? `, ${template.profileContext.doctorCredentials}` : ""
  }`;

  const renderedDate = new Date().toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  // Helper to ensure "N/A" placeholder
  const formatVal = (val: any) => (val && String(val).trim() !== "" ? String(val) : "N/A");

  return (
    <Document title={template.name}>
      <Page size="A4" style={styles.page}>
        
        {/* HEADER: Shifted higher, more spacing between Name and Address */}
        <View style={styles.headerContainer}>
          <Text style={styles.doctorName}>{doctorIdentity}</Text>
          <Text style={styles.clinicAddress}>
            {template.profileContext.hospitalAddressLine1 || "N/A"}
            {template.profileContext.hospitalAddressLine2 ? `, ${template.profileContext.hospitalAddressLine2}` : ""}
          </Text>
          
          <View style={styles.metaRow}>
            <Text style={styles.metaItem}>{template.profileContext.hospitalName || "N/A"}</Text>
            <Text style={styles.metaItem}>Tel: {template.profileContext.hospitalContact || "N/A"}</Text>
            <Text style={styles.metaItem}>Lic: {template.profileContext.doctorLicenseNo || "N/A"}</Text>
          </View>
        </View>

        {/* COMPACT PATIENT BAR: With N/A Fallbacks */}
        <View style={styles.patientInfoBar}>
          <View style={styles.patientGroup}>
            <Text style={styles.label}>Patient Name</Text>
            <Text style={styles.value}>{formatVal(llmObject.patient_name || llmObject.full_name)}</Text>
          </View>
          <View style={styles.verticalDivider} />
          <View style={styles.patientGroup}>
            <Text style={styles.label}>DOB</Text>
            <Text style={styles.value}>{formatVal(llmObject.patient_date_of_birth || llmObject.date_of_birth || llmObject.dob)}</Text>
          </View>
          <View style={styles.verticalDivider} />
          <View style={styles.patientGroup}>
            <Text style={styles.label}>Patient ID</Text>
            <Text style={styles.value}>{formatVal(llmObject.patient_id || llmObject.mrn)}</Text>
          </View>
          <View style={styles.verticalDivider} />
          <View style={styles.patientGroup}>
            <Text style={styles.label}>Visit Date</Text>
            <Text style={styles.value}>{formatVal(llmObject.visit_date || renderedDate)}</Text>
          </View>
        </View>

        {/* CONTENT SECTIONS */}
        <View>
          {template.bodySchema.fields.map((field) => (
            <View key={field.key} style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>{field.label}</Text>
                <View style={styles.sectionLine} />
              </View>
              <Text style={styles.sectionContent}>
                {formatVal(llmObject[field.key])}
              </Text>
            </View>
          ))}
        </View>

        {/* FOOTER: With Signature N/A Placeholder */}
        <View style={styles.footer}>
          <View style={styles.footerRow}>
            <View style={styles.sigBlock}>
              <Text style={styles.placeholderSig}>N/A</Text>
              <View style={styles.sigLine} />
              <Text style={styles.footerText}>Doctor Signature</Text>
            </View>
            <View style={styles.sigBlock}>
              <Text style={[styles.value, { marginBottom: 2, fontSize: 8 }]}>{renderedDate}</Text>
              <View style={styles.sigLine} />
              <Text style={styles.footerText}>Date of Issue</Text>
            </View>
          </View>
        </View>

      </Page>
    </Document>
  );
}

export function PdfNotePreview({ template, llmObject }: PdfNotePreviewProps) {
  return (
    <div className="h-[82vh] w-full overflow-hidden rounded-md border bg-white">
      <div className="h-full w-full">
        <PDFViewer width="100%" height="100%" showToolbar>
          <NoteDocument template={template} llmObject={llmObject} />
        </PDFViewer>
      </div>
    </div>
  );
}