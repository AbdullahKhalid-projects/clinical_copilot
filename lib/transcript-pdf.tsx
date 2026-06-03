import React from "react";
import { Document, Page, StyleSheet, Text, View, renderToStream } from "@react-pdf/renderer";
import { format, isValid } from "date-fns";

export type TranscriptPdfPayload = {
  patientName: string;
  doctorName: string;
  date: Date;
  reason: string;
  segments: Array<{ text?: string; speaker?: string; start?: number; end?: number }>;
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
  segmentRow: {
    marginBottom: 8,
    flexDirection: "row",
  },
  speakerBadge: {
    backgroundColor: "#f0e6ff",
    color: "#6b21a8",
    fontSize: 9,
    fontWeight: 700,
    borderRadius: 4,
    paddingTop: 2,
    paddingBottom: 2,
    paddingLeft: 6,
    paddingRight: 6,
    marginRight: 8,
    minWidth: 60,
    textAlign: "center" as const,
  },
  segmentText: {
    fontSize: 11,
    lineHeight: 1.5,
    flex: 1,
  },
  timestamp: {
    fontSize: 8,
    color: "#9ca3af",
    marginTop: 2,
  },
});

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function TranscriptPdfDocument(props: TranscriptPdfPayload) {
  const dateStr = isValid(props.date) ? format(props.date, "PPP") : "Unknown date";

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.headerTitle}>Session Transcript</Text>

        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Patient</Text>
          <Text style={styles.metaValue}>{props.patientName}</Text>
        </View>

        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Doctor</Text>
          <Text style={styles.metaValue}>{props.doctorName}</Text>
        </View>

        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Date</Text>
          <Text style={styles.metaValue}>{dateStr}</Text>
        </View>

        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Reason</Text>
          <Text style={styles.metaValue}>{props.reason}</Text>
        </View>

        <View style={{ ...styles.metaRow, marginTop: 6 }}>
          <Text style={styles.metaLabel}>Segments</Text>
          <Text style={styles.metaValue}>{props.segments.length} entries</Text>
        </View>

        <View style={styles.divider} />

        {props.segments.map((seg, idx) => (
          <View key={idx} style={styles.segmentRow} wrap={false}>
            <Text style={styles.speakerBadge}>{seg.speaker || "Speaker"}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.segmentText}>{seg.text}</Text>
              {typeof seg.start === "number" && typeof seg.end === "number" && (
                <Text style={styles.timestamp}>
                  {formatTime(seg.start)} – {formatTime(seg.end)}
                </Text>
              )}
            </View>
          </View>
        ))}
      </Page>
    </Document>
  );
}

export function buildTranscriptFilename(patientName: string, date: Date): string {
  const name = patientName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "patient";
  const dateStr = isValid(date) ? format(date, "yyyy-MM-dd") : "unknown-date";
  return `${name}-transcript-${dateStr}.pdf`;
}

export async function renderTranscriptPdfBuffer(payload: TranscriptPdfPayload): Promise<Buffer> {
  const doc = <TranscriptPdfDocument {...payload} />;
  const stream = await renderToStream(doc);
  return new Promise((resolve, reject) => {
    const buffers: Buffer[] = [];
    stream.on("data", (data: Buffer) => buffers.push(data));
    stream.on("end", () => resolve(Buffer.concat(buffers)));
    stream.on("error", reject);
  });
}
