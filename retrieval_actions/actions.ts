"use server";

import {
  querySimilarDocuments,
  getParentTexts,
  rerankDocuments,
} from "@/retrieval_actions/embeddings";
import { prisma } from "@/lib/prisma";

export interface ParentSearchResult {
  parentChunkId: string;
  parentText: string;
  documentId: string;
  documentTitle: string;
  score: number;
}

export type RetrievalTypeFilter = "medicine" | "disease" | "patient" | "all";

export interface SearchVectorDatabaseOptions {
  includePatientDocuments?: boolean;
  patientUserId?: string | null;
  patientProfileId?: string | null;
  skipDbValidation?: boolean;
}

type RetrievalDocumentType = "medicine" | "disease" | "patient";

type PatientScope = {
  patientUserId: string | null;
  patientProfileId: string | null;
};

function getAllowedTypes(
  typeFilter: RetrievalTypeFilter,
  includePatientDocuments: boolean
): RetrievalDocumentType[] {
  if (typeFilter === "medicine") {
    return ["medicine"];
  }

  if (typeFilter === "disease") {
    return ["disease"];
  }

  if (typeFilter === "patient") {
    return includePatientDocuments ? ["patient"] : [];
  }

  return includePatientDocuments
    ? ["medicine", "disease", "patient"]
    : ["medicine", "disease"];
}

function mapDocumentToRetrievalType(document: {
  type: string;
  ragSubtype: string | null;
}): RetrievalDocumentType | null {
  if (document.type === "PATIENT") {
    return "patient";
  }

  if (document.type !== "RAG") {
    return null;
  }

  if (document.ragSubtype === "MEDICINE") {
    return "medicine";
  }

  if (document.ragSubtype === "DISEASE") {
    return "disease";
  }

  return null;
}

function isDocumentAllowed(
  document: {
    type: string;
    ragSubtype: string | null;
    userId: string | null;
  },
  allowedTypes: Set<RetrievalDocumentType>,
  patientUserId: string | null
): boolean {
  const retrievalType = mapDocumentToRetrievalType(document);
  if (!retrievalType || !allowedTypes.has(retrievalType)) {
    return false;
  }

  // Patient documents must be explicitly scoped to a single patient user.
  if (retrievalType === "patient") {
    if (!patientUserId) {
      return false;
    }
    return document.userId === patientUserId;
  }

  return true;
}

async function resolvePatientScope(options?: SearchVectorDatabaseOptions): Promise<PatientScope> {
  const patientUserId = options?.patientUserId?.trim() || null;
  const patientProfileId = options?.patientProfileId?.trim() || null;

  if (patientUserId) {
    return {
      patientUserId,
      patientProfileId,
    };
  }

  if (!patientProfileId) {
    return {
      patientUserId: null,
      patientProfileId: null,
    };
  }

  const profile = await prisma.patientProfile.findUnique({
    where: { id: patientProfileId },
    select: { userId: true },
  });

  return {
    patientUserId: profile?.userId ?? null,
    patientProfileId,
  };
}

