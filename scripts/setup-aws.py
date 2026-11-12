"""One-off AWS setup for the shared Team Board. Safe to re-run.

    python scripts/setup-aws.py

Sign-in reuses the Sequencer's Cognito user pool and identity pool. This script only adds what the
Team Board needs on top:
  1. an inline policy on the signed-in role, allowing it to read and write the `team-board/` folder
     of the private bucket (and nothing else new);
  2. the Team Board site addresses on the bucket's CORS list, keeping every address already there.

Needs the AWS CLI signed in to the account that owns the bucket and the role.
"""
import json, os, subprocess, sys, tempfile

BUCKET = 'cams-sequencer-plans'
ROLE = 'cams-sequencer-authenticated'
PREFIX = 'team-board'
POLICY = 'team-board-storage'
ORIGINS = [
    'https://cams-team-board.d2f750kn9utf8t.amplifyapp.com',
    'https://main.d2f750kn9utf8t.amplifyapp.com',
    'http://localhost:4200',
    'http://localhost:4300',
]


def aws(*args, parse=True):
    r = subprocess.run(['aws', *args, '--output', 'json'], capture_output=True, text=True, shell=os.name == 'nt')
    if r.returncode:
        sys.exit(r.stderr.strip()[-800:])
    return json.loads(r.stdout) if parse and r.stdout.strip() else {}


def as_file(doc):
    f = tempfile.NamedTemporaryFile('w', suffix='.json', delete=False, encoding='utf-8')
    json.dump(doc, f); f.close()
    return 'file://' + f.name.replace('\\', '/')


policy = {
    'Version': '2012-10-17',
    'Statement': [
        {'Effect': 'Allow', 'Action': ['s3:GetObject', 's3:PutObject'], 'Resource': f'arn:aws:s3:::{BUCKET}/{PREFIX}/*'},
        # ListBucket on the folder makes a not-yet-created board answer 404 (no board yet) rather than 403
        {'Effect': 'Allow', 'Action': ['s3:ListBucket'], 'Resource': f'arn:aws:s3:::{BUCKET}',
         'Condition': {'StringLike': {'s3:prefix': [f'{PREFIX}/*']}}},
    ],
}
aws('iam', 'put-role-policy', '--role-name', ROLE, '--policy-name', POLICY, '--policy-document', as_file(policy), parse=False)
print(f'Role {ROLE}: policy {POLICY} in place')

cors = aws('s3api', 'get-bucket-cors', '--bucket', BUCKET)
rule = cors['CORSRules'][0]
missing = [o for o in ORIGINS if o not in rule['AllowedOrigins']]
if missing:
    rule['AllowedOrigins'] += missing
    aws('s3api', 'put-bucket-cors', '--bucket', BUCKET, '--cors-configuration', as_file(cors), parse=False)
print(f'Bucket {BUCKET}: {len(missing)} address(es) added to CORS, {len(rule["AllowedOrigins"])} allowed in total')
