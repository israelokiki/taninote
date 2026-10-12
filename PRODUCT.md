# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Static HTML/CSS/JS, no build step (user's choice). Libraries are vendored in vendor/ (pdf.js 3.11.174, pdf-lib 1.17.1, mammoth 1.6.0, JSZip 3.10.1, marked 4.3.0, DOMPurify 3.2.6, html2canvas 1.4.1, Phosphor icons 2.1.1), so nothing loads from third parties at runtime. A service worker (sw.js) caches the app for offline use; manifest.webmanifest makes it installable.

## Users

Students in general. They are studying course material ("study modules") handed to them in whatever format the course uses, and they want to read it and write on it. Devices: all of them. That means iPad with Apple Pencil, Mac or laptop with mouse/trackpad and keyboard, and phones with finger input.

## Product Purpose

TaniNote is a note-taking app in the spirit of Noteshelf. It opens study files and lets you handwrite, highlight, erase and type notes on them, or start blank notebooks. It exists because a study module would not open in Noteshelf. Success means any study file a student has opens and can be annotated, and the annotated result can be exported as a PDF.

## Positioning

TaniNote opens the formats other note apps refuse. It reads PDFs (including password-protected ones), Word .docx, PowerPoint .pptx, EPUB, images, Markdown, HTML and plain text, and it checks file contents rather than trusting the extension. It runs in a browser on any device, with no install and no account.

## Operating Context

- Long study sessions: reading, highlighting, margin notes, extra blank pages for working things out.
- Pencil-first on iPad, which needs palm rejection: fingers scroll and the pen draws.
- Files stay on the device, saved in the browser's IndexedDB. Export to PDF for sharing or for other apps.

## Capabilities and Constraints

- Tools: pen (pressure-sensitive), highlighter, eraser, text boxes, undo/redo, zoom, added blank pages (lined, grid, dotted, blank), PDF export.
- Old binary formats (.doc, .ppt, .xls) and Apple iWork files can't be parsed in the browser. Users have to export them to PDF or docx first.
- Reading sounds: five built-in tracks streamed from music/ (user-supplied MP3s), plus sounds the user imports (stored in IndexedDB). Volume, fades and a sleep timer. Music is not cached for offline use.
- Dashboard with study stats, recent files, study planner (sessions per day, linked to files), subjects and favourites, settings (name, theme, Pencil only, default paper), backup to and restore from a .zip.
- Security: strict Content-Security-Policy (self only), PDF.js with isEvalSupported off, DOMPurify on all converted HTML, validated backup restore, 300 MB import limit.
- No accounts or sync yet. Whether sync is wanted is undecided.

## Brand Commitments

Name: TaniNote (chosen by the user; the project folder is still NOTA). There are no other brand assets.

## Evidence on Hand

None. No testimonials, user counts or claims, and none should be invented.

## Product Principles

1. Opening the file is the product. Never leave a student unable to open their material without explaining why and what to do next.
2. Writing feels immediate. Ink appears on pen-down with no lag.
3. The material leads and the chrome recedes.
4. Students' work is never lost: autosave, undo, and on-device storage.

## Accessibility & Inclusion

Students on low-end devices and small screens. All tools must stay reachable at phone width, and each tool needs a label.
