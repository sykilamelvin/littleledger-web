# Little Ledger

A planner ledger that runs entirely in your browser. Plan the month first —
salary in, every bill listed — and what is left is what there is to spend.
Day to day spending counts that down.

No server, no sign in, no account. Nothing you type leaves your device.

## Where your records live

In this browser's own storage, on this device. That has two consequences
worth knowing before you rely on it:

- **Clearing your browsing data erases it.** So does a private window, and so
  does switching to another phone or browser.
- **Nothing syncs.** The copy on your phone and the copy on your laptop are
  two separate ledgers.

**Settings → Backup → Save a copy** writes a `.json` file you can keep
somewhere safe, and **Restore from a file** reads it back. Do that now and
then; it is the only copy there is.

If you would rather have accounts and a real database that syncs between
devices, that version of this app exists and needs a host that runs Node and
MySQL.

## Running it

It is a plain web page. Open `index.html`, or put the folder on any static
host — GitHub Pages, Netlify, anything. There is nothing to build and nothing
to install.

## What it does

- **Log** — plan the month, tick bills as you pay them, then record spending
  with two fields: an amount and what it was for. The category is worked out
  from the note.
- **History** — every record by day. Tap one to fix its note or category.
- **Debts** — each commitment with its own last payment date, so instalments
  that stack fall off separately.
- **Savings** — goals, net worth, and a month by month forecast of what frees
  up as each debt ends.
- A calculator that handles percentages the way a till does, and drops its
  answer straight into the entry.

Built on the Knot Studio design system.
