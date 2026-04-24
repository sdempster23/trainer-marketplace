# PawMatch — Claude Code Solo Build Package

This package takes you from **zero dev tools installed** to **running Claude Code on your PawMatch project with a team of six specialized subagents ready to build**. Follow it top to bottom the first time — it's designed to be read in order.

---

## What you're about to do

You're going to build PawMatch — a two-sided marketplace connecting dog owners with trainers — using Claude Code as your primary IDE. Six subagents will handle different parts of the stack: frontend, backend, database, payments, testing, and deployment. You'll stay in the "product manager / architect" seat, and the subagents will execute focused work in their own context windows.

The full build is a 6+ month part-time project. This guide gets you past the first two weeks (the hardest part), after which the routine becomes: read → prompt → review → commit → repeat.

**One thing to internalize up front:** when something in these docs says "the user must do X manually," that means you — the Stripe dashboards, the DNS records, the legal stuff. Claude Code won't do those for you. Everything else, you'll delegate.

---

## What's in this package

```
pawmatch-claude-code-setup/
├── README.md              ← you are here
├── CLAUDE.md              ← project context file (goes in project root)
├── architecture.md        ← data model + system overview
├── build-plan.md          ← the 14 phases, in order
├── starter-prompts.md     ← copy-paste prompts for each phase
└── .claude/
    └── agents/
        ├── frontend-agent.md
        ├── backend-agent.md
        ├── database-agent.md
        ├── stripe-agent.md
        ├── testing-agent.md
        └── devops-agent.md
```

