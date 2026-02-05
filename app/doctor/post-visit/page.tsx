"use client";

import { useState } from "react";
import { FileText, Save, Send } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { patients } from "@/lib/mockData";

export default function PostVisitPage() {
  const [selectedPatient, setSelectedPatient] = useState("");
  const [visitType, setVisitType] = useState("");
  const [chiefComplaint, setChiefComplaint] = useState("");
  const [assessment, setAssessment] = useState("");
  const [plan, setPlan] = useState("");
  const [prescriptions, setPrescriptions] = useState("");
  const [followUp, setFollowUp] = useState("");

  const handleSaveDraft = () => {
    alert("Draft saved successfully!");
  };

  const handleSubmit = () => {
    if (!selectedPatient || !visitType || !assessment) {
      alert("Please fill in all required fields");
      return;
    }
    alert("Visit summary submitted successfully!");
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Post-Visit Editor</h1>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileText className="w-5 h-5 text-primary" />
            Visit Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="patient">Patient *</Label>
              <Select value={selectedPatient} onValueChange={setSelectedPatient}>
                <SelectTrigger>
                  <SelectValue placeholder="Select patient" />
                </SelectTrigger>
                <SelectContent>
                  {patients.map((patient) => (
                    <SelectItem key={patient.id} value={patient.id}>
                      {patient.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="visitType">Visit Type *</Label>
              <Select value={visitType} onValueChange={setVisitType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select visit type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="initial">Initial Consultation</SelectItem>
                  <SelectItem value="follow-up">Follow-up</SelectItem>
                  <SelectItem value="check-up">Check-up</SelectItem>
                  <SelectItem value="urgent">Urgent Care</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="chiefComplaint">Chief Complaint</Label>
            <Input
              id="chiefComplaint"
              placeholder="Enter the main reason for the visit"
              value={chiefComplaint}
              onChange={(e) => setChiefComplaint(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="assessment">Assessment & Diagnosis *</Label>
            <Textarea
              id="assessment"
              placeholder="Enter your clinical assessment and diagnosis"
              value={assessment}
              onChange={(e) => setAssessment(e.target.value)}
              rows={4}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="plan">Treatment Plan</Label>
            <Textarea
              id="plan"
              placeholder="Enter the treatment plan and recommendations"
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
              rows={4}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="prescriptions">Prescriptions</Label>
            <Textarea
              id="prescriptions"
              placeholder="Enter any prescriptions (medication, dosage, frequency)"
              value={prescriptions}
              onChange={(e) => setPrescriptions(e.target.value)}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="followUp">Follow-up Instructions</Label>
            <Input
              id="followUp"
              placeholder="E.g., Return in 2 weeks, Schedule lab work"
              value={followUp}
              onChange={(e) => setFollowUp(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <Button
              variant="outline"
              onClick={handleSaveDraft}
              className="flex items-center gap-2 bg-transparent"
            >
              <Save className="w-4 h-4" />
              Save Draft
            </Button>
            <Button
              onClick={handleSubmit}
              className="flex items-center gap-2"
            >
              <Send className="w-4 h-4" />
              Submit Summary
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
