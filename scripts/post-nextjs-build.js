#!/usr/bin/env node
/**
 * post-nextjs-build.js
 *
 * Post-build script: copies static assets into the Next.js standalone output.
 * Run automatically after `npm run build` in apps/web/ via the "postbuild"
 * npm lifecycle hook, and before electron-builder via build:win / build:mac.
 *
 * This automates the manual copy steps documented in next.config.mjs:
 *   .next/static   → .next/standalone/.next/static
 *   public/        → .next/standalone/public/
 *
 * Without this step the packaged app serves a blank page because the
 * standalone server.js cannot find its static assets.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// Resolve paths relative to this script's location (scripts/)
const ROOT       = path.join(__dirname, '..');
const WEB_DIR    = path.join(ROOT, 'apps', 'web');
const STANDALONE = path.join(WEB_DIR, '.next', 'standalone');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function copyDirSync(src, dest) {
    if (!fs.existsSync(src)) {
        console.error(`❌  Source not found: ${src}`);
        process.exit(1);
    }
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const srcPath  = path.join(src,  entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDirSync(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

function countFiles(dir) {
    if (!fs.existsSync(dir)) return 0;
    let count = 0;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        count += entry.isDirectory()
            ? countFiles(path.join(dir, entry.name))
            : 1;
    }
    return count;
}

// ─── Guard: standalone output must exist ──────────────────────────────────────

if (!fs.existsSync(STANDALONE)) {
    console.error('❌  .next/standalone not found.');
    console.error('    Run `npm run build` in apps/web/ before this script.');
    process.exit(1);
}

console.log('📦  Skales post-build: copying static assets into standalone output...');

// ─── 1. .next/static → .next/standalone/.next/static ─────────────────────────

const staticSrc  = path.join(WEB_DIR, '.next', 'static');
const staticDest = path.join(STANDALONE, '.next', 'static');
console.log(`    .next/static → standalone/.next/static`);
copyDirSync(staticSrc, staticDest);
console.log(`    ✓  ${countFiles(staticDest)} files`);

// ─── 2. public/ → .next/standalone/public/ ───────────────────────────────────

const publicSrc  = path.join(WEB_DIR, 'public');
const publicDest = path.join(STANDALONE, 'public');
console.log(`    public/ → standalone/public/`);
copyDirSync(publicSrc, publicDest);
console.log(`    ✓  ${countFiles(publicDest)} files`);

// ─── 3. Explicit mascot check ─────────────────────────────────────────────────
// Belt-and-suspenders: confirm mascot videos are in place after the copy.
// The Desktop Buddy will silently show nothing if these are missing.
//
// Folder structure (since Phase 3D):
//   public/mascot/<skin>/<category>/*.webm
//   e.g. public/mascot/skales/idle/stand.webm
//
// The default skin is 'skales'. At least one category subfolder must exist.

const mascotDest     = path.join(publicDest, 'mascot');
const defaultSkin    = 'skales';
const skinDest       = path.join(mascotDest, defaultSkin);
const CATEGORIES     = ['idle', 'action', 'intro', 'outro'];

if (!fs.existsSync(mascotDest)) {
    console.error('❌  mascot/ directory is missing from standalone/public/.');
    console.error('    Check that apps/web/public/mascot/ exists and is not empty.');
    process.exit(1);
}

if (!fs.existsSync(skinDest)) {
    console.error(`❌  mascot/${defaultSkin}/ skin folder is missing from standalone/public/.`);
    console.error(`    Expected: apps/web/public/mascot/${defaultSkin}/ with category subfolders.`);
    console.error(`    Did you forget to move videos from mascot/idle/ → mascot/${defaultSkin}/idle/ ?`);
    process.exit(1);
}

// Warn (not fatal) if any expected category folder is absent
for (const cat of CATEGORIES) {
    const catDir = path.join(skinDest, cat);
    if (!fs.existsSync(catDir)) {
        console.warn(`⚠️   mascot/${defaultSkin}/${cat}/ not found — Buddy will skip that state.`);
    }
}

const mascotCount = countFiles(mascotDest);
console.log(`    ✓  mascot/${defaultSkin}/ verified (${mascotCount} video files total)`);

console.log('✅  Post-build copy complete — standalone output is ready for electron-builder.');
