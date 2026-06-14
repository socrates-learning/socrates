export type Concept = {
  id: string;
  name: string;
  type: string | null;
  importance: string | null;
  difficulty: string | null;
  estimated_time: string | null;
  summary: string | null;
  why_it_matters: string | null;
};

export type LearningObject = {
  id: string;
  concept_id: string;
  object_type: string;
  prompt: string;
  answer: string | null;
  submastery_area: string | null;
};
