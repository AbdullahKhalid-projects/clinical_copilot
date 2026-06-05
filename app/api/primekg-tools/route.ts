import { NextResponse } from "next/server";
import {
  executePrimeKgDiseasesForDrugTool,
  executePrimeKgDrugsForDiseaseTool,
  executePrimeKgDiseaseContextTool,
  executePrimeKgDrugContextTool,
  executePrimeKgEntitySearchTool,
  executePrimeKgRelatedDiseasesTool,
  executePrimeKgTargetsForDrugTool,
} from "@/lib/primekg/tools";

export const runtime = "nodejs";

type PrimeKgToolRequest =
  | {
      toolName: "search_primekg_entities";
      input: {
        query: string;
        entityType?: "any" | "drug" | "disease" | "gene/protein";
      };
    }
  | {
      toolName: "get_primekg_drugs_for_disease";
      input: {
        diseaseName: string;
      };
    }
  | {
      toolName: "get_primekg_diseases_for_drug";
      input: {
        drugName: string;
      };
    }
  | {
      toolName: "get_primekg_targets_for_drug";
      input: {
        drugName: string;
      };
    }
  | {
      toolName: "get_primekg_related_diseases";
      input: {
        diseaseName: string;
      };
    }
  | {
      toolName: "get_primekg_drug_context";
      input: {
        drugName: string;
      };
    }
  | {
      toolName: "get_primekg_disease_context";
      input: {
        diseaseName: string;
      };
    };

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | PrimeKgToolRequest
    | null;

  if (!body || typeof body !== "object" || !("toolName" in body)) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Invalid request body. Expected { toolName, input } for a PrimeKG tool.",
      },
      { status: 400 },
    );
  }

  switch (body.toolName) {
    case "search_primekg_entities": {
      const result = await executePrimeKgEntitySearchTool({
        query: body.input?.query ?? "",
        entityType: body.input?.entityType ?? "any",
      });
      return NextResponse.json(result, {
        status: result.ok ? 200 : 400,
      });
    }

    case "get_primekg_drugs_for_disease": {
      const result = await executePrimeKgDrugsForDiseaseTool({
        diseaseName: body.input?.diseaseName ?? "",
      });
      return NextResponse.json(result, {
        status: result.ok ? 200 : 400,
      });
    }

    case "get_primekg_diseases_for_drug": {
      const result = await executePrimeKgDiseasesForDrugTool({
        drugName: body.input?.drugName ?? "",
      });
      return NextResponse.json(result, {
        status: result.ok ? 200 : 400,
      });
    }

    case "get_primekg_targets_for_drug": {
      const result = await executePrimeKgTargetsForDrugTool({
        drugName: body.input?.drugName ?? "",
      });
      return NextResponse.json(result, {
        status: result.ok ? 200 : 400,
      });
    }

    case "get_primekg_related_diseases": {
      const result = await executePrimeKgRelatedDiseasesTool({
        diseaseName: body.input?.diseaseName ?? "",
      });
      return NextResponse.json(result, {
        status: result.ok ? 200 : 400,
      });
    }

    case "get_primekg_drug_context": {
      const result = await executePrimeKgDrugContextTool({
        drugName: body.input?.drugName ?? "",
      });
      return NextResponse.json(result, {
        status: result.ok ? 200 : 400,
      });
    }

    case "get_primekg_disease_context": {
      const result = await executePrimeKgDiseaseContextTool({
        diseaseName: body.input?.diseaseName ?? "",
      });
      return NextResponse.json(result, {
        status: result.ok ? 200 : 400,
      });
    }

    default:
      return NextResponse.json(
        {
          ok: false,
          error:
            "Unsupported PrimeKG toolName.",
        },
        { status: 400 },
      );
  }
}
