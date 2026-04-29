/**
 * Neo4j Cypher query dump for chat tools and quick graph exploration.
 *
 * Tool names expected by chat route:
 * - get_patient_clinical_summary
 * - verify_prescription_safety
 * - suggest_safe_alternatives
 */

export const patientOverviewExplorationQuery = `
MATCH (llmP:ClinicalEntity {type: "PATIENT"})-[r:RELATES_TO]->(target:ClinicalEntity)
WHERE r.relationType IN ["HAS_CONDITION", "ALLERGIC_TO", "ON_MEDICATION"]
RETURN llmP, r, target
`;

export const medicationRiskExplorationQuery = `
MATCH (med:ClinicalEntity {name: "Cetirizine"})-[r:RELATES_TO]->(target:ClinicalEntity)
WHERE r.relationType IN ["CAUSES_COMPLICATION", "HAS_SIDE_EFFECT", "INTERACTS_WITH", "CONTRAINDICATED_FOR"]
RETURN med, r, target
`;

export const allergyConflictExplorationQuery = `
MATCH (llmP:ClinicalEntity {type: "PATIENT"})-[allergy:RELATES_TO {relationType: "ALLERGIC_TO"}]->(allergen:ClinicalEntity)
MATCH (med:ClinicalEntity)
WHERE toLower(med.name) = "amoxicillin"
  AND (
    toLower(allergen.name) = "amoxicillin"
    OR EXISTS { (med)-[:RELATES_TO {relationType: "CROSS_REACTS_WITH"}]-(allergen) }
  )
RETURN llmP.name AS Patient,
       allergen.name AS KnownAllergy,
       med.name AS PrescribedDrug,
       "PRESCRIPTION REJECTED: ALLERGY / CROSS-REACTION RISK" AS SystemAlert
`;

export const getPatientClinicalSummaryQuery = `
MATCH (p:ClinicalEntity {type: "PATIENT"})-[r:RELATES_TO]->(target:ClinicalEntity)
WHERE p.name CONTAINS $patientId
  AND r.relationType IN ["HAS_CONDITION", "ALLERGIC_TO", "ON_MEDICATION"]
RETURN r.relationType AS Category,
       target.name AS Item,
       r.reportDate AS Date
ORDER BY Category, Date DESC
`;

export const verifyPrescriptionSafetyQuery = `
MATCH (p:ClinicalEntity {type: "PATIENT"})
WHERE p.name CONTAINS $patientId
MATCH (med:ClinicalEntity)
WHERE toLower(med.name) = toLower($proposedDrug)

// Check Allergies & Cross-Reactions
OPTIONAL MATCH (p)-[:RELATES_TO {relationType: "ALLERGIC_TO"}]->(allergen:ClinicalEntity)
WHERE toLower(allergen.name) = toLower(med.name)
   OR EXISTS { (med)-[:RELATES_TO {relationType: "CROSS_REACTS_WITH"}]-(allergen) }
WITH p, med, collect(DISTINCT allergen.name) AS AllergyConflicts

// Check Drug Interactions
OPTIONAL MATCH (p)-[:RELATES_TO {relationType: "ON_MEDICATION"}]->(currentMed:ClinicalEntity)
WHERE EXISTS { (med)-[:RELATES_TO {relationType: "INTERACTS_WITH"}]-(currentMed) }
WITH p, med, AllergyConflicts, collect(DISTINCT currentMed.name) AS InteractionAlerts

// Check Disease Contraindications
OPTIONAL MATCH (p)-[:RELATES_TO {relationType: "HAS_CONDITION"}]->(condition:ClinicalEntity)
WHERE EXISTS { (med)-[:RELATES_TO {relationType: "CONTRAINDICATED_FOR"}]-(condition) }

RETURN med.name AS ProposedMedicine,
       AllergyConflicts AS Warning_Allergies,
       InteractionAlerts AS Warning_Interactions,
       collect(DISTINCT condition.name) AS Warning_Contraindications
`;

export const suggestSafeAlternativesQuery = `
MATCH (disease:ClinicalEntity)
WHERE toLower(disease.name) = toLower($diseaseName)

// Notice we removed the arrow direction (-) and check both relationship names
MATCH (disease)-[r:RELATES_TO]-(treatment:ClinicalEntity)
WHERE r.relationType IN ["TREATED_BY", "INDICATED_FOR"]

MATCH (p:ClinicalEntity {type: "PATIENT"})
WHERE p.name CONTAINS $patientId
  AND NOT EXISTS {
      MATCH (p)-[:RELATES_TO {relationType: "ALLERGIC_TO"}]->(allergen:ClinicalEntity)
      WHERE toLower(allergen.name) = toLower(treatment.name)
         OR EXISTS { (treatment)-[:RELATES_TO {relationType: "CROSS_REACTS_WITH"}]-(allergen) }
  }

RETURN treatment.name AS SafeAlternative,
       r.relationType AS FoundVia,
       r.propertiesJson AS TreatmentDetails
LIMIT 5
`;
