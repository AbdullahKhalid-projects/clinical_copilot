# Clinical Copilot Jury Demo Query Guide

This guide is structured for a live demo in front of a jury.

Use it to show the strongest parts of the project in the right order:

1. clinical workflow automation
2. patient-aware retrieval
3. medication safety reasoning
4. knowledge-graph exploration with PrimeKG

---

## Demo Goal

The strongest story for the jury is:

- Shifa listens to or ingests a clinical session
- turns the session into a transcript
- generates a structured clinical note
- helps with patient-specific safety decisions
- can also switch into general biomedical graph knowledge when needed

---

## Best Demo Order

### 1. Session Intake and Transcription

Show first because it proves this is more than a chatbot.

**Feature / Tool**

- Audio upload or live session transcription
- Transcript confirmation flow

**What it proves**

- Real clinical workflow support
- Raw audio can become usable medical text
- The system is designed around the appointment, not just generic Q&A

**Best narration**

- "We start with the real consultation artifact: the audio."
- "Shifa converts that into structured transcript data that the rest of the workflow can use."

---

### 2. Note Generation

Show second because it converts the transcript into a practical output.

**Feature / Tool**

- Template note generation
- Note Studio / structured note rendering

**What it proves**

- The project reduces documentation burden
- Output is clinically useful, not just conversational
- Workflow moves from conversation to artifact generation

**Best narration**

- "After transcription, the same session data is turned into a structured clinical note."
- "This is where automation becomes time-saving for a doctor."

---

### 3. Patient-Aware Shifa Chat

Show third because it demonstrates contextual retrieval over this patient’s chart.

**Feature / Tool**

- `structuredRetrieval`
- `structuredLatestMetric`
- `getLatestReports`
- `retrieveLastSession`
- `getLastSoapNote`

**What it proves**

- Shifa can answer with chart context
- The assistant is grounded in patient-specific data
- It can pull labs, past sessions, reports, and notes instead of hallucinating

**PrimeKG setting**

- Keep PrimeKG off

---

### 4. Medication Safety Review

Show fourth because it is one of the highest-value clinical moments.

**Feature / Tool**

- `verify_prescription_safety`
- `suggest_safe_alternatives`
- medication review flow from staged prescriptions

**What it proves**

- The system is useful at the point of prescribing
- It can surface allergy, contraindication, and interaction concerns
- It can suggest safer directions, not just flag problems

**PrimeKG setting**

- Keep PrimeKG off

---

### 5. PrimeKG Knowledge Graph Mode

Show last because it is impressive, but it should be framed as a different mode from patient safety.

**Feature / Tool**

- `search_primekg_entities`
- `get_primekg_drug_context`
- `get_primekg_disease_context`
- `get_primekg_drugs_for_disease`
- `get_primekg_diseases_for_drug`
- `get_primekg_targets_for_drug`
- `get_primekg_related_diseases`

**What it proves**

- Shifa is not limited to local chart memory
- The system can explore biomedical graph relationships
- It supports broader clinical education and reasoning support

**PrimeKG setting**

- Turn PrimeKG on
- You can also use `#primekg` in the prompt

---

## High-Priority Queries to Show

These are the strongest live prompts for a jury.

### A. Patient-Specific Clinical Summary

**Priority**

- Highest

**Why show it**

- Fastest way to prove chart grounding

**Best prompt**

```text
Give me a concise clinical summary of this patient based on the current chart, including major conditions, recent concerns, medications, and anything I should keep in mind before continuing the visit.
```

**Expected value**

- Pulls patient-aware context
- Shows that Shifa can summarize the chart into an actionable overview

---

### B. Latest Labs or Reports

**Priority**

- Highest

**Why show it**

- Demonstrates evidence-based retrieval from stored patient records

**Best prompts**

```text
What are the latest important lab findings for this patient?
```

```text
Summarize the most recent report for this patient and tell me what stands out.
```

```text
What is the latest value for HbA1c, and what trend should I notice?
```

**Expected value**

- Shows metrics, reports, and structured retrieval

---

### C. Previous Session Memory

**Priority**

- High

**Why show it**

- Jurors will immediately understand continuity of care

**Best prompts**

```text
What happened in the patient’s last session, and what follow-up items should I keep in mind today?
```

```text
Pull the last SOAP note and summarize the prior assessment and plan.
```

**Expected value**

- Shows retrieval of past transcript and SOAP note

---

### D. Medication Safety

**Priority**

- Highest

**Why show it**

- This is one of the clearest clinical-value moments in the project

**Best prompts**

```text
Is this medication safe for this patient given their conditions, allergies, and current medications?
```

```text
Check whether prescribing warfarin is appropriate for this patient and explain any risks.
```

```text
Suggest safer alternatives if this prescription is risky for this patient.
```

**Expected value**

- Shows patient-specific reasoning, not generic drug facts

---

### E. General Drug Knowledge with PrimeKG

**Priority**

- High

**Why show it**

- Strong technical differentiator

**Best prompts**

```text
#primekg What is metformin used for, and what diseases is it linked to?
```

```text
#primekg What does prednisone target?
```

```text
#primekg What drugs are indicated for asthma?
```

```text
#primekg What diseases are related to psoriasis?
```

**Expected value**

- Shows graph retrieval, targets, disease links, and knowledge exploration

---

## Good Backup Queries

Use these if the main demo needs variety or recovery.

### Patient-Aware Backup

```text
What are the top clinical concerns for this patient today?
```

```text
What medications is this patient currently on, and what should I watch closely?
```

```text
Summarize the chart for me in plain language before I talk to the patient.
```

### PrimeKG Backup

```text
#primekg Search for amoxicillin and tell me what kind of entity it is.
```

```text
#primekg What diseases is warfarin contraindicated in?
```

```text
#primekg Show me related diseases connected to heart failure.
```

---

## Suggested Jury Demo Script

Use this exact flow if you want a smooth 5 to 8 minute demo.

### Demo Flow

1. Upload or open a clinical session recording.
2. Show that transcription is generated.
3. Generate a note from the transcript.
4. Ask for a patient clinical summary.
5. Ask for latest labs or latest report findings.
6. Run a medication safety check.
7. Turn PrimeKG on.
8. Ask one graph-style biomedical question.

### Best single-line narration

- "This starts from real clinical audio, turns it into transcript and notes, then supports both patient-specific safety decisions and general biomedical graph reasoning."

---

## What to Emphasize to the Jury

- This is a workflow system, not just a chat interface.
- The patient-aware mode is grounded in chart data, reports, transcripts, and prior notes.
- The prescribing flow is clinically meaningful because it checks safety in context.
- PrimeKG mode is deliberately separate from patient-specific safety, which shows good system design discipline.

---

## What to Avoid in the Demo

Avoid these because they undersell the project:

- generic prompts like `hello`, `what can you do`, or `tell me about medicine`
- overly broad questions with no patient or disease anchor
- mixing patient-specific safety with PrimeKG mode in the same explanation
- relying only on the chat panel without showing transcription or note generation

---

## One Excellent End-to-End Demo Set

If you want one compact set of prompts, use these:

### Step 1

```text
Give me a concise clinical summary of this patient based on the current chart, including conditions, medications, and today’s main concerns.
```

### Step 2

```text
What are the latest important labs or report findings I should review before making a treatment decision?
```

### Step 3

```text
Check whether this medication is safe for this patient and suggest safer alternatives if there are any risks.
```

### Step 4

```text
#primekg What does metformin target, and what diseases is it most strongly linked to?
```

---

## File Purpose

This document is optimized for:

- FYP jury demo
- sponsor walkthrough
- professor evaluation
- short live product pitch
