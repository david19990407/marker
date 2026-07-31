"use client";

import {
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from "recharts";
import type { Skill } from "@/lib/types";

export function SkillRadar({
  data,
}: {
  data: { skill: Skill; score: number }[];
}) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data}>
          <PolarGrid stroke="#e2e8f0" />
          <PolarAngleAxis dataKey="skill" tick={{ fill: "#64748b", fontSize: 11 }} />
          <Radar
            name="Skills"
            dataKey="score"
            stroke="#7c3aed"
            fill="#8b5cf6"
            fillOpacity={0.35}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
