import React from "react";
import { Document, Page, StyleSheet, Text, View, renderToStream } from "@react-pdf/renderer";

export type VisitSummaryPdfPayload = {
  patientName: string;
  doctorName: string;
  visitDate: string;
  reason: string;
  noteText: string;
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 28,
    paddingRight: 32,
    paddingBottom: 32,
    paddingLeft: 32,
    fontSize: 11,
    color: "#111827",
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: 700,
    marginBottom: 6,
  },
  metaRow: {
    marginBottom: 3,
  },
  metaLabel: {
    fontSize: 10,
    color: "#6b7280",
  },
  metaValue: {
    fontSize: 11,
    color: "#111827",
  },
  divider: {
    marginTop: 10,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  bodyText: {
    fontSize: 11,
    lineHeight: 1.5,
  },
});

function VisitSummaryPdfDocument(props: VisitSummaryPdfPayload) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.headerTitle}>After Visit Summary</Text>

        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Patient</Text>
          <Text style={styles.metaValue}>{props.patientName}</Text>
        </View>

        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Doctor</Text>
          <Text style={styles.metaValue}>{props.doctorName}</Text>
        </View>

        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Visit Date</Text>
          <Text style={styles.metaValue}>{props.visitDate}</Text>
        </View>

        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Reason</Text>
          <Text style={styles.metaValue}>{props.reason}</Text>
        </View>

        <View style={styles.divider} />

        <Text style={styles.bodyText}>{props.noteText}</Text>
      </Page>
    </Document>
  );
}

export function formatVisitSummaryDateLabel(value: Date): string {
  const year = value.getUTCFullYear();
  const month = `${value.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${value.getUTCDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function sanitizeVisitSummaryFilenameSegment(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "visit-summary"
  );
}

export function buildVisitSummaryFilename(patientName: string, visitDateLabel: string): string {
  return `${sanitizeVisitSummaryFilenameSegment(patientName)}-${visitDateLabel}.pdf`;
}

export async function renderVisitSummaryPdfBuffer(payload: VisitSummaryPdfPayload): Promise<Buffer> {
  const doc = <VisitSummaryPdfDocument {...payload} />;
  const stream = await renderToStream(doc);
  return new Promise((resolve, reject) => {
    const buffers: Buffer[] = [];
    stream.on("data", (data: Buffer) => buffers.push(data));
    stream.on("end", () => resolve(Buffer.concat(buffers)));
    stream.on("error", reject);
  });
}
