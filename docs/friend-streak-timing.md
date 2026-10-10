# Friend Streak timing — two options for Deb

Nothing here is implemented yet: the app still uses **A**. This note is for
choosing. (Solve Streak isn't affected — it has no clock.)

Throughout: **Deb is in Denver (MDT, UTC−6), Sam is in Tokyo (JST, UTC+9)** —
Tokyo is 15 hours ahead. Times are shown as *Denver / Tokyo*.

## A. Fixed 24-hour periods (current)

The finish that starts a streak sets the clock. From then on the streak is
counted in back-to-back 24-hour periods. The first finish in each new period
adds 1; more finishes in that period add nothing. A period with no finish
breaks it.

Sam finishes Deb's puzzle **Sat 8:00 PM / Sun 11:00 AM** → Friend Streak **1**.
Periods now start every day at 8:00 PM Denver / 11:00 AM Tokyo.
The deadline shown is **Mon 8:00 PM / Tue 11:00 AM**.

| When (Denver / Tokyo) | What happens | Friend Streak |
| --- | --- | --- |
| Sat 8:20 PM / Sun 11:20 AM — Sam sends one right back, Deb plays it at once | Same period: already counted. App says more puzzles before Sun 8:00 PM won't add a day | 1 |
| Sun 9:00 PM / Mon 12:00 PM — Deb finishes another | New period → counts. Deadline moves to Tue 8:00 PM | **2** |
| Mon — nobody plays | Still alive: the deadline is Tue 8:00 PM | 2 |
| Tue 7:58 PM / Wed 10:58 AM — Sam finishes just before the deadline | Counts. Deadline moves to Wed 8:00 PM | **3** |
| …or Tue 8:01 PM / Wed 11:01 AM instead | A whole period (Mon 8 PM → Tue 8 PM) passed empty → **broken**. This finish starts a new streak at 1, with a new clock from 8:01 PM | 1 |

- **Increases:** on the first finish in each new period.
- **Breaks:** at the deadline, which is the end of the period after the last counted one. A finish at or after it starts over at 1.
- **Time zones:** one fixed moment every day for both friends (8 PM for Deb, 11 AM for Sam). Daylight saving shifts it by an hour locally, because periods are elapsed hours.
- **Quirks:**
  - Two finishes minutes apart on either side of a boundary count as two days.
  - Finishes up to almost 48 hours apart can still count.
  - If the streak started at an awkward hour, that stays the daily boundary until it breaks.

## B. Reset the deadline after each qualifying finish

Each finish that counts moves the deadline to **24 hours after that finish**.
On its own this can be farmed: a quick send-back-and-play would add a day
every few minutes. So B also needs a **minimum gap** before the next finish
can count; 12 hours is used below as an example. Finishes inside the gap do
nothing.

Sam finishes **Sat 8:00 PM / Sun 11:00 AM** → Friend Streak **1**.
The deadline is **Sun 8:00 PM / Mon 11:00 AM** — 24 hours, not the 48 A gives.

| When (Denver / Tokyo) | What happens | Friend Streak |
| --- | --- | --- |
| Sat 8:20 PM / Sun 11:20 AM — immediate send-back, Deb plays it | Inside the 12-hour gap: doesn't count, deadline unchanged. (With no gap it would count → 2, and could be repeated) | 1 |
| Sun 7:00 PM / Mon 10:00 AM — Deb finishes | 23 h after the last counted finish → counts. Deadline → Mon 7:00 PM | **2** |
| Mon 6:58 PM / Tue 9:58 AM — Sam finishes just before the deadline | Counts. Deadline → Tue 6:58 PM | **3** |
| …or Mon 7:01 PM / Tue 10:01 AM instead | Past 24 h → **broken**; starts over at 1, deadline Tue 7:01 PM | 1 |
| (compare) Sun 9:00 PM / Mon 12:00 PM — the same finish that counted under A | Past Sun 8:00 PM → **broken** under B | 1 |
| Playing early: Sam finishes Mon 8:00 AM / Mon 11:00 PM (13 h after) | Counts, but the deadline jumps **earlier** to Tue 8:00 AM Denver / Tue 11:00 PM Tokyo | 3 |

- **Increases:** on a finish at least the gap after the last counted finish, and within 24 hours of it.
- **Breaks:** 24 hours after the last counted finish.
- **Time zones:** the deadline moves every time a finish counts. It can wander into one friend's night (a 7 AM Denver finish sets a 10 PM Tokyo deadline the next day), and the other friend has to keep re-checking it.
- **Quirks:**
  - Playing sooner shrinks the next window.
  - The gap length is a new rule players have to learn ("why didn't that count?").

## Recommendation: keep A

- It can't be farmed without an extra rule.
- The deadline is a steady time both friends can plan around.
- It forgives the day-to-day drift of two people in different time zones: finishes can be up to ~48 hours apart.
- The confusing part of A was the "already counted" state. The screens now say plainly when a period is already counted, when the next day starts counting, and the deadline in each friend's own time.

If a steadier daily time matters more later, a gentler change than B would be to let a pair move its period boundary to a friendlier hour once, without resetting the streak. That's also a timing decision, so it's left for Deb.
