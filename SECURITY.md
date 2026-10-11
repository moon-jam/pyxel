# Security notes for this fork

This fork publishes Pyxel Code Maker and its static documentation: the Maker Manual, Resource Editor Manual, API Reference, User Guide, Web Publishing guide, and MML Commands reference. Other upstream tools are not hosted and are marked as unavailable in the guides.

- The trusted upstream baseline is commit `5d8e7b4f37c106684c1e91692772569a32a5e3d4` (Pyxel 2.9.9, 2026-08-12).
- Commits `57893a29`, `f5700728`, and `97670a55` are intentionally excluded.
- The only GitHub Actions workflow is `.github/workflows/pages.yml`. It copies committed static files and deploys them to GitHub Pages. It does not build Pyxel, install dependencies, run repository scripts, or read repository secrets.
- Every third-party action is pinned to a complete commit SHA.
- Do not add secrets to the `github-pages` environment.
- Review any future upstream changes before merging them into this fork.

The browser app still executes user-entered Python inside Pyodide. Treat imported projects as untrusted and use this personal instance only for projects you trust.

Save > HTML embeds the current project in a Pyxel app archive without executing or uploading it. Shared HTML uses Pyxel 2.9.9 from the audited fork commit `16b09cc63731a9456704cff23ef0882cdd4edb2c`, with an integrity-checked loader and a content security policy limiting runtime requests to jsDelivr. It requires internet access. Imported archive paths are validated before export; startup code and resources are replaced with the current editor contents. This does not make untrusted game code safe to play.

Code Maker supports loading ZIP projects through `?url=` and the Load > URL menu. These requests accept only HTTPS URLs, omit cookies and other browser credentials, and send no referrer. The ZIP host must allow browser requests from this site's origin. Importing a project does not automatically run its Python code.
