# Note Generation: Evaluation Methods & Metrics

## Why Evaluate?

Your pipeline already guarantees **structural correctness** via Zod schema enforcement. But a note can be perfectly structured yet clinically wrong. Evaluation ensures the LLM-generated content is **faithful to the transcript**, **clinically complete**, and **safe**.

---

## 1. Evaluation Dimensions

Evaluate across four independent dimensions. Do not rely on a single score.

| Dimension | Question | Failure Mode |
|-----------|----------|--------------|
| **Schema Compliance** | Does the output match the template's Zod schema? | Extra keys, wrong types, missing required fields |
| **Transcript Fidelity** | Is every claim in the note supported by the transcript? | Hallucination (invented symptoms, medications, vitals) |
| **Completeness** | Did the note capture all clinically relevant information from the transcript? | Omission (missed allergies, skipped complaints) |
| **Clinical Utility** | Is the note formatted and phrased for effective clinical use? | Ambiguous phrasing, redundant text, poor structure |

---

## 2. Automated Evaluation Pipeline

Run these checks automatically after every generation (or in a background audit job).

### 2.1 Schema Compliance (Already Implemented)

**What**: `validateAndNormalizeLlmPayload()` in `template-engine.ts`  
**Metric**: `schema_pass_rate` = percentage of generations passing `safeParse`  
**Target**: `> 99%` (failures should be extremely rare; if not, fix the prompt or model)

**Log these**: failure reason (`extra_keys`, `type_mismatch`, `missing_required`, `parse_error`)

---

### 2.2 Transcript Fidelity (Hallucination Detection)

**Goal**: Ensure no information exists in the note that was not in the transcript.

#### Method A: LLM-as-Judge (Recommended for v1)

Send the transcript and the generated note to a separate LLM prompt:

```text
You are a clinical auditor. Given a TRANSCRIPT and a GENERATED NOTE, identify any
claims, facts, or data points in the NOTE that are NOT present in the TRANSCRIPT.

For each unsupported claim, return:
- field_key: which note field contains it
- claim: the unsupported text
- severity: "critical" (medication, diagnosis, vital) | "warning" (demographics, history) | "minor" (formatting inference)

Return JSON: { "unsupported_claims": [...], "fidelity_score": 0.0-1.0 }
```

**Metric**: `fidelity_score` — 1.0 means every claim is traceable to the transcript.  
**Target**: `> 0.95`  
**Action on failure**: Flag note for doctor review before saving.

#### Method B: Entity Extraction + Coverage (More robust)

1. Extract clinical entities from transcript using an NER model or LLM:
   - Medications, symptoms, diagnoses, vitals, allergies, procedures
2. Extract entities from the generated note.
3. Compare: note entities should be a **subset** of transcript entities.

**Metric**: `entity_precision` = `|note_entities ∩ transcript_entities| / |note_entities|`  
**Target**: `> 0.98`

---

### 2.3 Completeness (Omission Detection)

**Goal**: Ensure clinically important information from the transcript was not dropped.

#### Method: Field-Level Coverage Scoring

For each field in the template, evaluate whether the transcript contained relevant information that should have been captured.

Use an LLM judge prompt:

```text
Given a TRANSCRIPT and a TEMPLATE FIELD (key, label, type, guidance),
determine if the transcript contains information relevant to this field.

If YES, check if the NOTE field value accurately captures it.
Return:
{
  "field_key": "...",
  "transcript_has_info": true|false,
  "note_captured_it": true|false,
  "completeness_score": 0.0-1.0
}
```

**Metric**: `completeness_score` per generation, averaged across all fields where `transcript_has_info == true`.  
**Target**: `> 0.90`  
**Action on failure**: Surface "Possible missing information" warning in the UI.

**Aggregate metric**: `omission_rate` = percentage of notes with at least one missed critical field.

---

### 2.4 Clinical Utility (Readability & Structure)

**Goal**: The note should be concise, unambiguous, and clinically actionable.

#### Automated Heuristics

| Metric | How to Compute | Target |
|--------|---------------|--------|
| `avg_field_length` | Average character count per field | Context-dependent; flag outliers |
| `empty_field_rate` | `%` of fields with `""`, `"Not documented"`, or `"N/A"` after generation | `< 30%` for required fields |
| `redundancy_score` | `%` of note text duplicated across fields | `< 10%` |
| `readability_score` | Flesch-Kincaid or simple sentence-length heuristic | Keep low (clinical notes should be concise) |

#### LLM-as-Judge for Quality

```text
Rate the clinical note on:
1. Conciseness (1-5)
2. Clarity (1-5)
3. Actionability (1-5)
4. Professional tone (1-5)

Return average as "utility_score".
```

**Target**: `utility_score > 3.5`

---

## 3. Human-in-the-Loop Metrics (Ground Truth)

Automated metrics are proxies. The ground truth is what doctors actually do with the note.

### 3.1 Edit Distance & Time-to-Edit

Track how much doctors change the generated note before finalizing.

| Metric | Definition | Interpretation |
|--------|-----------|----------------|
| `edit_distance` | Levenshtein or token-level diff between generated and saved draft | High = poor generation quality |
| `fields_edited` | Count of template fields modified by the doctor | High = specific fields are unreliable |
| `time_to_edit_sec` | Time from generation opening to draft save | High = doctor is struggling with the note |
| `regeneration_rate` | `%` of times doctor clicks "Regenerate" | High = first draft is unacceptable |

**How to implement**: Store both `generatedNoteData` and `savedNoteData` in the database. Compute diffs in a background job.

---

### 3.2 Doctor Approval Rating

Add a simple thumbs-up / thumbs-down after note finalization.

