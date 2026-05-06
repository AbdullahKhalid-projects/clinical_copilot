"use server";

import { Pinecone } from "@pinecone-database/pinecone";
import { VoyageAIClient } from "voyageai";

import { prisma } from "@/lib/prisma";

export interface QuerySimilarDocumentResult {
  documentId: string;
  documentTitle: string;
  childText: string;
  parentChunkId: string;
  score: number;
}

export interface RerankResult {
  document: string;
  relevanceScore: number;
  index: number;
}

function requireEnv(name: "PINECONE_API_KEY" | "PINECONE_INDEX_NAME" | "VOYAGE_API_KEY"): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

function getPineconeIndex() {
  const apiKey = requireEnv("PINECONE_API_KEY");
  const indexName = requireEnv("PINECONE_INDEX_NAME");
  const pc = new Pinecone({ apiKey });
  const indexHost = process.env.PINECONE_INDEX_HOST;
  const baseIndex = pc.index(indexName, indexHost);
  const namespace = process.env.PINECONE_NAMESPACE?.trim();

  return namespace ? baseIndex.namespace(namespace) : baseIndex;
}

function getVoyageClient() {
  const apiKey = requireEnv("VOYAGE_API_KEY");
  return new VoyageAIClient({ apiKey });
}

export async function getParentTexts(parentChunkIds: string[]): Promise<Map<string, string>> {
  try {
    const validIds = parentChunkIds.filter((id): id is string => id != null && id.length > 0);
    if (validIds.length === 0) {
      return new Map();
    }

    const parentChunks = await prisma.parentChunk.findMany({
      where: { id: { in: validIds } },
      select: { id: true, parentText: true },
    });

    const parentTextMap = new Map<string, string>();
    parentChunks.forEach((chunk) => {
      parentTextMap.set(chunk.id, chunk.parentText);
    });

    return parentTextMap;
  } catch (error) {
    console.error("Error fetching parent texts:", error);
    return new Map();
  }
}

export async function querySimilarDocuments(
  query: string,
  topK: number = 5,
  filter?: Record<string, unknown>
): Promise<QuerySimilarDocumentResult[]> {
  try {
    const index = getPineconeIndex();
    const voyageClient = getVoyageClient();

    const queryEmbedding = await voyageClient.embed({
      input: [query],
      model: "voyage-3-large",
      inputType: "query",
      outputDimension: 2048,
    });

    const queryVector = (queryEmbedding.data?.[0]?.embedding ?? null) as number[] | null;
    if (!queryVector) {
      console.error("Failed to generate query embedding");
      return [];
    }

    const results = await index.query({
      vector: queryVector,
      topK,
      includeMetadata: true,
      filter,
    });

    const matches = (results.matches ?? []) as Array<{
      score?: number;
      metadata?: Record<string, unknown>;
    }>;

    return matches
      .map((match) => {
        const metadata = match.metadata ?? {};
        const parentChunkId =
          typeof metadata.parentChunkId === "string" ? metadata.parentChunkId : "";

        return {
          documentId: typeof metadata.documentId === "string" ? metadata.documentId : "",
          documentTitle:
            typeof metadata.documentTitle === "string" ? metadata.documentTitle : "",
          childText: typeof metadata.childText === "string" ? metadata.childText : "",
          parentChunkId,
          score: typeof match.score === "number" ? match.score : 0,
        };
      })
      .filter((result) => result.parentChunkId.length > 0);
  } catch (error) {
    console.error("Error querying similar documents:", error);
    return [];
  }
}

export async function rerankDocuments(
  query: string,
  documents: string[],
  topK?: number
): Promise<RerankResult[]> {
  try {
    if (documents.length === 0) {
      return [];
    }

    const voyageClient = getVoyageClient();

    const rerankedResult = await voyageClient.rerank({
      query,
      documents,
      model: "rerank-2.5",
      topK: topK ?? documents.length,
      returnDocuments: true,
    });

    const rerankData = (rerankedResult?.data ?? []) as Array<{
      document?: string;
      relevanceScore?: number;
      index?: number;
    }>;

    if (rerankData.length === 0) {
      return [];
    }

    return rerankData.map((doc) => ({
      document: doc.document ?? "",
      relevanceScore: doc.relevanceScore ?? 0,
      index: doc.index ?? 0,
    }));
  } catch (error) {
    console.error("Error reranking documents:", error);
    return [];
  }
}