The `.claude/agents/` folder and `CLAUDE.md` go **inside your project directory** (we'll create that in Part 2). The other files are reference — keep them handy but they don't need to be in the project.

---

## Part 1 — Install the dev tools (one-time, ~60 min)

Open **Terminal** (Cmd+Space, type "Terminal"). Every command below goes in Terminal. Copy one line at a time, hit enter, wait for it to finish before moving on.

### 1.1 — Install Xcode Command Line Tools
Apple's baseline dev toolchain. Git and a C compiler ride along.
```bash
xcode-select --install
```
A popup will appear. Click Install. Takes 5–15 minutes.

### 1.2 — Install Homebrew
The macOS package manager. This is how you'll install almost everything else.
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```
At the end it will tell you to run two commands to add Homebrew to your PATH. **Run them.** They look like `echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile` and a second `eval` command. Read the output, copy, paste, enter.

Verify:
```bash
brew --version
```
You should see something like `Homebrew 4.x.x`. If you see "command not found," the PATH step didn't take — close Terminal, reopen, try again.

### 1.3 — Install nvm (Node Version Manager)
Node is the JavaScript runtime Next.js needs. nvm lets you switch versions cleanly, which matters over a long project.
```bash
brew install nvm
mkdir ~/.nvm
echo 'export NVM_DIR="$HOME/.nvm"' >> ~/.zshrc
echo '[ -s "/opt/homebrew/opt/nvm/nvm.sh" ] && \. "/opt/homebrew/opt/nvm/nvm.sh"' >> ~/.zshrc
source ~/.zshrc
```

### 1.4 — Install Node.js LTS
```bash
nvm install --lts
nvm use --lts
node --version
```
Should print something like `v22.x.x`.

### 1.5 — Install pnpm
Faster and more disk-efficient than npm. This is the package manager we'll use.
```bash
npm install -g pnpm
pnpm --version
```

### 1.6 — Install Git (if it's not already there)
```bash
git --version
```
If that prints a version, skip. Otherwise:
```bash
brew install git
```
Configure your identity (replace with your actual info):
```bash
git config --global user.name "Shane [Last Name]"
git config --global user.email "shane@example.com"
git config --global init.defaultBranch main
```

### 1.7 — Install VS Code
This is where you'll view and edit files. Claude Code runs in Terminal but reads/writes the same files VS Code sees.
```bash
brew install --cask visual-studio-code
```
Open VS Code once, then open Command Palette (Cmd+Shift+P), type "Shell Command: Install 'code' command in PATH" and run it. Now you can open any folder from Terminal with `code .`.

### 1.8 — Install Claude Code
```bash
npm install -g @anthropic-ai/claude-code
claude --version
```

---

## Part 2 — Create accounts (one-time, ~30 min)

You'll need accounts on these services. Create them in this order. Use your personal email, not Wells Fargo — these are personal tools.

### 2.1 — GitHub
Go to [github.com/signup](https://github.com/signup). Pick a username you're okay with publicly. Free tier is fine.

Then set up SSH so you don't have to type your password every push:
```bash
ssh-keygen -t ed25519 -C "shane@example.com"
```
Hit enter three times (accept defaults, no passphrase).
```bash
cat ~/.ssh/id_ed25519.pub | pbcopy
```
That copies your public key. Go to [github.com/settings/keys](https://github.com/settings/keys), click "New SSH key," paste, save.

Test:
```bash
ssh -T git@github.com
```
Say "yes" to the fingerprint prompt. You should see `Hi <username>! You've successfully authenticated`.

### 2.2 — Anthropic (for Claude Code)
You probably already have this via your Claude.ai account. Claude Code will ask you to sign in the first time you run it — use the same account.

### 2.3 — Supabase
Go to [supabase.com](https://supabase.com), sign in with GitHub. Free tier is plenty for dev.

**Don't create a project yet** — the database-agent will do that with you in Phase 1.

### 2.4 — Stripe
Go to [stripe.com](https://stripe.com), sign up. You'll start in test mode, which is fine until you're going live.

Important for a marketplace: you'll eventually need to apply for **Stripe Connect** and complete the **platform profile**. Don't do that now — we'll walk through it in Phase 7.

### 2.5 — Vercel (can wait until Phase 0.5)
Go to [vercel.com](https://vercel.com), sign in with GitHub. Free "Hobby" tier works for the entire prototype phase.

### 2.6 — Resend (can wait until Phase 11)
Transactional email. [resend.com](https://resend.com). Free tier = 3,000 emails/month.

### 2.7 — Sentry (can wait until Phase 13)
Error tracking. [sentry.io](https://sentry.io). Free tier is generous.

---

## Part 2.5 — What this will cost you

You're a financial advisor — you'll want the numbers up front. Here's the full picture, verified against current 2026 pricing.

### During development (Phases 0 through 13): **~$0/month**

Every service we're using has a free tier generous enough to cover prototype development:

| Service | Free tier | What it buys during dev |
|---|---|---|
| Vercel Hobby | Free (non-commercial only) | Unlimited preview deploys, 100 GB bandwidth/mo |
| Supabase Free | Free | 500 MB database, 50k MAU, auto-pauses after 1 week inactive |
| Stripe | Free | Test mode, unlimited transactions |
| Resend | Free | 3,000 emails/month, 100/day |
| Sentry | Free (Developer tier) | 5k errors/month |
| Cloudflare DNS | Free | Unlimited DNS queries |
| GitHub | Free | Private repos, 2,000 CI minutes/month |

**You can build through Phase 13 without spending a dollar on infrastructure.** Your only real spend is your existing Claude subscription.

### Going live (Phase 14+): **~$46/month baseline**

Two services flip from free to paid the moment you start charging real users. This is not optional — it's a Terms of Service requirement.

| Service | Cost | Why |
|---|---|---|
| **Vercel Pro** | **$20/mo** | Hobby is explicitly non-commercial — when you take money, you must be on Pro (Vercel actively enforces this) |
| **Supabase Pro** | **$25/mo** | Free projects auto-pause after 1 week of inactivity (dealbreaker) + no daily backups on free |
| Domain | ~$1/mo | $10–15/year at Cloudflare Registrar (at-cost) |
| Resend | $0 | Free tier covers first few thousand users |
| Sentry | $0 | Free tier covers first several months of real traffic |

**Baseline total: ~$46/month** for a real, live marketplace. Supabase Pro handles ~100k MAU and Vercel Pro includes 1 TB bandwidth — you won't bump these ceilings for a long time.

### Transaction fees (not monthly — per booking, paid to Stripe)

- **2.9% + $0.30** per card transaction (standard Stripe processing)
- **0.25% + $0.25** per payout to a trainer's Connected account

**Example math on a $100 session with your default 15% platform commission:**

| Line item | Amount |
|---|---|
| Owner pays | $100.00 |
| Your platform commission (15%) | $15.00 |
| Transferred to trainer | $85.00 |
| Stripe processing fee (your cost) | –$3.20 |
| **Your net per booking** | **~$11.80** |

**Break-even math:** 4 bookings/month at this rate covers the $46/mo infrastructure cost. Very achievable if PawMatch does anything at all.

### First-year budget estimate

Assumes Phase 14 (go-live) hits around month 6 of your build.

| Item | Cost |
|---|---|
| Months 1–6 (development) | $0 |
| Months 7–12 (live) | $46 × 6 = $276 |
| Domain | $12 |
| Legal review of Terms of Service + Privacy Policy | $300–500 one-time |
| **Year 1 total infrastructure + legal** | **~$600–800** |

Plus transaction fees scaling proportionally with revenue — which is the healthy kind of cost.

### Scaling triggers (what future-you will pay for)

Watch for these inflection points:

- **Supabase compute add-on** (+$10–30/mo): when you hit ~5k daily active users and queries start slowing
- **Sentry Team** ($26/mo): when your error volume exceeds the 5k/month free tier
- **Upstash Redis** ($0–10/mo): Phase 13 rate limiting; free tier is usually fine
- **Resend Pro** ($20/mo): when you exceed 3k emails/month
- **Mapbox** (if you outgrow MapLibre + OSM): $0 for first 50k map loads/month, then ~$0.60/1k

None of these are urgent. Most won't hit until year 2.

---

## Part 3 — Create the project (10 min)

### 3.1 — Pick a home for your code
```bash
mkdir -p ~/Code
cd ~/Code
```

### 3.2 — Create the project folder
```bash
mkdir pawmatch
cd pawmatch
git init
```

### 3.3 — Drop in the Claude Code config
Copy the `CLAUDE.md` file from this package into `~/Code/pawmatch/CLAUDE.md`.

Copy the `.claude/` folder from this package into `~/Code/pawmatch/.claude/`.

From Terminal, if you have the package in your Downloads:
```bash
cp ~/Downloads/pawmatch-claude-code-setup/CLAUDE.md .
cp -r ~/Downloads/pawmatch-claude-code-setup/.claude .
```

Verify:
```bash
ls -la
```
You should see `.claude`, `.git`, and `CLAUDE.md`.

### 3.4 — Open the project
```bash
code .
```
VS Code opens. You should see `CLAUDE.md` and the `.claude/agents/` folder with six files.

### 3.5 — Launch Claude Code
In VS Code, open the integrated terminal (Ctrl+` — that's the backtick).
```bash
claude
```
First run will ask you to sign in via browser. Do it. Come back to Terminal when it says you're authenticated.

You're now in a Claude Code session. The prompt looks like `>`. Type `/help` and enter to see commands. Type `/agents` to see your six subagents loaded.

---

## Part 4 — Run your first prompt

Open `starter-prompts.md` from this package. Find the **Phase 0 prompt**. Copy the entire block. Paste it into your Claude Code session. Hit enter.

Claude Code will start scaffolding the Next.js project. It'll ask questions — answer them based on what's in `starter-prompts.md`. Watch what it does. Don't worry about understanding every line yet; you'll come back to the code once it builds.

When it finishes, run:
```bash
pnpm dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser. You should see a working Next.js default page. **That's a milestone — commit it.**

```bash
git add -A
git commit -m "Phase 0: Next.js scaffold"
```

From here, follow `build-plan.md` phase by phase.

---

## Part 5 — The development loop (your daily routine)

For every phase:

1. **Read the phase in `build-plan.md`** — understand what you're about to build and why
2. **Paste the corresponding prompt from `starter-prompts.md`** into Claude Code
3. **Watch what Claude Code does** — don't rubber-stamp. Ask "why" when it makes a choice you don't understand
4. **Test it yourself in the browser** after each major step
5. **Commit when it works** — don't accumulate uncommitted work across phases
6. **Push to GitHub** at least once a day

```bash
git add -A
git commit -m "Phase X: <what you built>"
git push
```

**Rule of thumb:** if a Claude Code session is longer than ~30 minutes of back-and-forth, your context is probably getting bloated. Use `/clear` to start fresh, then reorient it with a short recap prompt.

---

## Part 6 — Things that will surprise you

These are real speed bumps first-time builders hit with marketplace apps. Know them in advance.

**Supabase Row Level Security (RLS)** will feel confusing for a week. You'll write a query that works in the Supabase SQL editor but returns nothing from your app. 95% of the time the cause is RLS blocking the query because the user context isn't being passed correctly. The database-agent will help, but expect to get bitten.

**Stripe Connect terms of service** are not just a checkbox — you have to complete a "platform profile" describing your marketplace, and Stripe reviews it. Do this in Phase 7, not the night before you want to go live. The review can take 1–5 business days.

**Deploying to Vercel the first time** will work on the first try. Deploying with environment variables set correctly will not. Budget an hour the first time.

**Supabase migrations vs the dashboard** — you can make schema changes in the Supabase dashboard UI, but then they won't be in your migration history and production won't know about them. Always go through `supabase migration new` with the database-agent.

**Money math** — never use JavaScript floats for money. Always integers in the smallest currency unit (cents). The stripe-agent enforces this, but when you write utility code yourself, remember it.

**Timezones** — always store UTC. Always. Every timestamp. This will bite you when a trainer in Eastern time books a morning slot that shows up at 2am for an owner in Pacific.

---

## Part 7 — Troubleshooting

| Symptom | First thing to check |
|---|---|
| `claude: command not found` | Re-run `npm install -g @anthropic-ai/claude-code`; close and reopen Terminal |
| Subagent not triggering | Check the description in the `.md` file — did "MUST BE USED for…" match the task? |
| `pnpm dev` errors about missing packages | `rm -rf node_modules && pnpm install` |
| Supabase RLS blocks a query that should work | Check if your client is using the anon key (RLS applies) vs. service key (RLS bypassed); anon key + correct session is what you want |
| Stripe webhook shows "signature mismatch" | You're using the wrong webhook secret for the environment, or you're parsing the body before verifying |
| Build fails on Vercel but works locally | Env var missing in Vercel project settings, or Node version mismatch — check `.nvmrc` |

When in doubt, copy the error into Claude Code with context: "I got this error, here's what I was trying to do."

---

## Part 7.5 — When Claude Code goes sideways

Every AI assistant makes mistakes. The difference between "mistake" and "catastrophe" is whether you have escape hatches ready. Git and Supabase both give you time machines — this section teaches you to use them.

### Daily safety habits

- **Commit after every working piece**, not every "complete feature." Small commits = small rollbacks.
- **Never work uncommitted for more than ~30 minutes.** If you've been heads-down for a while without a commit, that's a warning.
- **Push to GitHub at least once a day.** Your laptop could die. Your apartment could flood. Remote backups matter.
- **Before letting Claude Code run any bash command you don't recognize** — pause and ask "what does this do?"

### Git rescue toolkit

Memorize these. You will use them.

```bash
# "What has changed?"
git status                    # which files are modified
git diff                      # see changes line by line in unstaged files
git diff --staged             # see what's staged for the next commit

# "Undo uncommitted changes to a single file"
git checkout -- path/to/file.ts

# "Nuke ALL uncommitted changes" (use carefully)
git reset --hard HEAD

# "Undo the last commit but keep the changes" (common move)
git reset --soft HEAD~1

# "Undo the last commit AND delete the changes" (really gone)
git reset --hard HEAD~1

# "Undo a specific committed change without rewriting history" (safest)
git revert <commit-sha>       # creates a NEW commit that reverses the old one

# "I did something stupid, find my lost commits"
git reflog                    # shows every HEAD position, even after reset --hard
# Find the sha you want, then:
git reset --hard <sha-from-reflog>

# "Save work-in-progress without committing"
git stash                     # shelve changes
git stash pop                 # bring them back

# "What did this file look like at commit X?"
git show <sha>:path/to/file.ts
```

### Supabase migration rescue

**The rule: never edit a migration that's been applied to a remote database.** Always write a new "revert" migration.

```bash
# Local — nuke and reapply everything from scratch
supabase db reset

# Remote dev — create a revert migration
supabase migration new revert_<descriptive_name>
# write SQL that undoes the change
supabase db push

# Before any scary migration, back up first:
supabase db dump --db-url "<your-db-url>" > backup-$(date +%Y%m%d-%H%M).sql
```

### When Claude Code proposes something that feels off

Trust the instinct. Use one of these moves:

- **"Explain this first."** Have Claude Code walk through what it's about to do, step by step, before executing.
- **"Work on a branch."** `git checkout -b claude-experiment/<thing>`. Let Claude Code work. Review. Merge if good, delete if not.
- **"Show me the diff."** After changes, have Claude Code summarize what changed and why. Compare against what you expected.
- **"Back up first."** Before anything involving the database or deletion of files: make a backup.

### Red flags — stop immediately

If Claude Code suggests any of these, do not approve. Say "don't do that — explain what you're trying to accomplish and we'll find a different way":

- Running `DROP TABLE`, `DELETE FROM` without `WHERE`, or `TRUNCATE` against a remote DB
- Committing a file matching `*.env*` or containing anything key-like
- Adding `NEXT_PUBLIC_` prefix to anything labeled "secret," "private," or "service role"
- Disabling RLS "just temporarily"
- Using `--force` on a git push to main
- Editing a migration that's already been applied to a remote DB
- Adding a new dependency with no explanation of why
- "Bypassing" a failing test instead of fixing it
- Writing try/catch blocks that silently swallow errors
- Hardcoding API keys anywhere, even "just to test"

### Common recovery scenarios

**"Claude Code deleted files I needed."**
Check git. If committed: `git checkout -- <file>`. If not committed: they're gone. This is why you commit often.

**"Claude Code pushed a bad commit to main."**
`git revert <sha>` on your local main, then push. **Do not** `git reset` + force push — it rewrites shared history and will bite you later.

**"Claude Code applied a migration locally and broke everything."**
`supabase db reset` wipes local and reapplies from scratch. If the broken migration is the problem, edit it (local-only migrations are editable) before reset.

**"Claude Code added a package that broke the build."**
`git diff package.json pnpm-lock.yaml` shows what was added. Remove with `pnpm remove <package>`. `pnpm install`. Rebuild.

**"Claude Code's context is confused — it's contradicting itself."**
`/clear`. Paste the reorientation prompt from `starter-prompts.md`. Give one paragraph of context and one clear task.

**"Claude Code got deep into something and I realize it's the wrong approach."**
Interrupt with Ctrl+C in the terminal. Say "stop, let's talk about this before continuing." Reset the approach before more work piles up.

**"Claude Code keeps trying to do something I don't want."**
Be explicit and restate your constraint. "I hear you, but I want to do X instead of Y because Z. Stop suggesting Y." It'll respect the boundary.

### The meta-rule

If you ever feel rushed by Claude Code to approve something you don't fully understand — **that is the exact moment to slow down**. Claude Code has no timeline. Its confidence is not correlated with correctness. Your judgment is the final check.

---

## Part 8 — Learning resources for deeper understanding

Save these for when you want to understand what you're building, not just ship it.

**Marketplaces specifically**
- "Designing Two-Sided Marketplaces" — a16z (essay, ~20 min read)
- Stripe's own Connect docs — some of the best technical writing on payments anywhere
- Sangeet Paul Choudary's *Platform Revolution* (book)

**Next.js + React**
- The official Next.js tutorial at nextjs.org/learn — the tutorial walks through App Router patterns well
- Kent C. Dodds' Epic React course — advanced, but the fundamentals sections are worth the price

**Postgres + Supabase**
- Supabase docs on RLS — read twice; the mental model pays off
- *Designing Data-Intensive Applications* by Martin Kleppmann — the canonical book; chapters 2 and 3 cover what you need

**Stripe Connect**
- Stripe's "Becoming a Platform" guide
- Stripe's "Atlas Guides" on marketplaces

You don't need to read these before starting. You'll understand them much better after Phase 4 or 5 when the code has given you hooks to hang the concepts on.

---

## A note on pace

A solo build at 10 hours/week hits the prototype milestone (all V1 features working end-to-end) around month 5–6. The first month will feel like you're going slowly. Phases 1–3 are foundational and they pay off across everything that comes after. Don't skip to Phase 7 because payments feel exciting — Stripe without a working data model is a bad time.

Commit often. Push daily. Ask the subagents to explain things you don't understand instead of nodding along. The goal is **a working prototype** AND **you, the builder, actually understanding marketplace mechanics**. Both matter.

Now go read `CLAUDE.md`, then `architecture.md`, then `build-plan.md`, in that order. Then run Phase 0.
