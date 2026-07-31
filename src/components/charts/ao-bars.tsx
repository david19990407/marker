"use client";

import { Progress } from "@/components/ui/progress";

const labels: Record<string, string> = {
  ao1: "AO1 — Knowledge & response",
  ao2: "AO2 — Analysis of methods",
  ao3: "AO3 — Context & comparisons",
  ao4: "AO4 — SPAG / accuracy",
};

export function AoBars({
  data,
}: {
  data: { ao1: number; ao2: number; ao3: number; ao4: number };
}) {
  return (
    <div className="space-y-4">
      {(Object.keys(labels) as Array<keyof typeof data>).map((key) => (
        <div key={key}>
          <div className="mb-1.5 flex items-center justify-between text-sm">
            <span className="font-medium text-slate-700">{labels[key]}</span>
            <span className="text-slate-500">{data[key]}%</span>
          </div>
          <Progress value={data[key]} />
        </div>
      ))}
    </div>
  );
}
