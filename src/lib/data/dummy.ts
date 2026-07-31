import type {
  ActivityItem,
  AiSettings,
  CatchUpPack,
  EssaySubmission,
  Flashcard,
  Lesson,
  PastPaperQuestion,
  ProgressStats,
  Quiz,
  Resource,
  UpcomingTask,
  User,
} from "@/lib/types";

export const DEMO_USERS: Record<"student" | "teacher", User> = {
  student: {
    id: "user-student-1",
    email: "alex.student@school.edu",
    name: "Alex Morgan",
    role: "student",
    yearGroup: "Year 11",
    examBoard: "AQA",
    avatarInitials: "AM",
  },
  teacher: {
    id: "user-teacher-1",
    email: "ms.harper@school.edu",
    name: "Ms Harper",
    role: "teacher",
    avatarInitials: "MH",
  },
};

export const LESSONS: Lesson[] = [
  {
    id: "lesson-1",
    title: "Macbeth: Ambition and Guilt",
    description:
      "Explore how Shakespeare presents ambition and guilt through Macbeth and Lady Macbeth across Acts 1–3.",
    topic: "Macbeth",
    examBoard: "AQA",
    yearGroup: "Year 11",
    paper: "Literature Paper 1",
    objectives: [
      "Analyse key quotations linked to ambition",
      "Track guilt as a structural motif",
      "Practise AO2 language analysis",
    ],
    slidesUrl: "/resources/macbeth-ambition.pptx",
    worksheets: ["Quotation bank", "Guilt tracking grid"],
    videos: ["Lady Macbeth soliloquy walkthrough"],
    homework: "Write a PEEL paragraph on ambition in Act 1 Scene 7.",
    aiSummary:
      "This lesson focuses on ambition as a driving force and guilt as its consequence, with emphasis on imagery of blood, darkness, and sleeplessness.",
    estimatedMinutes: 45,
    progress: 100,
    completed: true,
    text: "Macbeth",
    createdAt: "2026-05-12T09:00:00Z",
    updatedAt: "2026-06-01T11:00:00Z",
  },
  {
    id: "lesson-2",
    title: "An Inspector Calls: Social Responsibility",
    description:
      "Examine Priestley’s socialist message through the Inspector and the younger generation.",
    topic: "An Inspector Calls",
    examBoard: "AQA",
    yearGroup: "Year 11",
    paper: "Literature Paper 2",
    objectives: [
      "Explain Priestley’s purpose",
      "Compare generational attitudes",
      "Use context to support AO3",
    ],
    worksheets: ["Character attitude table", "Context flashcards"],
    videos: ["1945 vs 1912 context briefing"],
    homework: "Plan an essay on social responsibility.",
    aiSummary:
      "Students learn how Priestley uses the Inspector as a moral mouthpiece and contrasts the Birlings to argue for collective responsibility.",
    estimatedMinutes: 50,
    progress: 72,
    completed: false,
    text: "An Inspector Calls",
    createdAt: "2026-05-20T09:00:00Z",
    updatedAt: "2026-06-10T10:00:00Z",
  },
  {
    id: "lesson-3",
    title: "Language Paper 1: Question 2 Methods",
    description:
      "Master language analysis for AQA Language Paper 1 Question 2 with focused method spotting.",
    topic: "Language Analysis",
    examBoard: "AQA",
    yearGroup: "Year 10",
    paper: "Language Paper 1",
    objectives: [
      "Identify language methods accurately",
      "Explain effects with precision",
      "Write a timed Q2 response",
    ],
    worksheets: ["Method spotting sheet", "Effect bank"],
    videos: ["Q2 mark scheme explained"],
    homework: "Complete a 10-mark practice Q2.",
    aiSummary:
      "A skills lesson on identifying diction, imagery, and sentence forms, then explaining reader effects clearly.",
    estimatedMinutes: 40,
    progress: 35,
    completed: false,
    createdAt: "2026-06-02T09:00:00Z",
    updatedAt: "2026-06-15T09:00:00Z",
  },
  {
    id: "lesson-4",
    title: "Power and Conflict: Exposure",
    description:
      "Analyse Owen’s presentation of weather, suffering, and futility in Exposure.",
    topic: "Power and Conflict",
    examBoard: "AQA",
    yearGroup: "Year 11",
    paper: "Literature Paper 2",
    objectives: [
      "Annotate form and structure",
      "Link weather imagery to theme",
      "Compare with another war poem",
    ],
    worksheets: ["Annotation guide", "Comparison planner"],
    videos: ["Exposure reading with notes"],
    homework: "Compare Exposure with Charge of the Light Brigade (one paragraph).",
    aiSummary:
      "Students explore how Owen uses nature as an antagonist and structural repetition to convey endless suffering.",
    estimatedMinutes: 55,
    progress: 0,
    completed: false,
    text: "Exposure",
    createdAt: "2026-06-18T09:00:00Z",
    updatedAt: "2026-06-18T09:00:00Z",
  },
  {
    id: "lesson-5",
    title: "Creative Writing: Narrative Openings",
    description:
      "Craft compelling narrative openings using atmosphere, character hooks, and controlled pacing.",
    topic: "Creative Writing",
    examBoard: "AQA",
    yearGroup: "Year 10",
    paper: "Language Paper 1",
    objectives: [
      "Open with atmosphere",
      "Vary sentence length for pace",
      "Avoid exposition dumps",
    ],
    worksheets: ["Opening toolkit", "Peer feedback checklist"],
    videos: ["Three opening techniques"],
    homework: "Write a 250-word narrative opening.",
    aiSummary:
      "Focuses on hooking the reader quickly while demonstrating control of tone and structure for AO5/AO6.",
    estimatedMinutes: 45,
    progress: 20,
    completed: false,
    createdAt: "2026-06-22T09:00:00Z",
    updatedAt: "2026-06-22T09:00:00Z",
  },
  {
    id: "lesson-6",
    title: "Jekyll and Hyde: Duality",
    description:
      "Investigate Stevenson’s presentation of duality through setting, character, and Victorian anxiety.",
    topic: "Jekyll and Hyde",
    examBoard: "AQA",
    yearGroup: "Year 11",
    paper: "Literature Paper 1",
    objectives: [
      "Explain duality as a central theme",
      "Analyse setting as character",
      "Use Victorian context effectively",
    ],
    worksheets: ["Duality quotation pack", "Fog and London map"],
    videos: ["Victorian science and reputation"],
    homework: "Annotate the Carew murder chapter for duality.",
    aiSummary:
      "Students connect Hyde’s violence to repressed desire and the fear of scientific overreach in Victorian London.",
    estimatedMinutes: 50,
    progress: 0,
    completed: false,
    text: "Jekyll and Hyde",
    createdAt: "2026-06-25T09:00:00Z",
    updatedAt: "2026-06-25T09:00:00Z",
  },
];

