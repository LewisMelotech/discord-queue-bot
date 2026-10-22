# Sign-up Queue Bot

[![Publish Docker image](https://github.com/LewisMelotech/discord-queue-bot/actions/workflows/docker-publish.yml/badge.svg)](https://github.com/LewisMelotech/discord-queue-bot/actions/workflows/docker-publish.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A Discord bot that manages a rotating sign-up queue for volunteer slots —
built for things like a weekly storytelling rota, but usable for any
"we need N people to do a thing on a schedule" situation. Members with a
chosen role are asked in turn, in DMs, whether they want a slot; the queue
reorders itself fairly based on how people respond.

## Features

- **Fair rotation** — everyone with the configured role gets asked in
  turn; accepting a slot sends you to the back of the queue, declining
  moves you to the front for next time.
- **Reusable templates** — define a poll's title and named slots once
  (e.g. `Fri`, `Sat AM`, `Sat PM`, `Sun`), run it every week. Slot names
  can auto-fill next week's date.
- **Event reminders** — turn them on and everyone in a slot gets a DM on
  the morning of that day (9am by default), so nobody forgets their turn.
- **Self-healing** — no response within 24 hours, or explicitly asking
  not to be bothered for a month, snoozes someone automatically; dropping
  out after being assigned reopens that slot and resumes polling.
- **Admin controls** — manually reorder the queue, edit a completed
  round's results, stop a round early, bulk-clear snoozes.
- **Zero external dependencies** — no database, no paid services; state
  lives in a single JSON file next to the bot.

## Commands

- `/setup role:... [channel:...] [logs:...]` (run this first) sets which
  role's members make up the queue, and optionally a default results
  channel and a log channel. Picked natively from Discord's own
  role/channel pickers — nothing to look up or copy by hand. Re-run it any
  time to change any of them.
  - `logs` — if set, every time the bot DMs someone it posts a line there
    (who, which poll, how many slots are still open), plus a follow-up line
    once they respond: which slot they picked, that they said Not
    Available, that they snoozed themselves, that their DM couldn't be
    delivered, or that they timed out after 24h. Off by default — without
    it, that visibility only exists in ephemeral replies to whoever ran
    `/polling-start`.
- `/queue-sync` builds/refreshes the queue from current members of the
  configured role. New members are added to the top (asked before anyone
  already in the rotation); anyone who lost the role is removed. Existing
  order among current members is preserved.
- `/queue-move user:... [position:...] [direction:Up|Down] [by:...]`
  manually repositions someone in the queue — use exactly one of the two
  approaches. `position` moves them directly to that 1-indexed spot (1 =
  front), shifting everyone between their old and new spot to make room.
  `direction` + `by` instead bumps them toward the front (sooner) or back
  (later) `by` positions at a time (default 1). Either way it's clamped at
  the ends, and safe to use any time, including mid-round — it only
  affects who gets asked next, not anything already in progress.
- `/template-create name:"..." slots:"..." [intro:...]` creates (or updates,
  if the name already exists) a template — a title plus a comma-separated
  list of slot names, e.g. `slots:"Sat {{next}} AM, Sat {{next}} PM, Sun
  {{next}}"`. Up to 20 slots per template.
  - Put `{{next}}` or `{{next+N}}` anywhere in a slot name (after a day of
    the week — Monday … Sunday, or common abbreviations like "Sat") and
    it's replaced with that day's date when a round starts, computed in UK
    time. `{{next}}` is the day's next upcoming occurrence; `{{next+1}}` is
    one week further out, `{{next+2}}` two weeks, and so on — useful for a
    template spanning more than one weekend. E.g. `"Sat {{next}}"` →
    `"Sat 22 Aug"`, and `"Saturday Slot 1 ({{next}})"` →
    `"Saturday Slot 1 (22 Aug)"` — the date goes wherever you put the
    placeholder, and everything else in the label is yours to format.
  - The day used is the first day-of-week word found in that slot name —
    if a label mentions two different days, both placeholders resolve
    against the first one, so keep one day per slot name.
  - Slot names with no `{{next...}}` placeholder are left exactly as
    typed, so the template never needs editing week to week as long as you
    use the placeholder.
  - `intro` is a custom greeting shown at the top of every DM sent for that
    template — e.g. "Yo! It's storytime bot here." Leave it out and the bot
    uses a default: "Hello, I'm the scheduler for **\<server name\>**." Set
    per template, since re-running `/template-create` on an existing
    template always replaces the whole thing — omit `intro` on an update
    and it reverts to the default rather than keeping the old custom one.
  - **Event reminders** work out which day a slot is on from the same
    day-of-week word: its next occurrence, or `{{next+N}}` weeks later if
    the label has that placeholder. This works whether or not the label
    has a placeholder (`"Sat AM"` is the coming Saturday). A slot name
    with no day of the week in it doesn't get a reminder.
- `/template-view [name:...]` shows one template's slots and greeting, or
  lists all saved templates if you omit `name`.
- `/template-delete name:...` removes a saved template.
- `/polling-start template:... [title:...] [channel:...]` starts a round
  using a saved template (the `template` option autocompletes from what
  you've created). Pass `title` to override just this run's title (e.g. a
  one-off "Halloween Storytelling" using the regular weekend template) —
  the saved template itself is untouched. It immediately posts a results
  message in the channel with every slot shown `_unfilled_` — that same
  message then gets edited in place as slots fill, rather than only
  appearing once the round finishes, so anyone watching the channel can see
  it fill up live. The bot DMs the person at the top of the queue asking if
  they want to sign up, with a button per slot plus **Not Available** and
  **Don't ask again for a month**.
  - Pick a slot → they're locked into that slot and moved to the **bottom**
    of the queue.
  - Not Available → they're moved to the **top** of the queue (asked first
    next round) and the bot moves on.
  - Don't ask again for a month → they're skipped by every round (this one
    and any future one) for 30 days, no matter what else happens — passing,
    picking a slot, or anything else doesn't cancel a snooze early. Their
    queue position is untouched, and it lifts automatically once it expires.
    The confirmation message tells them how to undo it: `/queue-rejoin`
    clears their own snooze (open to anyone, no permission needed), or an
    admin can end it early for everyone with the queue role at once with
    `/queue-snooze-clear`, which also DMs each of them that they're back in.
  - If a DM can't be delivered (DMs closed), they're skipped for this round
    only and keep their current queue position. Only noted in the log
    channel (if configured) — nothing posted in the round's channel.
  - No response within 24 hours → treated like they clicked **Don't ask
    again for a month**, except snoozed for a week instead: skipped for
    this round and every round for 7 days, then automatically eligible
    again. The bot also DMs them "Sorry you did not respond in time." so
    they know they've been skipped, along with a reminder that
    `/queue-rejoin` lifts the snooze early (silently skipped if their DMs
    have since closed). Checked roughly every 15 minutes, and the 24h
    countdown survives a bot restart since it's based on a persisted
    timestamp, not a timer. Only noted in the log channel (if configured)
    — nothing posted in the round's channel for this one either.
  - If everyone in the queue has been asked once and slots are still open,
    the bot loops back and offers spare slots to people who already took
    one — so one person can end up covering more than one slot rather than
    leaving it unfilled, rotating fairly if more than one person is willing.
  - This repeats automatically until all slots are filled, at which point
    that same live message gets its final edit (adding the ❌ drop-out hint
    below) rather than a new one being posted.
  - If event reminders are on, the reply to `/polling-start` says when
    they'll go out and lists any slot that won't get one (no day of the
    week in its name).
- `/polling-stop [cancel-reminders:...]` cancels the in-progress round
  early (started by mistake, wrong template, whatever) — edits the live
  results message to mark it "(stopped early)" with whatever was filled so
  far, posts a short notice, then clears the round so `/polling-start` can
  be run again. Anyone already locked into a slot keeps their queue
  position from that; it isn't rolled back. They keep their event
  reminders too, unless you pass `cancel-reminders:True` (e.g. the round
  was started by mistake).
- `/polling-respond user:... choice:...` lets an admin answer on behalf of
  whoever the bot is *currently* waiting on — useful if their DMs are
  closed, or you already know their answer from elsewhere. `choice`
  autocompletes to that round's open slots plus Not Available and Don't
  ask again for a month, and behaves exactly as if they'd clicked it
  themselves (moved to the bottom/top of the queue, snoozed, etc.). Only
  works for the person currently pending — it'll tell you who that
  actually is if you target someone else. The log channel entry for a
  response recorded this way notes which admin did it, so it's clear it
  wasn't the person's own click.
- **Can't make it after all?** Anyone assigned a slot can react with ❌ on
  the results message. The bot vacates every slot that person held, updates
  the results message to show the opening(s), and automatically resumes
  polling down the queue to refill them — same rules as above, and that
  person isn't re-asked for their own vacated slot(s). If another round is
  already in progress when someone reacts, the bot posts a note asking an
  admin to sort it out manually instead of auto-resuming.
- `/polling-edit slot:... user:... action:Add|Remove [move:...]` manually
  fixes up the last completed round's results — the `slot` option
  autocompletes from that round's slots. Add puts someone in a slot
  alongside whoever's already there (slots aren't limited to one person —
  useful for co-storytellers), Remove takes them out. `move` (default yes,
  Add only) controls whether adding someone also moves them to the bottom
  of the queue like a normal slot pickup, or leaves their position alone.
  Edits update the results message in place. Only works between rounds —
  blocked while a round is actively in progress.
- `/reminders-setup [enabled:...] [time:...]` turns event reminders on or
  off and sets what time of day they go out, UK time. They're **off**
  until you turn them on. `enabled:True` turns them on at 9am (or
  whatever time was last set); `time:"08:30"`, `"9am"` and so on sets
  the time and turns them on in one go; `enabled:False` turns them off
  again, keeping the time for next time. Run it with no options to see
  the current setting and every upcoming slot that has someone in it
  (which day, and who).
  - On the day of each slot, at that time, the bot DMs whoever's in it. If
    someone's in more than one slot that day, they get one DM listing all
    of them.
  - It's whoever's in the slot at the time: picking a slot, an admin's
    `/polling-edit`, and a ❌ drop-out all update who gets one. Someone
    who only joins a slot after that morning's reminder time doesn't get
    one, since they've only just signed up.
  - Checked every minute, and each reminder is recorded once sent, so a
    restart never repeats one. If the bot was offline at reminder time, it
    catches up as soon as it's back, as long as it's still that day.
  - The DM links the results message so people can ❌ out if they can't
    make it (while that's still the latest round). Each reminder is noted
    in the log channel, as is a reminder that couldn't be delivered.
- `/queue-status` shows the current queue order, any round in progress, and
  who's currently snoozed and when they're back.
- `/queue-snooze-clear` clears every currently-snoozed member of the queue role
  at once and DMs each of them that they're back in — for when you'd
  rather reset everyone than wait for individual snoozes to expire.
- `/queue-rejoin` clears your own snooze early, if you're currently on
  one — no permission needed, since it only ever touches your own data.
- `/queue-position` tells you your own place in the queue — "#3 of 12" —
  without exposing the full ordering. Open to everyone; also flags if
  you're currently snoozed.
- `/queue-snooze [days:...]` lets you snooze yourself any time — no active
  poll needed, and no permission required. Defaults to 30 days; pass
  `days` for something shorter or longer.
- `/queue-snooze-user user:... [days:...]` is the admin equivalent for
  snoozing someone else, same defaults, and DMs them to let them know
  (unless their DMs are closed, in which case it just fails silently and
  the snooze still applies).

All commands require the **Manage Server** permission, except
`/queue-rejoin`, `/queue-position`, and `/queue-snooze`, which anyone can
use for their own data.

## Getting started

1. Create an application + bot at the
   [Discord Developer Portal](https://discord.com/developers/applications),
   and copy its token (**Bot** page → Reset Token / Copy).
2. On the same **Bot** page, enable the **Server Members Intent**
   (privileged intent — required to read who has the queue role).
3. Invite the bot to your server via **OAuth2 → URL Generator** with the
   `bot` and `applications.commands` scopes, and bot permissions **View
   Channels**, **Send Messages**, **Embed Links**, **Add Reactions**, and
   **Read Message History** (it only reads roles, it doesn't assign them —
   no Manage Roles needed) — together these are permissions integer
   `85056`. Open the generated URL and add it to your server. If you'd
   rather skip the checkbox UI, build the invite URL directly:
   `https://discord.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&scope=bot%20applications.commands&permissions=85056`
   (swap in your application ID from the Developer Portal's **General
   Information** page).
4. Copy `.env.example` to `.env` and paste in `DISCORD_TOKEN` — that's the
   only secret needed. Everything else (queue role, results channel) is
   configured afterward in Discord itself.
5. Start the bot (see **Running the bot**, below). It logs in and
   automatically registers its slash commands in every server it's in — no
   separate deploy step, and no need to know the server's ID. This usually
   takes a few seconds; reload Discord if the commands don't show up right
   away.
6. In Discord, run `/setup role:@YourQueueRole channel:#your-channel` once
   to finish configuration. Optionally run `/reminders-setup time:9am` too,
   to DM people on the morning of their slot.

## Running the bot

This is a Docker-only project — no local Node.js install needed. From the
project folder, with `.env` in place:

```bash
docker compose up -d --build
```

`docker-compose.yml` mounts `./data` into the container so the queue
survives restarts and rebuilds. Logs:

```bash
docker compose logs -f
```

**A published image is also available** — every push to `main` builds and
pushes `ghcr.io/lewismelotech/discord-queue-bot:latest` via GitHub Actions
(see `.github/workflows/docker-publish.yml`). Anywhere you don't need to
build from source, skip the build entirely:

```bash
docker compose pull && docker compose up -d
```

Without Compose, plain Docker works too — either build locally:

```bash
docker build -t discord-queue-bot .
docker run -d --name discord-queue-bot --restart unless-stopped \
  --env-file .env -v "$(pwd)/data:/app/data" discord-queue-bot
```

or pull the published image directly:

```bash
docker run -d --name discord-queue-bot --restart unless-stopped \
  --env-file .env -v "$(pwd)/data:/app/data" ghcr.io/lewismelotech/discord-queue-bot:latest
```

### Data & persistence

Queue, templates, and round state are stored in `data/state.json`, created
automatically on first run. Back it up if you want to preserve the queue
across moves.

## Deploying elsewhere (e.g. a NAS)

The bot's identity (its token, and its membership/role in your server)
lives in Discord, not on any one machine — moving hosts just means running
the same image somewhere else with the same `.env`. Since a published image
exists at `ghcr.io/lewismelotech/discord-queue-bot:latest`, the target
machine doesn't need the source code at all — just `docker-compose.yml`
and `.env`.

1. Get `docker-compose.yml` onto the target machine — download that one
   file, or `git clone` the whole repo if you'd rather have the source too.
2. Make sure Docker + Compose are installed there.
3. Recreate `.env` next to it with the same `DISCORD_TOKEN` — it's
   gitignored, so it never comes along with a `git clone` or a plain file
   copy, and has to be added by hand each time.
4. Optionally bring `data/state.json` over (`scp` it into `data/` before
   first start) to keep the existing queue/templates, or leave it out for
   a clean start — either way `/setup` needs running again since that also
   isn't tracked in git.
5. `docker compose pull && docker compose up -d` on the new machine — no
   build step, just pulls the published image.
6. **Stop the old instance first** (`docker compose down` on the original
   machine). The same bot token connected twice means both instances react
   to the same Discord events — DMs get sent twice, and the two `state.json`
   files diverge. Only one instance should run at a time.

### Using a stack manager (Dockge, Portainer, etc.)

The existing `docker-compose.yml` works as-is — these tools are UIs over
`docker compose`, not a different format. For Dockge specifically: create a
new stack in its configured stacks directory (default `/opt/stacks/<name>`)
containing just `docker-compose.yml` and `.env` — no need to clone the whole
repo — then deploy. It pulls the published image on first run since
`build:` is only used if you explicitly ask for a rebuild. After a new
version is published, use the UI's Pull/Update button if it has one, or
`docker compose pull && docker compose up -d` over SSH.

Dockge's `.env` tab shows a generic placeholder by default — it doesn't
read this project's `.env.example` automatically. To get the real template
loaded instead of typing from scratch, put an actual `.env` file in the
stack folder *before* Dockge indexes it (e.g. `cp .env.example .env` over
SSH), then fill in the value from its editor.

## Contributing

This started as a personal project, but issues and pull requests are
welcome — especially bug reports, since it's only been tested against one
real setup so far.

## License

[MIT](LICENSE)

## Legal

[Terms of Service](TERMS_OF_SERVICE.md) · [Privacy Policy](PRIVACY_POLICY.md)
