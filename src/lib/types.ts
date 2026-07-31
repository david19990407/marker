export type UserRole = "student" | "teacher";

export type ExamBoard = "AQA" | "Edexcel" | "OCR" | "Eduqas" | "WJEC";
export type YearGroup = "Year 10" | "Year 11";
export type Paper =
  | "Paper 1"
  | "Paper 2"
  | "Literature Paper 1"
  | "Literature Paper 2"
  | "Language Paper 1"
  | "Language Paper 2";

export type ResourceCategory =
  | "Revision Guides"
  | "Knowledge Organisers"
  | "Model Answers"
  | "Worksheets"
  | "Videos"
  | "Past Papers"
  | "Mark Schemes"
  | "Flashcards";

export type Skill =
  | "Analysis"
  | "Evaluation"
  | "Comparison"
  | "Context"
  | "Structure"
  | "Language"
  | "Creative Writing"
  | "SPAG";

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  yearGroup?: YearGroup;
  examBoard?: ExamBoard;
  avatarInitials: string;
}

export interface Lesson {
  id: string;
  title: string;
  description: string;
  topic: string;
  examBoard: ExamBoard;
  yearGroup: YearGroup;
  paper: Paper;
  objectives: string[];
  slidesUrl?: string;
  worksheets: string[];
  videos: string[];
  homework: string;
  aiSummary: string;
  estimatedMinutes: number;
  progress: number;
  completed: boolean;
  text?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Resource {
  id: string;
  title: string;
  description: string;
  category: ResourceCategory;
  topic: string;
  examBoard: ExamBoard;
  fileType: "PDF" | "PPTX" | "DOCX" | "MP4" | "Link";
  previewText: string;
  downloads: number;
  createdAt: string;
}

export interface Quiz {
  id: string;
  title: string;
  topic: string;
  questions: QuizQuestion[];
  lessonId?: string;
}

export interface QuizQuestion {
  id: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface EssaySubmission {
  id: string;
  studentId: string;
  studentName: string;
  question: string;
  essayText: string;
  submittedAt: string;
  status: "pending" | "ai_marked" | "teacher_reviewed";
  feedback?: EssayFeedback;
  version: number;
}

export interface EssayFeedback {
  estimatedMark: number;
  outOf: number;
  estimatedLevel: string;
  ao1: number;
  ao2: number;
  ao3: number;
  ao4: number;
  strengths: string[];
  weaknesses: string[];
  improvements: string[];
  nextSteps: string[];
  teacherOverrideMark?: number;
  teacherNotes?: string;
}

export interface ProgressStats {
  overallPercent: number;
  lessonsCompleted: number;
  lessonsTotal: number;
  quizzesCompleted: number;
  essaysMarked: number;
  essaysSubmitted: number;
  averageGrade: number;
  aoProgress: {
    ao1: number;
    ao2: number;
    ao3: number;
    ao4: number;
  };
  skillRadar: { skill: Skill; score: number }[];
  weeklyProgress: { week: string; score: number }[];
  achievements: Achievement[];
  areasToImprove: string[];
  suggestedNextLessonId: string;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  earnedAt: string;
  icon: string;
}

export interface ActivityItem {
  id: string;
  type: "lesson" | "quiz" | "essay" | "coach" | "revision";
  title: string;
  description: string;
  timestamp: string;
}

export interface UpcomingTask {
  id: string;
  title: string;
  dueDate: string;
  type: "homework" | "essay" | "quiz" | "lesson";
  priority: "low" | "medium" | "high";
}

export interface Flashcard {
  id: string;
  front: string;
  back: string;
  topic: string;
}

export interface PastPaperQuestion {
  id: string;
  examBoard: ExamBoard;
  paper: Paper;
  year: number;
  question: string;
  marks: number;
  topic: string;
  modelAnswerSnippet: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
}

export interface CatchUpPack {
  lessonId: string;
  summary: string;
  keyKnowledge: string[];
  activities: string[];
  quiz: QuizQuestion[];
  practiceQuestion: string;
  homework: string;
  checklist: { id: string; label: string; done: boolean }[];
}

export interface AiSettings {
  model: string;
  temperature: number;
  systemPrompt: string;
  maxContextChunks: number;
  coachingStyle: "socratic" | "supportive" | "exam_focused";
  allowHomeworkCompletion: boolean;
}
