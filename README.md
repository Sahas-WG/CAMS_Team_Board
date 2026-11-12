# Team Board

One page that shows who in the team is carrying what: a lane per person, their tasks as cards, and a
second view that rolls the work up into broad responsibilities. It started as the Team page of the
Sequencer app and is a separate project with no dependency on it.

## What it does

- **Tasks view.** A lane per person. Each card is a task with its number, status, responsibility,
  project and due date. Overdue work sorts to the top; finished work is struck through.
- **Responsibilities view.** Each responsibility (for example Reporting) appears once, under the one
  person who leads it, with progress and the next due date. Click a card to list its tasks. The lead
  is whoever owns most of its tasks until you pick one from the Lead dropdown on the card.
- **Filters.** Open, Due in 14 days, All, and a project filter once tasks carry a project.
- **Editing.** `+ Person` adds a lane. The `+` on a lane adds a task there. Click a task to edit or
  delete it, click a person's name to rename, reorder or remove them. Removing a person leaves their
  tasks on the board in an Unassigned lane.

## Where the data lives

**In the browser only.** The board is kept in that browser's `localStorage`, so each person who opens
the site sees their own copy. Use **Export** to download the board as a JSON file and **Import** to
load one. `sample-board.json` is an example you can import to see a filled board.

That makes this version a single-keeper tool: one person maintains the board and shares their screen
or the export. For a board the whole team edits, the app needs sign-in and shared storage. The code is
ready for that: `src/app/board.store.ts` is the only file that touches storage (`load` and `persist`).

There is also **no sign-in**. Anyone with the hosted URL can open the page, although they would see an
empty board, not yours. Do not treat the URL as private once shared storage is added without also
adding sign-in.

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

`amplify.yml` is already set up (Node 20, `npm ci`, `npm run build`, publish `dist/team-board/browser`).

1. Create an empty repository on GitHub and push this one to it:
   ```bash
   git remote add origin https://github.com/<owner>/<repo>.git
   git push -u origin main
   ```
2. In the AWS Amplify console choose **Create new app**, pick GitHub, select the repository and the
   `main` branch. Amplify reads `amplify.yml`; accept the detected settings and deploy.
3. Every later `git push` to `main` rebuilds and redeploys the site.

## Layout

- `src/app/models.ts`: the data contract (people, tasks, area leads).
- `src/app/team-board.ts`: pure board logic (lanes, sorting, filters, responsibilities), with a spec.
- `src/app/board.store.ts`: the store and the only storage code, with a spec.
- `src/app/app.{ts,html,scss}`: the page and its two dialogs.
- `src/styles.scss`: CAMS design tokens and shared styles.
