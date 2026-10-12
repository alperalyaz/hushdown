const test = require("node:test");
const assert = require("node:assert/strict");
const n = require("../extension/naming.js");

test("slugify folds Turkish letters and keeps other scripts", () => {
  assert.equal(n.slugify("Mitokondri Yapısı (2)"), "mitokondri-yapisi-2");
  assert.equal(n.slugify("ÇĞİÖŞÜ çğıöşü"), "cgiosu-cgiosu");
  assert.equal(n.slugify("Café résumé"), "cafe-resume");
  assert.equal(n.slugify("线粒体 结构"), "线粒体-结构");
  assert.equal(n.slugify("___"), "");
});

test("junk names are detected", () => {
  for (const s of ["image931", "image", "download (3)", "IMG_20240101_1234", "1234567",
    "a8f3e2c1-9b4d-4c2e-8f1a-123456789abc", "3f9a0c7e1b2d4f60", "unnamed", "resim2",
    "WhatsApp Image 2024-05-01 at 10.00.00", "AbX9kQ2mZt7LpR4w", "Screenshot", "file_12"]) {
    assert.equal(n.isJunkName(s), true, s);
  }
});

test("meaningful names are kept", () => {
  for (const s of ["mitekondri_atik_259wiki", "Hafta4 Ders Notlari", "hucre-zari",
    "Ataturk_1923", "CV", "rapor-final", "BiyolojiNotlari"]) {
    assert.equal(n.isJunkName(s), false, s);
  }
});

test("topic comes from the page url", () => {
  assert.equal(n.topicFromPageUrl("https://tr.wikipedia.org/wiki/Mitokondri"), "mitokondri");
  assert.equal(n.topicFromPageUrl("https://en.wikipedia.org/wiki/Cell_membrane"), "cell-membrane");
  assert.equal(n.topicFromPageUrl("https://dergipark.org.tr/tr/download/article-file/123456"), "article-file");
  assert.equal(n.topicFromPageUrl("https://www.google.com/"), "google");
  assert.equal(n.topicFromPageUrl("https://dergipark.org.tr/"), "dergipark");
  assert.equal(n.topicFromPageUrl("https://www.bbc.co.uk/news/12345678"), "news");
  assert.equal(n.topicFromPageUrl("blob:https://x.com/abc"), "");
  assert.equal(n.topicFromPageUrl(""), "");
});

test("project paths follow the standard", () => {
  const r = n.buildProjectPath({
    project: "Biyoloji Ödevi", number: 3, originalName: "image931.png",
    pageUrl: "https://tr.wikipedia.org/wiki/Mitokondri", fileUrl: "https://upload.wikimedia.org/x/image931.png", ext: "png",
  });
  assert.deepEqual(r, { folder: "Biyoloji Ödevi", filename: "Biyoloji Ödevi/biyoloji-odevi_003_mitokondri.png" });

  const r2 = n.buildProjectPath({
    project: "Biyoloji Ödevi", number: 12, originalName: "mitekondri_atik_259wiki.jpg",
    pageUrl: "", fileUrl: "", ext: "jpg",
  });
  assert.equal(r2.filename, "Biyoloji Ödevi/biyoloji-odevi_012_mitekondri-atik-259wiki.jpg");

  const r3 = n.buildProjectPath({ project: "Tarih", number: 1, originalName: "", pageUrl: "", fileUrl: "", ext: "pdf" });
  assert.equal(r3.filename, "Tarih/tarih_001.pdf");
});

test("project folder names are safe on Windows", () => {
  assert.equal(n.projectFolderName('Rapor: "son"?'), "Rapor son");
  assert.equal(n.projectFolderName("  ..gizli.. "), "gizli");
  assert.equal(n.projectFolderName("CON"), "_CON");
  assert.equal(n.projectPrefix("!!!"), "is");
});

test("loose mode only renames junk", () => {
  const date = new Date(2026, 9, 12, 14, 3, 5);
  assert.equal(n.buildLooseFilename({ originalName: "Hafta4 Notlar.pdf", pageUrl: "", fileUrl: "", ext: "pdf", date }), null);
  assert.equal(
    n.buildLooseFilename({ originalName: "image931.png", pageUrl: "https://tr.wikipedia.org/wiki/Mitokondri", fileUrl: "", ext: "png", date }),
    "mitokondri_261012-140305.png",
  );
  assert.equal(n.buildLooseFilename({ originalName: "download", pageUrl: "", fileUrl: "", ext: "", date }), "dosya_261012-140305");
});

test("topic comes from the page title", () => {
  assert.equal(n.topicFromTitle("Mitokondri - Vikipedi"), "mitokondri");
  assert.equal(n.topicFromTitle("Hücre zarı nedir? | Biyoloji Portalı"), "hucre-zari-nedir");
  assert.equal(n.topicFromTitle("mitokondri - Google'da Ara"), "mitokondri");
  assert.equal(n.topicFromTitle("A - B - Site"), "a-b");
  assert.equal(n.topicFromTitle("Untitled"), "");
  assert.equal(n.topicFromTitle(""), "");
});

test("title beats a trimmed referrer, a good file name beats both", () => {
  const base = { project: "Bio", number: 1, pageUrl: "https://tr.wikipedia.org/", fileUrl: "https://upload.wikimedia.org/a/b/image931.png", ext: "png" };
  assert.equal(n.buildProjectPath({ ...base, originalName: "image931.png", pageTitle: "Mitokondri - Vikipedi" }).filename, "Bio/bio_001_mitokondri.png");
  assert.equal(n.buildProjectPath({ ...base, originalName: "image931.png" }).filename, "Bio/bio_001_wikipedia.png");
  assert.equal(n.buildProjectPath({ ...base, originalName: "hucre.png", pageTitle: "Mitokondri - Vikipedi" }).filename, "Bio/bio_001_hucre.png");
  assert.equal(n.siteName("http://127.0.0.1:8080/"), "");
  assert.equal(n.siteName("http://localhost:8080/"), "");
});

test("generic path parts and file extensions are skipped", () => {
  assert.equal(n.topicFromPageUrl("http://localhost:8080/files/image931.png"), "");
  assert.equal(n.topicFromPageUrl("https://site.com/uploads/2024/05/Cell-Diagram.jpg"), "cell-diagram");
  assert.equal(n.topicFromPageUrl("https://site.com/konu/mitokondri.html"), "mitokondri");
});
