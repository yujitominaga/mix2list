# First Claude Code session — kickoff prompt

Claude Code has no memory of how this project was built. Paste something like the
message below as your very first turn in a new Claude Code session, so it orients
itself from the files instead of guessing. After this once, `CLAUDE.md` does the
work — you won't need to repeat it.

---

**Kickoff message (copy/paste, edit freely):**

> This is mix2list — a personal tool that turns a YouTube DJ mix into a Spotify
> playlist. Before doing anything, read `CLAUDE.md` in the repo root, especially
> the "Design intent", "Hard constraints", and "Decisions & dead ends" sections —
> they capture choices and things we already tried and rejected, so we don't
> repeat them.
>
> Then give me a short summary of: (1) the architecture, (2) the design
> principles, and (3) the hard constraints — so I can confirm you've got the
> context right before we start making changes.
>
> Don't change any code yet.

---

**Why the "don't change code yet" line matters:** it forces a read-and-confirm
step first. If the summary it gives back is wrong or missing something, you catch
it before it starts editing — cheaper than undoing bad changes.

**After the summary checks out,** give it one small, well-scoped task to verify it
works end to end (read → diff → your approval → apply → commit) before handing it
anything big. E.g. "adjust the track-row hover timing" or "add a JA string I
missed." Then scale up.
