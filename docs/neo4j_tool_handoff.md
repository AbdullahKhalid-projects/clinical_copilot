# Neo4j Tool Handoff

## Purpose

This document defines the tool layer the agent should use when interacting with the Neo4j clinical graph.

The agent should prefer calling explicit tools over generating arbitrary Cypher at runtime.

That keeps retrieval:

- consistent
- explainable
- easier to test
- safer to evolve

## Tooling Strategy

The graph is best used through a small set of domain tools:

- entity search
- drug to disease retrieval
- disease to drug retrieval
- contraindication lookup
- target/mechanism lookup
- disease hierarchy lookup
- compact context summary tools

The agent should:

1. identify whether the user is asking about a drug, disease, or mechanism
2. resolve the entity name
3. call one or more graph tools
4. summarize the returned graph facts

## Tool Catalog

### `search_entities`

Find candidate entities by fuzzy name match.

#### Arguments

- `query: string`
- `limit: integer = 10`

#### Cypher

```cypher
MATCH (n:Entity)
WHERE toLower(n.node_name) CONTAINS toLower($query)
RETURN n.node_name AS name,
       n.node_type AS type,
       n.node_source AS source,
       n.node_index AS node_index
ORDER BY n.node_name
LIMIT $limit
```

#### Use When

- the user mentions a partial name
- the entity could be a drug or disease
- the agent is unsure about exact spelling

---

### `get_drugs_for_disease`

Return drugs indicated for a disease.

#### Arguments

- `disease_name: string`
- `limit: integer = 20`

#### Cypher

```cypher
MATCH (d:Disease)<-[r:RELATED]-(drug:Drug)
WHERE r.relation = 'indication'
  AND toLower(d.node_name) CONTAINS toLower($disease_name)
RETURN d.node_name AS disease,
       collect(DISTINCT drug.node_name)[0..$limit] AS drugs
```

#### Use When

- the user asks what drugs are used for a disease
- the user asks treatment-style graph questions

---

### `get_off_label_drugs_for_disease`

Return drugs linked through off-label use.

#### Arguments

- `disease_name: string`
- `limit: integer = 20`

#### Cypher

```cypher
MATCH (d:Disease)<-[r:RELATED]-(drug:Drug)
WHERE r.relation = 'off-label use'
  AND toLower(d.node_name) CONTAINS toLower($disease_name)
RETURN d.node_name AS disease,
       collect(DISTINCT drug.node_name)[0..$limit] AS off_label_drugs
```

#### Use When

- the user asks about off-label disease-drug links

---

### `get_contraindications_for_disease`

Return drugs contraindicated for a disease or condition.

#### Arguments

- `disease_name: string`
- `limit: integer = 20`

#### Cypher

```cypher
MATCH (d:Disease)<-[r:RELATED]-(drug:Drug)
WHERE r.relation = 'contraindication'
  AND toLower(d.node_name) CONTAINS toLower($disease_name)
RETURN d.node_name AS disease,
       collect(DISTINCT drug.node_name)[0..$limit] AS contraindicated_drugs
```

#### Use When

- the user asks what drugs should be avoided in a condition

---

### `get_diseases_for_drug`

Return diseases connected to a drug through indication, contraindication, or off-label use.

#### Arguments

- `drug_name: string`
- `limit: integer = 25`

#### Cypher

```cypher
MATCH (drug:Drug)-[r:RELATED]->(d:Disease)
WHERE r.relation IN ['indication', 'contraindication', 'off-label use']
  AND toLower(drug.node_name) CONTAINS toLower($drug_name)
RETURN drug.node_name AS drug,
       r.relation AS relation,
       collect(DISTINCT d.node_name)[0..$limit] AS diseases
ORDER BY relation
```

#### Use When

- the user asks what a drug is used for
- the user asks what conditions a drug is linked to

---

### `get_targets_for_drug`

Return drug to gene/protein connections.

#### Arguments

- `drug_name: string`
- `limit: integer = 25`

#### Cypher

```cypher
MATCH (drug:Drug)-[r:RELATED]->(g:GeneProtein)
WHERE r.relation = 'drug_protein'
  AND toLower(drug.node_name) CONTAINS toLower($drug_name)
RETURN drug.node_name AS drug,
       collect(DISTINCT {
         protein: g.node_name,
         role: r.display_relation
       })[0..$limit] AS targets
```

#### Use When

- the user asks about mechanisms
- the user asks what a drug targets
- the user asks for biological context around a drug

