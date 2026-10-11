(() => {
  // Resolve from this script so links work at /pyxel/, /, and local previews.
  const base = new URL("./", document.currentScript.src);
  const pages = [
    ["code-maker/", "Maker", "Maker", "Maker"],
    [
      "code-maker/manual.html",
      "Maker Manual",
      "Maker 手冊",
      "Maker マニュアル",
    ],
    [
      "editor-manual/",
      "Resource Editor Manual",
      "資源編輯器手冊",
      "エディターマニュアル",
    ],
    ["api-reference/", "API Reference", "函式參考", "API リファレンス"],
    ["user-guide/", "User Guide", "使用者指南", "ユーザーガイド"],
    ["web-usage/", "Web Publishing", "網頁發布說明", "Web 公開ガイド"],
  ];
  const normalize = (path) => path.replace(/index\.html$/, "");
  const currentPath = normalize(location.pathname);
  const isMaker = currentPath === new URL("code-maker/", base).pathname;
  // Maker already links to its manual and needs the full editor height.
  if (isMaker) return;
  const nav = document.createElement("nav");
  nav.className = "site-navigation";

  const links = pages.map(([path]) => {
    const anchor = document.createElement("a");
    anchor.href = new URL(path, base).href;
    if (currentPath === new URL(path, base).pathname) {
      anchor.setAttribute("aria-current", "page");
      // Clicking Maker's current-page link must not reset an unsaved project.
      anchor.addEventListener("click", (event) => event.preventDefault());
    }
    nav.appendChild(anchor);
    return anchor;
  });

  const updateLabels = () => {
    const language = document.documentElement.lang.toLowerCase();
    const column =
      language === "cn" || language.startsWith("zh")
        ? 2
        : language.startsWith("ja")
          ? 3
          : 1;
    nav.setAttribute(
      "aria-label",
      column === 2
        ? "網站導覽"
        : column === 3
          ? "サイトナビゲーション"
          : "Site navigation",
    );
    links.forEach((anchor, index) => {
      anchor.textContent = pages[index][column];
    });
  };
  updateLabels();
  // Keep navigation outside the document container rebuilt on language changes.
  document.body.prepend(nav);
  new MutationObserver(updateLabels).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["lang"],
  });
  window.addEventListener("storage", (event) => {
    if (event.key === "pyxel-lang") updateLabels();
  });
})();
