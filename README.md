# HushDown

A Chrome extension that quietly renames every download with a sortable timestamp, sorts files into folders by type, and keeps a searchable history.

Setup and help page: https://alperalyaz.github.io/hushdown/

## What it does

**Three naming modes.** Timestamp, for example 260529-235512.png; Stamp+Name, the timestamp plus the original filename; or Original, the site's suggested name, sanitized. Your choice syncs across Chrome.

**Folder organization.** Optionally sort downloads into subfolders by file type — images, documents, videos and more — all inside your normal Downloads folder.

**Preview notifications.** A desktop notification appears when a download completes, showing the picture itself for images. Click it to reveal the file in its folder.

**Searchable history.** The popup lists up to 200 recent downloads with thumbnails. Search by filename, click a row to open the file, or remove an entry from the list.

## Install from source

Open chrome://extensions, turn on Developer mode, choose Load unpacked and select the extension folder. Then pin HushDown to the toolbar.

Notifications and image previews need two small permissions on first run; the setup page linked above walks through them.

## HushDown.ahk

A small standalone Windows helper, separate from the extension: pressing Ctrl+F12 types a yyyyMMddHHmmss timestamp into whatever field has focus. Requires AutoHotkey v1.

## Contact

hushdown@hidroteknik.com.tr — developed by Alper Alyaz on behalf of Hidroteknik.
