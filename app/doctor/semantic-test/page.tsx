import { Metadata } from "next";
import { SemanticRetrievalTestClient } from "./semantic-test-client";

export const metadata: Metadata = {
  title: "Semantic Retrieval Test | Clinical Co-Pilot",
  description: "Test the semantic RAG retrieval pipeline",
};

export default function SemanticRetrievalTestPage() {
  return <SemanticRetrievalTestClient />;
}