export const RESOURCES: Resource[] = [
  {
    id: "res-1",
    title: "Macbeth Knowledge Organiser",
    description: "Characters, themes, and high-value quotations on one page.",
    category: "Knowledge Organisers",
    topic: "Macbeth",
    examBoard: "AQA",
    fileType: "PDF",
    previewText:
      "Key themes: Ambition, Guilt, Supernatural, Gender, Fate vs Free Will...",
    downloads: 214,
    createdAt: "2026-05-01T10:00:00Z",
  },
  {
    id: "res-2",
    title: "Inspector Calls Model Answer (Grade 8)",
    description: "Annotated model essay on social responsibility.",
    category: "Model Answers",
    topic: "An Inspector Calls",
    examBoard: "AQA",
    fileType: "PDF",
    previewText:
      "Priestley presents social responsibility as a moral imperative through the Inspector’s interrogation...",
    downloads: 189,
    createdAt: "2026-05-08T10:00:00Z",
  },
  {
    id: "res-3",
    title: "Language Paper 1 Revision Guide",
    description: "Question-by-question strategy for reading and writing.",
    category: "Revision Guides",
    topic: "Language Analysis",
    examBoard: "AQA",
    fileType: "PDF",
    previewText: "Q2: Identify methods → explain effect → support with short quotes...",
    downloads: 301,
    createdAt: "2026-05-15T10:00:00Z",
  },
  {
    id: "res-4",
    title: "Power & Conflict Flashcards",
    description: "40 flashcards covering poems, methods, and comparisons.",
    category: "Flashcards",
    topic: "Power and Conflict",
    examBoard: "AQA",
    fileType: "PDF",
    previewText: "Front: What does Owen personify in Exposure? Back: The weather...",
    downloads: 156,
    createdAt: "2026-05-20T10:00:00Z",
  },
  {
    id: "res-5",
    title: "AQA Literature Paper 1 Past Paper 2023",
    description: "Full past paper with extract and essay options.",
    category: "Past Papers",
    topic: "Macbeth",
    examBoard: "AQA",
    fileType: "PDF",
    previewText: "Section A Shakespeare · Section B 19th-century novel...",
    downloads: 278,
    createdAt: "2026-06-01T10:00:00Z",
  },
  {
    id: "res-6",
    title: "Creative Writing Worksheets",
    description: "Sentence craft, sensory detail, and structure drills.",
    category: "Worksheets",
    topic: "Creative Writing",
    examBoard: "AQA",
    fileType: "DOCX",
    previewText: "Exercise 1: Rewrite the bland opening using weather and sound...",
    downloads: 97,
    createdAt: "2026-06-05T10:00:00Z",
  },
  {
    id: "res-7",
    title: "Mark Scheme: Macbeth Ambition Essay",
    description: "Level descriptors and examiner commentary.",
    category: "Mark Schemes",
    topic: "Macbeth",
    examBoard: "AQA",
    fileType: "PDF",
    previewText: "Level 6: Critical, exploratory, conceptualised response...",
    downloads: 142,
    createdAt: "2026-06-08T10:00:00Z",
  },
  {
    id: "res-8",
    title: "Jekyll Duality Explainer Video",
    description: "12-minute walkthrough of duality and Victorian context.",
    category: "Videos",
    topic: "Jekyll and Hyde",
    examBoard: "AQA",
    fileType: "MP4",
    previewText: "Timestamps: 0:00 Duality · 3:20 Setting · 7:10 Context...",
    downloads: 88,
    createdAt: "2026-06-12T10:00:00Z",
  },
];

