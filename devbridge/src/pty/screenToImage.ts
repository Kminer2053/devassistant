/**
 * PTY 버퍼(텍스트 줄 배열)를 터미널 스타일 PNG 이미지로 변환.
 * SVG 생성 후 sharp로 PNG 인코딩. sharp 없으면 null 반환.
 */

const FONT_SIZE = 14;
const LINE_HEIGHT = 18;
const PADDING = 12;
const BG = "#1e1e1e";
const FG = "#d4d4d4";
const COLS = 120;
const CHAR_WIDTH = 8;

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function linesToSvg(lines: string[]): string {
  const maxLen = Math.max(...lines.map((l) => l.length), 1);
  const width = Math.min(1200, PADDING * 2 + maxLen * CHAR_WIDTH);
  const height = PADDING * 2 + lines.length * LINE_HEIGHT;
  const textLines = lines
    .map(
      (line, i) =>
        `<text x="${PADDING}" y="${PADDING + (i + 1) * LINE_HEIGHT}" font-family="monospace" font-size="${FONT_SIZE}" fill="${FG}">${escapeXml(line.slice(0, COLS))}</text>`
    )
    .join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="${BG}"/>
  ${textLines}
</svg>`;
}

export async function bufferToPngBase64(lines: string[]): Promise<string | null> {
  if (lines.length === 0) return null;
  try {
    const sharp = (await import("sharp")).default;
    const svg = linesToSvg(lines);
    const buf = await sharp(Buffer.from(svg, "utf8"))
      .png()
      .toBuffer();
    return buf.toString("base64");
  } catch {
    return null;
  }
}
