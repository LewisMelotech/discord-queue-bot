# Sign-up Queue Bot

Manages a rotating sign-up queue drawn from everyone with a chosen Discord
role. Poll structure (title + named slots, e.g. "Weekend Storytelling" with
slots "Friday" / "Saturday AM" / "Saturday PM" / "Sunday") is defined as
reusable **templates**, so different recurring events can have different
line-ups without touching config.

## How it works

- `/setup role:... [channel:...]` (run this first) sets which role's members
  make up the queue, and optionally a default results channel. Picked
  natively from Discord's own role/channel pickers — nothing to look up or
  copy by hand. Re-run it any time to change either.
- `/queue-sync` builds/refreshes the queue from current members of the
  configured role. New members are added to the top (asked before anyone
  already in the rotation); anyone who lost the role is removed. Existing
  order among current members is preserved.
- `/template-create name:"..." slots:"..."` creates (or updates, if the name
  already exists) a template — a title plus a comma-separated list of slot
  names, e.g. `slots:"Sat {{next}} AM, Sat {{next}} PM, Sun {{next}}"`. Up
  to 20 slots per template.
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
- `/template-view [name:...]` shows one template's slots, or lists all
  saved templates if you omit `name`.
- `/template-delete name:...` removes a saved template.
- `/polling-start template:... [title:...] [channel:...]` starts a round
  using a saved template (the `template` option autocompletes from what
  you've created). Pass `title` to override just this run's title (e.g. a
  one-off "Halloween Storytelling" using the regular weekend template) —
  the saved template itself is untouched. The bot DMs the person at the top
  of the queue asking if they want to sign up, with a button per slot plus
  **Not Available** and **Don't ask again for a month**.
  - Pick a slot → they're locked into that slot and moved to the **bottom**
    of the queue.
  - Not Available → they're moved to the **top** of the queue (asked first
    next round) and the bot moves on.
  - Don't ask again for a month → they're skipped by every round (this one
    and any future one) for 30 days, no matter what else happens — passing,
    picking a slot, or anything else doesn't cancel a snooze early. Their
    queue position is untouched, and it lifts automatically once it expires.
    An admin can end it early for everyone with the queue role at once with
    `/clear-snooze`, which also DMs each of them that they're back in.
  - If a DM can't be delivered (DMs closed), the bot posts a notice in the
    round's channel, skips them for this round only, and they keep their
    current queue position.
  - If everyone in the queue has been asked once and slots are still open,
    the bot loops back and offers spare slots to people who already took
    one — so one person can end up covering more than one slot rather than
    leaving it unfilled, rotating fairly if more than one person is willing.
  - This repeats automatically until all slots are filled, then the bot
    posts the final line-up as a message in the channel, titled with the
    template's name.
- `/polling-stop` cancels the in-progress round early (started by mistake,
  wrong template, whatever) — posts a notice showing whatever was filled so
  far, then clears the round so `/polling-start` can be run again. Anyone
  already locked into a slot keeps their queue position from that; it isn't
  rolled back.
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
- `/queue-status` shows the current queue order, any round in progress, and
  who's currently snoozed and when they're back.

All commands require the **Manage Server** permission.

## Setup

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
   only secret needed.
5. Install [Node.js](https://nodejs.org/) 18+ if you don't have it (skip
   this if running with Docker instead — see below).
6. Start the bot (`npm start`, or the Docker instructions below). It logs in
   and automatically registers its slash commands in every server it's in —
   no separate deploy step, and no need to know the server's ID. This
   usually takes a few seconds; reload Discord if the commands don't show
   up right away.
7. In Discord, run `/setup role:@YourQueueRole channel:#your-channel` once
   to finish configuration.

## Install & run

```bash
npm install
npm start
```

## Run with Docker

Steps 1–4 above (Developer Portal setup + `.env`) still apply. Then:

```bash
docker compose up -d --build
```

`docker-compose.yml` mounts `./data` into the container so the queue survives
restarts and rebuilds, and reads `DISCORD_TOKEN` from `.env` via `env_file`.
Logs:

```bash
docker compose logs -f
```

Without Compose, plain Docker works too:

```bash
docker build -t storyteller-queue-bot .
docker run -d --name storyteller-bot --restart unless-stopped \
  --env-file .env -v "$(pwd)/data:/app/data" storyteller-queue-bot
```

## Data

Queue, templates, and round state are stored in `data/state.json`, created
automatically on first run. Back it up if you want to preserve the queue
across moves.

## Upgrading from an older setup

`CLIENT_ID`, `GUILD_ID`, `STORYTELLER_ROLE_ID`, and `RESULTS_CHANNEL_ID` are
no longer used — leftover values in an existing `.env` are simply ignored.
Run `/setup role:... channel:...` once after upgrading to carry your role
and results channel over into `data/state.json`; your existing queue and
templates in there are untouched.
