# Note Generation System: How It Works

## Quick Verification: Is the Output Strictly Bound to a Zod Schema?

**Yes.** The pipeline enforces a strict object contract at multiple layers:

1. **Runtime Schema Construction** (`schema.ts`): `buildRuntimeSchema()` dynamically assembles a `z.object(shape).strict()` from the template’s `bodySchema.fields`. The `.strict()` modifier rejects any keys not declared in the template.
2. **LLM Prompting with Schema Awareness** (`template-engine.ts`): `buildLlmInstructionForTemplate()` and `buildStrictJsonShapeExample()` explicitly tell the LLM the exact required keys, their types, and whether they are required or optional.
3. **Python Backend JSON Enforcement** (`python/main.py`): The Mistral call uses `response_format: { type: "json_object" }`, and the prompt explicitly instructs the model to return **only** valid JSON with exactly the required keys.
4. **Type Coercion + Fallback Layer** (`template-engine.ts`): Before validation, `buildNormalizedLlmPayload()` coerces each incoming value to the declared field type (string / number / boolean) and applies the field’s `fallbackPolicy` (`empty`, `not_documented`, `omit_if_optional`).
5. **Validation Gate** (`template-engine.ts`): `validateAndNormalizeLlmPayload()` runs `runtimeSchema.safeParse(normalizedPayload)`. If the LLM hallucinates extra keys, returns wrong types, or misses required fields, this gate fails and returns an error to the UI instead of persisting bad data.
6. **Draft Editing Also Guarded** (`note-workflow-actions.ts`): `saveAppointmentTemplateNoteDraft()` re-runs the same validation gate, so manual edits are also schema-bound.

---

## Note Generation Flow (Step-by-Step)

### 1. Template Definition (The Contract)
A doctor creates a template in the **Note Studio**. The template consists of:

- **Body Schema**: A list of fields, each with:
  - `key` (snake_case identifier)
  - `label` (human-readable name)
  - `type`: `string` | `number` | `boolean`
  - `required`: boolean
  - `guidance` / `hint`: optional doctor-facing instructions
  - `fallbackPolicy`: `"empty"` | `"not_documented"` | `"omit_if_optional"`
- **Prompt Directives**: Custom instructions appended to the LLM prompt.
- **Header / Footer**: Text with placeholders like `{{patient_name}}`, `{{doctor_name}}`.
- **Normalization Settings**: Rules like trim text, collapse whitespace, normalize `"N/A"` → `"Not documented"`.
- **Profile Context**: Hospital/doctor metadata for placeholder resolution.

The editor stores this in the database (Prisma). The frontend validates the editor state with `bodySchemaEditorSchema` (Zod) to ensure uniqueness and correct formatting before saving.

---

### 2. Template-to-Runtime Mapping
When a template is fetched for generation, `mapRecordToSoapTemplate()` (in `lib/template-utils.ts`) converts the Prisma record into a typed `SoapTemplate` object:

- Normalizes enums (`NUMBER` → `number`, `BOOLEAN` → `boolean`).
- Normalizes fallback policies (`NOT_DOCUMENTED` → `"not_documented"`).
- Normalizes header text alignment.
- Applies default values for missing normalization settings or profile context fields.

---

### 3. Generation Trigger
`generateAppointmentNoteFromTemplate(appointmentId, templateId)` (in `app/doctor/clinical-session/note-workflow-actions.ts`) performs the following:

1. **Auth & Authorization**: Validates the Clerk user → Prisma user → Doctor profile.
2. **Data Fetching**: Loads the `Appointment` (with transcript segments & patient metadata) and the active `NoteTemplate`.
3. **Transcript Normalization**: `normalizeTranscriptSegments()` cleans raw transcript segments; `buildTranscriptText()` formats them as `[Speaker] text`.
4. **Metadata Assembly**: `buildPatientMetadata()` extracts `patient_name`, `date_of_birth`, `visit_date`, etc.

---

### 4. Payload Construction
The action builds a JSON payload sent to the Python backend (`POST /api/notes/generate-from-template`):

| Payload Field | Source |
|---------------|--------|
| `template` | Full template with fields, `llm_instruction`, `strict_shape_example`, normalization rules, profile context |
| `transcript_text` | Cleaned conversation text |
| `transcript_segments` | Structured segments with speaker/role |
| `metadata` | Appointment reason, patient info, visit date |

---

### 5. LLM Generation (Python Backend)
`generate_note_from_template()` in `python/main.py`:

1. Validates that `fields` and `llm_instruction` exist.
2. Rebuilds transcript text from segments (with role fallback).
3. Constructs a generation prompt containing:
   - The template’s `llm_instruction`
   - The list of required keys
   - The `strict_shape_example`
   - Metadata
   - The full transcript
4. Calls `mistral_chat()` with `model = MISTRAL_MODEL_L` and `response_format = {"type": "json_object"}`.
5. Parses the raw LLM output with `json.loads(strip_json_fences(raw))`.
6. Returns `{ note_data: {...}, generated_at: ... }` to the Next.js app.

---

### 6. Validation & Normalization Gate (The Safety Layer)
Back in Next.js, `validateAndNormalizeLlmPayload(template, note_data)` runs:

1. **Builds Runtime Schema**: `buildRuntimeSchema(template.bodySchema)` → `z.object({...}).strict()`.
2. **Normalizes Payload**: `buildNormalizedLlmPayload()` iterates over every declared field:
   - If missing/empty and optional with `omit_if_optional`, the key is dropped.
   - Otherwise applies `fallbackValueForField()` (e.g., `"Not documented"` or `0`).
   - `coerceValueToFieldType()` casts strings to numbers/booleans if needed.
   - `normalizeStringValue()` applies trim, whitespace collapse, line-break collapse, and `"N/A"` normalization.
