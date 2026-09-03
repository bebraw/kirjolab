---
name: simplify
description: Simplify recently changed code for clarity and consistency without changing behavior or expanding scope.
---

# Simplify

Review the user-specified changes. Preserve behavior and public contracts while reducing conceptual overhead:

- shorten mechanical names without losing domain meaning;
- merge substantially overlapping types, helpers, or constants;
- derive values instead of passing or storing duplicate state;
- remove indirection that has no distinct responsibility.

Touch only the requested scope and run relevant verification after editing.
