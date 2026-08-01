import type { ComponentProps } from "react";
import type { Assignment, BuilderSection } from "@/lib/types";
import { HomeworkStudio } from "./homework-studio";

interface Props {
  assignment: Assignment & { template_id: string };
  initialSections: BuilderSection[];
  classNames?: string[];
  /** When true, show only student preview (used by /preview route) */
  previewOnly?: boolean;
  resources?: ComponentProps<typeof HomeworkStudio>["resources"];
  markSchemes?: ComponentProps<typeof HomeworkStudio>["markSchemes"];
  initialComments?: ComponentProps<typeof HomeworkStudio>["initialComments"];
  commentBanks?: ComponentProps<typeof HomeworkStudio>["commentBanks"];
  selectedCommentItemIds?: ComponentProps<typeof HomeworkStudio>["selectedCommentItemIds"];
  feedbackFields?: ComponentProps<typeof HomeworkStudio>["feedbackFields"];
}

export function HomeworkBuilder({ classNames = [], ...props }: Props) {
  return <HomeworkStudio {...props} classNames={classNames} />;
}
