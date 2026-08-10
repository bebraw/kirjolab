# ADR-169: Recognize Held PDF Drawing Shapes

**Status:** Implemented

**Date:** 2026-07-25

## Context

The private PDF Draw tool stores sampled freehand points until pointer release.
Researchers drawing diagrams benefit from the Apple Notes convention where a
single-stroke shape snaps to clean geometry after a short hold, remains under
the same pointer, and can be adjusted before release.

Simple geometric rules recognize lines reliably, but closed shapes vary by
starting point, direction, rotation, and drawing style. Building and training a
browser ML model would add data collection, model delivery, and calibration
work before the common line, ellipse, rectangle, and triangle cases are known
to need it.

## Decision

Pin `@smartupcorp/onedollar-unistroke-recognizer` 1.0.0 and isolate it behind a
Kirjolab-owned shape-recognition module. The package supplies the BSD-licensed
`$1` template classifier; Kirjolab remains responsible for:

- minimum-size, closure, score, and runner-up rejection gates;
- direction-independent matching;
- geometric fitting and canonical point generation;
- line recognition;
- pause timing and pointer capture;
- same-pointer scale and rotation around an opposite anchor; and
- conversion between page-pixel recognition coordinates and normalized
  persisted drawing points.

An 850 millisecond stationary period attempts recognition while the pointer is
still down. Samples that remain within six CSS pixels of the held endpoint are
treated as device jitter and do not restart the period; meaningful movement
beyond that tolerance starts a new hold. A successful match transitions the
page-local markup layer from drawing freehand points to manipulating the fitted
shape. Later pointer movement replaces the canonical preview in that same layer
rather than appending ink or rerunning the classifier. Pointer release saves the
final point sequence through the existing private drawing API.

Recognized shapes are not persisted as semantic editable objects. They remain
ordinary drawing point sequences, preserving existing storage, annotated PDF
export, deletion, and undo behavior. Selecting and editing shape geometry after
release is outside this decision.

## Consequences

**Positive:**

- Shape recognition is immediate, offline, and does not upload drawing data.
- The first release covers common diagram shapes without an ML runtime or model.
- The recognizer can be replaced behind one typed module if field data supports
  a different classifier later.
- Existing PDF markup storage and export need no migration.

**Negative:**

- Template classification still needs conservative thresholds and regression
  samples to avoid unwanted snaps.
- Canonical shapes lose freehand variation once accepted.
- Shapes cannot be semantically resized or rotated after pointer release.
- A young package becomes a pinned production dependency.

## Alternatives Considered

### Train a coordinate-sequence model

This scales better to hearts, stars, clouds, and other complex shapes, but it
requires representative positive and negative stroke data plus a model
delivery and evaluation workflow. That cost is not justified for the initial
four shape families.

### Use only handwritten geometric heuristics

This avoids a dependency and works well for lines, but robustly distinguishing
rough ellipses, rectangles, and triangles would recreate a template classifier
and its normalization behavior.

### Persist semantic shapes immediately

Storing shape kind, bounds, rotation, and handles would enable later editing,
but changes the private markup API, storage validation, selection model, and
annotated PDF export. Same-gesture adjustment does not require that expansion.
