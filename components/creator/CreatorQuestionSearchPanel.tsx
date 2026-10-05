'use client';

import type { FormEvent } from 'react';
import { questionMarkdownSummary } from '@/components/MarkdownContent';
import { Search } from 'lucide-react';
import { createCreatorEntityKey } from '@/lib/creator-entity-contracts';
import type { ExistingQuestion, QuestionSearchFilters, QuestionSearchCursor } from '../CreatorStudioV2Client';
import styles from '../CreatorStudioV2Client.module.css';

type QuestionDifficulty = QuestionSearchFilters['difficulty'];
type LifecycleStatus = QuestionSearchFilters['status'];

type Props = {
  questionSearchResults: ExistingQuestion[];
  questionSearchHasMore: boolean;
  submitQuestionSearch: (event: FormEvent<HTMLFormElement>) => void;
  questionSearchFilters: QuestionSearchFilters;
  updateQuestionSearchFilter: <K extends keyof QuestionSearchFilters>(key: K, value: QuestionSearchFilters[K]) => void;
  isLearnerReadOnly: boolean;
  prerequisiteConceptOptions: Array<{ id: string; name: string }>;
  availableTags: Array<{ id: string; name: string; status: string }>;
  testingAngleOptions: string[];
  testingAngleVocabulary?: Array<{ display_name: string; storage_key: string; reserved_names: string[] }>;
  testingAngleLabel?: (key: string) => string;
  resolveTestingAngleFilter?: (value: string) => string;
  isSearchingQuestions: boolean;
  clearQuestionSearch: () => void;
  questionSearchError: string;
  personalCardEditorId: string | null;
  questionId: string | null;
  appliedQuestionSearchFilters: QuestionSearchFilters;
  isSavingQuestion: boolean;
  selectQuestionSearchResult: (question: ExistingQuestion) => void;
  questionSearchCursor: QuestionSearchCursor | null;
  loadMoreQuestionSearchResults: () => void;
};

