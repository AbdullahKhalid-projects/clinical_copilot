"use client";

import { useState } from "react";
import { Search, Loader2, AlertTriangle, CheckCircle, Clock, Database, FileText, User, Settings, ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

interface SemanticRetrievalResult {
  ok: boolean;
  query: string;
  patient: {
    resolvedPatientUserId: string | null;
    resolvedPatientProfileId: string | null;
    patientName: string | null;
  };
  warnings: string[];
  request: {
    topK: number;
    resultLimit: number;
    typeFilter: string;
    includePatientDocuments: boolean;
    skipDbValidation: boolean;
    maxChunks: number;
    maxChunkChars: number;
    maxTotalChars: number;
  };
  environment: {
    pineconeIndexNameSet: boolean;
    pineconeIndexHostSet: boolean;
    pineconeNamespace: string | null;
    voyageApiKeySet: boolean;
  };
  semanticRetrieval: {
    totalMatches: number;
    latencyMs: number;
    results: Array<{
      rank: number;
      parentChunkId: string;
      documentId: string;
      documentTitle: string;
      score: number;
      parentTextPreview: string;
      parentTextLength: number;
    }>;
  };
  mergedContext: {
    totalChunks: number;
    mergeLatencyMs: number;
    chunks: Array<{
      chunkId: string;
      kind: string;
      title: string;
      score: number;
      textPreview: string;
      textLength: number;
    }>;
    citations: Array<{
      chunkId: string;
      kind: string;
      title: string;
      score: number;
    }>;
    contextBlockForLLM: string;
  };
  latencyMs: {
    retrieval: number;
    merge: number;
    total: number;
  };
}

export function SemanticRetrievalTestClient() {
  const [query, setQuery] = useState("What are the side effects of metformin?");
  const [patientUserId, setPatientUserId] = useState("");
  const [patientProfileId, setPatientProfileId] = useState("");
  const [appointmentId, setAppointmentId] = useState("");
  const [topK, setTopK] = useState(50);
  const [resultLimit, setResultLimit] = useState(10);
  const [typeFilter, setTypeFilter] = useState("all");
  const [includePatientDocuments, setIncludePatientDocuments] = useState(true);
  const [maxChunks, setMaxChunks] = useState(8);
  const [maxChunkChars, setMaxChunkChars] = useState(14000);
  const [maxTotalChars, setMaxTotalChars] = useState(28000);
  const [skipDbValidation, setSkipDbValidation] = useState(false);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SemanticRetrievalResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showLLMContext, setShowLLMContext] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  async function runTest() {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const params = new URLSearchParams();
      params.set("query", query);
      if (patientUserId.trim()) params.set("patientUserId", patientUserId.trim());
      if (patientProfileId.trim()) params.set("patientProfileId", patientProfileId.trim());
      if (appointmentId.trim()) params.set("appointmentId", appointmentId.trim());
      params.set("topK", String(topK));
      params.set("resultLimit", String(resultLimit));
      params.set("typeFilter", typeFilter);
      params.set("includePatientDocuments", String(includePatientDocuments));
      params.set("skipDbValidation", String(skipDbValidation));
      params.set("maxChunks", String(maxChunks));
      params.set("maxChunkChars", String(maxChunkChars));
      params.set("maxTotalChars", String(maxTotalChars));

      const res = await fetch(`/api/semantic-retrieval-test?${params.toString()}`);
      const data = await res.json();

      if (!res.ok || !data.ok) {
        setError(data.error || `HTTP ${res.status}`);
        return;
      }

      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#FAF9F6] p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#2D2422]">Semantic Retrieval Test</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Test the isolated semantic RAG pipeline — no LLM generation, just retrieval.
            </p>
          </div>
          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
            Debug Tool
          </Badge>
        </div>

        {/* Query Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Search className="h-4 w-4" />
              Query & Patient Scope
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="query">Query</Label>
              <Textarea
                id="query"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Enter your clinical query..."
                rows={2}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="patientUserId">Patient User ID</Label>
                <Input
                  id="patientUserId"
                  value={patientUserId}
                  onChange={(e) => setPatientUserId(e.target.value)}
                  placeholder="Optional"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="patientProfileId">Patient Profile ID</Label>
                <Input
                  id="patientProfileId"
                  value={patientProfileId}
                  onChange={(e) => setPatientProfileId(e.target.value)}
                  placeholder="Optional"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="appointmentId">Appointment ID</Label>
                <Input
                  id="appointmentId"
                  value={appointmentId}
                  onChange={(e) => setAppointmentId(e.target.value)}
                  placeholder="Optional"
                />
              </div>
            </div>

            <div className="flex items-center gap-4">
              <Button
                onClick={runTest}
                disabled={loading || !query.trim()}
                className="bg-[#2D2422] hover:bg-[#2D2422]/90"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Retrieving...
                  </>
                ) : (
                  <>
                    <Search className="mr-2 h-4 w-4" />
                    Run Retrieval
                  </>
                )}
              </Button>

              <Button
                variant="outline"
                onClick={() => setShowSettings(!showSettings)}
                className="gap-2"
              >
                <Settings className="h-4 w-4" />
                Settings
                {showSettings ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Settings Panel */}
        {showSettings && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Settings className="h-4 w-4" />
                Retrieval Settings
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="topK">Top K (vector search)</Label>
                  <Input
                    id="topK"
                    type="number"
                    min={1}
                    max={200}
                    value={topK}
                    onChange={(e) => setTopK(Number(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="resultLimit">Result Limit (display)</Label>
                  <Input
                    id="resultLimit"
                    type="number"
                    min={1}
                    max={50}
                    value={resultLimit}
                    onChange={(e) => setResultLimit(Number(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="typeFilter">Type Filter</Label>
                  <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger id="typeFilter">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="medicine">Medicine</SelectItem>
                      <SelectItem value="disease">Disease</SelectItem>
                      <SelectItem value="patient">Patient</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maxChunks">Max Chunks</Label>
                  <Input
                    id="maxChunks"
                    type="number"
                    min={1}
                    max={20}
                    value={maxChunks}
                    onChange={(e) => setMaxChunks(Number(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maxChunkChars">Max Chunk Chars</Label>
                  <Input
                    id="maxChunkChars"
                    type="number"
                    min={100}
                    max={50000}
                    value={maxChunkChars}
                    onChange={(e) => setMaxChunkChars(Number(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maxTotalChars">Max Total Chars</Label>
                  <Input
                    id="maxTotalChars"
                    type="number"
                    min={500}
                    max={100000}
                    value={maxTotalChars}
                    onChange={(e) => setMaxTotalChars(Number(e.target.value))}
                  />
                </div>
                <div className="flex items-center gap-3 pt-6">
                  <Switch
                    id="includePatientDocuments"
                    checked={includePatientDocuments}
                    onCheckedChange={setIncludePatientDocuments}
                  />
                  <Label htmlFor="includePatientDocuments" className="cursor-pointer">
                    Include Patient Documents
                  </Label>
                </div>
                <div className="flex items-center gap-3 pt-6">
                  <Switch
                    id="skipDbValidation"
                    checked={skipDbValidation}
                    onCheckedChange={setSkipDbValidation}
                  />
                  <Label htmlFor="skipDbValidation" className="cursor-pointer">
                    Skip DB Validation
                  </Label>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Error */}
        {error && (
          <Card className="border-red-200 bg-red-50/40">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5" />
                <div>
                  <p className="font-medium text-red-800">Retrieval failed</p>
                  <p className="text-sm text-red-700 mt-1">{error}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Results */}
        {result && (
          <div className="space-y-6">
            {/* Summary */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="rounded-lg bg-muted p-3">
                    <p className="text-xs text-muted-foreground">Query</p>
                    <p className="text-sm font-medium truncate">{result.query}</p>
                  </div>
                  <div className="rounded-lg bg-muted p-3">
                    <p className="text-xs text-muted-foreground">Semantic Matches</p>
                    <p className="text-sm font-medium">{result.semanticRetrieval.totalMatches}</p>
                  </div>
                  <div className="rounded-lg bg-muted p-3">
                    <p className="text-xs text-muted-foreground">Merged Chunks</p>
                    <p className="text-sm font-medium">{result.mergedContext.totalChunks}</p>
                  </div>
                  <div className="rounded-lg bg-muted p-3">
                    <p className="text-xs text-muted-foreground">Total Latency</p>
                    <p className="text-sm font-medium">{result.latencyMs.total}ms</p>
                  </div>
                </div>

                {/* Patient Info */}
                {result.patient.resolvedPatientUserId && (
                  <div className="mt-4 rounded-lg bg-blue-50 p-3 border border-blue-100">
                    <div className="flex items-center gap-2 text-blue-800 text-sm">
                      <User className="h-4 w-4" />
                      <span className="font-medium">
                        Patient: {result.patient.patientName || "Unknown"}
                      </span>
                      <Badge variant="secondary" className="text-xs">
                        {result.patient.resolvedPatientUserId}
                      </Badge>
                    </div>
                  </div>
                )}

                {/* Warnings */}
                {result.warnings.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {result.warnings.map((warning, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 border border-amber-100 text-sm text-amber-800"
                      >
                        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                        <span>{warning}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Environment Status */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Database className="h-4 w-4" />
                  Environment Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  <StatusBadge
                    ok={result.environment.pineconeIndexNameSet}
                    label="Pinecone Index"
                  />
                  <StatusBadge
                    ok={result.environment.pineconeIndexHostSet}
                    label="Pinecone Host"
                  />
                  <StatusBadge
                    ok={Boolean(result.environment.pineconeNamespace)}
                    label="Pinecone Namespace"
                    detail={result.environment.pineconeNamespace || undefined}
                  />
                  <StatusBadge
                    ok={result.environment.voyageApiKeySet}
                    label="Voyage API Key"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Latency */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Latency Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4">
                  <div className="rounded-lg bg-muted p-3 text-center">
                    <p className="text-2xl font-bold">{result.latencyMs.retrieval}ms</p>
                    <p className="text-xs text-muted-foreground">Vector Search + Rerank</p>
                  </div>
                  <div className="rounded-lg bg-muted p-3 text-center">
                    <p className="text-2xl font-bold">{result.latencyMs.merge}ms</p>
                    <p className="text-xs text-muted-foreground">Merge & Budget</p>
                  </div>
                  <div className="rounded-lg bg-muted p-3 text-center">
                    <p className="text-2xl font-bold">{result.latencyMs.total}ms</p>
                    <p className="text-xs text-muted-foreground">Total</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Semantic Results */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Semantic Retrieval Results
                  <Badge variant="secondary">{result.semanticRetrieval.results.length} shown</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {result.semanticRetrieval.results.map((item) => (
                  <div
                    key={item.rank}
                    className="rounded-lg border p-4 space-y-2 hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#2D2422] text-xs text-white font-medium">
                          {item.rank}
                        </span>
                        <span className="font-medium text-sm">{item.documentTitle}</span>
                      </div>
                      <Badge variant="outline" className="font-mono">
                        score: {item.score}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground space-y-1">
                      <p>parentChunkId: <code className="bg-muted px-1 rounded">{item.parentChunkId}</code></p>
                      <p>documentId: <code className="bg-muted px-1 rounded">{item.documentId}</code></p>
                      <p>length: {item.parentTextLength} chars</p>
                    </div>
                    <div className="text-sm text-[#2D2422] leading-relaxed bg-white rounded p-3 border">
                      {item.parentTextPreview}
                      {item.parentTextLength > item.parentTextPreview.length && (
                        <span className="text-muted-foreground italic"> ... (truncated)</span>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Merged Context */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Merged Context (What goes to LLM)
                  <Badge variant="secondary">{result.mergedContext.chunks.length} chunks</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {result.mergedContext.chunks.map((chunk) => (
                  <div
                    key={chunk.chunkId}
                    className="rounded-lg border p-4 space-y-2 hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <code className="bg-[#2D2422] text-white text-xs px-2 py-0.5 rounded">
                          {chunk.chunkId}
                        </code>
                        <span className="text-sm font-medium">{chunk.title}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {chunk.kind}
                        </Badge>
                        <Badge variant="outline" className="font-mono text-xs">
                          {chunk.score}
                        </Badge>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      length: {chunk.textLength} chars
                    </div>
                    <div className="text-sm text-[#2D2422] leading-relaxed bg-white rounded p-3 border">
                      {chunk.textPreview}
                      {chunk.textLength > chunk.textPreview.length && (
                        <span className="text-muted-foreground italic"> ... (truncated)</span>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* LLM Context Block */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Full Context Block for LLM
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowLLMContext(!showLLMContext)}
                  className="mb-3"
                >
                  {showLLMContext ? "Hide" : "Show"} Context Block
                  {showLLMContext ? (
                    <ChevronUp className="ml-2 h-3 w-3" />
                  ) : (
                    <ChevronDown className="ml-2 h-3 w-3" />
                  )}
                </Button>
                {showLLMContext && (
                  <pre className="whitespace-pre-wrap text-xs bg-slate-900 text-slate-50 p-4 rounded-lg overflow-auto max-h-[600px]">
                    {result.mergedContext.contextBlockForLLM}
                  </pre>
                )}
              </CardContent>
            </Card>

            {/* Citations */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Citations
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 pr-4 font-medium">Chunk ID</th>
                        <th className="text-left py-2 pr-4 font-medium">Kind</th>
                        <th className="text-left py-2 pr-4 font-medium">Title</th>
                        <th className="text-left py-2 font-medium">Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.mergedContext.citations.map((c) => (
                        <tr key={c.chunkId} className="border-b last:border-0">
                          <td className="py-2 pr-4 font-mono text-xs">{c.chunkId}</td>
                          <td className="py-2 pr-4">
                            <Badge variant="outline" className="text-xs">
                              {c.kind}
                            </Badge>
                          </td>
                          <td className="py-2 pr-4">{c.title}</td>
                          <td className="py-2 font-mono">{c.score}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({
  ok,
  label,
  detail,
}: {
  ok: boolean;
  label: string;
  detail?: string;
}) {
  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border ${
        ok
          ? "bg-green-50 text-green-700 border-green-200"
          : "bg-red-50 text-red-700 border-red-200"
      }`}
    >
      {ok ? (
        <CheckCircle className="h-3 w-3" />
      ) : (
        <AlertTriangle className="h-3 w-3" />
      )}
      {label}
      {detail && <span className="text-muted-foreground">({detail})</span>}
    </div>
  );
}
