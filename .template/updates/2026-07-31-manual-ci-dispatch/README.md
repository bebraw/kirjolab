# Add A Manual CI Recovery Trigger

Use this update when a repository needs to distinguish missing GitHub event
delivery from a workflow execution failure.

## Apply

1. Add `workflow_dispatch` to the existing CI workflow triggers.
2. Keep the normal push and pull-request triggers unchanged.
3. Document manual dispatch as a diagnostic recovery path, not the routine CI
   entrypoint.

## Fallback

If manual dispatch also fails to create a run, inspect repository Actions
permissions and the workflow's active state before changing job definitions.

## Verify

- Run the project's local CI gate.
- Push the workflow change.
- Run `gh workflow run CI --ref main` and confirm GitHub creates a run.
