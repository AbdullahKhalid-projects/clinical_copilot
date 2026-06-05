import neo4j, { type Driver } from "neo4j-driver";

const PRIMEKG_NEO4J_URI = process.env.NEO4J_URI_Q?.trim() ?? "";
const PRIMEKG_NEO4J_USERNAME =
  process.env.NEO4J_USERNAME_Q?.trim() ??
  process.env.NEO4J_USER_Q?.trim() ??
  "";
const PRIMEKG_NEO4J_PASSWORD =
  process.env.NEO4J_PASSWORD_Q ?? process.env.NEO4J_PASS_Q ?? "";
const PRIMEKG_NEO4J_DATABASE =
  process.env.NEO4J_DATABASE_Q?.trim() || undefined;

let primeKgDriverSingleton: Driver | null = null;

export type PrimeKgQueryRow = Record<string, unknown>;

const PRIMEKG_ENTITY_TYPE_FILTER = `
  $entityType = "any"
  OR ($entityType = "drug" AND (e:Drug OR e.node_type = "drug"))
  OR ($entityType = "disease" AND (e:Disease OR e.node_type = "disease"))
  OR ($entityType = "gene/protein" AND (e:GeneProtein OR e.node_type = "gene/protein"))
`;

export const searchPrimeKgEntitiesQuery = `
MATCH (e:Entity)
WHERE toLower(coalesce(e.node_name, "")) CONTAINS toLower($query)
  AND (${PRIMEKG_ENTITY_TYPE_FILTER})
WITH e,
     CASE
       WHEN toLower(e.node_name) = toLower($query) THEN 0
       WHEN toLower(e.node_name) STARTS WITH toLower($query) THEN 1
       ELSE 2
     END AS match_rank
RETURN e.node_name AS entity_name,
       coalesce(
         e.node_type,
         CASE
           WHEN e:Drug THEN "drug"
           WHEN e:Disease THEN "disease"
           WHEN e:GeneProtein THEN "gene/protein"
           ELSE "entity"
         END
       ) AS entity_type,
       labels(e) AS labels
ORDER BY match_rank ASC, size(e.node_name) ASC
LIMIT 10
`;

export const getPrimeKgDrugContextQuery = `
MATCH (drug:Entity)
WHERE toLower(coalesce(drug.node_name, "")) CONTAINS toLower($drugName)
  AND (drug:Drug OR drug.node_type = "drug")
WITH drug
ORDER BY
  CASE WHEN toLower(drug.node_name) = toLower($drugName) THEN 0 ELSE 1 END,
  size(drug.node_name) ASC
LIMIT 1
RETURN drug.node_name AS drug,
       [(drug)-[ind:RELATED]->(indDisease:Entity)
         WHERE ind.relation = "indication"
           AND (indDisease:Disease OR indDisease.node_type = "disease")
         | indDisease.node_name][0..15] AS indications,
       [(drug)-[con:RELATED]->(conDisease:Entity)
         WHERE con.relation = "contraindication"
           AND (conDisease:Disease OR conDisease.node_type = "disease")
         | conDisease.node_name][0..15] AS contraindications,
       [(drug)-[prot:RELATED]->(g:Entity)
         WHERE prot.relation = "drug_protein"
           AND (g:GeneProtein OR g.node_type = "gene/protein")
         | {
             protein: g.node_name,
             role: prot.display_relation
           }][0..20] AS targets
`;

export const getPrimeKgDiseasesForDrugQuery = `
MATCH (drug:Entity)
WHERE toLower(coalesce(drug.node_name, "")) CONTAINS toLower($drugName)
  AND (drug:Drug OR drug.node_type = "drug")
WITH drug
ORDER BY
  CASE WHEN toLower(drug.node_name) = toLower($drugName) THEN 0 ELSE 1 END,
  size(drug.node_name) ASC
LIMIT 1
RETURN drug.node_name AS drug,
       [(drug)-[rel:RELATED]->(d:Entity)
         WHERE rel.relation = "indication"
           AND (d:Disease OR d.node_type = "disease")
         | d.node_name][0..20] AS indication_diseases,
       [(drug)-[rel:RELATED]->(d:Entity)
         WHERE rel.relation = "contraindication"
           AND (d:Disease OR d.node_type = "disease")
         | d.node_name][0..20] AS contraindication_diseases,
       [(drug)-[rel:RELATED]->(d:Entity)
         WHERE toLower(coalesce(rel.relation, "")) IN ["off-label use", "off_label_use", "off-label_use", "off label use"]
           AND (d:Disease OR d.node_type = "disease")
         | d.node_name][0..20] AS off_label_diseases
`;

export const getPrimeKgTargetsForDrugQuery = `
MATCH (drug:Entity)
WHERE toLower(coalesce(drug.node_name, "")) CONTAINS toLower($drugName)
  AND (drug:Drug OR drug.node_type = "drug")
WITH drug
ORDER BY
  CASE WHEN toLower(drug.node_name) = toLower($drugName) THEN 0 ELSE 1 END,
  size(drug.node_name) ASC
LIMIT 1
RETURN drug.node_name AS drug,
       [(drug)-[prot:RELATED]->(g:Entity)
         WHERE prot.relation = "drug_protein"
           AND (g:GeneProtein OR g.node_type = "gene/protein")
         | {
             protein: g.node_name,
             role: prot.display_relation
           }][0..25] AS targets
`;

