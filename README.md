# Team Board

One page that shows who in the team is carrying what: a lane per person, their tasks as cards, and a
second view that rolls the work up into broad responsibilities. It started as the Team page of the
Sequencer app and is a separate project with no dependency on it.

## What it does

- **Tasks view.** A lane per person. Each card is a task with its number, status, responsibility,
  project and due date. Overdue work sorts to the top; finished work is struck through. A task can
  have several owners: a shared card shows in each of their lanes with everyone's initials on it.
- **Responsibilities view.** Each responsibility (for example Reporting) appears once, under the one
  person who leads it, with progress and the next due date. Click a card to list its tasks. The lead
  is whoever owns most of its tasks until you pick one from the Lead dropdown on the card.
- **Filters.** Open, Due in 14 days, All, and a project filter once tasks carry a project.
- **Editing.** `+ Person` adds a lane. The `+` on a lane adds a task there. Click a task to edit or
  delete it, click a person's name to rename, reorder or remove them. Removing a person leaves their
  tasks on the board in an Unassigned lane.

## Sign-in and where the data lives

**Sign-in.** The page is behind the same Cognito user pool as the Sequencer, so anyone with a
Sequencer account signs in here with the same email and password. Accounts are by invitation; there
is no sign-up.

**One shared board.** Everyone signed in sees and edits the same board. It is a single JSON object,
`team-board/board.json`, in the private bucket `cams-sequencer-plans`, reached with the short-lived
credentials the sign-in provides. There is no API key in the browser.

**How edits are saved.** A change shows at once, then the app re-reads the shared board, applies the
same change to that fresh copy and writes it back. Two people editing different things at the same
moment both keep their change. Other people's changes arrive every 30 seconds and whenever the window
regains focus. The header shows Saved, Saving or Not saved.

**Export and Import.** Export downloads the board as a file, a handy backup. Import replaces the
shared board for everyone, so it asks first. `sample-board.json` is an example.

**One-off AWS setup.** `python scripts/setup-aws.py` gives the signed-in role access to the
`team-board/` folder and adds the site addresses to the bucket's CORS list. It is safe to re-run, and
has to be run once by someone allowed to change IAM. Everything is in `src/app/aws-config.ts` and
`src/app/board.backends.ts` if the board ever moves to its own pool or bucket.

## Run, build, test

```bash
npm install
npm start          # http://localhost:4200
npm run build      # production build to dist/team-board/browser
npm test           # unit tests (karma, headless Chrome)
```

If this folder sits in OneDrive and `npm run build` fails with `UNKNOWN: unknown error, read`, that is
OneDrive's files-on-demand, not the code. Mark the folder "Always keep on this device" or build from a
copy on a local disk.

## Deploy to AWS Amplify

The site is hosted on the Amplify app **CAMS-Team-Board** (`d2f750kn9utf8t`, ap-southeast-2):
https://cams-team-board.d2f750kn9utf8t.amplifyapp.com

The older address https://main.d2f750kn9utf8t.amplifyapp.com is kept and gets the same build.

The app is not connected to GitHub, so a `git push` does not deploy. To publish the current code:

```bash
npm run deploy
```

That builds the site and runs `scripts/deploy.py`, which zips `dist/team-board/browser`, uploads it
to Amplify and waits for the result. It needs Python and the AWS CLI signed in to the account that
owns the app.

**To deploy on every push instead**, connect the repository in the Amplify console (it asks you to
authorise GitHub in the browser). `amplify.yml` already holds the build settings (Node 20, `npm ci`,
`npm run build`, publish `dist/team-board/browser`). If the console will not attach a repository to
this manually deployed app, create a new app from the repository there and delete this one.

## Layout

- `src/app/models.ts`: the data contract (people, tasks, area leads).
- `src/app/team-board.ts`: pure board logic (lanes, sorting, filters, responsibilities), with a spec.
- `src/app/board.store.ts`: the store (optimistic edits, save by replaying onto the latest board), with a spec.
- `src/app/board.backends.ts`, `src/app/aws-config.ts`: where the board is kept and the AWS ids.
- `src/app/app.{ts,html,scss}`: the page and its two dialogs.
- `src/styles.scss`: CAMS design tokens and shared styles.