**Metric**: `doctor_satisfaction_rate` = `thumbs_up / (thumbs_up + thumbs_down)`  
**Target**: `> 0.85`

Optional: Ask for a 1-sentence reason on thumbs-down. Categorize into:
- Hallucination
- Omission
- Poor formatting
- Wrong tone

---

### 3.3 Rejection Rate

**Metric**: `rejection_rate` = `%` of generated notes discarded without saving  
**Target**: `< 5%`

---

## 4. Evaluation Framework: Implementation Tiers

Do not build everything at once. Implement in tiers.

### Tier 1: Baseline (Week 1)

These are cheap and give immediate signal.

| Check | Implementation | Where |
|-------|---------------|-------|
| Schema pass rate | Already exists | `validateAndNormalizeLlmPayload()` |
| Empty field rate | Count `""` / `"Not documented"` in normalized payload | After normalization |
| Edit distance | Store `generatedData` vs `savedData`, compute JSON diff | Background cron job |
| Doctor rating | Add UI feedback component | Note viewer |

### Tier 2: Automated Auditing (Week 2-3)

| Check | Implementation | Where |
|-------|---------------|-------|
| Fidelity scoring | LLM-as-judge prompt (Method A) | Python backend or Next.js API route |
| Completeness scoring | Per-field LLM judge (Method A) | Same as above |
| Regeneration rate | Analytics event on "Regenerate" click | Frontend tracking |

### Tier 3: Advanced (Month 2+)

| Check | Implementation | Where |
|-------|---------------|-------|
| Entity-level precision/recall | NER model or structured LLM extraction | Python pipeline |
| A/B test prompts | Serve two `llm_instruction` variants, compare metrics | Feature flag system |
| Golden dataset benchmark | Curate 50 transcripts with expert-written notes, score generations automatically | Offline evaluation script |

---

## 5. Golden Dataset Benchmark (Recommended)

The most reliable way to measure progress over time is a **fixed benchmark dataset**.

### How to Build It

1. **Collect 50-100 transcripts** representing diverse visit types (follow-up, initial consultation, emergency).
2. **Have an expert clinician write the "gold standard" note** for each transcript using your template structure.
3. **Store as JSON**: `{ transcript, template_id, gold_note_data, gold_note_text }`.

### How to Evaluate Against It

Run your full pipeline on each transcript and compute:

| Metric | Formula |
|--------|---------|
| `field_accuracy` | `%` of fields exactly matching gold (after normalization) |
| `semantic_similarity` | Embedding cosine similarity between generated and gold note text |
| `entity_recall` | `%` of gold clinical entities present in generation |
| `entity_precision` | `%` of generation clinical entities present in gold |

**Run this benchmark**:
- After every prompt change
- After every model upgrade
- Before deploying to production

---

## 6. Metrics Dashboard (What to Track)

Build a simple internal dashboard or log to your analytics tool:

| Metric | Source | Alert Threshold |
|--------|--------|-----------------|
| `schema_pass_rate` | `validateAndNormalizeLlmPayload` result | `< 99%` → PagerDuty/Slack alert |
| `fidelity_score` | LLM judge | `< 0.90` → Flag for review |
| `completeness_score` | LLM judge | `< 0.85` → Flag for review |
| `avg_edit_distance` | `generatedData` vs `savedData` diff | Spike > 2x weekly average |
| `regeneration_rate` | Frontend event | `> 10%` → investigate prompt |
| `doctor_satisfaction_rate` | UI thumbs up/down | `< 80%` → review session |
| `note_generation_latency_p99` | Backend timer | `> 30s` → performance alert |

---

## 7. Safety & Hallucination Guardrails

Beyond metrics, implement hard guardrails:

### 7.1 Pre-Generation

- **Anti-hallucination prompt directives**: Your existing prompt already includes "Only use information explicitly present in transcript/context." Good — keep it.
- **Transcript context window**: Ensure the full transcript fits in the LLM context. If too long, use semantic chunking with overlap.

### 7.2 Post-Generation

- **Fidelity gate**: If `fidelity_score < 0.90`, do NOT auto-save. Show the note in "Review Required" mode.
- **Critical field audit**: If fields like `medications`, `diagnoses`, or `allergies` contain values, run a second-pass check that they appear in the transcript.

### 7.3 Doctor Override

- Always allow the doctor to edit. Never lock the note.
- Log every edit to improve the model/prompt over time.

---

## 8. Summary: How to Ensure the Correct Note Is Being Made

| Layer | Method | Owner |
|-------|--------|-------|
| **Structure** | Zod `strict()` schema validation | System (already done) |
| **Faithfulness** | LLM-as-judge fidelity scoring | Automated post-generation |
| **Completeness** | Per-field coverage scoring | Automated post-generation |
| **Quality** | Heuristics + doctor rating | Automated + Human |
| **Ground Truth** | Golden dataset benchmark | Offline evaluation |
| **Continuous** | Edit distance, regeneration rate, rejection rate | Product analytics |

### Recommended First Steps

1. **This week**: Start logging `generatedData` vs `savedData` to compute edit distance and identify which fields doctors change most.
2. **Next week**: Implement the LLM-as-judge fidelity prompt in your Python backend as a `/api/notes/audit` endpoint.
3. **Next week**: Add a thumbs-up/thumbs-down widget to the note viewer.
4. **This month**: Curate a golden dataset of 20-30 transcripts with expert notes. Run your pipeline against it weekly.

The key insight: **You cannot rely on schema validation alone**. A structurally perfect note that hallucinates a medication is dangerous. Combine automated fidelity checks, human feedback, and a fixed benchmark to build confidence in your pipeline.
