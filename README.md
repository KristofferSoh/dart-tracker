# 🎯 Dart Tracker

A tiny web app for a daily dart tournament. Each player throws three times a
day; the highest weekly total (Monday–Friday) keeps the trophy. The
"📋 Tournament rules" button in the header shows the full rules.

Plain HTML/CSS/JS on the front, [Supabase](https://supabase.com) (hosted
Postgres) for storage. No build step, no server to run.

## Files

| File | Purpose |
|------|---------|
| `login.html` / `login.js` | Open a scorecard by password, or create one |
| `index.html` | The tracker itself |
| `styles.css` | Styling (shared by both pages) |
| `app.js` | Tracker logic — all data access via Supabase RPCs |
| `dartboard.js` | The "Pick on dartboard" popup: SVG board + drag-to-score |
| `config.js` | Supabase URL + publishable key |
| `supabase/schema.sql` | Reference copy of the schema (already applied) |

## Scorecards & login

There are no user accounts. A **scorecard** is one isolated tournament — its own
players and scores — reached only by knowing its password. Scorecards are not
listed anywhere, so you can't browse to one; you need the password. There is no
password reset.

- **Create** (`login.html`): pick a name + password (min 4 chars, must be unique
  across all scorecards). You're taken straight into the new, empty scorecard.
- **Open**: enter the password. Wrong password → "No scorecard with that
  password."
- The tracker stores the scorecard id in `localStorage`; "Switch scorecard" in
  the header clears it and returns to the login page.

### How the isolation works

`players`, `scores` and `scorecards` have RLS enabled with **no policies**, and
table grants are revoked from the anon role — so the publishable key can't read
or write them directly at all. Every operation goes through a `SECURITY DEFINER`
function scoped by a scorecard id (`open_scorecard` / `create_scorecard` hand out
that id only in exchange for the right password; the id is a random uuid and
isn't exposed anywhere else). Passwords are stored as bcrypt hashes.

Supabase's linter flags "RLS enabled, no policy" and "anon can execute SECURITY
DEFINER function" for this design — both are intentional here; that's the whole
mechanism.

## Running locally

`app.js` is an ES module, so serve over HTTP, not `file://`:

```bash
python -m http.server 4180
```

Then visit http://localhost:4180 (you'll be sent to the login page first).

## Hosting (free)

Any static host works — drag the folder onto **Cloudflare Pages**, **Netlify**
(app.netlify.com/drop), **GitHub Pages**, or **Vercel**. No environment
variables; `config.js` holds the publishable key, which is safe in client code
because the tables are sealed and only the RPCs are reachable.

## Database

Supabase project: **dart-tracker** (`bxovlkjcjzixevcqhtbx`), region `eu-north-1`,
free tier ($0/month). Tables: `scorecards`, `players`, `scores`
(`players`/`scores` each carry a `scorecard_id`). `scores` has one row per
`(player_id, day)` with `throw1/2/3` and a generated `total`.

The weekly leaderboard and the "trophy holder" (winner of the most recent
completed week) are computed in the browser.

## Entering a score

**Enter a score** has a Mon–Fri day picker instead of a date field. It follows
the week shown in the leaderboard above it (‹ › arrows change week) and defaults
to today. Every weekday is selectable; picking a day more than one either side of
today just triggers a soft warning on save. Switching the player snaps the picker
back to today, this week.

Player names can be edited in the **Players** section — click the ✎ on a name,
change it, Save. Players can't be removed from the UI.

### Rule warnings

Saving never fails, but the confirmation line turns amber with a ⚠ note when a
save looks off: logging a day more than one either side of today; logging a 3rd
distinct tournament-day within the current real day; or logging two
non-consecutive days. Two consecutive days just prompts the reminder that
another player has to have thrown between the rounds — that part is physical and
not something the app checks. Past-week corrections don't warn.

### The dartboard picker

"🎯 Pick on dartboard" opens a popup with an SVG board, built mobile first (a
full-screen sheet on phones). Press and drag on the board — a magnifier and a
live score readout follow your finger — then lift off to place the dart (lift
off outside the board to cancel). Each point becomes a darts score (single /
double / triple / 25 / bull, or a miss) from its position using real board
proportions. Up to three darts; "Use these scores" fills Throw 1–3, still
editable before saving.

## Notes

- The free project **pauses after ~7 days of no activity**. Daily use keeps it
  awake; if it sleeps, open the Supabase dashboard to resume it.
- No password reset — if a scorecard's password is lost, the data is only
  reachable from the Supabase dashboard.
- To delete a scorecard, player or score, use the Supabase dashboard.
