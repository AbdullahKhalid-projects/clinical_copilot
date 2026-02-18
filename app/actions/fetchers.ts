"use server";

import { currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export async function getPatientDashboardData() {
  const user = await currentUser();

  if (!user) {
    redirect("/");
  }

  const dbUser = await prisma.user.findUnique({
    where: { clerkId: user.id },
    include: {
      patientProfile: {
        include: {
          appointments: {
            orderBy: { date: "asc" },
            where: {
              date: {
                gte: new Date(),
              },
            },
            take: 3,
            include: { doctor: true },
          },
          prescriptions: {
            where: { status: "ACTIVE" },
          },
          healthMetrics: {
            orderBy: { date: "desc" },
            take: 3,
          },
        },
      },
    },
  });

  if (!dbUser || !dbUser.patientProfile) {
    return null;
  }

  const profile = dbUser.patientProfile;

  const age = profile.dateOfBirth
    ? new Date().getFullYear() - profile.dateOfBirth.getFullYear()
    : "N/A";

  return {
    ...profile,
    name: dbUser.name ?? "Unknown",
    email: dbUser.email,
    initials: dbUser.name
      ? dbUser.name
          .split(" ")
          .map((n: string) => n[0])
          .join("")
          .toUpperCase()
          .substring(0, 2)
      : "U",
    age: age,
  };
}

export async function getPatientMedications() {
  const user = await currentUser();

  if (!user) {
    redirect("/");
  }

  const dbUser = await prisma.user.findUnique({
    where: { clerkId: user.id },
    include: {
      patientProfile: {
        include: {
          prescriptions: {
            orderBy: { startDate: "desc" },
            include: {
              doctor: {
                include: {
                  user: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!dbUser || !dbUser.patientProfile) {
    return [];
  }

  return dbUser.patientProfile.prescriptions.map((p) => ({
    ...p,
    doctorName: p.doctor?.user.name
      ? `Dr. ${p.doctor.user.name}`
      : p.prescribedBy || "Unknown Doctor",
  }));
}

export async function getNotesAndReminders() {
  const user = await currentUser();

  if (!user) {
    redirect("/");
  }

  const dbUser = await prisma.user.findUnique({
    where: { clerkId: user.id },
    include: {
      patientProfile: {
        include: {
          notes: {
            orderBy: { date: "desc" },
          },
          reminders: {
            orderBy: { date: "asc" },
          },
        },
      },
    },
  });

  if (!dbUser || !dbUser.patientProfile) {
    return {
      notes: [],
      reminders: [],
    };
  }

  return {
    notes: dbUser.patientProfile.notes,
    reminders: dbUser.patientProfile.reminders,
  };
}

export async function getPatientReports() {
  const user = await currentUser();

  if (!user) {
    redirect("/");
  }

  const dbUser = await prisma.user.findUnique({
    where: { clerkId: user.id },
  });

  if (!dbUser) {
    return [];
  }

  const reports = await prisma.medicalReport.findMany({
    where: { userId: dbUser.id },
    include: {
      document: {
        select: { title: true },
      },
      reportValues: {
        orderBy: { key: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return reports.map((report) => ({
    id: report.id,
    title: report.document.title,
    reportDate: report.reportDate,
    hospitalName: report.hospitalName,
    reportURL: report.reportURL,
    createdAt: report.createdAt,
    valuesCount: report.reportValues.length,
    values: report.reportValues.map((v) => ({
      id: v.id,
      key: v.key,
      value: v.value,
      unit: v.unit,
    })),
  }));
}

export async function getPatientReportById(reportId: string) {
  const user = await currentUser();

  if (!user) {
    redirect("/");
  }

  const dbUser = await prisma.user.findUnique({
    where: { clerkId: user.id },
  });

  if (!dbUser) {
    return null;
  }

  const report = await prisma.medicalReport.findFirst({
    where: {
      id: reportId,
      userId: dbUser.id,
    },
    include: {
      document: {
        select: { title: true },
      },
      reportValues: {
        orderBy: { key: "asc" },
      },
    },
  });

  if (!report) return null;

  return {
    id: report.id,
    title: report.document.title,
    reportDate: report.reportDate,
    hospitalName: report.hospitalName,
    reportURL: report.reportURL,
    markdown: report.markdown,
    createdAt: report.createdAt,
    values: report.reportValues.map((v) => ({
      id: v.id,
      key: v.key,
      value: v.value,
      unit: v.unit,
    })),
  };
}

export async function getPatientReportStats() {
  const user = await currentUser();

  if (!user) {
    redirect("/");
  }

  const dbUser = await prisma.user.findUnique({
    where: { clerkId: user.id },
  });

  if (!dbUser) {
    return null;
  }

  const totalReports = await prisma.medicalReport.count({
    where: { userId: dbUser.id },
  });

  const totalTestValues = await prisma.medicalReportValue.count({
    where: { userId: dbUser.id },
  });

  const latestReport = await prisma.medicalReport.findFirst({
    where: { userId: dbUser.id },
    orderBy: { reportDate: "desc" },
    select: { reportDate: true, hospitalName: true },
  });

  const uniqueHospitals = await prisma.medicalReport.findMany({
    where: {
      userId: dbUser.id,
      hospitalName: { not: null },
    },
    select: { hospitalName: true },
    distinct: ["hospitalName"],
  });

  // Get test value distribution for chart - group values by key and count occurrences
  const allValues = await prisma.medicalReportValue.findMany({
    where: { userId: dbUser.id },
    select: { key: true },
  });

  const testDistribution: Record<string, number> = {};
  allValues.forEach((v) => {
    testDistribution[v.key] = (testDistribution[v.key] || 0) + 1;
  });

  // Top 10 most frequent tests
  const topTests = Object.entries(testDistribution)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }));

  // Reports over time (by month)
  const reports = await prisma.medicalReport.findMany({
    where: { userId: dbUser.id },
    select: { reportDate: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  const reportsOverTime: Record<string, number> = {};
  reports.forEach((r) => {
    const date = r.reportDate || r.createdAt;
    const monthKey = `${date.getFullYear()}-${String(
      date.getMonth() + 1
    ).padStart(2, "0")}`;
    reportsOverTime[monthKey] = (reportsOverTime[monthKey] || 0) + 1;
  });

  const timelineData = Object.entries(reportsOverTime)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, count]) => ({ month, count }));

  return {
    totalReports,
    totalTestValues,
    latestReportDate: latestReport?.reportDate ?? null,
    latestHospital: latestReport?.hospitalName ?? null,
    uniqueHospitals: uniqueHospitals.length,
    topTests,
    timelineData,
  };
}

export async function searchPatientReports(query: string) {
  const user = await currentUser();

  if (!user) {
    redirect("/");
  }

  const dbUser = await prisma.user.findUnique({
    where: { clerkId: user.id },
  });

  if (!dbUser) {
    return [];
  }

  // Search reports by document title, hospital name, or test value keys
  const reports = await prisma.medicalReport.findMany({
    where: {
      userId: dbUser.id,
      OR: [
        { document: { title: { contains: query, mode: "insensitive" } } },
        { hospitalName: { contains: query, mode: "insensitive" } },
        {
          reportValues: {
            some: { key: { contains: query, mode: "insensitive" } },
          },
        },
      ],
    },
    include: {
      document: { select: { title: true } },
      reportValues: { orderBy: { key: "asc" } },
    },
    orderBy: { createdAt: "desc" },
  });

  return reports.map((report) => ({
    id: report.id,
    title: report.document.title,
    reportDate: report.reportDate,
    hospitalName: report.hospitalName,
    reportURL: report.reportURL,
    createdAt: report.createdAt,
    valuesCount: report.reportValues.length,
    values: report.reportValues.map((v) => ({
      id: v.id,
      key: v.key,
      value: v.value,
      unit: v.unit,
    })),
  }));
}

export async function searchTestKeyTrends(keyQuery: string) {
  const user = await currentUser();

  if (!user) {
    redirect("/");
  }

  const dbUser = await prisma.user.findUnique({
    where: { clerkId: user.id },
  });

  if (!dbUser) {
    return { keys: [], selectedKeyData: null };
  }

  // Find all unique keys that match the query
  const matchingKeys = await prisma.medicalReportValue.findMany({
    where: {
      userId: dbUser.id,
      key: { contains: keyQuery, mode: "insensitive" },
    },
    select: { key: true },
    distinct: ["key"],
    orderBy: { key: "asc" },
    take: 20,
  });

  const keys = matchingKeys.map((k) => k.key);

  // If we have an exact match, get the trend data for that key
  const exactMatch = keys.find(
    (k) => k.toUpperCase() === keyQuery.toUpperCase()
  );

  if (exactMatch) {
    const historicalData = await prisma.medicalReportValue.findMany({
      where: {
        userId: dbUser.id,
        key: exactMatch,
      },
      include: {
        report: {
          select: {
            reportDate: true,
            hospitalName: true,
            document: { select: { title: true } },
          },
        },
      },
      orderBy: { report: { reportDate: "desc" } },
    });

    // Filter out records where value is null/empty
    const validRecords = historicalData.filter(
      (v) => v.value != null && v.value !== ""
    );

    // Convert to chart data - only include records with report dates
    const chartData = validRecords
      .filter((v) => v.report.reportDate)
      .map((v) => ({
        date: v.report.reportDate!.toISOString().split("T")[0],
        value: parseFloat(v.value) || 0,
        unit: v.unit,
        hospital: v.report.hospitalName,
        reportTitle: v.report.document.title,
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Find the latest record by report date (prioritize report date)
    const recordsWithDates = validRecords.filter((v) => v.report.reportDate);
    const latest =
      recordsWithDates.length > 0
        ? recordsWithDates.sort(
            (a, b) =>
              new Date(b.report.reportDate!).getTime() -
              new Date(a.report.reportDate!).getTime()
          )[0]
        : validRecords[0]; // Fallback to first record if no dates

    return {
      keys,
      selectedKeyData: {
        key: exactMatch,
        unit: latest?.unit,
        latestValue: latest?.value,
        latestDate: latest?.report.reportDate,
        latestHospital: latest?.report.hospitalName,
        totalRecords: validRecords.length,
        chartData,
        allRecords: validRecords.map((v) => ({
          id: v.id,
          value: v.value,
          unit: v.unit,
          reportDate: v.report.reportDate,
          hospitalName: v.report.hospitalName,
          reportTitle: v.report.document.title,
        })),
      },
    };
  }

  return { keys, selectedKeyData: null };
}

export async function getAllTestKeys() {
  const user = await currentUser();

  if (!user) {
    redirect("/");
  }

  const dbUser = await prisma.user.findUnique({
    where: { clerkId: user.id },
  });

  if (!dbUser) {
    return [];
  }

  const keys = await prisma.medicalReportValue.findMany({
    where: { userId: dbUser.id },
    select: { key: true },
    distinct: ["key"],
    orderBy: { key: "asc" },
  });

  return keys.map((k) => k.key);
}
