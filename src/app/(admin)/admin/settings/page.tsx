import { PageHeader } from "@/components/ui/page-header";
import { Card, CardTitle } from "@/components/ui/card";
import { SchoolSettingsForm } from "@/components/admin/school-settings-form";
import { YearGroupsManager } from "@/components/admin/year-groups-manager";
import { SubjectsManager } from "@/components/admin/subjects-manager";
import { ClassColoursManager } from "@/components/admin/class-colours-manager";
import { SubjectIconsPanel } from "@/components/admin/subject-icons-panel";
import { requireProfile } from "@/lib/auth/get-profile";
import { createClient } from "@/lib/supabase/server";
import {
  getAllColourOptions,
  getAllSubjectOptions,
  getAllYearGroupOptions,
} from "@/lib/school/settings";

export default async function AdminSettingsPage() {
  await requireProfile(["admin"]);
  const supabase = await createClient();

  const [settingsResult, yearGroups, subjects, colours] = await Promise.all([
    supabase
      .from("school_settings")
      .select("id, school_name, platform_display_name, max_upload_bytes")
      .limit(1)
      .maybeSingle(),
    getAllYearGroupOptions(),
    getAllSubjectOptions(),
    getAllColourOptions(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="School settings"
        description="Configure branding, year groups, subjects and class colours used across the platform."
      />

      <Card>
        <CardTitle className="mb-4">Branding</CardTitle>
        <SchoolSettingsForm settings={settingsResult.data ?? undefined} />
      </Card>

      <Card>
        <CardTitle className="mb-4">Year groups</CardTitle>
        <YearGroupsManager yearGroups={yearGroups} />
      </Card>

      <Card>
        <CardTitle className="mb-4">Subjects</CardTitle>
        <SubjectsManager subjects={subjects} colours={colours} />
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardTitle className="mb-4">Class colours</CardTitle>
          <ClassColoursManager colours={colours} />
        </Card>
        <Card>
          <CardTitle className="mb-4">Subject icons</CardTitle>
          <SubjectIconsPanel />
        </Card>
      </div>
    </div>
  );
}