// Presentation only: Library requests, selection and draft ownership stay in Creator.
export function CreatorQuestionSearchPanel({
  questionSearchResults,
  questionSearchHasMore,
  submitQuestionSearch,
  questionSearchFilters,
  updateQuestionSearchFilter,
  isLearnerReadOnly,
  prerequisiteConceptOptions,
  availableTags,
  testingAngleOptions,
  testingAngleVocabulary = [],
  testingAngleLabel = value => value,
  resolveTestingAngleFilter = value => value,
  isSearchingQuestions,
  clearQuestionSearch,
  questionSearchError,
  personalCardEditorId,
  questionId,
  appliedQuestionSearchFilters,
  isSavingQuestion,
  selectQuestionSearchResult,
  questionSearchCursor,
  loadMoreQuestionSearchResults,
}: Props) {
  return (
    <section
      className={`${styles.panel} ${styles.questionSearchPanel}`}
      aria-labelledby="library-question-search-heading"
    >
      <div className={styles.questionSearchHeading}>
        <div>
          <h2 id="library-question-search-heading">
            Library Question Search
          </h2>
          <p>
            Find any Question in the active Library, then load it in
            the Questions editor.
          </p>
        </div>
        <span className={styles.questionSearchCount}>
          {questionSearchResults.length}
          {questionSearchHasMore ? '+' : ''} loaded · newest first
        </span>
      </div>

      <form
        className={styles.questionSearchForm}
        onSubmit={submitQuestionSearch}
      >
        <label className={styles.questionSearchText}>
          <span>Question text</span>
          <input
            type="search"
            name="question-search-text"
            value={questionSearchFilters.text}
            onChange={(event) =>
              updateQuestionSearchFilter('text', event.target.value)
            }
            placeholder="Search question, answer, or explanation"
          />
        </label>

        <div className={styles.questionSearchFilters}>
          <label>
            <span>Difficulty</span>
            <select
              name="question-search-difficulty"
              value={questionSearchFilters.difficulty}
              onChange={(event) =>
                updateQuestionSearchFilter(
                  'difficulty',
                  event.target.value as '' | QuestionDifficulty
                )
              }
            >
              <option value="">All difficulties</option>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </label>

          <label>
            <span>Primary Testing Angle</span>
            <input
              type="search"
              name="question-search-primary-angle"
              list="question-search-angle-options"
              value={questionSearchFilters.primaryTestingAngle}
              onChange={(event) =>
                updateQuestionSearchFilter(
                  'primaryTestingAngle',
                  event.target.value
                )
              }
              placeholder="All primary angles"
            />
          </label>

          <label>
            <span>Additional Testing Angle</span>
            <input
              type="search"
              name="question-search-additional-angle"
              list="question-search-angle-options"
              value={questionSearchFilters.additionalTestingAngle}
              disabled={isLearnerReadOnly}
              title={isLearnerReadOnly ? 'Additional Testing Angles are authoring-only metadata.' : undefined}
              onChange={(event) =>
                updateQuestionSearchFilter(
                  'additionalTestingAngle',
                  event.target.value
                )
              }
              placeholder="All additional angles"
            />
          </label>

          <label>
            <span>Primary Concept</span>
            <select
              name="question-search-primary-concept"
              value={questionSearchFilters.primaryConceptId}
              onChange={(event) =>
                updateQuestionSearchFilter(
                  'primaryConceptId',
                  event.target.value
                )
              }
            >
              <option value="">All primary Concepts</option>
              {prerequisiteConceptOptions.map((conceptOption) => (
                <option
                  key={`primary-concept-search-${conceptOption.id}`}
                  value={conceptOption.id}
                >
                  {conceptOption.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Related Concept</span>
            <select
              name="question-search-related-concept"
              value={questionSearchFilters.relatedConceptId}
              disabled={isLearnerReadOnly}
              title={isLearnerReadOnly ? 'Related Concepts are authoring-only metadata.' : undefined}
              onChange={(event) =>
                updateQuestionSearchFilter(
                  'relatedConceptId',
                  event.target.value
                )
              }
            >
              <option value="">All related Concepts</option>
              {prerequisiteConceptOptions.map((conceptOption) => (
                <option
                  key={`related-concept-search-${conceptOption.id}`}
                  value={conceptOption.id}
                >
                  {conceptOption.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Status</span>
            <select
              name="question-search-status"
              value={isLearnerReadOnly ? 'published' : questionSearchFilters.status}
              disabled={isLearnerReadOnly}
              onChange={(event) =>
                updateQuestionSearchFilter(
                  'status',
                  event.target.value as '' | LifecycleStatus
                )
              }
            >
              <option value="">All statuses</option>
              <option value="published">Published</option>
              <option value="draft">Draft</option>
              <option value="archived">Archived</option>
            </select>
          </label>

          <label>
            <span>Tag</span>
            <select
              name="question-search-tag"
              value={questionSearchFilters.tagId}
              onChange={(event) =>
                updateQuestionSearchFilter('tagId', event.target.value)
              }
            >
              <option value="">All tags</option>
              {availableTags.map((tag) => (
                <option key={`tag-search-${tag.id}`} value={tag.id}>
                  {tag.name}
                  {tag.status === 'archived' ? ' (Archived)' : ''}
                </option>
              ))}
            </select>
          </label>
        </div>

        <datalist id="question-search-angle-options">
          {Array.from(
            new Set([
              ...testingAngleOptions,
              ...testingAngleVocabulary.flatMap(entry => [entry.display_name, entry.storage_key, ...entry.reserved_names]),
              ...questionSearchResults.flatMap((question) => [
                question.testingAngle,
                ...question.additionalTestingAngles,
              ]),
            ])
          )
          .filter((angle): angle is string => Boolean(angle))
            .sort((left, right) => left.localeCompare(right))
            .map((angle) => (
              <option key={`question-search-angle-${angle}`} value={angle} />
            ))}
        </datalist>

        <div className={styles.questionSearchActions}>
          <button
            className={styles.primaryButton}
            type="submit"
            disabled={isSearchingQuestions}
          >
            <Search size={17} />
            {isSearchingQuestions ? 'Searching…' : 'Search Questions'}
          </button>
          <button
            className={styles.secondaryButton}
            type="button"
            disabled={isSearchingQuestions}
            onClick={clearQuestionSearch}
          >
            Clear filters
          </button>
        </div>
      </form>

      {questionSearchError ? (
        <div
          className={`${styles.status} ${styles.error} ${styles.questionSearchStatus}`}
          role="alert"
        >
          {questionSearchError}
        </div>
      ) : (
        <div
          className={styles.questionSearchResults}
          aria-label="Library Question search results"
          aria-busy={isSearchingQuestions}
          tabIndex={0}
        >
          {questionSearchResults.map((question) => {
            const isSelected = question.source === 'personal'
              ? question.id === personalCardEditorId
              : question.id === questionId;
            const primaryConceptMatch =
              appliedQuestionSearchFilters.primaryConceptId ===
              question.conceptId;
            const relatedConceptMatch =
              Boolean(appliedQuestionSearchFilters.relatedConceptId) &&
              question.relatedConceptIds.includes(
                appliedQuestionSearchFilters.relatedConceptId
              );
            const primaryAngleMatch =
              Boolean(
                appliedQuestionSearchFilters.primaryTestingAngle
              ) &&
                question.testingAngle?.toLocaleLowerCase() ===
                resolveTestingAngleFilter(appliedQuestionSearchFilters.primaryTestingAngle).toLocaleLowerCase();
            const additionalAngleMatch =
              Boolean(
                appliedQuestionSearchFilters.additionalTestingAngle
              ) &&
              question.additionalTestingAngles.some(
                (angle) =>
                  angle.toLocaleLowerCase() ===
                  resolveTestingAngleFilter(appliedQuestionSearchFilters.additionalTestingAngle).toLocaleLowerCase()
              );

            return (
              <button
                className={styles.questionSearchResult}
                key={createCreatorEntityKey(
                  question.source,
                  question.kind,
                  question.id
                )}
                type="button"
                aria-pressed={isSelected}
                disabled={isSavingQuestion}
                onClick={() => selectQuestionSearchResult(question)}
              >
                <span className={styles.questionSearchPrompt}>
                  {(question.source === 'official' ? questionMarkdownSummary(question.prompt, question.promptFormat) : question.prompt) || 'Untitled Question'}
                </span>
                <span className={styles.questionSearchMetadata}>
                  <span>{question.status || 'Lifecycle · N/A'}</span>
                  <span>{question.difficulty || 'Difficulty · N/A'}</span>
                  {question.conceptId && <span>
                    Primary Concept: {question.primaryConceptName}
                  </span>}
                  <span>
                    Primary Angle: {testingAngleLabel(question.testingAngle || '') || 'N/A'}
                  </span>
                  {question.relatedConcepts.length > 0 && (
                    <span>
                      Related:{' '}
                      {question.relatedConcepts
                        .map((conceptOption) => conceptOption.name)
                        .join(', ')}
                    </span>
                  )}
                  {question.additionalTestingAngles.length > 0 && (
                    <span>
                      Additional:{' '}
                      {question.additionalTestingAngles.map(testingAngleLabel).join(', ')}
                    </span>
                  )}
                  {question.tags.length > 0 && (
                    <span>
                      Tags:{' '}
                      {question.tags
                        .map(
                          (tag) =>
                            `${tag.name}${
                              tag.status === 'archived'
                                ? ' (Archived)'
                                : ''
                            }`
                        )
                        .join(', ')}
                    </span>
                  )}
                </span>
                {(primaryConceptMatch ||
                  relatedConceptMatch ||
                  primaryAngleMatch ||
                  additionalAngleMatch) && (
                  <span className={styles.questionSearchMatches}>
                    {primaryConceptMatch && (
                      <span>Primary Concept match</span>
                    )}
                    {relatedConceptMatch && (
                      <span>Related Concept match</span>
                    )}
                    {primaryAngleMatch && (
                      <span>Primary Angle match</span>
                    )}
                    {additionalAngleMatch && (
                      <span>Additional Angle match</span>
                    )}
                  </span>
                )}
              </button>
            );
          })}
          {!questionSearchResults.length && !isSearchingQuestions && (
            <p className={styles.emptySelection}>
              No Questions match these Library filters.
            </p>
          )}
          {isSearchingQuestions && !questionSearchResults.length && (
            <p className={styles.emptySelection}>
              Loading Library Questions…
            </p>
          )}
        </div>
      )}

      {questionSearchHasMore && questionSearchCursor && (
        <div className={styles.questionSearchFooter}>
          <button
            className={styles.secondaryButton}
            type="button"
            disabled={isSearchingQuestions}
            onClick={loadMoreQuestionSearchResults}
          >
            {isSearchingQuestions ? 'Loading…' : 'Load more Questions'}
          </button>
        </div>
      )}
    </section>
  );
}
