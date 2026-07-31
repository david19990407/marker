"use client";

import { useMemo, useState } from "react";
import { Download, Eye, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { RESOURCES } from "@/lib/data/dummy";
import type { Resource, ResourceCategory } from "@/lib/types";

const categories: Array<ResourceCategory | "All"> = [
  "All",
  "Revision Guides",
  "Knowledge Organisers",
  "Model Answers",
  "Worksheets",
  "Videos",
  "Past Papers",
  "Mark Schemes",
  "Flashcards",
];

export default function ResourcesPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<(typeof categories)[number]>("All");
  const [preview, setPreview] = useState<Resource | null>(RESOURCES[0]);

  const filtered = useMemo(
    () =>
      RESOURCES.filter((resource) => {
        const matchesCategory =
          category === "All" || resource.category === category;
        const matchesQuery =
          !query ||
          `${resource.title} ${resource.description} ${resource.topic}`
            .toLowerCase()
            .includes(query.toLowerCase());
        return matchesCategory && matchesQuery;
      }),
    [category, query],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Resources"
        description="Searchable library of revision guides, organisers, model answers, worksheets, videos and past papers."
      />

      <Card>
        <div className="flex flex-col gap-3 lg:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="pl-9"
              placeholder="Search resources..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {categories.map((item) => (
            <button
              key={item}
              onClick={() => setCategory(item)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                category === item
                  ? "bg-brand-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map((resource) => (
            <Card key={resource.id} className="flex flex-col">
              <div className="mb-3 flex flex-wrap gap-2">
                <Badge>{resource.category}</Badge>
                <Badge tone="neutral">{resource.fileType}</Badge>
              </div>
              <CardTitle>{resource.title}</CardTitle>
              <CardDescription className="mt-2 flex-1">
                {resource.description}
              </CardDescription>
              <p className="mt-3 text-xs text-slate-400">
                {resource.topic} · {resource.examBoard} · {resource.downloads} downloads
              </p>
              <div className="mt-4 flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setPreview(resource)}
                >
                  <Eye className="h-4 w-4" /> Preview
                </Button>
                <Button size="sm" variant="outline">
                  <Download className="h-4 w-4" /> Download
                </Button>
              </div>
            </Card>
          ))}
        </div>

        <Card className="h-fit xl:sticky xl:top-24">
          <CardTitle className="mb-2">Preview</CardTitle>
          {preview ? (
            <>
              <CardDescription>{preview.title}</CardDescription>
              <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 p-5">
                <p className="text-sm leading-7 text-slate-700">
                  {preview.previewText}
                </p>
                <p className="mt-4 text-xs text-slate-400">
                  Demo preview — connect Supabase Storage for real file previews.
                </p>
              </div>
              <Button className="mt-4 w-full">
                <Download className="h-4 w-4" /> Download {preview.fileType}
              </Button>
            </>
          ) : (
            <CardDescription>Select a resource to preview.</CardDescription>
          )}
        </Card>
      </div>
    </div>
  );
}