export const QUIZZES: Quiz[] = [
  {
    id: "quiz-1",
    title: "Macbeth Ambition Check",
    topic: "Macbeth",
    lessonId: "lesson-1",
    questions: [
      {
        id: "q1",
        prompt: "Which quotation best shows Macbeth’s ambition early in the play?",
        options: [
          "“Fair is foul, and foul is fair”",
          "“I have no spur / To prick the sides of my intent, but only / Vaulting ambition”",
          "“What’s done cannot be undone”",
          "“Out, damned spot!”",
        ],
        correctIndex: 1,
        explanation:
          "Macbeth explicitly names “vaulting ambition” as his only motive in Act 1 Scene 7.",
      },
      {
        id: "q2",
        prompt: "How does Shakespeare often present guilt in Macbeth?",
        options: [
          "Through comic relief alone",
          "Through blood and sleeplessness imagery",
          "Through stage directions about weather only",
          "Through long soliloquies about school",
        ],
        correctIndex: 1,
        explanation:
          "Blood and sleeplessness recur as motifs of guilt for both Macbeth and Lady Macbeth.",
      },
    ],
  },
  {
    id: "quiz-2",
    title: "Inspector Calls Context",
    topic: "An Inspector Calls",
    lessonId: "lesson-2",
    questions: [
      {
        id: "q3",
        prompt: "Why is 1945 an important context for the play?",
        options: [
          "It was Shakespeare’s lifetime",
          "Priestley wrote for a post-war audience open to social change",
          "It was before the Industrial Revolution",
          "It marks the invention of the novel",
        ],
        correctIndex: 1,
        explanation:
          "Priestley wrote in 1945, urging audiences towards welfare-state values after WWII.",
      },
    ],
  },
];

export const FLASHCARDS: Flashcard[] = [
  {
    id: "fc-1",
    front: "What is AO2 in GCSE English Literature?",
    back: "Analysis of language, form and structure — how the writer’s methods create meaning.",
    topic: "Exam Skills",
  },
  {
    id: "fc-2",
    front: "Macbeth: “Vaulting ambition”",
    back: "Shows ambition as uncontrolled and self-destructive — like a rider who leaps too far and falls.",
    topic: "Macbeth",
  },
  {
    id: "fc-3",
    front: "Priestley’s purpose in An Inspector Calls?",
    back: "To promote social responsibility and criticise capitalist selfishness through the Inspector and the younger generation.",
    topic: "An Inspector Calls",
  },
  {
    id: "fc-4",
    front: "What does Owen personify in Exposure?",
    back: "The weather — nature becomes an enemy more deadly than human opponents.",
    topic: "Power and Conflict",
  },
  {
    id: "fc-5",
    front: "Jekyll and Hyde: duality",
    back: "The split between public respectability and private desire; Hyde embodies repressed impulses.",
    topic: "Jekyll and Hyde",
  },
];

