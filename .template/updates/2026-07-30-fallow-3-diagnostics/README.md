# Upgrade Advisory Diagnostics to Fallow 3

Use this update when moving an existing Fallow changed-code audit to the 3.x
CLI and its upstream-attributed new-only verdict.

## Apply

1. Pin Fallow 3 and regenerate the package lock.
2. Exclude checked-in generated declarations from all Fallow analysis.
3. Declare framework-reflected class members, such as Cloudflare Durable Object
   RPC methods, through scoped `usedClassMembers` rules.
4. Remove suppression comments that become stale after the framework rule.
5. Run the audit against the branch upstream and address introduced findings;
   keep inherited findings advisory.

## Fallback

Adapt generated-file and framework-member rules to the target project. Do not
copy Cloudflare-specific rules into a project without Durable Objects.

## Verify

- `npm run diagnostics:readability`
- `npm run diagnostics:health`
- `npm run quality:gate:fast`
