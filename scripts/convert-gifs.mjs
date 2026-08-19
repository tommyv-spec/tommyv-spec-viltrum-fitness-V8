// Viltrum — conversione GIF esercizi → video MP4 (H.264), ispirata allo
// script di MoreMuscle: una GIF usa 256 colori per fotogramma, un video
// comprime il movimento — stesso contenuto, 30-50x meno banda.
//
// A differenza di MoreMuscle NON tocchiamo la fonte dei dati (il foglio di
// Giuseppe): generiamo media/<hash>.mp4 + media/manifest.json e l'app fa il
// resto (js/media-resolver.js sceglie il video quando esiste, altrimenti GIF).
//
// USO (PowerShell, dalla cartella viltrum-fitness-V8):
//   1. procurati l'elenco GIF: apri la dashboard loggato con ?dumpgifs=1
//      → scarica gif-urls.json → mettilo in scripts/gif-urls.json
//   2. ffmpeg dev'essere nel PATH (choco install ffmpeg -y)
//   3. node scripts/convert-gifs.mjs
//   4. deploya (.\deploy.ps1): media/ viene servito dal Worker
//
// Rilanciabile: gli URL già in manifest vengono saltati.

import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";

const run = promisify(execFile);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const MEDIA_DIR = path.join(ROOT, "media");
const MANIFEST = path.join(MEDIA_DIR, "manifest.json");
const URLS_FILE = path.join(ROOT, "scripts", "gif-urls.json");

const hash = (s) => createHash("sha1").update(s).digest("hex").slice(0, 12);

async function main() {
  let urls;
  try {
    urls = JSON.parse(await fs.readFile(URLS_FILE, "utf8"));
  } catch (e) {
    console.error("Manca scripts/gif-urls.json — apri la dashboard con ?dumpgifs=1 per generarlo.");
    process.exit(1);
  }
  if (!Array.isArray(urls) || urls.length === 0) {
    console.error("gif-urls.json vuoto o non valido.");
    process.exit(1);
  }
  await fs.mkdir(MEDIA_DIR, { recursive: true });
  let manifest = {};
  try { manifest = JSON.parse(await fs.readFile(MANIFEST, "utf8")); } catch (e) {}

  let done = 0, skipped = 0, failed = 0;
  for (const url of urls) {
    if (!url || typeof url !== "string") continue;
    if (manifest[url]) { skipped++; continue; }
    const id = hash(url);
    const tmpGif = path.join(MEDIA_DIR, id + ".tmp.gif");
    const outMp4 = path.join(MEDIA_DIR, id + ".mp4");
    try {
      const res = await fetch(url, { redirect: "follow" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      await fs.writeFile(tmpGif, Buffer.from(await res.arrayBuffer()));
      // H.264, dimensioni pari (richiesto da yuv420p), niente audio,
      // faststart per lo streaming, qualità visivamente identica alla GIF.
      await run("ffmpeg", [
        "-y", "-i", tmpGif,
        "-movflags", "+faststart",
        "-pix_fmt", "yuv420p",
        "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
        "-an", "-crf", "27", "-preset", "veryfast",
        outMp4,
      ]);
      const size = (await fs.stat(outMp4)).size;
      if (size < 500) throw new Error("output sospetto (" + size + " byte)");
      manifest[url] = "media/" + id + ".mp4";
      done++;
      console.log("OK ", id, (size / 1024).toFixed(0) + "KB", url.slice(0, 70));
    } catch (e) {
      failed++;
      console.warn("FAIL", url.slice(0, 70), "-", e.message);
    } finally {
      try { await fs.unlink(tmpGif); } catch (e) {}
    }
    // manifest salvato a ogni passo: interrompibile senza perdere lavoro
    await fs.writeFile(MANIFEST, JSON.stringify(manifest, null, 2));
  }
  console.log(`\nConvertite: ${done} · gia' presenti: ${skipped} · fallite: ${failed}`);
  console.log("Ora deploya: le pagine useranno gli MP4 dove esistono, GIF altrove.");
}

main();
