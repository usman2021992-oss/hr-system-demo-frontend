import { describe, it, expect } from 'vitest';
import {
  sanitizeDescriptionHtml,
  looksLikeOfficeMarkup,
} from '../modules/ats/jobDescriptionSanitizer';
import {
  parseRejectionReason,
  serializeRejectionReason,
} from '../modules/ats/rejectionReasons';

// What Word actually puts on the clipboard. The old handler removed disallowed
// elements and stripped attributes, but this payload lives inside a comment
// node — invisible to querySelectorAll — so it reached the database intact.
const WORD_CLIPBOARD = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<!--[if gte mso 9]><xml>
 <w:WordDocument><w:View>Normal</w:View></w:WordDocument>
 <w:LatentStyles DefLockedState="false">
  <w:LsdException Locked="false" Priority="0" Name="Normal"/>
  <w:LsdException Locked="false" Priority="9" Name="heading 1"/>
 </w:LatentStyles>
 <m:mathPr><m:brkBinSub m:val="&#8722;&#8722;"/></m:mathPr>
</xml><![endif]-->
<style><!-- p.MsoNormal {mso-style-parent:""; font-size:12.0pt;} --></style>
<body><p class="MsoNormal" style="margin:0cm"><b><span lang="IT">Assistant Store Manager</span></b></p>
<p class="MsoNormal"><o:p>&nbsp;</o:p></p>
<ul><li style="mso-list:l0"><i>Gestione</i> del punto vendita</li></ul>
<div><font face="Calibri">Sede: Milano</font></div></body></html>`;

describe('sanitizeDescriptionHtml', () => {
  it('removes the Office comment block and its w:/m: markup', () => {
    const cleaned = sanitizeDescriptionHtml(WORD_CLIPBOARD);

    expect(cleaned).not.toContain('<!--');
    expect(cleaned).not.toMatch(/LsdException|brkBinSub|WordDocument/i);
    expect(cleaned).not.toMatch(/mso|MsoNormal/i);
    expect(looksLikeOfficeMarkup(cleaned)).toBe(false);
  });

  it('collapses the stored size while keeping every visible word', () => {
    const cleaned = sanitizeDescriptionHtml(WORD_CLIPBOARD);

    expect(cleaned.length).toBeLessThan(WORD_CLIPBOARD.length / 3);
    expect(cleaned).toContain('Assistant Store Manager');
    expect(cleaned).toContain('Gestione');
    expect(cleaned).toContain('del punto vendita');
    expect(cleaned).toContain('Sede: Milano');
  });

  it('keeps only the agreed tags, normalising b/i to strong/em', () => {
    const cleaned = sanitizeDescriptionHtml(WORD_CLIPBOARD);

    expect(cleaned).toContain('<strong>');
    expect(cleaned).toContain('<em>');
    expect(cleaned).toContain('<ul>');
    expect(cleaned).not.toMatch(/<span|<div|<font|<body|<html/i);
    expect(cleaned).not.toMatch(/class=|style=|lang=/i);
  });

  it('leaves already-clean content untouched', () => {
    const clean = '<p>Cerchiamo un <strong>Assistant Store Manager</strong>.</p><ul><li>Requisito</li></ul>';
    expect(sanitizeDescriptionHtml(clean)).toBe(clean);
  });

  it('is idempotent', () => {
    const once = sanitizeDescriptionHtml(WORD_CLIPBOARD);
    expect(sanitizeDescriptionHtml(once)).toBe(once);
  });

  it('drops scripts and event handlers', () => {
    const cleaned = sanitizeDescriptionHtml('<p>Ciao</p><script>alert(1)</script><p onclick="alert(1)">Testo</p>');

    expect(cleaned).not.toMatch(/script|onclick/i);
    expect(cleaned).toContain('<p>Ciao</p>');
    expect(cleaned).toContain('Testo');
  });

  it('converts headings to paragraphs rather than discarding them', () => {
    const cleaned = sanitizeDescriptionHtml('<h2>Responsabilità</h2><p>Testo</p>');

    expect(cleaned).toContain('<p>Responsabilità</p>');
  });

  it('handles empty input', () => {
    expect(sanitizeDescriptionHtml('')).toBe('');
  });
});

describe('rejection reasons (frontend mirror)', () => {
  it('folds the five spellings seen in production onto one code', () => {
    const variants = ['non idoneo', "Non e' idoneo", 'non idonea', 'Non idoneo', 'NON IDONEA'];
    const codes = variants.map((v) => parseRejectionReason(v).code);

    expect(new Set(codes).size).toBe(1);
    expect(codes[0]).toBe('not_suitable');
  });

  it('round-trips "other" with its note', () => {
    const stored = serializeRejectionReason('other', 'Ha rifiutato la sede');

    expect(stored).toBe('other:Ha rifiutato la sede');
    expect(parseRejectionReason(stored)).toEqual({
      code: 'other',
      note: 'Ha rifiutato la sede',
      legacy: false,
    });
  });

  it('stores a bare code for the other reasons', () => {
    expect(serializeRejectionReason('not_available')).toBe('not_available');
    expect(parseRejectionReason('not_available').legacy).toBe(false);
  });
});