---

### `get_related_diseases`

Return disease hierarchy or nearby disease links.

#### Arguments

- `disease_name: string`
- `limit: integer = 20`

#### Cypher

```cypher
MATCH (d1:Disease)-[r:RELATED]-(d2:Disease)
WHERE r.relation = 'disease_disease'
  AND toLower(d1.node_name) CONTAINS toLower($disease_name)
RETURN d1.node_name AS disease,
       collect(DISTINCT {
         related_disease: d2.node_name,
         link_type: r.display_relation
       })[0..$limit] AS related_diseases
```

#### Use When

- the user asks for broader or narrower disease context
- the user asks for related disease categories

---

### `get_drug_context`

Return a compact combined context for a drug.

#### Arguments

- `drug_name: string`

#### Cypher

```cypher
MATCH (drug:Drug)
WHERE toLower(drug.node_name) CONTAINS toLower($drug_name)
OPTIONAL MATCH (drug)-[ind:RELATED]->(indDisease:Disease)
WHERE ind.relation = 'indication'
OPTIONAL MATCH (drug)-[con:RELATED]->(conDisease:Disease)
WHERE con.relation = 'contraindication'
OPTIONAL MATCH (drug)-[prot:RELATED]->(g:GeneProtein)
WHERE prot.relation = 'drug_protein'
RETURN drug.node_name AS drug,
       collect(DISTINCT indDisease.node_name)[0..15] AS indications,
       collect(DISTINCT conDisease.node_name)[0..15] AS contraindications,
       collect(DISTINCT {
         protein: g.node_name,
         role: prot.display_relation
       })[0..20] AS targets
LIMIT 1
```

#### Use When

- the user asks for a summary of a drug
- the user asks “tell me about this drug in the graph”

---

### `get_disease_context`

Return a compact combined context for a disease.

#### Arguments

- `disease_name: string`

#### Cypher

```cypher
MATCH (d:Disease)
WHERE toLower(d.node_name) CONTAINS toLower($disease_name)
OPTIONAL MATCH (d)<-[ind:RELATED]-(drug1:Drug)
WHERE ind.relation = 'indication'
OPTIONAL MATCH (d)<-[con:RELATED]-(drug2:Drug)
WHERE con.relation = 'contraindication'
OPTIONAL MATCH (d)-[dd:RELATED]-(other:Disease)
WHERE dd.relation = 'disease_disease'
RETURN d.node_name AS disease,
       collect(DISTINCT drug1.node_name)[0..15] AS indicated_drugs,
       collect(DISTINCT drug2.node_name)[0..15] AS contraindicated_drugs,
       collect(DISTINCT {
         disease: other.node_name,
         link_type: dd.display_relation
       })[0..20] AS related_diseases
LIMIT 1
```

#### Use When

- the user asks for a summary of a disease
- the user asks for a disease-centered graph view

## Agent Routing Guidance

### When to Call `search_entities` First

Use `search_entities` first when:

- the user gives a partial term
- spelling may be ambiguous
- the query could refer to either a drug or disease
- the user describes a fuzzy condition rather than a precise entity

### When to Skip `search_entities`

You can go directly to a retrieval tool when:

- the entity name is explicit and likely canonical
- the user asks a clear drug or disease lookup

### Typical Agent Flows

#### Drug question

User:

- “What does prednisone connect to?”

Agent flow:

1. `get_drug_context("prednisone")`
2. optionally `get_targets_for_drug("prednisone")`

#### Disease treatment question

User:

- “What drugs are associated with asthma?”

Agent flow:

1. `get_drugs_for_disease("asthma")`
2. optionally `get_related_diseases("asthma")`

#### Fuzzy question

User:

- “What medicines relate to airway inflammation?”

Agent flow:

1. `search_entities("airway inflammation")`
2. choose likely disease candidate
3. `get_drugs_for_disease(...)`
4. optionally `get_disease_context(...)`

## Output Expectations

Tool outputs should be treated as graph evidence, not final medical advice.

The agent should summarize:

- matched entity
- relation type used
- top retrieved neighbors
- brief caution that this is knowledge graph context, not direct treatment recommendation

## Important Warnings

Do not use this graph alone for:

- allergy detection
- validated drug-drug interaction warnings
- diagnosis
- dose selection
- current treatment standard verification

If the user appears to be asking for patient-specific safety decisions, the agent should explicitly note that this graph is contextual and not a clinical rule engine.
