"""Deploy the built site to its AWS Amplify app (manual deployment, no Git connection needed).

    npm run build
    python scripts/deploy.py                 # the app and both branches below
    python scripts/deploy.py <app-id> <branch> [<branch> ...]

Needs the AWS CLI signed in to the account that owns the app. Zips dist/team-board/browser,
asks Amplify for an upload URL, uploads, starts the deployment and waits for the result.
"""
import json, os, subprocess, sys, time, urllib.request, zipfile

APP_ID = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('TEAM_BOARD_APP_ID', 'd2f750kn9utf8t')
# cams-team-board is the address to share; main is kept so the first link that went out still works
BRANCHES = sys.argv[2:] or ['cams-team-board', 'main']
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SITE = os.path.join(ROOT, 'dist', 'team-board', 'browser')
ZIP = os.path.join(ROOT, 'dist', 'site.zip')


def aws(*args):
    r = subprocess.run(['aws', 'amplify', *args, '--output', 'json'], capture_output=True, text=True, shell=os.name == 'nt')
    if r.returncode:
        sys.exit(r.stderr.strip()[-800:])
    return json.loads(r.stdout or '{}')


if not os.path.isfile(os.path.join(SITE, 'index.html')):
    sys.exit('No build found. Run "npm run build" first.')

count = 0
with zipfile.ZipFile(ZIP, 'w', zipfile.ZIP_DEFLATED) as z:
    for folder, _, files in os.walk(SITE):
        for f in files:
            full = os.path.join(folder, f)
            # forward slashes: Amplify serves the entry names as URL paths
            z.write(full, os.path.relpath(full, SITE).replace(os.sep, '/'))
            count += 1
print(f'Packaged {count} files ({os.path.getsize(ZIP) // 1024} KB)')

failed = False
for BRANCH in BRANCHES:
    dep = aws('create-deployment', '--app-id', APP_ID, '--branch-name', BRANCH)
    with open(ZIP, 'rb') as fh:
        req = urllib.request.Request(dep['zipUploadUrl'], data=fh.read(), method='PUT', headers={'Content-Type': 'application/zip'})
        urllib.request.urlopen(req).read()
    aws('start-deployment', '--app-id', APP_ID, '--branch-name', BRANCH, '--job-id', dep['jobId'])
    print(f'{BRANCH}: deployment {dep["jobId"]} started', end='', flush=True)

    while True:
        time.sleep(4)
        status = aws('get-job', '--app-id', APP_ID, '--branch-name', BRANCH, '--job-id', dep['jobId'])['job']['summary']['status']
        print('.', end='', flush=True)
        if status in ('SUCCEED', 'FAILED', 'CANCELLED'):
            break
    print(f'\n{status}: https://{BRANCH}.{APP_ID}.amplifyapp.com')
    failed = failed or status != 'SUCCEED'
sys.exit(1 if failed else 0)