3. **Strict Parse**: `runtimeSchema.safeParse(normalizedPayload)`.
   - **Success**: Returns the clean, type-safe `noteData` object.
   - **Failure**: Returns an error (extra keys, wrong types, missing required fields) and the note is **not** saved.

---

### 7. Rendering & Persistence
If validation passes:

1. `renderNotePreviewFromObject(template, noteData, patientMetadata)`:
   - Resolves header/footer placeholders (`{{patient_name}}`, etc.).
   - Builds a patient details block.
   - Maps each field label → value into a human-readable text block.
2. The result is persisted into `appointment.soapNote` as a versioned JSON object:
   ```json
   {
     "version": 2,
     "mode": "template-generated",
     "template": { "id": "...", "name": "..." },
     "generatedAt": "2026-04-24T...",
     "noteMetadata": { ...patient/visit metadata... },
     "noteData": { ...strict validated object... },
     "noteText": "...rendered preview..."
   }
   ```
3. `revalidatePath()` invalidates the clinical session and dashboard pages so the UI reflects the new note immediately.

---

### 8. Draft Editing (Same Guard)
If the doctor edits the generated note in the UI and clicks **Save Draft**:

- `saveAppointmentTemplateNoteDraft()` receives the edited `noteDataDraft`.
- It re-runs `validateAndNormalizeLlmPayload()` against the same template schema.
- Only valid drafts are re-rendered and persisted with `mode: "template-edited"`.

---

## Diagram Description

Draw a **left-to-right pipeline diagram** with the following modules. Use directional arrows to show data flow. Group the frontend/Next.js boxes on the **left**, the Python backend in the **middle**, and the output on the **right**.

### Modules

#### A. Input Layer (Left)
| Module | Contents | Suggested Shape |
|--------|----------|-----------------|
| **Appointment Data** | Transcript segments, patient metadata, appointment reason/date | Cylinder / document icon |
| **Note Template** | `bodySchema` (fields, types, required, fallback), header/footer, prompt directives, normalization settings, profile context | Document with gear icon. Label: **Zod Schema Contract** |

#### B. Frontend Engine (Next.js)
| Module | File | Function |
|--------|------|----------|
| **Workflow Orchestrator** | `note-workflow-actions.ts` | Fetches appointment + template, builds payload, calls backend, receives raw `note_data` |
| **Template Engine** | `template-engine.ts` | **Instruction Builder**: creates `llm_instruction` + `strict_shape_example`<br>**Placeholder Resolver**: maps `{{patient_name}}`, etc. to real values<br>**Normalizer**: coerces types, applies fallback policies, cleans strings |
| **Schema Builder** | `schema.ts` | `buildRuntimeSchema()` constructs `z.object().strict()` dynamically. Draw a **shield** icon — this is the contract enforcer. |

#### C. Backend Layer (Middle)
| Module | File | Function |
|--------|------|----------|
| **Python LLM Backend** | `python/main.py` | **Prompt Assembler**: combines template instruction + shape hint + transcript + metadata<br>**Mistral LLM**: external model box. Label: `response_format: json_object` |

#### D. Validation Gate (Between Backend and Output)
| Module | File | Function |
|--------|------|----------|
| **Strict Validation Gate** | `validateAndNormalizeLlmPayload()` | Draw as a **diamond decision shape**.<br>• **Yes/Pass** → arrow to Rendered Note Preview labeled `safeParse.success`<br>• **No/Fail** → arrow to error box labeled `Schema Mismatch Error` |

#### E. Output Layer (Right)
| Module | Function |
|--------|----------|
| **Rendered Note Preview** | `renderNotePreviewFromObject()` — resolves placeholders, formats labels/values into readable text |
| **Database** | `appointment.soapNote` JSON blob (Prisma) |
| **PDF / Dashboard** | Final note view and downloadable PDF |

---

### Arrow Flow (One Sentence per Arrow)

```
[Appointment Data] + [Note Template]
         ↓
[Workflow Orchestrator builds payload]
         ↓
[Python Prompt Assembler]
         ↓
[Mistral LLM returns JSON]
         ↓
[Template Engine Normalizer coerces & cleans values]
         ↓
[Schema Builder runs Zod strict validation]
         ↓
      [Pass?]
    Yes /   \ No
     ↓       ↓
[Rendered   [Schema Mismatch
 Note        Error → UI]
 Preview]
     ↓
[Save to DB]
     ↓
[Display to Doctor / PDF]
```

### Color Coding Suggestion
- **Blue**: Data / Input boxes (Appointment, Template)
- **Green**: Processing / Engine boxes (Orchestrator, Template Engine, Python Backend)
- **Red / Yellow**: Validation Gate diamond
- **Purple**: Output boxes (Preview, DB, PDF)

---

## Summary

The note generation system is a **schema-first pipeline**:

1. The doctor defines a **strict Zod contract** (the template).
2. The system **feeds that contract** to the LLM via prompts and shape examples.
3. The LLM returns JSON.
4. The system **normalizes, coerces, and strictly validates** that JSON against the runtime Zod schema.
5. Only after passing the gate is the note **rendered, persisted, and displayed**.

This guarantees that every generated note — whether AI-generated or doctor-edited — conforms exactly to the template’s declared structure.
