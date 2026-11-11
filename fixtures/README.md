# fixtures/

Synthetic fixtures for the engine's own tests (no real names, accounts or tokens; C-08-04).

- `engine/`: a fixture engine, the smallest tree with every extension point filled in. The
  path-guard tests (AC-08-09) copy it into a temporary git repository and open "pull
  requests" against it; `pnpm cc:validate --repo fixtures/engine` passes on it.
- `d3-bad-widget/`: a known-bad widget that must fail rule D3 (ADR 0003 decision 8), the D3
  analogue of AC-08-02.
