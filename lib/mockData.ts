// Mock Data for Clinical Co-Pilot Healthcare App

export interface Patient {
  id: string;
  name: string;
  initials: string;
  email: string;
  age: number;
  weight: string;
  height: string;
  phone: string;
  dateOfBirth: string;
  bloodType: string;
  allergies: string[];
  conditions: string[];
  primaryDoctor: string;
}

export interface Doctor {
  id: string;
  name: string;
  initials: string;
  email: string;
  specialty: string;
  title: string;
  licenseNumber: string;
  phone: string;
}

export interface Appointment {
  id: string;
  patientId: string;
  patientName: string;
  patientInitials: string;
  doctorId: string;
  doctorName: string;
  date: string;
  time: string;
  type: 'follow-up' | 'check-up' | 'consultation' | 'initial';
  status: 'scheduled' | 'completed' | 'cancelled';
}

export interface VisitSummary {
  id: string;
  title: string;
  date: string;
  doctorName: string;
  description: string;
  notes?: string;
}

export interface Transcript {
  id: string;
  title: string;
  date: string;
  duration: string;
  doctorName: string;
}

export interface LabResult {
  id: string;
  name: string;
  date: string;
  status: 'Normal' | 'Abnormal';
  type: 'lab' | 'imaging';
  results?: string;
}

export interface Medication {
  id: string;
  name: string;
  dosage: string;
  frequency: string;
  startDate: string;
  prescribedBy: string;
  isNew?: boolean;
}

export interface Note {
  id: string;
  title: string;
  content: string;
  tags: string[];
  date: string;
}

export interface Reminder {
  id: string;
  text: string;
}

export interface AIAlert {
  id: string;
  type: 'warning' | 'danger' | 'info';
  title: string;
  message: string;
}

export interface DrugInteraction {
  id: string;
  severity: 'Moderate' | 'Severe' | 'Minor';
  drugs: string;
}

export interface TimelineEvent {
  id: string;
  type: 'lab' | 'medication' | 'visit' | 'imaging';
  title: string;
  subtitle: string;
  date: string;
}

// Current User Context
export const currentPatient: Patient = {
  id: 'p1',
  name: 'John Anderson',
  initials: 'JA',
  email: 'john.anderson@email.com',
  age: 45,
  weight: '180 lbs',
  height: '5\'10"',
  phone: '(555) 123-4567',
  dateOfBirth: '1981-03-15',
  bloodType: 'A+',
  allergies: ['Penicillin', 'Sulfa drugs'],
  conditions: ['Pre-Diabetic', 'Hypertension'],
  primaryDoctor: 'Dr. Sarah Mitchell',
};

export const currentDoctor: Doctor = {
  id: 'd1',
  name: 'Dr. Sarah Mitchell',
  initials: 'SM',
  email: 'doctor@clinic.com',
  specialty: 'Internal Medicine',
  title: 'Primary Care Physician',
  licenseNumber: 'MD-2019-45678',
  phone: '(555) 987-6543',
};

// Patients List (for doctor view)
export const patients: Patient[] = [
  currentPatient,
  {
    id: 'p2',
    name: 'Emily Chen',
    initials: 'EC',
    email: 'emily.chen@email.com',
    age: 32,
    weight: '135 lbs',
    height: '5\'4"',
    phone: '(555) 234-5678',
    dateOfBirth: '1994-07-22',
    bloodType: 'O+',
    allergies: ['Latex'],
    conditions: ['Asthma'],
    primaryDoctor: 'Dr. Sarah Mitchell',
  },
  {
    id: 'p3',
    name: 'Michael Brown',
    initials: 'MB',
    email: 'michael.brown@email.com',
    age: 58,
    weight: '210 lbs',
    height: '6\'1"',
    phone: '(555) 345-6789',
    dateOfBirth: '1968-11-08',
    bloodType: 'B-',
    allergies: [],
    conditions: ['Type 2 Diabetes', 'High Cholesterol'],
    primaryDoctor: 'Dr. Sarah Mitchell',
  },
  {
    id: 'p4',
    name: 'Sarah Williams',
    initials: 'SW',
    email: 'sarah.williams@email.com',
    age: 41,
    weight: '155 lbs',
    height: '5\'6"',
    phone: '(555) 456-7890',
    dateOfBirth: '1985-02-14',
    bloodType: 'AB+',
    allergies: ['Aspirin', 'Ibuprofen'],
    conditions: ['Migraine'],
    primaryDoctor: 'Dr. Sarah Mitchell',
  },
  {
    id: 'p5',
    name: 'Robert Davis',
    initials: 'RD',
    email: 'robert.davis@email.com',
    age: 67,
    weight: '175 lbs',
    height: '5\'9"',
    phone: '(555) 567-8901',
    dateOfBirth: '1959-09-30',
    bloodType: 'A-',
    allergies: ['Codeine'],
    conditions: ['Hypertension', 'Arthritis'],
    primaryDoctor: 'Dr. Sarah Mitchell',
  },
];

// Appointments
export const appointments: Appointment[] = [
  {
    id: 'apt1',
    patientId: 'p1',
    patientName: 'John Anderson',
    patientInitials: 'JA',
    doctorId: 'd1',
    doctorName: 'Dr. Sarah Mitchell',
    date: 'Tue, Feb 10',
    time: '09:00 AM',
    type: 'follow-up',
    status: 'scheduled',
  },
  {
    id: 'apt2',
    patientId: 'p2',
    patientName: 'Emily Chen',
    patientInitials: 'EC',
    doctorId: 'd1',
    doctorName: 'Dr. Sarah Mitchell',
    date: 'Tue, Feb 10',
    time: '10:30 AM',
    type: 'check-up',
    status: 'scheduled',
  },
  {
    id: 'apt3',
    patientId: 'p3',
    patientName: 'Michael Brown',
    patientInitials: 'MB',
    doctorId: 'd1',
    doctorName: 'Dr. Sarah Mitchell',
    date: 'Wed, Feb 11',
    time: '02:00 PM',
    type: 'consultation',
    status: 'scheduled',
  },
];

