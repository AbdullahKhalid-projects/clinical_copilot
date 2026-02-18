"use client";

import React, { useState, useTransition, useMemo, useEffect } from "react";
import {
    FileText,
    Search,
    Calendar,
    Building2,
    TrendingUp,
    TrendingDown,
    Activity,
    Sparkles,
    X,
    ChevronRight,
    History,
} from "lucide-react";
import { format } from "date-fns";
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    ReferenceLine,
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Pagination,
    PaginationContent,
    PaginationEllipsis,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious,
} from "@/components/ui/pagination";
import { searchPatientReports } from "@/app/actions/fetchers";
import { searchTestKeyTrends, getAllTestKeys } from "@/app/actions/fetchers";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ReportValue {
    id: string;
    key: string;
    value: string;
    unit: string | null;
}

interface Report {
    id: string;
    title: string;
    reportDate: Date | null;
    hospitalName: string | null;
    reportURL: string | null;
    createdAt: Date;
    valuesCount: number;
    values: ReportValue[];
}

interface TrendDataPoint {
    date: string;
    value: number;
    unit: string | null;
    hospital: string | null;
    reportTitle: string;
}

interface SelectedKeyData {
    key: string;
    unit: string | null;
    latestValue: string;
    latestDate: Date | null;
    latestHospital: string | null;
    totalRecords: number;
    chartData: TrendDataPoint[];
    allRecords: Array<{
        id: string;
        value: string;
        unit: string | null;
        reportDate: Date | null;
        hospitalName: string | null;
        reportTitle: string;
    }>;
}

interface ReportsDashboardProps {
    initialReports: Report[];
}

// ─── Custom Tooltip for Chart ───────────────────────────────────────────────

