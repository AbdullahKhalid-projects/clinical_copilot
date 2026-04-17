"use server";

import {
  querySimilarDocuments,
  getParentTexts,
  rerankDocuments,
} from "@/retrieval_actions/embeddings";

export interface ParentSearchResult {
  parentChunkId: string;
  parentText: string;
  documentId: string;
  documentTitle: string;
  score: number;
}

/**
 * Search the vector database and return top parent chunks with scores
 * Uses parent document RAG to aggregate child chunk scores by parent
 * @param query - Search query
 * @param topK - Number of child results to fetch before aggregating
 * @param typeFilter - Filter by document type: "medicine", "disease", or "all" (default: "all")
 */
export async function searchVectorDatabase(
  query: string,
  topK: number = 50,
  typeFilter: "medicine" | "disease" | "all" = "all"
): Promise<ParentSearchResult[]> {
  if (!query.trim()) {
    return [];
  }

  try {
    // Build filter - ALWAYS exclude patient documents
    let filter: Record<string, unknown>;

    if (typeFilter === "all") {
      // Query both medicine and disease, but NEVER patient
      filter = {
        type: { $in: ["medicine", "disease"] },
      };
    } else {
      // Query specific type (medicine or disease)
      filter = {
        type: typeFilter,
      };
    }

    // Query for more results to aggregate by parent
    const childResults = await querySimilarDocuments(query, topK, filter);

    if (childResults.length === 0) {
      return [];
    }

    // Aggregate scores by parent chunk using reciprocal rank fusion
    const parentScores = new Map<
      string,
      {
        totalScore: number;
        maxScore: number;
        documentId: string;
        documentTitle: string;
      }
    >();

    childResults.forEach((result, index) => {
      // Skip results with missing parentChunkId
      if (!result.parentChunkId) {
        return;
      }

      const existing = parentScores.get(result.parentChunkId);
      // Reciprocal rank contribution
      const rrfScore = 1 / (index + 60); // k=60 is common for RRF

      if (existing) {
        existing.totalScore += rrfScore;
        existing.maxScore = Math.max(existing.maxScore, result.score);
      } else {
        parentScores.set(result.parentChunkId, {
          totalScore: rrfScore,
          maxScore: result.score,
          documentId: result.documentId,
          documentTitle: result.documentTitle,
        });
      }
    });

    // Sort parents by their aggregated score
    const sortedParents = Array.from(parentScores.entries())
      .sort((a, b) => {
        // Primary: total RRF score, Secondary: max similarity score
        const scoreDiff = b[1].totalScore - a[1].totalScore;
        if (Math.abs(scoreDiff) > 0.001) return scoreDiff;
        return b[1].maxScore - a[1].maxScore;
      })
      .slice(0, 10);

    // Fetch parent texts
    const parentChunkIds = sortedParents.map(([id]) => id);
    const parentTexts = await getParentTexts(parentChunkIds);

    // Build intermediate results with parent text
    const intermediateResults = sortedParents.map(([parentChunkId, data]) => ({
      parentChunkId,
      parentText: parentTexts.get(parentChunkId) || "",
      documentId: data.documentId,
      documentTitle: data.documentTitle,
      score: data.maxScore,
    }));

    // Filter to only unique parent texts
    const seenTexts = new Set<string>();
    const uniqueResults = intermediateResults.filter((result) => {
      if (!result.parentText || seenTexts.has(result.parentText)) {
        return false;
      }
      seenTexts.add(result.parentText);
      return true;
    });

    if (uniqueResults.length === 0) {
      return [];
    }

    // Rerank unique parent texts using VoyageAI
    const documentsToRerank = uniqueResults.map((r) => r.parentText);
    const rerankedDocs = await rerankDocuments(query, documentsToRerank);

    if (rerankedDocs.length === 0) {
      // If reranking failed, return original results
      return uniqueResults;
    }

    // Map reranked results back to ParentSearchResult format, preserving rerank order
    const results: ParentSearchResult[] = rerankedDocs.map((reranked) => {
      const original = uniqueResults[reranked.index];
      return {
        parentChunkId: original.parentChunkId,
        parentText: original.parentText,
        documentId: original.documentId,
        documentTitle: original.documentTitle,
        score: reranked.relevanceScore,
      };
    });

    return results;
  } catch (error) {
    console.error("Error searching vector database:", error);
    return [];
  }
}
