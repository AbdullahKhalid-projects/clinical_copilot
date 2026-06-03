import { getPatientTranscripts } from "@/app/actions/fetchers";
import { TranscriptsDashboard } from "./transcripts-dashboard";

export default async function TranscriptsPage() {
  const transcripts = await getPatientTranscripts();

  return <TranscriptsDashboard initialTranscripts={transcripts} />;
}