function CustomTooltip({ active, payload }: any) {
    if (active && payload && payload.length) {
        const data = payload[0].payload;
        return (
            <div className="bg-background border rounded-lg shadow-lg p-3">
                <p className="text-xs text-muted-foreground mb-1">
                    {format(new Date(data.date), "MMM d, yyyy")}
                </p>
                <p className="text-sm font-semibold">
                    {data.value} {data.unit || ""}
                </p>
                {data.hospital && (
                    <p className="text-xs text-muted-foreground mt-1">
                        {data.hospital}
                    </p>
                )}
            </div>
        );
    }
    return null;
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function ReportsDashboard({ initialReports }: ReportsDashboardProps) {
    const [reports, setReports] = useState<Report[]>(initialReports);
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedReport, setSelectedReport] = useState<Report | null>(null);
    const [sheetOpen, setSheetOpen] = useState(false);
    const [isPending, startTransition] = useTransition();

    // Pagination State
    const [reportsPage, setReportsPage] = useState(1);
    const reportsPerPage = 10;

    // BI Dashboard State
    const [testKeyQuery, setTestKeyQuery] = useState("");
    const [suggestedKeys, setSuggestedKeys] = useState<string[]>([]);
    const [selectedKeyData, setSelectedKeyData] = useState<SelectedKeyData | null>(null);
    const [allTestKeys, setAllTestKeys] = useState<string[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);

    // Load all test keys on mount
    useEffect(() => {
        startTransition(async () => {
            const keys = await getAllTestKeys();
            setAllTestKeys(keys);
        });
    }, []);

    // Handle test key autocomplete suggestions with debounce
    useEffect(() => {
        const timer = setTimeout(() => {
            if (testKeyQuery.trim()) {
                startTransition(async () => {
                    const result = await searchTestKeyTrends(testKeyQuery);
                    setSuggestedKeys(result.keys);
                    // Don't auto-load the full trend data, only suggestions
                });
            } else {
                setSuggestedKeys([]);
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [testKeyQuery]);

    // Calculate paginated reports
    const paginatedReports = useMemo(() => {
        const startIndex = (reportsPage - 1) * reportsPerPage;
        const endIndex = startIndex + reportsPerPage;
        return reports.slice(startIndex, endIndex);
    }, [reports, reportsPage]);

    const totalPages = Math.ceil(reports.length / reportsPerPage);

    const handleReportsSearch = () => {
        setReportsPage(1); // Reset to first page on search
        if (searchQuery.trim() === "") {
            setReports(initialReports);
            return;
        }
        startTransition(async () => {
            const results = await searchPatientReports(searchQuery);
            setReports(results as Report[]);
        });
    };

    const clearReportsSearch = () => {
        setSearchQuery("");
        setReports(initialReports);
    };

    const handleTestKeySearch = () => {
        if (testKeyQuery.trim()) {
            startTransition(async () => {
                const result = await searchTestKeyTrends(testKeyQuery);
                setSuggestedKeys(result.keys);
                setSelectedKeyData(result.selectedKeyData);
                setShowSuggestions(false);
            });
        }
    };

    const openReport = (report: Report) => {
        setSelectedReport(report);
        setSheetOpen(true);
    };

    const selectTestKey = (key: string) => {
        setTestKeyQuery(key);
        setShowSuggestions(false);
        startTransition(async () => {
            const result = await searchTestKeyTrends(key);
            if (result.selectedKeyData) {
                setSelectedKeyData(result.selectedKeyData);
            }
        });
    };

    // Calculate trend statistics
    const trendStats = useMemo(() => {
        if (!selectedKeyData || selectedKeyData.chartData.length < 2) {
            return null;
        }

        const data = selectedKeyData.chartData;
        const latest = data[data.length - 1].value;
        const previous = data[data.length - 2].value;
        const change = latest - previous;
        const percentChange = previous !== 0 ? (change / previous) * 100 : 0;
        const isIncreasing = change > 0;

        // Calculate min/max
        const values = data.map((d) => d.value);
        const min = Math.min(...values);
        const max = Math.max(...values);
        const avg = values.reduce((a, b) => a + b, 0) / values.length;

        return {
            latest,
            previous,
            change,
            percentChange,
            isIncreasing,
            min,
            max,
            avg,
        };
    }, [selectedKeyData]);

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div className="flex flex-col gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Health Analytics</h1>
                    <p className="text-sm text-muted-foreground">
                        Track your lab results and trends over time
                    </p>
                </div>
            </div>

            {/* All Reports Section */}
            <div className="space-y-4">
                <div className="flex items-center justify-between gap-4">
                    <h2 className="text-lg font-semibold">All Reports</h2>
                    <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search reports..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    handleReportsSearch();
                                }
                            }}
                            className="pl-9 h-9 pr-20"
                        />
                        <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-1">
                            {searchQuery && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 w-7 p-0"
                                    onClick={clearReportsSearch}
                                >
                                    <X className="h-3 w-3" />
                                </Button>
                            )}
                            <Button
                                size="sm"
                                className="h-7 px-2"
                                onClick={handleReportsSearch}
                            >
                                <Search className="h-3 w-3" />
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Reports Table */}
                <Card>
                    <div className="rounded-lg border overflow-hidden">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/50">
                                    <TableHead className="text-xs font-semibold uppercase tracking-wider">
                                        Report Title
                                    </TableHead>
                                    <TableHead className="text-xs font-semibold uppercase tracking-wider">
                                        Hospital
                                    </TableHead>
                                    <TableHead className="text-xs font-semibold uppercase tracking-wider">
                                        Report Date
                                    </TableHead>
                                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-right">
                                        Tests
                                    </TableHead>
                                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-right">
                                        Uploaded
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {paginatedReports.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground text-sm">
                                            {searchQuery ? "No reports found matching your search." : "No reports available."}
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    paginatedReports.map((report) => (
                                        <TableRow
                                            key={report.id}
                                            className="cursor-pointer hover:bg-muted/30 transition-colors"
                                            onClick={() => openReport(report)}
                                        >
                                            <TableCell className="font-medium">
                                                <div className="flex items-center gap-2">
                                                    <FileText className="h-4 w-4 text-muted-foreground" />
                                                    <span>{report.title}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-sm">
                                                {report.hospitalName || "—"}
                                            </TableCell>
                                            <TableCell className="text-sm">
                                                {report.reportDate
                                                    ? format(new Date(report.reportDate), "MMM d, yyyy")
                                                    : "—"}
                                            </TableCell>
                                            <TableCell className="text-sm text-right">
                                                <Badge variant="secondary" className="font-mono text-xs">
                                                    {report.valuesCount}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-sm text-right text-muted-foreground">
                                                {format(new Date(report.createdAt), "MMM d, yyyy")}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-end space-x-2 py-4 px-4">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setReportsPage((p) => Math.max(1, p - 1))}
                                disabled={reportsPage === 1}
                            >
                                Previous
                            </Button>
                            <div className="flex items-center gap-1">
                                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                                    let pageNum;
                                    if (totalPages <= 5) {
                                        pageNum = i + 1;
                                    } else if (reportsPage <= 3) {
                                        pageNum = i + 1;
                                    } else if (reportsPage >= totalPages - 2) {
                                        pageNum = totalPages - 4 + i;
                                    } else {
                                        pageNum = reportsPage - 2 + i;
                                    }

                                    return (
                                        <Button
                                            key={pageNum}
                                            variant={reportsPage === pageNum ? "default" : "outline"}
                                            size="sm"
                                            className="w-9 h-9 p-0"
                                            onClick={() => setReportsPage(pageNum)}
                                        >
                                            {pageNum}
                                        </Button>
                                    );
                                })}
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setReportsPage((p) => Math.min(totalPages, p + 1))}
                                disabled={reportsPage === totalPages}
                            >
                                Next
                            </Button>
                        </div>
                    )}
                </Card>
            </div>

            {/* Test Key Search */}
            <div className="relative">
                <div className="flex gap-2">
                    <div className="relative flex-1">
                        <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search for a test (e.g., Hemoglobin, Vitamin D, Cholesterol)..."
                            value={testKeyQuery}
                            onChange={(e) => {
                                setTestKeyQuery(e.target.value);
                                setShowSuggestions(true);
                            }}
                            onFocus={() => setShowSuggestions(true)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    handleTestKeySearch();
                                }
                            }}
                            className="pl-10 h-11 text-base pr-24"
                        />
                        <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-1">
                            {testKeyQuery && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0"
                                    onClick={() => {
                                        setTestKeyQuery("");
                                        setSelectedKeyData(null);
                                        setSuggestedKeys([]);
                                    }}
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            )}
                            <Button
                                size="sm"
                                className="h-8 px-3"
                                onClick={handleTestKeySearch}
                            >
                                <Search className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Suggestions Dropdown */}
                {showSuggestions && suggestedKeys.length > 0 && (
                    <Card className="absolute z-10 w-full mt-1 shadow-lg">
                        <ScrollArea className="max-h-64">
                            <div className="p-1">
                                {suggestedKeys.map((key) => (
                                    <button
                                        key={key}
                                        onClick={() => selectTestKey(key)}
                                        className="w-full flex items-center gap-2 px-3 py-2 rounded-md hover:bg-accent text-left transition-colors"
                                    >
                                        <Activity className="h-4 w-4 text-muted-foreground" />
                                        <span className="text-sm font-medium">{key}</span>
                                    </button>
                                ))}
                            </div>
                        </ScrollArea>
                    </Card>
                )}
            </div>

            {/* BI Dashboard - Shows when a test key is selected */}
            {selectedKeyData && (
                <div className="space-y-4 animate-in fade-in slide-in-from-top-4 duration-300">
                    {/* Key Info Header */}
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-xl font-bold">{selectedKeyData.key}</h2>
                                {selectedKeyData.unit && (
                                    <Badge variant="secondary">{selectedKeyData.unit}</Badge>
                                )}
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">
                                {selectedKeyData.totalRecords} record{selectedKeyData.totalRecords !== 1 ? "s" : ""} found
                            </p>
                        </div>
                        {trendStats && (
                            <div className="flex items-center gap-2">
                                {trendStats.isIncreasing ? (
                                    <TrendingUp className="h-5 w-5 text-red-500" />
                                ) : (
                                    <TrendingDown className="h-5 w-5 text-green-500" />
                                )}
                                <span
                                    className={`text-sm font-semibold ${trendStats.isIncreasing ? "text-red-500" : "text-green-500"
                                        }`}
                                >
                                    {trendStats.isIncreasing ? "+" : ""}
                                    {trendStats.percentChange.toFixed(1)}%
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Stats Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <StatCard
                            label="Latest Value"
                            value={`${selectedKeyData.latestValue} ${selectedKeyData.unit || ""}`}
                            icon={Activity}
                        />
                        <StatCard
                            label="Last Checked"
                            value={
                                selectedKeyData.latestDate
                                    ? format(new Date(selectedKeyData.latestDate), "MMM d, yyyy")
                                    : "N/A"
                            }
                            icon={Calendar}
                        />
                        <StatCard
                            label="Last Hospital"
                            value={selectedKeyData.latestHospital || "Unknown"}
                            icon={Building2}
                        />
                        {trendStats && (
                            <StatCard
                                label="Average"
                                value={`${trendStats.avg.toFixed(1)} ${selectedKeyData.unit || ""}`}
                                icon={TrendingUp}
                            />
                        )}
                    </div>

                    {/* Trend Chart */}
                    {selectedKeyData.chartData.length > 0 && (
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">Trend Over Time</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <ResponsiveContainer width="100%" height={250}>
                                    <LineChart data={selectedKeyData.chartData}>
                                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                        <XAxis
                                            dataKey="date"
                                            tickFormatter={(value) => format(new Date(value), "MMM d, yyyy")}
                                            className="text-xs"
                                        />
                                        <YAxis className="text-xs" />
                                        <Tooltip content={<CustomTooltip />} />
                                        <Line
                                            type="monotone"
                                            dataKey="value"
                                            stroke="hsl(var(--primary))"
                                            strokeWidth={2}
                                            dot={{ fill: "hsl(var(--primary))", r: 4 }}
                                            activeDot={{ r: 6 }}
                                        />
                                        {trendStats && (
                                            <ReferenceLine
                                                y={trendStats.avg}
                                                stroke="hsl(var(--muted-foreground))"
                                                strokeDasharray="3 3"
                                                label={{
                                                    value: "Avg",
                                                    position: "right",
                                                    fill: "hsl(var(--muted-foreground))",
                                                    fontSize: 10,
                                                }}
                                            />
                                        )}
                                    </LineChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>
                    )}

                    {/* Historical Records */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base flex items-center gap-2">
                                <History className="h-4 w-4" />
                                Historical Records
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="rounded-lg border overflow-hidden">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-muted/50">
                                            <TableHead className="text-xs font-semibold uppercase tracking-wider">
                                                Test Name
                                            </TableHead>
                                            <TableHead className="text-xs font-semibold uppercase tracking-wider">
                                                Value
                                            </TableHead>
                                            <TableHead className="text-xs font-semibold uppercase tracking-wider">
                                                Report Date
                                            </TableHead>
                                            <TableHead className="text-xs font-semibold uppercase tracking-wider">
                                                Hospital Name
                                            </TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {selectedKeyData.allRecords.map((record, index) => (
                                            <TableRow
                                                key={record.id}
                                                className="cursor-pointer hover:bg-muted/30 transition-colors"
                                                onClick={() => {
                                                    // Find and open the report
                                                    const report = reports.find((r) =>
                                                        r.values.some((v) => v.id === record.id)
                                                    );
                                                    if (report) openReport(report);
                                                }}
                                            >
                                                <TableCell className="font-medium text-sm">
                                                    <div className="flex items-center gap-2">
                                                        {index === 0 && (
                                                            <Activity className="h-3 w-3 text-primary" />
                                                        )}
                                                        <span>{selectedKeyData.key}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-sm">
                                                    <span className="font-mono font-semibold">
                                                        {record.value}
                                                    </span>
                                                    {record.unit && (
                                                        <span className="text-muted-foreground ml-1">
                                                            {record.unit}
                                                        </span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-sm">
                                                    {record.reportDate
                                                        ? format(new Date(record.reportDate), "MMM d, yyyy")
                                                        : "Unknown"}
                                                </TableCell>
                                                <TableCell className="text-sm text-muted-foreground">
                                                    {record.hospitalName || "—"}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Report Detail Sheet */}
            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
                <SheetContent
                    side="right"
                    className="w-full sm:max-w-2xl lg:max-w-3xl overflow-y-auto p-0"
                >
                    {selectedReport && (
                        <ReportSheetContent report={selectedReport} />
                    )}
                </SheetContent>
            </Sheet>
        </div>
    );
}

// ─── Stat Card Component ────────────────────────────────────────────────────

function StatCard({
    label,
    value,
    icon: Icon,
}: {
    label: string;
    value: string | number;
    icon: React.ElementType;
}) {
    return (
        <Card>
            <CardContent className="p-4">
                <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">{label}</p>
                        <p className="text-sm font-semibold text-foreground truncate">{String(value)}</p>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

// ─── Report Sheet Content ───────────────────────────────────────────────────

function ReportSheetContent({ report }: { report: Report }) {
    const [valueSearch, setValueSearch] = useState("");

    const filteredValues = useMemo(() => {
        if (!valueSearch.trim()) return report.values;
        const q = valueSearch.toLowerCase();
        return report.values.filter(
            (v) =>
                v.key.toLowerCase().includes(q) ||
                v.value.toLowerCase().includes(q) ||
                (v.unit && v.unit.toLowerCase().includes(q))
        );
    }, [report.values, valueSearch]);

    return (
        <>
            {/* Header */}
            <SheetHeader className="sticky top-0 z-10 bg-background border-b px-6 py-5">
                <SheetTitle className="text-lg">Medical Report</SheetTitle>
                <SheetDescription>{report.title}</SheetDescription>
            </SheetHeader>

            {/* Content */}
            <div className="px-6 py-6 space-y-6">
                {/* Metadata Grid */}
                <div className="grid gap-3 grid-cols-2">
                    <div className="p-4 rounded-lg border bg-muted/30">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            Hospital / Lab
                        </p>
                        <p className="font-medium mt-1.5 text-sm">
                            {report.hospitalName || "Not detected"}
                        </p>
                    </div>
                    <div className="p-4 rounded-lg border bg-muted/30">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            Report Date
                        </p>
                        <p className="font-medium mt-1.5 text-sm">
                            {report.reportDate
                                ? format(new Date(report.reportDate), "MMMM d, yyyy")
                                : "Unknown"}
                        </p>
                    </div>
                    <div className="p-4 rounded-lg border bg-muted/30">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            Uploaded
                        </p>
                        <p className="font-medium mt-1.5 text-sm">
                            {format(new Date(report.createdAt), "MMM d, yyyy")}
                        </p>
                    </div>
                    <div className="p-4 rounded-lg border bg-muted/30">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            Test Values
                        </p>
                        <p className="font-medium mt-1.5 text-sm">
                            {report.values.length} extracted
                        </p>
                    </div>
                </div>

                {/* Original Report Link */}
                {report.reportURL && (
                    <a
                        href={report.reportURL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 p-4 rounded-lg border bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/30 hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors"
                    >
                        <div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center shrink-0">
                            <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm text-blue-700 dark:text-blue-300">
                                View Original Report
                            </p>
                            <p className="text-xs text-blue-600/70 dark:text-blue-400/70 truncate">
                                {report.reportURL}
                            </p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-blue-500 dark:text-blue-400 shrink-0" />
                    </a>
                )}

                {/* Test Values */}
                <div className="space-y-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                            placeholder="Filter test values..."
                            value={valueSearch}
                            onChange={(e) => setValueSearch(e.target.value)}
                            className="pl-9 h-9 text-sm"
                        />
                    </div>

                    <div className="rounded-lg border overflow-hidden">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b bg-muted/50">
                                    <th className="text-left p-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                                        Test Name
                                    </th>
                                    <th className="text-right p-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                                        Value
                                    </th>
                                    <th className="text-left p-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                                        Unit
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {filteredValues.length === 0 ? (
                                    <tr>
                                        <td
                                            colSpan={3}
                                            className="p-3 text-center text-muted-foreground text-sm"
                                        >
                                            {valueSearch
                                                ? "No matching test values found."
                                                : "No test values extracted."}
                                        </td>
                                    </tr>
                                ) : (
                                    filteredValues.map((v) => (
                                        <tr
                                            key={v.id}
                                            className="hover:bg-muted/30 transition-colors"
                                        >
                                            <td className="p-3 font-medium">
                                                {v.key}
                                            </td>
                                            <td className="p-3 text-right tabular-nums font-mono">
                                                {v.value}
                                            </td>
                                            <td className="p-3 text-muted-foreground">
                                                {v.unit || "—"}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </>
    );
}

// ─── Sheet Components (Inline to avoid import issues) ───────────────────────

import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
} from "@/components/ui/sheet";