function buildPineconeFilter(
  allowedTypeList: RetrievalDocumentType[],
  patientScope: PatientScope
): Record<string, unknown> | null {
  if (allowedTypeList.length === 0) {
    return null;
  }

  const nonPatientTypes = allowedTypeList.filter((type) => type !== "patient");
  const includesPatientType = allowedTypeList.includes("patient");

  const patientScopeFilters: Array<Record<string, string>> = [];

  if (patientScope.patientUserId) {
    patientScopeFilters.push(
      { userId: patientScope.patientUserId },
      { patientUserId: patientScope.patientUserId },
      { ownerUserId: patientScope.patientUserId },
      { patientId: patientScope.patientUserId }
    );
  }

  if (patientScope.patientProfileId) {
    patientScopeFilters.push(
      { patientProfileId: patientScope.patientProfileId },
      { profileId: patientScope.patientProfileId }
    );
  }

  if (!includesPatientType) {
    return nonPatientTypes.length === 1
      ? { type: nonPatientTypes[0] }
      : { type: { $in: nonPatientTypes } };
  }

  // Do not query patient vectors unless we have explicit patient scope.
  if (patientScopeFilters.length === 0) {
    if (nonPatientTypes.length === 0) {
      return null;
    }

    return nonPatientTypes.length === 1
      ? { type: nonPatientTypes[0] }
      : { type: { $in: nonPatientTypes } };
  }

  // Flat patient condition: type="patient" AND (any of the patient scope filters)
  // Pinecone implicitly ANDs top-level keys, so we combine type + $or directly.
  const patientCondition: Record<string, unknown> = {
    type: "patient",
    $or: patientScopeFilters,
  };

  if (nonPatientTypes.length === 0) {
    return patientCondition;
  }

  const nonPatientCondition: Record<string, unknown> =
    nonPatientTypes.length === 1
      ? { type: nonPatientTypes[0] }
      : { type: { $in: nonPatientTypes } };

  return {
    $or: [
      nonPatientCondition,
      patientCondition,
    ],
  };
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
  typeFilter: RetrievalTypeFilter = "all",
  options?: SearchVectorDatabaseOptions
): Promise<ParentSearchResult[]> {
  if (!query.trim()) {
    return [];
  }

  try {
    const includePatientDocuments = options?.includePatientDocuments === true;
    const patientScope = await resolvePatientScope(options);
    const patientUserId = patientScope.patientUserId;

    const allowedTypeList = getAllowedTypes(typeFilter, includePatientDocuments);
    if (allowedTypeList.length === 0) {
      return [];
    }

    // Coarse Pinecone filter with optional patient scope. Access is re-validated via DB below.
    const filter = buildPineconeFilter(allowedTypeList, patientScope);
    if (!filter) {
      return [];
    }

    // Query for more results to aggregate by parent.
    // If patient-scoped filtering returns nothing (common when ingestion metadata keys differ),
    // retry without a metadata filter and enforce patient constraints via DB metadata below.
    let childResults = await querySimilarDocuments(query, topK, filter);

    const hasExplicitPatientScope =
      includePatientDocuments &&
      (patientScope.patientUserId !== null || patientScope.patientProfileId !== null);

    if (childResults.length === 0 && hasExplicitPatientScope) {
      const fallbackTopK = Math.min(Math.max(topK * 2, 40), 120);
      childResults = await querySimilarDocuments(query, fallbackTopK);
    }

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

    // Enforce retrieval access/type constraints against canonical DB metadata.
    let accessFilteredResults = intermediateResults;
    const skipDbValidation = options?.skipDbValidation === true;

    if (!skipDbValidation) {
      const documentIds = Array.from(
        new Set(
          intermediateResults
            .map((result) => result.documentId)
            .filter((id): id is string => typeof id === "string" && id.length > 0)
        )
      );

      if (documentIds.length === 0) {
        return [];
      }

      const documents = await prisma.document.findMany({
        where: { id: { in: documentIds } },
        select: {
          id: true,
          type: true,
          ragSubtype: true,
          userId: true,
        },
      });

      const documentsById = new Map(documents.map((document) => [document.id, document]));
      const allowedTypes = new Set<RetrievalDocumentType>(allowedTypeList);

      let rejectionReasons: string[] = [];
      accessFilteredResults = intermediateResults.filter((result) => {
        const document = documentsById.get(result.documentId);
        if (!document) {
          rejectionReasons.push(`${result.documentId}: not found in DB`);
          return false;
        }
        const allowed = isDocumentAllowed(document, allowedTypes, patientUserId);
        if (!allowed) {
          rejectionReasons.push(
            `${result.documentId}: type=${document.type} ragSubtype=${document.ragSubtype} userId=${document.userId} — does not match scope patientUserId=${patientUserId}`
          );
        }
        return allowed;
      });

      if (rejectionReasons.length > 0) {
        console.warn("[searchVectorDatabase] DB validation rejections:", rejectionReasons.slice(0, 10));
      }
    }

    // Filter to only unique parent texts
    const seenTexts = new Set<string>();
    const uniqueResults = accessFilteredResults.filter((result) => {
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
