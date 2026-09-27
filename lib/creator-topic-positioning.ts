import { compareCreatorTopics } from './creator-topic-order.js';
export type StructuralTopic = {
    key: string;
    id: string;
    source: 'official' | 'personal';
    name: string;
    parentKey: string | null;
    placementKey: string | null;
    sort_order: number | null;
    ownerId?: string;
};
export type DropIntent = 'before' | 'after' | 'inside';
export type PositionContext = {
    libraryId: string;
    ownerId: string;
    canManageOfficial: boolean;
    nodes: readonly StructuralTopic[];
};
export type PositionPlan = {
    key: string;
    rpc: 'position_library_node_in_library' | 'position_personal_topic';
    args: Record<string, string | null | string[]>;
    noop: boolean;
    destinationKey: string | null;
};
const raw = (key: string | null) => key?.slice(key.indexOf(':topic:') + 7) ?? null;
export function canPosition(context: PositionContext, node: StructuralTopic) {
    return !!context.libraryId && (node.source === 'official' ? context.canManageOfficial && node.parentKey !== null : node.ownerId === context.ownerId);
}
/** Build assertions from the complete gesture-start snapshot, never filtered visible rows. */
export function planTopicPosition(context: PositionContext, key: string, targetKey: string, intent: DropIntent): PositionPlan | null {
    const moving = context.nodes.find(n => n.key === key), target = context.nodes.find(n => n.key === targetKey);
    if (!moving || !canPosition(context, moving) || (!target && targetKey !== 'unplaced'))
        return null;
    let parent: string | null = null, placement: string | null = null;
    if (targetKey === 'unplaced') {
        if (moving.source !== 'personal' || moving.parentKey !== null)
            return null;
    }
    else if (moving.source === 'official') {
        if (target!.source !== 'official')
            return null;
        parent = intent === 'inside' ? target!.key : target!.parentKey;
        if (!parent)
            return null;
    }
    else if (moving.parentKey === null) {
        if (intent === 'inside' && target!.source === 'official')
            placement = target!.key;
        else if (intent !== 'inside' && target!.source === 'personal' && target!.parentKey === null && target!.ownerId === context.ownerId)
            placement = target!.placementKey;
        else
            return null;
    }
    else {
        if (target!.source !== 'personal' || target!.ownerId !== context.ownerId)
            return null;
        parent = intent === 'inside' ? target!.key : target!.parentKey;
        if (!parent)
            return null;
    }
    // Reject malformed cycles as well as moving beneath our own descendants.
    const ancestry = new Set<string>();
    for (let ancestor = parent; ancestor;) {
        if (ancestor === key || ancestry.has(ancestor))
            return null;
        ancestry.add(ancestor);
        ancestor = context.nodes.find(n => n.key === ancestor)?.parentKey ?? null;
    }
    const siblings = (p: string | null, place: string | null) => context.nodes.filter(n => n.source === moving.source && n.parentKey === p &&
        (n.source === 'official' || (n.ownerId === context.ownerId && (p !== null || n.placementKey === place)))).slice().sort(compareCreatorTopics).map(n => n.id);
    const source = siblings(moving.parentKey, moving.placementKey), destination = siblings(parent, placement);
    const remaining = destination.filter(id => id !== moving.id);
    let before: string | null = null;
    if (target && intent !== 'inside') {
        if (target.id === moving.id && target.source === moving.source) {
            before = source[source.indexOf(moving.id) + 1] ?? null;
        }
        else {
            const index = remaining.indexOf(target.id);
            if (index < 0)
                return null;
            before = intent === 'before' ? target.id : remaining[index + 1] ?? null;
        }
    }
    const next = remaining.slice();
    next.splice(before === null ? next.length : next.indexOf(before), 0, moving.id);
    const noop = parent === moving.parentKey && placement === moving.placementKey && JSON.stringify(next) === JSON.stringify(source);
    const common = { p_topic_id: moving.id, p_expected_parent_id: raw(moving.parentKey), p_destination_parent_id: raw(parent), p_before_sibling_id: before, p_expected_source_ids: source, p_expected_destination_ids: destination };
    return { key, rpc: moving.source === 'official' ? 'position_library_node_in_library' : 'position_personal_topic',
        args: moving.source === 'official' ? { ...common, p_library_id: context.libraryId } : { ...common, p_expected_official_node_id: raw(moving.placementKey), p_destination_official_node_id: raw(placement) }, noop, destinationKey: parent ?? placement };
}
export type PositionError = {
    code?: string;
    message?: string;
};
/** No optimistic writes or retries: a conflict invalidates this exact snapshot. */
export async function executeTopicPosition(plan: PositionPlan, lock: {
    current: boolean;
}, rpc: (name: string, args: PositionPlan['args']) => PromiseLike<{
    error: PositionError | null;
}>, refresh: () => Promise<void>) {
    if (lock.current)
        return { kind: 'busy', message: 'A Topic change is already in progress.' };
    if (plan.noop)
        return { kind: 'noop', message: 'Topic is already in that position.' };
    lock.current = true;
    try {
        const { error } = await rpc(plan.rpc, plan.args);
        if (error?.code === 'PT409') {
            try {
                await refresh();
            }
            catch {
                return { kind: 'error', message: 'The Topic Tree changed. It could not be refreshed; refresh the page before trying again.' };
            }
            return { kind: 'stale', message: 'The Topic Tree changed since you opened it. It has been refreshed; try the move again.' };
        }
        if (error)
            return { kind: 'error', message: error.code === '42501' ? 'You do not have permission to move this Topic.' : error.code === '23505' ? 'That parent already has a Topic with this name.' : error.code === '22023' || error.code === 'P0001' ? 'That destination is not valid for this Topic.' : 'The Topic could not be moved. Check your connection and try again.' };
        try {
            await refresh();
        }
        catch {
            return { kind: 'error', message: 'The Topic moved, but the tree could not be refreshed. Refresh the page before making another change.' };
        }
        return { kind: 'success', message: 'Topic moved.' };
    }
    catch {
        return { kind: 'error', message: 'The move could not be confirmed. Refresh the tree before trying again.' };
    }
    finally {
        lock.current = false;
    }
}