export const PAST_PAPER_QUESTIONS: PastPaperQuestion[] = [
  {
    id: "pp-1",
    examBoard: "AQA",
    paper: "Literature Paper 1",
    year: 2023,
    question:
      "Starting with this extract, explore how Shakespeare presents ambition in Macbeth.",
    marks: 30,
    topic: "Macbeth",
    modelAnswerSnippet:
      "Shakespeare presents ambition as a corrupting force that unsettles natural order...",
  },
  {
    id: "pp-2",
    examBoard: "AQA",
    paper: "Literature Paper 2",
    year: 2022,
    question:
      "How does Priestley present ideas about social responsibility in An Inspector Calls?",
    marks: 30,
    topic: "An Inspector Calls",
    modelAnswerSnippet:
      "Priestley uses the Inspector as a collective conscience to challenge the Birlings’ individualism...",
  },
  {
    id: "pp-3",
    examBoard: "AQA",
    paper: "Literature Paper 2",
    year: 2024,
    question:
      "Compare how poets present the effects of conflict in Exposure and one other poem.",
    marks: 30,
    topic: "Power and Conflict",
    modelAnswerSnippet:
      "Both Owen and Tennyson present conflict as devastating, yet Owen emphasises futility while Tennyson explores...",
  },
];

export const ESSAY_SUBMISSIONS: EssaySubmission[] = [
  {
    id: "essay-1",
    studentId: "user-student-1",
    studentName: "Alex Morgan",
    question:
      "Starting with this extract, explore how Shakespeare presents ambition in Macbeth.",
    essayText:
      "Shakespeare presents ambition as a powerful and destructive force in Macbeth. From the beginning, Macbeth is tempted by the witches’ prophecy and begins to consider murdering Duncan. In Act 1 Scene 7, Macbeth admits he has ‘no spur to prick the sides of my intent, but only vaulting ambition’. This metaphor of horse-riding suggests his ambition is uncontrolled and will cause him to fall. Lady Macbeth also fuels his ambition by attacking his masculinity. Overall, ambition leads to guilt and chaos in Scotland.",
    submittedAt: "2026-07-20T14:30:00Z",
    status: "ai_marked",
    version: 1,
    feedback: {
      estimatedMark: 21,
      outOf: 30,
      estimatedLevel: "Level 5",
      ao1: 7,
      ao2: 6,
      ao3: 5,
      ao4: 3,
      strengths: [
        "Clear argument that ambition is destructive",
        "Good use of the ‘vaulting ambition’ quotation",
        "Some awareness of Lady Macbeth’s influence",
      ],
      weaknesses: [
        "Analysis of methods could go deeper (metaphor/structure)",
        "Limited context linked to Jacobean ideas of kingship",
        "Conclusion restates rather than conceptualises",
      ],
      improvements: [
        "Zoom in on ‘vaulting’ — what does the failed leap imply?",
        "Add one precise contextual point about Divine Right / natural order",
        "Develop a second quotation with equally detailed AO2",
      ],
      nextSteps: [
        "Rewrite one body paragraph with deeper method analysis",
        "Add a short AO3 sentence after your key quotation",
        "Practise a Level 6 conclusion that answers ‘so what?’",
      ],
    },
  },
  {
    id: "essay-2",
    studentId: "user-student-2",
    studentName: "Jordan Lee",
    question:
      "How does Priestley present ideas about social responsibility in An Inspector Calls?",
    essayText:
      "Priestley presents social responsibility as important. The Inspector tells the Birlings that they are responsible for Eva Smith. Mr Birling only cares about money and says a man has to look after himself. Sheila feels guilty and changes. This shows the younger generation can learn.",
    submittedAt: "2026-07-22T16:10:00Z",
    status: "pending",
    version: 1,
  },
];

