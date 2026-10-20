'use client';

import { useState, type CSSProperties, type ReactNode } from 'react';
import { topicKey, type GoalTopic } from '@/lib/study-goals';
import styles from './StudyGoals.module.css';

type Props = {
  topics: GoalTopic[];
  selected: string[];
  query: string;
  busy: boolean;
  onChange: (selected: string[]) => void;
};

/** Display only: retain the authorized RPC's placement identities and sibling order. */
export function goalTopicBranches(topics: GoalTopic[]) {
  const byKey = new Map(topics.map(topic => [topicKey(topic), topic]));
  const children = new Map<string | null, GoalTopic[]>();
  const ancestors = new Map<string, string[]>();
  for (const topic of topics) {
    const key = topicKey(topic);
    const chain: string[] = [];
    const visited = new Set([key]);
    let parent = topic.parent_id ? `${topic.source}:${topic.parent_id}` : null;
    while (parent && byKey.has(parent) && !visited.has(parent)) {
      chain.push(parent);
      visited.add(parent);
      const ancestor = byKey.get(parent)!;
      parent = ancestor.parent_id ? `${ancestor.source}:${ancestor.parent_id}` : null;
    }
    ancestors.set(key, chain);
    const parentKey = chain[0] ?? null;
    const siblings = children.get(parentKey) ?? [];
    siblings.push(topic);
    children.set(parentKey, siblings);
  }
  return { byKey, children, ancestors };
}

export function StudyGoalTopicTree({ topics, selected, query, busy, onChange }: Props) {
  const { byKey, children, ancestors } = goalTopicBranches(topics);
  const [expanded, setExpanded] = useState(() => new Set([
    ...(children.get(null) ?? []).map(topicKey),
    ...selected.flatMap(key => ancestors.get(key) ?? []),
  ]));
  const [searchCollapsed, setSearchCollapsed] = useState({ query: '', keys: new Set<string>() });
  const selectedKeys = new Set(selected);
  const selectedAncestors = new Set(selected.flatMap(key => ancestors.get(key) ?? []));
  const search = query.trim().toLocaleLowerCase();
  const matches = topics.filter(topic => topic.path.toLocaleLowerCase().includes(search));
  const visible = new Set(matches.flatMap(topic => [topicKey(topic), ...(ancestors.get(topicKey(topic)) ?? [])]));

  function toggleExpanded(key: string) {
    if (search) {
      setSearchCollapsed(current => {
        const keys = new Set(current.query === search ? current.keys : []);
        if (keys.has(key)) keys.delete(key); else keys.add(key);
        return { query: search, keys };
      });
    } else {
      setExpanded(current => {
        const next = new Set(current);
        if (next.has(key)) next.delete(key); else next.add(key);
        return next;
      });
    }
  }

  function renderBranch(topic: GoalTopic, depth: number): ReactNode {
    const key = topicKey(topic);
    if (!visible.has(key)) return null;
    const descendants = (children.get(key) ?? []).filter(child => visible.has(topicKey(child)));
    const inheritedFrom = (ancestors.get(key) ?? []).find(ancestor => selectedKeys.has(ancestor));
    const direct = selectedKeys.has(key);
    const included = direct || Boolean(inheritedFrom);
    const partial = !included && selectedAncestors.has(key);
    const open = search ? !(searchCollapsed.query === search && searchCollapsed.keys.has(key)) : expanded.has(key);
    const descriptionId = `goal-topic-description-${key}`;
    const childrenId = `goal-topic-children-${key}`;
    return <li key={key} className={styles.topicBranch}>
      <div className={styles.topicRow} style={{ '--goal-topic-depth': depth } as CSSProperties}>
        {descendants.length ? <button type="button" className={styles.topicExpander}
          aria-label={`${open ? 'Collapse' : 'Expand'} ${topic.path}${topic.source === 'personal' ? ' (My Topic)' : ''}`}
          aria-expanded={open} aria-controls={childrenId} onClick={() => toggleExpanded(key)}>
          <span aria-hidden="true">{open ? '▼' : '▶'}</span>
        </button> : <span className={styles.topicLeaf} aria-hidden="true">•</span>}
        <label className={styles.topicChoice}>
          <input type="checkbox" aria-label={`${topic.path}${topic.source === 'personal' ? ' (My Topic)' : ''}`}
            checked={included} aria-checked={partial ? 'mixed' : included}
            ref={input => { if (input) input.indeterminate = partial; }}
            disabled={busy || Boolean(inheritedFrom)}
            aria-describedby={`goal-topic-help${inheritedFrom || partial ? ` ${descriptionId}` : ''}`}
            onChange={event => {
              // An inherited branch cannot express an exclusion in the saved Goal.
              // Keep redundant, already-saved direct choices until explicitly changed.
              if (busy || inheritedFrom) return;
              onChange(event.target.checked ? [...selected.filter(id => id !== key), key] : selected.filter(id => id !== key));
            }} />
          <span className={styles.topicLabel} title={topic.path}>
            <span>{topic.name}{topic.source === 'personal' && <small className={styles.topicPersonal}>My Topic</small>}</span>
            {(inheritedFrom || partial) && <small id={descriptionId} className={styles.topicInclusion}>
              {inheritedFrom ? <>Included through {byKey.get(inheritedFrom)!.name}{direct ? ' · Also selected directly' : ''}</> : 'Subtopics selected'}
            </small>}
          </span>
        </label>
      </div>
      {descendants.length > 0 && <ul id={childrenId} hidden={!open} className={styles.topicChildren}>
        {descendants.map(child => renderBranch(child, depth + 1))}
      </ul>}
    </li>;
  }

  return <fieldset className={styles.topics}>
    <legend>Topics and subject areas ({selected.length} selected {selected.length === 1 ? 'branch' : 'branches'})</legend>
    <p id="goal-topic-help" className={styles.topicHelp}>A selected Topic includes its entire branch. To choose fewer subtopics, deselect the parent, then select the branches you want. Expanding a Topic does not select it.</p>
    <ul className={styles.topicTree} aria-label="Goal Topics">{(children.get(null) ?? []).map(topic => renderBranch(topic, 0))}</ul>
    {!matches.length && <p role="status">No matching Topics.</p>}
  </fieldset>;
}
