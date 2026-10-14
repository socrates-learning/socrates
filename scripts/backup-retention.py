"""Explicit, local backup expiry. Default is a read-only plan, never a glob delete."""
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import stat


def digest(data):
    return hashlib.sha256(data).hexdigest()


def timestamp(value):
    parsed = dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
    if parsed.tzinfo is None:
        raise ValueError('Backup timestamps must include a timezone')
    return parsed


def private_file(path, root):
    path, root = Path(path), Path(root)
    if not path.is_absolute() or not root.is_absolute() or root.is_symlink():
        raise ValueError('An absolute private backup root is required')
    path.relative_to(root)
    if path.resolve() != path or root.resolve() != root:
        raise ValueError('Symlinks are not allowed in backup paths')
    for directory in [root, *path.relative_to(root).parents]:
        directory = directory if directory.is_absolute() else root / directory
        if directory.stat().st_mode & 0o077:
            raise ValueError('Backup directories must be private')
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_mode & 0o077 or info.st_nlink != 1:
        raise ValueError('Backup files must be private regular files without aliases')
    return path


def plan_retention(catalog, now):
    if catalog.get('version') != 1 or catalog.get('retentionDays') != 30 or not catalog.get('source'):
        raise ValueError('Expected the approved 30-day backup catalog')
    seen, ids, checked = set(), set(), []
    for backup in catalog['backups']:
        if backup['id'] in ids:
            raise ValueError('Duplicate backup identity')
        ids.add(backup['id'])
        created = timestamp(backup['createdAt'])
        if created > now or not backup['artifacts']:
            raise ValueError('Invalid backup checkpoint')
        for item in backup['artifacts']:
            path = private_file(item['path'], backup['root'])
            if str(path) in seen:
                raise ValueError('A file cannot belong to multiple backup entries')
            seen.add(str(path))
            if path.stat().st_size != item['bytes'] or digest(path.read_bytes()) != item['sha256']:
                raise ValueError('Backup identity changed; no expiry is safe')
        verified = backup.get('verifiedAt')
        if verified and not created <= timestamp(verified) <= now:
            raise ValueError('Invalid restoration-verification time')
        if verified:
            proofs = [item for item in backup['artifacts'] if item['sha256'] == backup.get('restorationProofSha256')]
            if len(proofs) != 1 or json.loads(Path(proofs[0]['path']).read_text()).get('status') != 'PASS':
                raise ValueError('Restoration verification must reference a preserved passing proof')
        checked.append((backup, created))
    recent = [(b, created) for b, created in checked if b.get('verifiedAt') and b.get('restorationProofSha256') and now - created < dt.timedelta(days=30)]
    protected_latest = max(recent, key=lambda row: row[1])[0]['id'] if recent else None
    decisions = []
    for backup, created in checked:
        expired = now - created >= dt.timedelta(days=30)
        replacement = next((b for b, date in sorted(recent, key=lambda row: row[1], reverse=True) if date > created and b['id'] != backup['id']), None)
        if backup.get('hold'):
            action, reason = 'hold', 'Existing recovery/legal hold requires explicit review'
        elif not expired:
            action, reason = 'keep', 'Within the 30-day retention window'
        elif not replacement or backup['id'] == protected_latest:
            action, reason = 'blocked', 'No newer independently restore-verified checkpoint within 30 days'
        else:
            action, reason = 'expire', 'Expired and superseded by a verified recovery checkpoint'
        decisions.append({'id': backup['id'], 'action': action, 'reason': reason, 'replacement': replacement['id'] if replacement else None, 'artifacts': backup['artifacts']})
    return {'version': 1, 'source': catalog['source'], 'createdAt': now.isoformat(), 'catalogSha256': digest(json.dumps(catalog, sort_keys=True).encode()), 'decisions': decisions}


def apply_plan(catalog, approved, approval_digest, now):
    if digest(json.dumps(approved, sort_keys=True).encode()) != approval_digest:
        raise ValueError('Exact plan approval is required')
    planned_at = timestamp(approved['createdAt'])
    if not dt.timedelta() <= now - planned_at <= dt.timedelta(hours=1):
        raise ValueError('The expiry plan is stale')
    # Revalidate every retained/replacement/expired artifact before deleting any.
    if plan_retention(catalog, planned_at) != approved:
        raise ValueError('Backup catalog or identities changed')
    removed = 0
    for decision in approved['decisions']:
        if decision['action'] != 'expire':
            continue
        for item in decision['artifacts']:
            path = Path(item['path'])
            # Refuse changed paths even if a different process edits mid-operation.
            if path.is_symlink() or digest(path.read_bytes()) != item['sha256']:
                raise ValueError('Backup changed during expiry; stop and investigate')
            path.unlink()
            removed += 1
    return removed


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--catalog', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--apply-plan')
    parser.add_argument('--approve-sha256')
    args = parser.parse_args()
    os.umask(0o077)
    catalog_path = Path(args.catalog)
    if catalog_path.stat().st_mode & 0o077:
        raise ValueError('The catalog must be access restricted')
    catalog = json.loads(catalog_path.read_text())
    now = dt.datetime.now(dt.timezone.utc)
    output = Path(args.output)
    if output.resolve() == catalog_path.resolve() or output.exists():
        raise ValueError('Use a new evidence output file')
    if args.apply_plan:
        approved = json.loads(Path(args.apply_plan).read_text())
        removed = apply_plan(catalog, approved, args.approve_sha256, now)
        result = {'removedFiles': removed, 'source': catalog['source'], 'approvedPlanSha256': args.approve_sha256, 'completedAt': now.isoformat()}
    else:
        result = plan_retention(catalog, now)
    with output.open('x') as handle:
        json.dump(result, handle, indent=2)
    print(json.dumps({'applied': bool(args.apply_plan), 'resultSha256': digest(json.dumps(result, sort_keys=True).encode()), 'output': str(output)}))


if __name__ == '__main__':
    main()
