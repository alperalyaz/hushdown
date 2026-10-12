// Builds the text of the sources file (_sources.txt, _kaynaklar.txt...). Shared by background.js and the popup.

function sourcesText(folder, entries) {
  const t = (key) => chrome.i18n.getMessage(key);
  const lines = [`${t("sourcesTitle")}: ${folder}`, t("sourcesNote"), ""];
  for (const e of entries) {
    lines.push(`${String(e.number).padStart(3, "0")}  ${e.file}`);
    if (e.pageTitle) lines.push(`     ${t("sourcesTitleLabel")}: ${e.pageTitle}`);
    if (e.pageUrl) lines.push(`     ${t("sourcesPage")}: ${e.pageUrl}`);
    if (e.fileUrl && e.fileUrl !== e.pageUrl) lines.push(`     ${t("sourcesFileUrl")}: ${e.fileUrl}`);
    if (!e.pageUrl && !e.fileUrl) lines.push(`     ${t("sourcesUnknown")}`);
    lines.push(`     ${t("sourcesAccessed")}: ${e.accessed}`);
    lines.push("");
  }
  return lines.join("\r\n");
}
