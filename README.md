# HushDown

A Chrome extension that organises your downloads by the work you're doing, not by file type. Tell it what you're working on, and every download goes into that project's folder with a clear, numbered name and an automatic list of sources.

Setup and help page: https://alperalyaz.github.io/hushdown/

## What it does

**What I'm working on.** Type a project name in the popup, for example "Biology Essay", and press Start. Recent projects appear as chips for one-click restart; Finish ends the project.

**One folder, standard names.** While a project is active, every download is saved to `Downloads/<Project name>/` as `<project-slug>_<number>_<name>.<ext>`, for example `Biology Essay/biology-essay_001_mitochondrion.png` and `biology-essay_002_week4-notes.pdf`. The three-digit number keeps the order you collected things in.

**Meaningful names.** A useful file name from the site is kept but tidied: lowercase, accents folded, spaces turned into hyphens (`Week4 Notes.pdf` becomes `week4-notes.pdf`). Junk names such as `image931.png`, `download (3)`, `IMG_20240101_1234`, hashes or `WhatsApp Image ...` are replaced with the topic of the page you downloaded from: a file from `https://en.wikipedia.org/wiki/Mitochondrion` becomes `mitochondrion`.

**Automatic sources list.** Each project folder gets a text file (`_sources.txt` in English Chrome, `_kaynaklar.txt` in Turkish, `_来源.txt` in Chinese) listing every file with its number, the page it came from, the file URL and the access date. It is rewritten after each download and kept out of Chrome's download list. The popup can also copy the list to the clipboard (Copy sources) and open the folder.

**Tab groups as projects.** If the active tab is in a named Chrome tab group, downloads from it go to a folder named after the group, with no popup needed. A named group takes priority over the popup project. You can switch this off in the popup.

**Out of the way otherwise.** With no project and no named group, normal file names are kept and only junk names are renamed, as `<topic>_<yyMMdd-HHmmss>.<ext>`, for example `mitochondrion_261012-140305.png`.

**Searchable history.** The popup lists the last 200 downloads with thumbnails for images, each tagged with its project. Search by file or project name, click a row to open the file, or use × to remove the row from the list (the file itself is not deleted).

**Optional notifications.** A desktop notification when a download finishes. Off by default; turn it on in the popup ("Notify me when a download finishes").

Version 2.0.0 removes the three timestamp naming modes and the sort-into-folders-by-file-type option.

## Install from source

Open chrome://extensions, turn on Developer mode, choose Load unpacked and select the extension folder. Then pin HushDown to the toolbar.

Image thumbnails need "Allow access to file URLs" on the extension's details page, and notifications need Chrome to be allowed to show them; the setup page linked above walks through both. Everything stays in your browser and your Downloads folder: no servers, no accounts, nothing uploaded.

## Tests

`node --test tests/naming.test.js` checks the naming rules. `node tests/e2e.mjs` loads the extension into a real Chromium, downloads files from a local test site and checks the folders, names and sources list on disk (`TABS=1` repeats it with the optional tabs permission granted; `CHROMIUM=/path/to/chrome` picks the browser).

## HushDown.ahk

A small standalone Windows helper, separate from the extension: pressing Ctrl+F12 types a yyyyMMddHHmmss timestamp into whatever field has focus. Requires AutoHotkey v1.

## Contact

hushdown@hidroteknik.com.tr — developed by Alper Alyaz on behalf of Hidroteknik.
