// ─── Minimal single-page image PDF ──────────────────────────────────────────
// Replaces jsPDF for the ONE job the Biodata Maker needs: put a rendered
// canvas image on a single A4 page and download it. jsPDF's ESM entry
// statically imports html2canvas + canvg + dompurify for its .html()
// plugin — none of which this app calls — and together they cost
// ~180 KB gzip of bundle (the bundle-budget script has flagged this diet
// as owed since 2026-11-10). A JPEG embeds into a PDF verbatim with the
// DCTDecode filter, so a correct one-image PDF is ~100 lines, no library.
//
// buildPdfBytes() is pure (bytes in, bytes out) so the xref table can be
// unit-tested in Node without a canvas.

const A4_W = 595.28; // pt
const A4_H = 841.89;

const te = new TextEncoder();

function concatBytes(parts) {
  const total = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}

/**
 * Build a complete one-page A4 PDF embedding `jpegBytes` stretched to
 * the full page (the source canvas is already A4-proportioned).
 * Returns a Uint8Array.
 */
export function buildPdfBytes(jpegBytes, imgW, imgH) {
  const content = `q\n${A4_W} 0 0 ${A4_H} 0 0 cm\n/Im0 Do\nQ\n`;
  const objects = [
    te.encode('<< /Type /Catalog /Pages 2 0 R >>'),
    te.encode('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    te.encode(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4_W} ${A4_H}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`),
    null, // image object: dict + binary stream, built below
    null, // content stream object, built below
  ];
  objects[3] = concatBytes([
    te.encode(`<< /Type /XObject /Subtype /Image /Width ${imgW} /Height ${imgH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`),
    jpegBytes,
    te.encode('\nendstream'),
  ]);
  const contentBytes = te.encode(content);
  objects[4] = concatBytes([
    te.encode(`<< /Length ${contentBytes.length} >>\nstream\n`),
    contentBytes,
    te.encode('endstream'),
  ]);

  const parts = [te.encode('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')];
  const offsets = [0];
  let length = parts[0].length;
  objects.forEach((obj, i) => {
    offsets.push(length);
    const header = te.encode(`${i + 1} 0 obj\n`);
    const footer = te.encode('\nendobj\n');
    parts.push(header, obj, footer);
    length += header.length + obj.length + footer.length;
  });
  const xrefStart = length;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  parts.push(te.encode(xref));
  return concatBytes(parts);
}

/** Render a canvas to a downloadable one-page A4 PDF. Browser-only. */
export function downloadCanvasPdf(canvas, filename) {
  const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
  const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const bin = atob(b64);
  const jpeg = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) jpeg[i] = bin.charCodeAt(i);
  const bytes = buildPdfBytes(jpeg, canvas.width, canvas.height);
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.download = filename;
  a.href = url;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
