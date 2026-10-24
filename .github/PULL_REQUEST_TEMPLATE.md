## Summary

<!-- What does this PR do and why? -->

Closes #

## Type of change
- [ ] Bug fix
- [ ] New feature
- [ ] Connector / transform
- [ ] Docs
- [ ] Refactor / chore

## Ethics checklist (required)
- [ ] Uses only **public or explicitly authorized** data sources
- [ ] Respects each source's Terms of Service and rate limits
- [ ] Does **not** track/deanonymize private individuals or access devices without authorization
- [ ] Datapoints carry provenance (`source`, timestamp, confidence)

## Testing
<!-- How was this verified? Commands, screenshots, preview link. -->

## Definition of Done
- [ ] CI green: lint, type-check, unit tests, build, CodeQL, gitleaks
- [ ] Opened the Vercel preview and clicked through the changed flow
- [ ] A Playwright check covers any new user flow
- [ ] Every new screen has loading, empty and error states and works at phone width
- [ ] Every new endpoint has a pydantic schema, auth + role check, input validation, and a test
- [ ] Every new data source documents its terms of use, rate limits and provenance fields
- [ ] No secrets in code or logs; new config goes through GitHub Environments
- [ ] This PR closes its linked issue; changelog entry generated from the title
