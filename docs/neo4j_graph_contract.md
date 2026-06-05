# Neo4j Graph Contract

## Purpose

This document describes the Neo4j graph used for the clinical copilot demo. It is a curated subset of PrimeKG intended for tool-based graph retrieval, not full biomedical coverage.

The graph is designed to support:

- drug to disease lookups
- disease to drug lookups
- disease hierarchy exploration
- drug to target/mechanism lookups
- contraindication context

The graph is not intended to support:

- medication dosing
- patient allergy storage
- current clinical guideline enforcement
- reliable drug-drug interaction safety checking
- formulary or insurance coverage decisions

## Data Origin

The graph was built from a filtered PrimeKG export and loaded into Neo4j Aura.

Primary filtered files:

- `kg_showcase_disease_links_nodes.csv`
- `kg_showcase_disease_links.csv`

This curated version keeps only the following relation families:

- `indication`
- `contraindication`
- `drug_protein`
- `disease_disease`
- `off-label use`

## Node Model

All nodes have the base label:

- `Entity`

Additional labels are assigned from `node_type`:

- `Drug`
- `Disease`
- `GeneProtein`

### Node Properties

Every node should have:

- `node_index: integer`
- `node_id: string`
- `node_name: string`
- `node_type: string`
- `node_source: string`

### Node Label Mapping

Map `node_type` to labels as follows:

- `drug` -> `Drug`
- `disease` -> `Disease`
- `gene/protein` -> `GeneProtein`

## Relationship Model

All relationships are stored as:

- `RELATED`

Relationship meaning is expressed through properties rather than multiple Neo4j relationship types.

### Relationship Properties

Every relationship may contain:

- `relation: string`
- `display_relation: string`
- `x_index: integer`
- `y_index: integer`
- `x_type: string`
- `y_type: string`
- `x_name: string`
- `y_name: string`
- `x_source: string`
- `y_source: string`

### Allowed `relation` Values

- `indication`
- `contraindication`
- `drug_protein`
- `disease_disease`
- `off-label use`

### Interpreting `relation`

#### `indication`

Usually:

- `(Drug)-[:RELATED {relation: "indication"}]->(Disease)`

Meaning:

- the drug is indicated for the disease

#### `contraindication`

Usually:

- `(Drug)-[:RELATED {relation: "contraindication"}]->(Disease)`

Meaning:

- the drug is contraindicated in the disease or condition

#### `drug_protein`

Usually:

- `(Drug)-[:RELATED {relation: "drug_protein"}]->(GeneProtein)`

Use `display_relation` for finer semantics:

- `target`
- `enzyme`
- `transporter`
- `carrier`

#### `disease_disease`

Usually:

- `(Disease)-[:RELATED {relation: "disease_disease"}]->(Disease)`

Current curated graph uses this mainly as hierarchy/context. The most common `display_relation` is:

- `parent-child`

Treat this as disease hierarchy or disease neighborhood context, not causal biology.

#### `off-label use`

Usually:

- `(Drug)-[:RELATED {relation: "off-label use"}]->(Disease)`

Meaning:

- the drug is associated with off-label use for the disease

## Dataset Size

Current curated graph after import:

- about `26,766` nodes
- about `200k` relationships

This is the intended demo-scale graph.

## Constraints and Indexes

Expected constraint:

```cypher
CREATE CONSTRAINT entity_node_index IF NOT EXISTS
FOR (n:Entity)
REQUIRE n.node_index IS UNIQUE;
```

Recommended indexes:

```cypher
CREATE INDEX drug_name_idx IF NOT EXISTS FOR (n:Drug) ON (n.node_name);
CREATE INDEX disease_name_idx IF NOT EXISTS FOR (n:Disease) ON (n.node_name);
CREATE INDEX gene_name_idx IF NOT EXISTS FOR (n:GeneProtein) ON (n.node_name);
```

## Querying Guidance

Always filter by `r.relation` when querying `RELATED` edges.

Examples:

- for drug indications, require `r.relation = "indication"`
- for contraindications, require `r.relation = "contraindication"`
- for targets/mechanisms, require `r.relation = "drug_protein"`
- for disease hierarchy, require `r.relation = "disease_disease"`

Do not assume all `RELATED` edges mean the same thing.

## Product Limitations

This graph should be used for:

- context retrieval
- exploratory relationships
- tool-driven graph lookup
- doctor-facing knowledge support

This graph should not be used alone for:

- drug allergy decisioning
- dose recommendation
- validated interaction safety alerts
- current standard-of-care enforcement

If patient-specific safety is needed, combine with other sources such as allergy lists, medication histories, RxNorm-style normalization, and clinical rule systems.
