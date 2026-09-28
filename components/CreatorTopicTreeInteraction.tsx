'use client';
import { createContext, useContext, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { GripVertical } from 'lucide-react';
import { canPosition, planTopicPosition, type DropIntent, type PositionContext, type PositionPlan } from '@/lib/creator-topic-positioning';
import styles from './CreatorTopicTreeInteraction.module.css';
type Pick = {
    key: string;
    intent: DropIntent;
};
type Session = {
    key: string;
    context: PositionContext;
};
type Interaction = {
    context: PositionContext;
    disabled: boolean;
    moving: string | null;
    pick: Pick | null;
    start: (event: ReactPointerEvent<HTMLButtonElement>, key: string) => void;
    keyboard: (key: string, button: HTMLButtonElement, fromPointer: boolean) => void;
};
const InteractionContext = createContext<Interaction | null>(null);
export function CreatorTopicTreeInteraction({ context, disabled, onMove, children }: {
    context: PositionContext;
    disabled: boolean;
    onMove: (plan: PositionPlan) => Promise<void>;
    children: ReactNode;
}) {
    const [session, setSession] = useState<Session | null>(null), [pick, setPick] = useState<Pick | null>(null), [keyboard, setKeyboard] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [intent, setIntent] = useState<DropIntent>('inside'), [target, setTarget] = useState('');
    const root = useRef<HTMLDivElement>(null), origin = useRef<HTMLButtonElement | null>(null), pending = useRef(false);
    const pointer = useRef<{
        id: number;
        x: number;
        y: number;
        startX: number;
        startY: number;
        active: boolean;
    } | null>(null);
    const suppressClick = useRef(false), latestPick = useRef<Pick | null>(null);
    function cancel() { pointer.current = null; latestPick.current = null; setPick(null); setSession(null); setKeyboard(false); origin.current?.focus(); }
    async function commit(plan: PositionPlan | null) {
        if (!plan || disabled || pending.current)
            return;
        pending.current = true;
        setSubmitting(true);
        cancel();
        try {
            await onMove(plan);
        }
        finally {
            pending.current = false;
            setSubmitting(false);
            // Reparenting can replace the original DOM handle. Restore focus
            // to its new instance, but do not steal focus from another control.
            requestAnimationFrame(() => {
                if (document.activeElement === document.body || document.activeElement === origin.current) {
                    root.current?.querySelector<HTMLButtonElement>(
                        `[data-topic-drop-key="${CSS.escape(plan.key)}"] [data-topic-drag-handle]`
                    )?.focus();
                }
            });
        }
    }
    useEffect(() => {
        if (!session || keyboard)
            return;
        let frame = 0;
        const hit = () => {
            const p = pointer.current;
            if (!p?.active)
                return;
            const row = document.elementFromPoint(p.x, p.y)?.closest<HTMLElement>('[data-topic-drop-key]');
            let next: Pick | null = null;
            if (row && root.current?.contains(row)) {
                const rect = row.getBoundingClientRect(), ratio = (p.y - rect.top) / rect.height;
                const candidate = { key: row.dataset.topicDropKey!, intent: (row.dataset.topicDropKey === 'unplaced' ? 'inside' : ratio < .25 ? 'before' : ratio > .75 ? 'after' : 'inside') as DropIntent };
                if (planTopicPosition(session.context, session.key, candidate.key, candidate.intent))
                    next = candidate;
            }
            latestPick.current = next;
            setPick(old => old?.key === next?.key && old?.intent === next?.intent ? old : next);
        };
        const move = (event: PointerEvent) => {
            const p = pointer.current;
            if (!p || p.id !== event.pointerId)
                return;
            p.x = event.clientX;
            p.y = event.clientY;
            if (Math.hypot(p.x - p.startX, p.y - p.startY) > 6) {
                p.active = true;
                suppressClick.current = true;
            }
            if (p.active) {
                event.preventDefault();
                hit();
            }
        };
        const tick = () => {
            const p = pointer.current, viewport = root.current?.querySelector<HTMLElement>('[aria-label="Topic Tree"]');
            if (p?.active && viewport) {
                const r = viewport.getBoundingClientRect();
                if (p.x >= r.left && p.x <= r.right) {
                    const velocity = p.y < r.top + 40 ? -Math.min(14, (r.top + 40 - p.y) / 3) : p.y > r.bottom - 40 ? Math.min(14, (p.y - r.bottom + 40) / 3) : 0;
                    if (velocity) {
                        viewport.scrollTop += velocity;
                        hit();
                    }
                }
            }
            frame = requestAnimationFrame(tick);
        };
        const up = (event: PointerEvent) => {
            if (pointer.current?.id !== event.pointerId)
                return;
            const target = latestPick.current, active = pointer.current.active;
            if (active && target)
                void commit(planTopicPosition(session.context, session.key, target.key, target.intent));
            else
                cancel();
        };
        const abort = () => cancel();
        const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') {
            e.preventDefault();
            cancel();
        } };
        window.addEventListener('pointermove', move, { passive: false });
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', abort);
        window.addEventListener('blur', abort);
        window.addEventListener('keydown', escape);
        frame = requestAnimationFrame(tick);
        return () => { cancelAnimationFrame(frame); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', abort); window.removeEventListener('blur', abort); window.removeEventListener('keydown', escape); };
        // The gesture keeps its initial authoritative snapshot until commit/cancel.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session, keyboard]);
    const start = (event: ReactPointerEvent<HTMLButtonElement>, key: string) => {
        if (disabled || pending.current || event.button !== 0 || !event.isPrimary)
            return;
        origin.current = event.currentTarget;
        suppressClick.current = false;
        event.currentTarget.setPointerCapture(event.pointerId);
        pointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, active: false };
        setSession({ key, context });
        setKeyboard(false);
    };
    const openKeyboard = (key: string, button: HTMLButtonElement, fromPointer: boolean) => {
        if (fromPointer && suppressClick.current) {
            suppressClick.current = false;
            return;
        }
        if (disabled || pending.current)
            return;
        suppressClick.current = false;
        origin.current = button;
        setSession({ key, context });
        setKeyboard(true);
        setIntent('inside');
        setTarget('');
    };
    const movingNode = session?.context.nodes.find(node => node.key === session.key);
    const isPersonalRoot = movingNode?.source === 'personal' && movingNode.parentKey === null;
    const options = session && keyboard ? [
        ...session.context.nodes.map(node => {
            const path = [node.name];
            const seen = new Set([node.key]);
            let parent = node.parentKey;
            while (parent && !seen.has(parent)) {
                seen.add(parent);
                const ancestor = session.context.nodes.find(candidate => candidate.key === parent);
                if (!ancestor) break;
                path.unshift(ancestor.name);
                parent = ancestor.parentKey;
            }
            return {key: node.key, label: `${node.source === 'personal' ? 'Mine · ' : ''}${path.join(' › ')}`};
        }),
    ].filter(node => planTopicPosition(session.context, session.key, node.key, intent)) : [];
    const chosen = options.some(o => o.key === target) ? target : options[0]?.key ?? '';
    return <InteractionContext.Provider value={{ context, disabled, moving: session?.key ?? null, pick, start, keyboard: openKeyboard }}>
    <div ref={root} className={styles.interaction} aria-busy={disabled}>
      <p className={styles.instructions}>Drag the handle: a line places a sibling; a highlighted row makes it the parent. Select a handle for keyboard move options.{context.nodes.some(node => node.source === 'personal' && node.parentKey === null) && ' Personal roots keep their own branch when grouped under an official Topic.'}</p>
      {keyboard && session && <div role="dialog" aria-label="Move or reorder Topic" className={styles.keyboard} onKeyDown={e => { if (e.key === 'Escape') {
            e.stopPropagation();
            cancel();
        } }}>
        <strong>Move “{session.context.nodes.find(n => n.key === session.key)?.name}”</strong>
        <label>Position<select autoFocus value={intent} onChange={e => { setIntent(e.target.value as DropIntent); setTarget(''); }}><option value="inside">{isPersonalRoot ? 'Group under official Topic (last root)' : 'Inside parent (last child)'}</option><option value="before">Before sibling</option><option value="after">After sibling</option></select></label>
        <label>Destination<select value={chosen} onChange={e => setTarget(e.target.value)}>{options.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}</select></label>
        <div><button type="button" onClick={cancel}>Cancel</button><button type="button" disabled={!chosen || disabled} onClick={() => void commit(planTopicPosition(session.context, session.key, chosen, intent))}>Move Topic</button></div>
      </div>}
      <div role="status" className={styles.feedback}>{submitting ? 'Updating Topic Tree…' : session && !keyboard ? (pick ? `${pick.key === 'unplaced' ? 'Place in' : pick.intent === 'inside' ? (isPersonalRoot ? 'Group under' : 'Make child of') : pick.intent === 'before' ? 'Place before' : 'Place after'} ${context.nodes.find(n => n.key === pick.key)?.name ?? 'Unplaced'}` : 'Choose a valid destination; Escape cancels.') : ''}</div>
      {children}
    </div>
  </InteractionContext.Provider>;
}
export function TopicDropRow({ topicKey, className, style, children }: {
    topicKey: string;
    className?: string;
    style?: CSSProperties;
    children: ReactNode;
}) {
    const interaction = useContext(InteractionContext);
    const active = interaction?.pick?.key === topicKey ? interaction.pick.intent : undefined;
    return <div className={`${className ?? ''} ${styles.dropRow}`} style={{ ...style, '--topic-drop-indent': style?.paddingLeft ?? '12px' } as CSSProperties} data-topic-drop-key={topicKey} data-drop-intent={active} data-moving={interaction?.moving === topicKey || undefined}>{children}</div>;
}
export function TopicDragHandle({ topicKey }: {
    topicKey: string;
}) {
    const interaction = useContext(InteractionContext), node = interaction?.context.nodes.find(n => n.key === topicKey);
    if (!interaction || !node || !canPosition(interaction.context, node))
        return null;
    return <button type="button" data-topic-drag-handle className={styles.handle} disabled={interaction.disabled} aria-label={`Move or reorder ${node.name}${node.source === 'personal' ? ' (Mine)' : ''}`} title="Drag to move, or select for keyboard options" onPointerDown={e => interaction.start(e, topicKey)} onClick={e => { e.stopPropagation(); interaction.keyboard(topicKey, e.currentTarget, e.detail > 0); }}><GripVertical size={16}/></button>;
}
