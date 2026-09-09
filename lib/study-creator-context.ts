type TopicIdentity = {
  id: string;
  parent_id: string | null;
};

type ConceptIdentity = {
  id: string;
  topic_id: string;
};

export type StudyCreatorSelection = {
  topicId: string | null;
  conceptId: string | null;
};

export function resolveStudyCreatorSelection({
  concepts,
  requestedConceptId,
  requestedTopicId,
  topics,
}: {
  concepts: ConceptIdentity[];
  requestedConceptId: string | null;
  requestedTopicId: string | null;
  topics: TopicIdentity[];
}): StudyCreatorSelection {
  if (!topics.length) return { topicId: null, conceptId: null };

  const requestedTopic = requestedTopicId
    ? topics.find((topic) => topic.id === requestedTopicId) ?? null
    : null;
  const requestedConcept = requestedConceptId
    ? concepts.find((concept) => concept.id === requestedConceptId) ?? null
    : null;
  const conceptTopic = requestedConcept
    ? topics.find((topic) => topic.id === requestedConcept.topic_id) ?? null
    : null;
  const topic =
    requestedTopic ||
    conceptTopic ||
    topics.find((candidate) => candidate.parent_id === null) ||
    topics[0];
  const concept =
    requestedConcept?.topic_id === topic.id
      ? requestedConcept
      : concepts.find((candidate) => candidate.topic_id === topic.id) ?? null;

  return {
    topicId: topic.id,
    conceptId: concept?.id ?? null,
  };
}