// Visit Summaries
export const visitSummaries: VisitSummary[] = [
  {
    id: 'vs1',
    title: 'Follow-up Visit',
    date: 'January 28, 2026',
    doctorName: 'Dr. Sarah Mitchell',
    description: 'Routine diabetes management check',
    notes: 'Blood glucose levels stable. Continue current medication regimen.',
  },
  {
    id: 'vs2',
    title: 'Check-up Visit',
    date: 'January 15, 2026',
    doctorName: 'Dr. Sarah Mitchell',
    description: 'Annual physical examination',
    notes: 'Overall health good. Recommended increased physical activity.',
  },
];

// Session Transcripts
export const transcripts: Transcript[] = [
  {
    id: 't1',
    title: 'Session Transcript',
    date: 'January 28, 2026',
    duration: '18 min',
    doctorName: 'Dr. Sarah Mitchell',
  },
];

// Lab Results
export const labResults: LabResult[] = [
  {
    id: 'lab1',
    name: 'Chest X-Ray',
    date: 'Jan 10, 2026',
    status: 'Normal',
    type: 'imaging',
    results: 'No abnormalities detected.',
  },
  {
    id: 'lab2',
    name: 'Lipid Panel',
    date: 'Jan 25, 2026',
    status: 'Abnormal',
    type: 'lab',
    results: 'LDL cholesterol slightly elevated at 142 mg/dL.',
  },
  {
    id: 'lab3',
    name: 'Complete Blood Count',
    date: 'Jan 25, 2026',
    status: 'Normal',
    type: 'lab',
    results: 'All values within normal range.',
  },
];

// Medications
export const medications: Medication[] = [
  {
    id: 'med1',
    name: 'Lisinopril',
    dosage: '10mg',
    frequency: 'Once daily',
    startDate: '15/01/2026',
    prescribedBy: 'Dr. Sarah Mitchell',
    isNew: true,
  },
  {
    id: 'med2',
    name: 'Metformin',
    dosage: '500mg',
    frequency: 'Twice daily with meals',
    startDate: '01/06/2025',
    prescribedBy: 'Dr. Sarah Mitchell',
  },
  {
    id: 'med3',
    name: 'Aspirin',
    dosage: '81mg',
    frequency: 'Once daily',
    startDate: '15/03/2025',
    prescribedBy: 'Dr. James Wilson',
  },
];

// Patient Notes
export const patientNotes: Note[] = [
  {
    id: 'note1',
    title: 'Questions for next visit',
    content: 'Ask about the new blood pressure medication side effects. Also discuss exercise intensity.',
    tags: ['Ask about headaches', 'Discuss diet options'],
    date: 'Feb 1, 2026',
  },
];

// Reminders
export const reminders: Reminder[] = [
  { id: 'r1', text: 'Ask about headaches' },
  { id: 'r2', text: 'Discuss diet options' },
];

// AI Health Summary
export const aiHealthSummary = `Based on your recent health data, you're making excellent progress with your pre-diabetes management. Your fasting glucose levels have improved by 15% over the past 3 months, and your blood pressure is trending toward normal range with the new medication. Continue your current exercise routine and dietary modifications. Your next focus should be on maintaining consistent sleep patterns and reducing stress levels for optimal metabolic health.`;

// Health Trends
export const healthTrends = [
  { id: 'ht1', label: 'Diabetic Status', value: 'Pre Diabetic', trend: 'improving', icon: 'activity' },
  { id: 'ht2', label: 'Heart Health', value: 'Good', trend: 'stable', icon: 'heart' },
  { id: 'ht3', label: 'Blood Pressure', value: '128/82', trend: 'improving', icon: 'activity' },
];

// Current Prescriptions (for dashboard quick view)
export const currentPrescriptions = medications.slice(0, 3);

// Clinical Session Data
export const aiAlerts: AIAlert[] = [
  {
    id: 'alert1',
    type: 'warning',
    title: 'AI Alert',
    message: 'Patient has reported dizziness - possible medication interaction',
  },
  {
    id: 'alert2',
    type: 'info',
    title: 'Trend Alert',
    message: 'A1C levels trending upward over last 3 months',
  },
];

export const drugInteractions: DrugInteraction[] = [
  {
    id: 'di1',
    severity: 'Moderate',
    drugs: 'Lisinopril + Potassium supplements',
  },
];

export const patientAllergies = ['Penicillin', 'Sulfa drugs'];

export const patientTimeline: TimelineEvent[] = [
  {
    id: 'te1',
    type: 'lab',
    title: 'Complete Blood Count',
    subtitle: 'normal',
    date: 'Jan 25',
  },
  {
    id: 'te2',
    type: 'lab',
    title: 'Lipid Panel',
    subtitle: 'abnormal',
    date: 'Jan 25',
  },
  {
    id: 'te3',
    type: 'medication',
    title: 'Lisinopril',
    subtitle: '10mg - Once daily',
    date: 'Jan 15',
  },
  {
    id: 'te4',
    type: 'medication',
    title: 'Metformin',
    subtitle: '500mg - Twice daily with meals',
    date: 'Jun 1',
  },
  {
    id: 'te5',
    type: 'visit',
    title: 'Follow-up',
    subtitle: 'Pre-diabetes, well controlled',
    date: 'Jan 28',
  },
];

// Today's Overview for Doctor
export const todaysOverview = {
  appointments: 0,
  totalPatients: 3,
};