export const PROGRESS: ProgressStats = {
  overallPercent: 68,
  lessonsCompleted: 1,
  lessonsTotal: 6,
  quizzesCompleted: 4,
  essaysMarked: 3,
  essaysSubmitted: 4,
  averageGrade: 22,
  aoProgress: { ao1: 72, ao2: 64, ao3: 58, ao4: 80 },
  skillRadar: [
    { skill: "Analysis", score: 70 },
    { skill: "Evaluation", score: 62 },
    { skill: "Comparison", score: 55 },
    { skill: "Context", score: 58 },
    { skill: "Structure", score: 66 },
    { skill: "Language", score: 74 },
    { skill: "Creative Writing", score: 60 },
    { skill: "SPAG", score: 82 },
  ],
  weeklyProgress: [
    { week: "W1", score: 42 },
    { week: "W2", score: 48 },
    { week: "W3", score: 55 },
    { week: "W4", score: 58 },
    { week: "W5", score: 63 },
    { week: "W6", score: 68 },
  ],
  achievements: [
    {
      id: "ach-1",
      title: "First Essay Marked",
      description: "Submitted your first essay for AI feedback",
      earnedAt: "2026-06-10T12:00:00Z",
      icon: "quill",
    },
    {
      id: "ach-2",
      title: "Quiz Streak",
      description: "Completed 3 quizzes in one week",
      earnedAt: "2026-06-18T12:00:00Z",
      icon: "flame",
    },
    {
      id: "ach-3",
      title: "Macbeth Master",
      description: "Finished the Ambition and Guilt lesson",
      earnedAt: "2026-06-01T12:00:00Z",
      icon: "book",
    },
  ],
  areasToImprove: [
    "AO3 context in literature essays",
    "Comparison structure for Power & Conflict",
    "Deeper AO2 method analysis",
  ],
  suggestedNextLessonId: "lesson-2",
};

export const RECENT_ACTIVITY: ActivityItem[] = [
  {
    id: "act-1",
    type: "essay",
    title: "Essay feedback ready",
    description: "Macbeth ambition essay scored 21/30",
    timestamp: "2026-07-20T14:35:00Z",
  },
  {
    id: "act-2",
    type: "lesson",
    title: "Continued learning",
    description: "An Inspector Calls — 72% complete",
    timestamp: "2026-07-19T18:20:00Z",
  },
  {
    id: "act-3",
    type: "quiz",
    title: "Quiz completed",
    description: "Macbeth Ambition Check — 2/2",
    timestamp: "2026-07-18T16:05:00Z",
  },
  {
    id: "act-4",
    type: "coach",
    title: "AI Coach session",
    description: "Asked about vaulting ambition imagery",
    timestamp: "2026-07-17T20:10:00Z",
  },
  {
    id: "act-5",
    type: "revision",
    title: "Flashcards reviewed",
    description: "12 Power & Conflict cards",
    timestamp: "2026-07-16T19:40:00Z",
  },
];

export const UPCOMING_TASKS: UpcomingTask[] = [
  {
    id: "task-1",
    title: "Finish Inspector Calls lesson",
    dueDate: "2026-08-02",
    type: "lesson",
    priority: "high",
  },
  {
    id: "task-2",
    title: "PEEL paragraph homework",
    dueDate: "2026-08-03",
    type: "homework",
    priority: "medium",
  },
  {
    id: "task-3",
    title: "Language Paper 1 Q2 practice",
    dueDate: "2026-08-05",
    type: "quiz",
    priority: "medium",
  },
  {
    id: "task-4",
    title: "Resubmit Macbeth essay improvements",
    dueDate: "2026-08-07",
    type: "essay",
    priority: "high",
  },
];

