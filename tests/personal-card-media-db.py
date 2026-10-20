"""Run only against a dedicated, network-isolated synthetic 136 database."""
import json
from pathlib import Path
import subprocess

CONTAINER = 'socrates-admin-card135-recovery-20261020'
DATABASE = 'learner_card_media136_verified'
info = json.loads(subprocess.check_output(['docker', 'inspect', CONTAINER]))[0]
assert info['HostConfig']['NetworkMode'] == 'none'
assert not info['NetworkSettings']['Ports']
command = ['docker', 'exec', '-i', CONTAINER, 'psql', '-X', '-qAt', '-h', '/tmp',
           '-U', 'supabase_admin', '-d', DATABASE, '-v', 'ON_ERROR_STOP=1']
assert subprocess.check_output(command+['-c', 'select (select count(*) from auth.users)+(select count(*) from public.personal_cards)'], text=True).strip() == '0'
fixture = Path(__file__).with_name('learner-card-movement.sql').read_text().split('set local role authenticated;')[0]
fixture = fixture.replace("current_database() <> 'learner_card_movement_search'", "current_database() <> '"+DATABASE+"'")
result = subprocess.run(command, input=fixture+Path(__file__).with_suffix('.sql').read_text(), text=True, capture_output=True)
print(result.stdout)
print(result.stderr)
assert result.returncode == 0, 'Synthetic SQL contract failed'
