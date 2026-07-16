# ADR-121: Record Research Questions in Markdown

## Status

Implemented

## Context

Research questions need more structure than a diary entry, but they remain
authorial content that should travel with the manuscript. A proprietary resource
model would make exported projects lose their research agenda.

## Decision

Use a conventional `research-questions.md` project file. A level-two `RQ…`
heading identifies each question; labelled Markdown list fields record its
status, motivation, method, manuscript anchors, and stable claim IDs.

## Consequences

- The research agenda stays readable, editable, collaborative, and portable.
- The parser must tolerate incomplete entries and unknown values.
- Links are explicit author assertions; Kirjolab does not infer them from prose.

## Alternatives Considered

- Front matter was rejected because multiple long questions are awkward to edit there.
- Dedicated database rows were rejected because they would make an export incomplete.
