import datetime as dt
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('retention', Path(__file__).parents[1] / 'scripts/backup-retention.py')
retention = importlib.util.module_from_spec(spec)
spec.loader.exec_module(retention)


class BackupRetention(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='socrates-retention-test-')
        self.root = Path(self.temp.name).resolve()
        self.now = dt.datetime(2026, 10, 13, tzinfo=dt.timezone.utc)
        self.catalog = {'version': 1, 'retentionDays': 30, 'source': 'synthetic', 'backups': [self.backup('old', 31), self.backup('current', 1)]}

    def tearDown(self):
        self.temp.cleanup()

    def backup(self, name, age):
        directory = self.root / name
        directory.mkdir(mode=0o700)
        data = directory / 'database.dump'
        data.write_text('Disposable fictional database ' + name)
        proof = directory / 'restore-proof.json'
        proof.write_text(json.dumps({'status': 'PASS', 'fixture': name}))
        artifacts = []
        for path in [data, proof]:
            path.chmod(0o600)
            artifacts.append({'path': str(path), 'bytes': path.stat().st_size, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
        date = (self.now - dt.timedelta(days=age)).isoformat()
        return {'id': name, 'createdAt': date, 'verifiedAt': date, 'root': str(directory), 'artifacts': artifacts, 'restorationProofSha256': artifacts[1]['sha256']}

    def test_default_plan_never_deletes(self):
        plan = retention.plan_retention(self.catalog, self.now)
        self.assertEqual([row['action'] for row in plan['decisions']], ['expire', 'keep'])
        self.assertTrue((self.root / 'old/database.dump').exists())

    def test_explicit_plan_expires_only_superseded_disposable_files(self):
        plan = retention.plan_retention(self.catalog, self.now)
        approved = retention.digest(json.dumps(plan, sort_keys=True).encode())
        self.assertEqual(retention.apply_plan(self.catalog, plan, approved, self.now), 2)
        self.assertFalse((self.root / 'old/database.dump').exists())
        self.assertTrue((self.root / 'current/database.dump').exists())

    def test_last_verified_copy_never_expires(self):
        self.catalog['backups'] = self.catalog['backups'][:1]
        self.assertEqual(retention.plan_retention(self.catalog, self.now)['decisions'][0]['action'], 'blocked')

    def test_existing_holds_require_review(self):
        self.catalog['backups'][0]['hold'] = 'Protected original recovery checkpoint'
        self.assertEqual(retention.plan_retention(self.catalog, self.now)['decisions'][0]['action'], 'hold')

    def test_unverified_replacement_is_not_recovery_proof(self):
        self.catalog['backups'][1].pop('verifiedAt')
        self.assertEqual(retention.plan_retention(self.catalog, self.now)['decisions'][0]['action'], 'blocked')

    def test_changed_replacement_blocks_every_deletion(self):
        plan = retention.plan_retention(self.catalog, self.now)
        (self.root / 'current/database.dump').write_text('changed')
        with self.assertRaises(ValueError):
            retention.apply_plan(self.catalog, plan, retention.digest(json.dumps(plan, sort_keys=True).encode()), self.now)
        self.assertTrue((self.root / 'old/database.dump').exists())

    def test_stale_or_unapproved_plan_is_rejected(self):
        plan = retention.plan_retention(self.catalog, self.now)
        with self.assertRaises(ValueError):
            retention.apply_plan(self.catalog, plan, 'wrong', self.now)
        with self.assertRaises(ValueError):
            retention.apply_plan(self.catalog, plan, retention.digest(json.dumps(plan, sort_keys=True).encode()), self.now + dt.timedelta(hours=2))

    def test_symlink_or_public_files_are_rejected(self):
        data = self.root / 'old/database.dump'
        data.chmod(0o644)
        with self.assertRaises(ValueError): retention.plan_retention(self.catalog, self.now)
        data.unlink()
        data.symlink_to(self.root / 'current/database.dump')
        with self.assertRaises(ValueError): retention.plan_retention(self.catalog, self.now)

    def test_missing_or_forged_restore_proof_is_rejected(self):
        self.catalog['backups'][1]['restorationProofSha256'] = 'a' * 64
        with self.assertRaises(ValueError): retention.plan_retention(self.catalog, self.now)

    def test_duplicate_backup_id_is_rejected(self):
        self.catalog['backups'][1]['id'] = 'old'
        with self.assertRaises(ValueError): retention.plan_retention(self.catalog, self.now)


if __name__ == '__main__':
    unittest.main()