export const getPrimeKgDiseaseContextQuery = `
MATCH (d:Entity)
WHERE toLower(coalesce(d.node_name, "")) CONTAINS toLower($diseaseName)
  AND (d:Disease OR d.node_type = "disease")
WITH d
ORDER BY
  CASE WHEN toLower(d.node_name) = toLower($diseaseName) THEN 0 ELSE 1 END,
  size(d.node_name) ASC
LIMIT 1
RETURN d.node_name AS disease,
       [(d)<-[ind:RELATED]-(drug1:Entity)
         WHERE ind.relation = "indication"
           AND (drug1:Drug OR drug1.node_type = "drug")
         | drug1.node_name][0..15] AS indicated_drugs,
       [(d)<-[con:RELATED]-(drug2:Entity)
         WHERE con.relation = "contraindication"
           AND (drug2:Drug OR drug2.node_type = "drug")
         | drug2.node_name][0..15] AS contraindicated_drugs,
       [(d)-[dd:RELATED]-(other:Entity)
         WHERE dd.relation = "disease_disease"
           AND (other:Disease OR other.node_type = "disease")
         | {
             disease: other.node_name,
             link_type: dd.display_relation
           }][0..20] AS related_diseases
`;

export const getPrimeKgDrugsForDiseaseQuery = `
MATCH (d:Entity)
WHERE toLower(coalesce(d.node_name, "")) CONTAINS toLower($diseaseName)
  AND (d:Disease OR d.node_type = "disease")
WITH d
ORDER BY
  CASE WHEN toLower(d.node_name) = toLower($diseaseName) THEN 0 ELSE 1 END,
  size(d.node_name) ASC
LIMIT 1
RETURN d.node_name AS disease,
       [(d)<-[rel:RELATED]-(drug:Entity)
         WHERE rel.relation = "indication"
           AND (drug:Drug OR drug.node_type = "drug")
         | drug.node_name][0..20] AS indicated_drugs
`;

export const getPrimeKgRelatedDiseasesQuery = `
MATCH (d:Entity)
WHERE toLower(coalesce(d.node_name, "")) CONTAINS toLower($diseaseName)
  AND (d:Disease OR d.node_type = "disease")
WITH d
ORDER BY
  CASE WHEN toLower(d.node_name) = toLower($diseaseName) THEN 0 ELSE 1 END,
  size(d.node_name) ASC
LIMIT 1
RETURN d.node_name AS disease,
       [(d)-[dd:RELATED]-(other:Entity)
         WHERE dd.relation = "disease_disease"
           AND (other:Disease OR other.node_type = "disease")
         | {
             disease: other.node_name,
             link_type: dd.display_relation
           }][0..25] AS related_diseases
`;

function getPrimeKgDriverOrError(): { driver: Driver | null; error?: string } {
  if (!PRIMEKG_NEO4J_URI || !PRIMEKG_NEO4J_USERNAME || !PRIMEKG_NEO4J_PASSWORD) {
    const missing = [
      !PRIMEKG_NEO4J_URI && "NEO4J_URI_Q",
      !PRIMEKG_NEO4J_USERNAME && "NEO4J_USERNAME_Q",
      !PRIMEKG_NEO4J_PASSWORD && "NEO4J_PASSWORD_Q",
    ]
      .filter(Boolean)
      .join(", ");

    return {
      driver: null,
      error:
        `PrimeKG Neo4j is not configured. Missing: ${missing}.`,
    };
  }

  if (!primeKgDriverSingleton) {
    primeKgDriverSingleton = neo4j.driver(
      PRIMEKG_NEO4J_URI,
      neo4j.auth.basic(PRIMEKG_NEO4J_USERNAME, PRIMEKG_NEO4J_PASSWORD),
      {
        disableLosslessIntegers: true,
      },
    );
  }

  return { driver: primeKgDriverSingleton };
}

export async function runPrimeKgReadQuery(
  query: string,
  params: Record<string, unknown>,
): Promise<{ ok: true; rows: PrimeKgQueryRow[] } | { ok: false; error: string }> {
  const { driver, error } = getPrimeKgDriverOrError();
  if (!driver) {
    return {
      ok: false,
      error: error ?? "PrimeKG Neo4j driver is not available.",
    };
  }

  const session = driver.session(
    PRIMEKG_NEO4J_DATABASE
      ? {
          defaultAccessMode: neo4j.session.READ,
          database: PRIMEKG_NEO4J_DATABASE,
        }
      : {
          defaultAccessMode: neo4j.session.READ,
        },
  );

  try {
    const result = await session.executeRead((tx: any) => tx.run(query, params));
    const rows: PrimeKgQueryRow[] = result.records.map((record: any) => {
      const row: PrimeKgQueryRow = {};
      for (const key of record.keys) {
        row[key] = record.get(key);
      }
      return row;
    });

    return { ok: true, rows };
  } catch (queryError) {
    return {
      ok: false,
      error:
        queryError instanceof Error ? queryError.message : "PrimeKG Neo4j query failed.",
    };
  } finally {
    await session.close();
  }
}
