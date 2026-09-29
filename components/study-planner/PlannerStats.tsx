'use client';

import type { ReactNode } from 'react';
import type { StudyPlannerInitialData } from '@/lib/study-planner-initial-data';

type Progress = StudyPlannerInitialData['learnerProgress'];
type Metric = Progress['nodes'][number];
type Node = StudyPlannerInitialData['nodes'][number];
type Props = {
  activeTab: 'progress' | 'history' | 'algorithm';
  onTabChange: (tab: Props['activeTab']) => void;
  libraryName: string;
  progress: Progress;
  progressError: string;
  nodes: readonly Node[];
  rootNodes: readonly Node[];
  progressByNodeId: ReadonlyMap<string, Metric>;
  fallbackProgressMetric: Omit<Metric, 'library_node_id' | 'name' | 'parent_id' | 'sort_order'>;
  expandedNodeIds: ReadonlySet<string>;
  onToggleNode: (id: string) => void;
  showAlgorithmTab: boolean;
  algorithmPanel: ReactNode;
};

function HomeProgressBar({ value }: { value: number }) {
  return (
    <div
      className="home-v2-progress"
      aria-label={`${value}% coverage-adjusted progress`}
    >
      <span style={{ width: `${value}%` }} />
    </div>
  );
}

  function formatProgressDetail(metric: Props['fallbackProgressMetric']) {
    const assessedAverage =
      metric.assessed_mastery_percent === null
        ? 'no assessed mastery yet'
        : `${Math.round(metric.assessed_mastery_percent)}% assessed average`;

    return `${metric.assessed_concepts}/${metric.total_concepts} assessed · ${metric.unseen_concepts} unseen · ${assessedAverage}`;
  }


// Presentation only: loading, authority, navigation and expansion state stay in StudyPlanner.
export function PlannerStats({ activeTab, onTabChange, libraryName, progress, progressError, nodes, rootNodes, progressByNodeId, fallbackProgressMetric, expandedNodeIds, onToggleNode, showAlgorithmTab, algorithmPanel }: Props) {
  // Stats expansion is independent of Deck Settings selection and expansion.
  function renderHomeTreeRow(
    node: Node,
    depth: number
  ): ReactNode {
    const childNodes = nodes
      .filter((candidate) => candidate.parent_id === node.id)
      .sort((left, right) => left.name.localeCompare(right.name));
    const hasChildren = childNodes.length > 0;
    const isExpanded = expandedNodeIds.has(node.id);
    const metric =
      progressByNodeId.get(node.id) || fallbackProgressMetric;
    const progress = Math.round(metric.coverage_adjusted_progress_percent);

    return (
      <div key={node.id}>
        <div className="home-v2-tree-row" style={{ paddingLeft: 10 + depth * 34 }}>
          <button
            aria-label={
              hasChildren
                ? `${isExpanded ? 'Collapse' : 'Expand'} ${node.name}`
                : undefined
            }
            className="home-v2-chevron"
            disabled={!hasChildren}
            type="button"
            onClick={() => onToggleNode(node.id)}
          >
            {hasChildren ? (isExpanded ? '⌄' : '›') : ''}
          </button>
          <span className="home-v2-topic-copy">
            <span className="home-v2-topic-name">{node.name}</span>
            <small>{formatProgressDetail(metric)}</small>
          </span>
          <HomeProgressBar value={progress} />
          <span className="home-v2-percent">{progress}%</span>
        </div>
        {hasChildren &&
          isExpanded &&
          childNodes.map((child) => renderHomeTreeRow(child, depth + 1))}
      </div>
    );
  }

  return (
            <>
              <div className="home-v2-topline home-v2-stats-heading">
                <div>
                  <h2>Stats</h2>
                  <p>Track your progress and learning activity.</p>
                </div>
              </div>

              <nav className="home-v2-stats-tabs" aria-label="Stats sections" role="tablist">
                {(['progress', 'history'] as const).map((tab) => (
                  <button
                    aria-selected={activeTab === tab}
                    key={tab}
                    onClick={() => onTabChange(tab)}
                    role="tab"
                    type="button"
                  >
                    {tab === 'progress' ? 'Progress' : 'Study History'}
                  </button>
                ))}
                {showAlgorithmTab && (
                  <button
                    aria-selected={activeTab === 'algorithm'}
                    onClick={() => onTabChange('algorithm')}
                    role="tab"
                    type="button"
                  >
                    Algorithm
                  </button>
                )}
              </nav>

              {activeTab === 'progress' && (
                <section className="home-v2-deck-card" aria-labelledby="tree-title">
                  <h3 id="tree-title">
                    Current Deck: <span>{libraryName}</span>
                  </h3>
                  <p className="home-v2-progress-overview">
                    {progress.summary.assessed_concepts}/
                    {progress.summary.total_concepts} Concepts assessed ·{' '}
                    {progress.summary.unseen_concepts} unseen ·{' '}
                    {progress.summary.questions_answered} Questions answered ·{' '}
                    {progress.summary.recent_session_count} recent sessions
                  </p>
                  {progressError && (
                    <p className="home-v2-progress-overview">{progressError}</p>
                  )}
                  <div className="home-v2-tree">
                    {rootNodes.map((node) => renderHomeTreeRow(node, 0))}
                  </div>
                </section>
              )}

              {activeTab === 'history' && (
                <section className="home-v2-deck-card" aria-labelledby="study-history-title">
                  <h3 id="study-history-title">
                    Study History: <span>{libraryName}</span>
                  </h3>
                  <p className="home-v2-progress-overview">
                    Your five most recent recorded Study Sessions in this Library.
                  </p>
                  {progressError && (
                    <p className="home-v2-progress-overview">{progressError}</p>
                  )}
                  {progress.recent_sessions.length ? (
                    <div className="home-v2-history-list">
                      {progress.recent_sessions.map((session) => (
                        <article className="home-v2-history-row" key={session.id}>
                          <div>
                            <strong>{session.deck_name || 'Study Session'}</strong>
                            <time dateTime={session.started_at} suppressHydrationWarning>
                              {new Date(session.started_at).toLocaleString()}
                            </time>
                          </div>
                          <span>
                            {session.answered_count}{' '}
                            {session.answered_count === 1 ? 'response' : 'responses'}
                          </span>
                          <small>{session.ended_at ? 'Completed' : 'In progress'}</small>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="home-v2-history-empty">
                      No recorded Study Sessions in this Library yet.
                    </p>
                  )}
                </section>
              )}

              {algorithmPanel}
            </>
  );
}
