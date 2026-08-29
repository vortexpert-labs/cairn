# Adopting Cairn in an existing project

A new project can start with `cairn init` and record things as they are settled. An existing one is harder: the decisions were made years ago, the reasoning lives in people's heads and closed pull requests, and nobody is going to sit down and write it all out.

So don't. Start with three to five anchors and let the rest accumulate when it comes up.

## The rule that keeps this small

An anchor is worth writing only if all four hold:

1. It will still be true in months, not days.
2. The reason is not visible in the code.
3. It stops someone repeating a path that is now closed.
4. It fits in one to three sentences.

Most things fail this. That is the point. Cairn is built for tens of anchors, and a project with a hundred has become a wiki nobody reads.

## Let an agent draft them

The agent you already use knows your codebase, and if you have been working with it for a while it has watched you reject things. That is exactly the material worth recording, and it is the part no static analysis can recover.

Install the adapters, then paste the prompt below:

```
npx @vortexpert-labs/cairn init --stage PRODUCTION
npx @vortexpert-labs/cairn adapters --write
```

> Read this repository and propose three to five Cairn anchors for it.
>
> I am looking for the things a new engineer would get wrong in their first
> week, and that the code does not explain on its own:
>
> - Constraints that hold for a reason: a library we deliberately do not use,
>   a pattern we avoid, a boundary between modules that must not be crossed.
> - Decisions where an obvious alternative was rejected, and why.
> - Approaches that were tried in this codebase and abandoned. Check the git
>   history for reverted work, and anything you have seen me reject in our
>   previous sessions.
> - The project's current stage, and what that changes about acceptable
>   trade-offs.
>
> Do not record anything derivable from reading the code: file layout,
> dependency lists, framework conventions, or how to run the tests. Those
> belong in a README.
>
> For each one, show me the anchor before writing it and tell me which of the
> four tests it passes. Write them with `cairn new`, which drafts them as
> PROPOSED. I will promote the ones I agree with.

Then read what it wrote:

```
npx @vortexpert-labs/cairn timeline
npx @vortexpert-labs/cairn show ANC-0002
```

Promote the ones you agree with, and delete the rest:

```
npx @vortexpert-labs/cairn status ANC-0002 ACTIVE
```

An anchor you have not read is worse than no anchor, which is why nothing an agent writes is binding until a person moves it to `ACTIVE`.

## Wire it into review

```yaml
# .github/workflows/cairn.yml
name: Cairn
on: [pull_request]

permissions:
  contents: read
  pull-requests: write

jobs:
  anchors:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0   # the immutability check compares against history
      - uses: vortexpert-labs/cairn@v1
```

This validates the anchors, comments on the pull request with the ones governing the change, and lists any that are still proposed. That comment is where the record earns its keep: a constraint written a year ago is worth nothing if nobody sees it while approving the change that breaks it.

Add `allow-verify: true` once you have constraints carrying shell checks. It is off by default, and a repository can never turn it on for itself.

## After the first week

Record anchors as things get settled, not in batches. The `/anchor-this` skill exists for exactly the moment you have just decided something:

```
/anchor-this
```

Two habits matter more than anything else here:

**Write down what you ruled out.** A `DECISION` without `alternatives` cannot honestly be reopened later — there is nothing recorded to reconsider, so the next person re-derives the whole argument from nothing.

**Say what would change your mind.** `--revisit-if` names the condition that would make an anchor wrong. It is the difference between a record that goes stale silently and one that tells you when to look at it again.

## When not to bother

If a rule can be enforced by a real linter — ESLint, dependency-cruiser, ArchUnit, a type checker — write that instead. It is strictly stronger. Anchors are for the constraints those tools cannot express, and where a constraint is partly checkable, `--verify` lets the anchor carry the check.
