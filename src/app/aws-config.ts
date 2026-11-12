/**
 * AWS wiring. Sign-in reuses the Sequencer's Cognito user pool, so the same accounts work here;
 * the identity pool turns that login into short-lived credentials for the private bucket.
 * Public SPA app client: no secret, and these ids are not sensitive.
 */
export const AWS_REGION = 'ap-southeast-2';

export const COGNITO = {
  userPoolId: 'ap-southeast-2_YrZsyqHCD',
  userPoolClientId: '2k3425k4v6257qcrmdehta8v9u',
  identityPoolId: 'ap-southeast-2:6f39d725-4f08-4f54-8249-a2575903dbb1',
};

export const BOARD_STORAGE = {
  /** Private bucket (all public access blocked). Only the identity pool's signed-in role can reach it. */
  bucket: 'cams-sequencer-plans',
  /** The one shared board. Everyone signed in reads and writes this object. */
  key: 'team-board/board.json',
};
