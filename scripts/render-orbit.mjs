// Original procedural motion design. Requires ffmpeg and the app's sharp dependency.
// Run: node scripts/render-orbit.mjs. No stock footage, external APIs, or runtime rendering.
import sharp from "sharp";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { once } from "node:events";
import path from "node:path";
import { fileURLToPath } from "node:url";
const destination = fileURLToPath(new URL("../public/motion", import.meta.url));
mkdirSync(destination, { recursive: true });
const width = 960, height = 540, fps = 24, frames = 192;

function scene(frame) {
  const phase = frame / frames * Math.PI * 2;
  const stars = Array.from({ length: 70 }, (_, i) => {
    const x = (i * 137.508 + 31) % width;
    const y = (i * i * 53.12 + 73) % height;
    const opacity = .12 + (1 + Math.sin(phase + i)) * .12;
    return '<circle cx="' + x + '" cy="' + y + '" r="' + (i % 6 === 0 ? 1 : .5) + '" fill="#d4d5eb" opacity="' + opacity + '"/>';
  }).join("");
  const tilt = -24 + Math.sin(phase) * 3;
  const arc = Array.from({ length: 48 }, (_, i) => {
    const angle = (i / 48) * Math.PI * 2 + phase;
    return '<circle cx="' + (480 + Math.cos(angle) * 289) + '" cy="' + (286 + Math.sin(angle) * 69) + '" r=".65" fill="#c0c7dd" opacity="' + (.1 + (Math.sin(angle) + 1) * .15) + '"/>';
  }).join("");
  return '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540"><defs>' +
    '<radialGradient id="space"><stop stop-color="#1d1a2c"/><stop offset="1" stop-color="#090b11"/></radialGradient>' +
    '<radialGradient id="halo"><stop offset=".4" stop-color="#baa7f0" stop-opacity="0"/><stop offset=".52" stop-color="#aab7f7" stop-opacity=".32"/><stop offset=".63" stop-color="#a087d9" stop-opacity=".11"/><stop offset="1" stop-color="#a087d9" stop-opacity="0"/></radialGradient>' +
    '<linearGradient id="rim" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f0e7d5"/><stop offset=".36" stop-color="#b4b8db"/><stop offset=".65" stop-color="#555676"/><stop offset="1" stop-color="#171921"/></linearGradient>' +
    '<radialGradient id="sphere" cx=".28" cy=".1"><stop stop-color="#383340"/><stop offset=".46" stop-color="#17161e"/><stop offset="1" stop-color="#090b11"/></radialGradient>' +
    '</defs><rect width="960" height="540" fill="url(#space)"/>' + stars +
    '<circle cx="480" cy="268" r="' + (242 + Math.sin(phase) * 7) + '" fill="url(#halo)"/>' +
    '<g transform="rotate(' + tilt + ' 480 286)"><ellipse cx="480" cy="286" rx="289" ry="69" fill="none" stroke="#8a86a9" stroke-opacity=".22" stroke-width=".8"/>' + arc + '</g>' +
    '<circle cx="480" cy="265" r="124" fill="url(#rim)"/>' +
    '<circle cx="' + (483 + Math.sin(phase) * 1.5) + '" cy="267" r="122.3" fill="url(#sphere)"/>' +
    '<g transform="rotate(' + tilt + ' 480 286)"><path d="M191 286 A289 69 0 0 0 769 286" fill="none" stroke="#b6b7d3" stroke-width=".8" opacity=".45"/></g></svg>';
}

(async () => {
  await sharp(Buffer.from(scene(0))).webp({ quality: 88 }).toFile(path.join(destination, "orbit-poster.webp"));
  const ffmpeg = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "rawvideo", "-pixel_format", "rgb24", "-video_size", width+"x"+height, "-framerate", String(fps), "-i", "pipe:0", "-an", "-c:v", "libx264", "-preset", "slow", "-crf", "25", "-pix_fmt", "yuv420p", "-movflags", "+faststart", path.join(destination, "orbit.mp4")], { stdio: ["pipe", "inherit", "inherit"] });
  const completed = once(ffmpeg, "close");
  for (let frame = 0; frame < frames; frame++) {
    const pixels = await sharp(Buffer.from(scene(frame))).removeAlpha().raw().toBuffer();
    if (!ffmpeg.stdin.write(pixels)) await once(ffmpeg.stdin, "drain");
  }
  ffmpeg.stdin.end();
  const [code] = await completed;
  if (code !== 0) throw new Error("Video encode failed: " + code);
  console.log("Rendered 8-second seamless orbital film, 960×540, 24fps.");
})().catch(error => { console.error(error); process.exitCode = 1; });
