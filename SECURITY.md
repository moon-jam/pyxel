# Security notes for this fork

This fork publishes only the Pyxel Code Maker static site.

- The trusted upstream baseline is commit `5d8e7b4f37c106684c1e91692772569a32a5e3d4` (Pyxel 2.9.9, 2026-08-12).
- Commits `57893a29`, `f5700728`, and `97670a55` are intentionally excluded.
- The only GitHub Actions workflow is `.github/workflows/pages.yml`. It copies committed static files and deploys them to GitHub Pages. It does not build Pyxel, install dependencies, run repository scripts, or read repository secrets.
- Every third-party action is pinned to a complete commit SHA.
- Do not add secrets to the `github-pages` environment.
- Review any future upstream changes before merging them into this fork.

The browser app still executes user-entered Python inside Pyodide. Treat imported projects as untrusted and use this personal instance only for projects you trust.
