import React, { useState, useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useParams, Link } from 'react-router-dom';
import { LanguageSwitcher } from '../../components/ui/LanguageSwitcher';
import { getPublicLegalDocument, getPublicCompany, LegalDocument, PublicCompany } from '../../api/publicCareers';

export default function CookiePolicyPage() {
  const { companySlug } = useParams<{ companySlug?: string }>();
  const { i18n } = useTranslation();
  const lang = i18n.language?.startsWith('en') ? 'en' : 'it';

  const [doc, setDoc] = useState<LegalDocument | null>(null);
  const [company, setCompany] = useState<PublicCompany | null>(null);
  const [loading, setLoading] = useState(true);

  const companyName = company ? company.name : (doc?.platformCompanyName || '');
  const companyEmail = company ? (company.companyEmail || '') : (doc?.platformCompanyEmail || '');

  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    const promises: [Promise<LegalDocument>, Promise<PublicCompany | null>] = [
      getPublicLegalDocument('cookie', lang),
      companySlug ? getPublicCompany(companySlug).catch(() => null) : Promise.resolve(null),
    ];

    Promise.all(promises)
      .then(([docData, companyData]) => {
        if (isMounted) {
          setDoc(docData);
          setCompany(companyData);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error('Failed to load cookie policy from DB:', err);
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [lang, companySlug]);

  const convertMarkdownToHtml = (md: string) => {
    if (!md) return '';

    let html = md
      .replace(/\{\{companyName\}\}/g, companyName)
      .replace(/\{\{companyEmail\}\}/g, companyEmail);

    // If it is already HTML, skip markdown conversion
    const isHtml = /<[a-z][\s\S]*>/i.test(md);
    if (isHtml) {
      return html;
    }

    // Replace headers: ### Heading -> <h4>Heading</h4>
    html = html.replace(/^### (.*?)$/gm, '<h4 style="color: var(--primary); margin-top: 20px; margin-bottom: 10px; font-weight: 700; font-size: 16px;">$1</h4>');
    html = html.replace(/^## (.*?)$/gm, '<h3 style="color: var(--primary); margin-top: 24px; margin-bottom: 12px; font-weight: 700; font-size: 18px;">$1</h3>');
    html = html.replace(/^# (.*?)$/gm, '<h2 style="color: var(--primary); margin-top: 28px; margin-bottom: 14px; font-weight: 800; font-size: 20px;">$1</h2>');

    // Replace horizontal rules: --- -> <hr />
    html = html.replace(/^---$/gm, '<hr style="border: 0; border-top: 1px solid var(--border); margin: 24px 0;" />');

    // Replace bullet lists: - Item -> <li>Item</li>
    html = html.replace(/^[-*] (.*?)$/gm, '<li style="margin-bottom: 6px;">$1</li>');
    
    // Wrap lists in ul tags
    html = html.replace(/((?:<li style="margin-bottom: 6px;">.*?<\/li>\s*)+)/g, '<ul style="padding-left: 20px; margin-bottom: 16px; line-height: 1.7; color: var(--text-secondary);">$1</ul>');

    // Replace bold: **text** -> <strong>text</strong>
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__(.*?)__/g, '<strong>$1</strong>');

    // Replace italic: *text* -> <em>text</em>
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    html = html.replace(/_(.*?)_/g, '<em>$1</em>');

    // Paragraphs split by double newline
    const blocks = html.split(/\n\s*\n/);
    const parsedBlocks = blocks.map(block => {
      const trimmed = block.trim();
      if (!trimmed) return '';
      if (trimmed.startsWith('<h') || trimmed.startsWith('<ul') || trimmed.startsWith('<hr') || trimmed.startsWith('<div')) {
        return trimmed;
      }
      const withBreaks = trimmed.replace(/\n/g, '<br />');
      return `<p style="margin-bottom: 16px; line-height: 1.7; color: var(--text-secondary);">${withBreaks}</p>`;
    });

    return parsedBlocks.join('\n');
  };

  return (
    <div style={{ background: 'var(--background)', minHeight: '100vh', padding: '40px 20px', fontFamily: 'var(--font-body)' }}>
      <div style={{ maxWidth: '720px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
          <Link 
            to={companySlug ? `/careers/${companySlug}` : "/careers"} 
            style={{ 
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: '8px', 
              color: 'var(--primary)', 
              fontWeight: 600, 
              fontSize: '14px', 
              textDecoration: 'none',
              transition: 'color 0.2s'
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--primary)')}
          >
            <ArrowLeft size={16} />
            {lang === 'it' ? 'Torna alle Careers' : 'Back to Careers'}
          </Link>
          <LanguageSwitcher variant="pill" />
        </div>

        <div style={{ 
          background: 'var(--surface)', 
          borderRadius: 'var(--radius-lg)', 
          padding: '40px', 
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow)'
        }}>
          {loading ? (
            <div style={{ padding: '60px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '24px',
                height: '24px',
                border: '2px solid rgba(201,151,58,0.1)',
                borderTop: '2px solid var(--accent)',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite'
              }} />
              <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                {lang === 'it' ? 'Caricamento cookie policy...' : 'Loading cookie policy...'}
              </span>
            </div>
          ) : (
            <>
              <h1 style={{ fontFamily: 'var(--font-display)', color: 'var(--primary)', fontSize: '28px', fontWeight: 800, marginBottom: '24px' }}>
                {doc?.title || (lang === 'it' ? 'Informativa sui Cookie' : 'Cookie Policy')}
              </h1>
              <section 
                lang={lang} 
                className="legal-content-section"
                style={{ color: 'var(--text-secondary)', fontSize: '15px', lineHeight: '1.7' }}
                dangerouslySetInnerHTML={{ __html: convertMarkdownToHtml(doc?.content || '') }}
              />
              <style>{`
                .legal-content-section p {
                  margin-bottom: 16px;
                  line-height: 1.7;
                  font-size: 15px;
                }
                .legal-content-section h3 {
                  color: var(--primary);
                  margin-top: 24px;
                  margin-bottom: 12px;
                  font-weight: 700;
                  font-size: 18px;
                  font-family: var(--font-display);
                }
                .legal-content-section ul, .legal-content-section ol {
                  margin-bottom: 16px;
                  padding-left: 20px;
                  list-style-type: disc;
                }
                .legal-content-section li {
                  margin-bottom: 6px;
                  line-height: 1.7;
                  font-size: 15px;
                }
                .legal-content-section hr {
                  margin: 16px 0;
                  border: 0;
                  border-top: 1px solid var(--border);
                }
              `}</style>
              {!doc && (
                <p style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>
                  {lang === 'it' ? 'Informativa sui cookie non disponibile.' : 'Cookie policy not available.'}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