export const CATCH_UP_PACKS: Record<string, CatchUpPack> = {
  "lesson-4": {
    lessonId: "lesson-4",
    summary:
      "Owen’s Exposure presents war as endless suffering where nature, not just the enemy, destroys soldiers. Repetition and bleak imagery emphasise futility.",
    keyKnowledge: [
      "Weather is personified as an antagonist",
      "Refrain ‘But nothing happens’ conveys futility",
      "Half-rhyme and irregular rhythm mirror discomfort",
      "Compare with Charge of the Light Brigade for contrasting attitudes to war",
    ],
    activities: [
      "Annotate stanza 1 for weather imagery",
      "Track the refrain across the poem",
      "List three comparison points with another war poem",
    ],
    quiz: [
      {
        id: "cu-q1",
        prompt: "What does the refrain ‘But nothing happens’ emphasise?",
        options: ["Victory", "Futility and waiting", "Celebration", "Romance"],
        correctIndex: 1,
        explanation: "The refrain stresses endless waiting and the futility of conflict.",
      },
      {
        id: "cu-q2",
        prompt: "How is nature presented in Exposure?",
        options: [
          "As comforting",
          "As a hostile force",
          "As irrelevant",
          "As comic relief",
        ],
        correctIndex: 1,
        explanation: "Owen personifies nature as more deadly than human enemies.",
      },
    ],
    practiceQuestion:
      "How does Owen present the suffering of soldiers in Exposure? Use evidence from the poem.",
    homework:
      "Write one comparison paragraph linking Exposure to Charge of the Light Brigade.",
    checklist: [
      { id: "c1", label: "Read the lesson summary", done: false },
      { id: "c2", label: "Review key knowledge points", done: false },
      { id: "c3", label: "Complete the catch-up quiz", done: false },
      { id: "c4", label: "Attempt the practice question", done: false },
      { id: "c5", label: "Finish homework task", done: false },
    ],
  },
  "lesson-6": {
    lessonId: "lesson-6",
    summary:
      "Stevenson explores duality through Jekyll’s respectable public self and Hyde’s violent private self, reflecting Victorian anxieties about reputation and science.",
    keyKnowledge: [
      "Duality = split between appearance and reality",
      "London fog and night settings mirror moral obscurity",
      "Hyde represents repressed desire",
      "Context: Victorian reputation culture and evolutionary fear",
    ],
    activities: [
      "Create a duality mind map for Jekyll/Hyde",
      "Find two setting quotations linked to secrecy",
      "Write a context sentence suitable for AO3",
    ],
    quiz: [
      {
        id: "cu-q3",
        prompt: "What does Hyde primarily symbolise?",
        options: [
          "Scientific progress",
          "Repressed and immoral desire",
          "Loyalty to friends",
          "Comic entertainment",
        ],
        correctIndex: 1,
        explanation: "Hyde embodies the repressed, immoral side of human nature.",
      },
    ],
    practiceQuestion:
      "How does Stevenson present duality in The Strange Case of Dr Jekyll and Mr Hyde?",
    homework: "Annotate the Carew murder chapter for duality and setting.",
    checklist: [
      { id: "c1", label: "Read the lesson summary", done: false },
      { id: "c2", label: "Review key knowledge points", done: false },
      { id: "c3", label: "Complete the catch-up quiz", done: false },
      { id: "c4", label: "Attempt the practice question", done: false },
      { id: "c5", label: "Finish homework task", done: false },
    ],
  },
};

export const AI_SETTINGS: AiSettings = {
  model: "gpt-4o-mini",
  temperature: 0.4,
  systemPrompt:
    "You are LitCoach AI, a GCSE English coach. Answer only GCSE English questions. Use uploaded lesson content as primary knowledge. Explain concepts, ask coaching questions, suggest quotations, and recommend revision. Never complete homework or rewrite whole essays.",
  maxContextChunks: 6,
  coachingStyle: "socratic",
  allowHomeworkCompletion: false,
};

export const WEAK_TOPICS = [
  { topic: "AO3 Context", reason: "Lowest AO score (58%)", priority: "high" as const },
  {
    topic: "Power and Conflict comparison",
    reason: "No lessons completed yet",
    priority: "high" as const,
  },
  {
    topic: "Deeper AO2 analysis",
    reason: "Essay feedback pattern",
    priority: "medium" as const,
  },
];

export const EXAM_QUESTIONS = [
  "Starting with this extract, explore how Shakespeare presents ambition in Macbeth.",
  "How does Priestley present ideas about social responsibility in An Inspector Calls?",
  "Explore how Stevenson presents duality in Jekyll and Hyde.",
  "Compare how poets present the effects of conflict in Exposure and one other poem.",
  "How does the writer use language to describe the setting in this extract? (Language Paper 1 Q2)",
];

/** Simple keyword index over lessons for RAG demo / fallback. */
export function searchLessonChunks(query: string, limit = 4) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const scored = LESSONS.map((lesson) => {
    const haystack = [
      lesson.title,
      lesson.description,
      lesson.topic,
      lesson.aiSummary,
      ...lesson.objectives,
      lesson.homework,
    ]
      .join(" ")
      .toLowerCase();
    const score = terms.reduce(
      (acc, term) => acc + (haystack.includes(term) ? 1 : 0),
      0,
    );
    return {
      lessonId: lesson.id,
      title: lesson.title,
      topic: lesson.topic,
      content: `${lesson.aiSummary}\n\nObjectives: ${lesson.objectives.join("; ")}\nHomework: ${lesson.homework}`,
      score,
    };
  })
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  if (scored.length === 0) {
    return LESSONS.slice(0, limit).map((lesson) => ({
      lessonId: lesson.id,
      title: lesson.title,
      topic: lesson.topic,
      content: lesson.aiSummary,
      score: 0,
    }));
  }
  return scored;
}
