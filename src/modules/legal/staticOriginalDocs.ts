export interface StaticDoc {
  title: string;
  content: string;
}

export const STATIC_ORIGINAL_DOCS: Record<string, Record<string, StaticDoc>> = {
  privacy: {
    it: {
      title: "Informativa sulla Privacy",
      content: `<p style="font-size: 13px; color: var(--text-muted); margin-bottom: 16px;">
  <strong>Ultimo aggiornamento: 4 Giugno 2026</strong>
</p>
<p style="margin-bottom: 16px; line-height: 1.7; color: var(--text-secondary)">
  Questa informativa descrive come trattiamo i dati personali dei candidati che applicano alle posizioni aperte presso <strong>{{companyName}}</strong>. Ci impegniamo a garantire la riservatezza e la sicurezza dei dati forniti, in piena conformità al Regolamento Generale sulla Protezione dei Dati (GDPR - Regolamento UE 2016/679).
</p>

<h3 style="color: var(--primary); margin-top: 24px; margin-bottom: 12px; font-size: 18px; font-weight: 700">
  1. Dati Raccolti
</h3>
<p style="margin-bottom: 12px; line-height: 1.7; color: var(--text-secondary)">
  Raccogliamo le seguenti categorie di dati nel contesto delle candidature:
</p>
<ul style="padding-left: 20px; margin-bottom: 16px; color: var(--text-secondary); line-height: 1.7; list-style-type: disc;">
  <li style="margin-bottom: 6px">Nome, cognome, indirizzo email, recapito telefonico.</li>
  <li style="margin-bottom: 6px">CV/Resume, lettere di presentazione e referenze professionali.</li>
  <li style="margin-bottom: 6px">Precedenti esperienze lavorative, livello di istruzione e competenze.</li>
  <li style="margin-bottom: 6px">Disponibilità lavorativa, aspettative salariali e preferenze di sede.</li>
</ul>

<h3 style="color: var(--primary); margin-top: 24px; margin-bottom: 12px; font-size: 18px; font-weight: 700">
  2. Finalità del Trattamento
</h3>
<p style="margin-bottom: 16px; line-height: 1.7; color: var(--text-secondary)">
  I dati raccolti vengono utilizzati esclusivamente per scopi legati al processo di recruiting, inclusa la valutazione del profilo per la posizione selezionata o per future opportunità lavorative all'interno del gruppo.
</p>

<h3 style="color: var(--primary); margin-top: 24px; margin-bottom: 12px; font-size: 18px; font-weight: 700">
  3. Conservazione dei Dati
</h3>
<p style="margin-bottom: 16px; line-height: 1.7; color: var(--text-secondary)">
  I dati dei candidati saranno conservati per un periodo massimo di 24 mesi dall'ultimo contatto o dall'invio della candidatura, dopodiché verranno eliminati o resi anonimi in modo sicuro.
</p>

<h3 style="color: var(--primary); margin-top: 24px; margin-bottom: 12px; font-size: 18px; font-weight: 700">
  4. I Tuoi Diritti
</h3>
<p style="margin-bottom: 16px; line-height: 1.7; color: var(--text-secondary)">
  Ai sensi del GDPR, hai il diritto di accedere ai tuoi dati personali, richiederne la rettifica o la cancellazione, limitarne il trattamento, o opporti allo stesso inviando una email al nostro team di risorse umane.
</p>`
    },
    en: {
      title: "Privacy Policy",
      content: `<p style="font-size: 13px; color: var(--text-muted); margin-bottom: 16px;">
  <strong>Last Updated: June 4, 2026</strong>
</p>
<p style="margin-bottom: 16px; line-height: 1.7; font-size: 14px; font-style: italic; color: var(--text-secondary)">
  This privacy policy describes how we process the personal data of candidates applying for open positions at <strong>{{companyName}}</strong>. We are committed to ensuring the confidentiality and security of the data provided, in full compliance with the General Data Protection Regulation (GDPR - EU Regulation 2016/679).
</p>

<h3 style="color: var(--primary); margin-top: 24px; margin-bottom: 12px; font-size: 16px; font-weight: 700">
  1. Data Collected
</h3>
<p style="margin-bottom: 12px; line-height: 1.7; font-size: 14px; color: var(--text-secondary)">
  We collect the following categories of data in the context of applications:
</p>
<ul style="padding-left: 20px; margin-bottom: 16px; font-size: 14px; line-height: 1.7; color: var(--text-secondary); list-style-type: disc;">
  <li style="margin-bottom: 6px">First name, last name, email address, phone number.</li>
  <li style="margin-bottom: 6px">CV/Resume, cover letters, and professional references.</li>
  <li style="margin-bottom: 6px">Previous work experience, education level, and skills.</li>
  <li style="margin-bottom: 6px">Work availability, salary expectations, and location preferences.</li>
</ul>

<h3 style="color: var(--primary); margin-top: 24px; margin-bottom: 12px; font-size: 16px; font-weight: 700">
  2. Purpose of Processing
</h3>
<p style="margin-bottom: 16px; line-height: 1.7; font-size: 14px; color: var(--text-secondary)">
  The collected data is used exclusively for purposes related to the recruitment process, including the evaluation of the profile for the selected position or for future job opportunities within the group.
</p>

<h3 style="color: var(--primary); margin-top: 24px; margin-bottom: 12px; font-size: 16px; font-weight: 700">
  3. Data Retention
</h3>
<p style="margin-bottom: 16px; line-height: 1.7; font-size: 14px; color: var(--text-secondary)">
  Candidate data will be retained for a maximum period of 24 months from the last contact or application submission, after which it will be safely deleted or anonymized.
</p>

<h3 style="color: var(--primary); margin-top: 24px; margin-bottom: 12px; font-size: 16px; font-weight: 700">
  4. Your Rights
</h3>
<p style="margin-bottom: 16px; line-height: 1.7; font-size: 14px; color: var(--text-secondary)">
  Under the GDPR, you have the right to access your personal data, request its rectification or erasure, restrict its processing, or object to it by sending an email to our HR team.
</p>`
    }
  },
  terms: {
    it: {
      title: "Termini di Servizio",
      content: `<p style="font-size: 13px; color: var(--text-muted); margin-bottom: 16px;">
  <strong>Ultimo aggiornamento: 4 Giugno 2026</strong>
</p>
<p style="margin-bottom: 16px; line-height: 1.7; color: var(--text-secondary)">
  Benvenuto nel portale Careers di <strong>{{companyName}}</strong>. Utilizzando questo portale per consultare gli annunci di lavoro e inviare la tua candidatura, accetti i presenti Termini di Servizio.
</p>

<h3 style="color: var(--primary); margin-top: 24px; margin-bottom: 12px; font-size: 18px; font-weight: 700">
  1. Utilizzo del Portale
</h3>
<p style="margin-bottom: 16px; line-height: 1.7; color: var(--text-secondary)">
  Il portale è destinato a candidati reali in cerca di impiego presso <strong>{{companyName}}</strong>. È vietato l'invio di dati falsi, incompleti o fuorvianti. È vietato qualsiasi tentativo di alterare il funzionamento tecnico del sistema.
</p>

<h3 style="color: var(--primary); margin-top: 24px; margin-bottom: 12px; font-size: 18px; font-weight: 700">
  2. Candidature
</h3>
<p style="margin-bottom: 16px; line-height: 1.7; color: var(--text-secondary)">
  L'invio di una candidatura non costituisce alcuna offerta formale di impiego né garantisce un colloquio conoscitivo. Il team recruiting valuterà le risposte a propria discrezione.
</p>

<h3 style="color: var(--primary); margin-top: 24px; margin-bottom: 12px; font-size: 18px; font-weight: 700">
  3. Proprietà Intellettuale
</h3>
<p style="margin-bottom: 16px; line-height: 1.7; color: var(--text-secondary)">
  Tutti i contenuti presenti sul portale (loghi, testi, descrizioni delle posizioni) sono di proprietà esclusiva di <strong>{{companyName}}</strong> e non possono essere riutilizzati o diffusi senza autorizzazione.
</p>`
    },
    en: {
      title: "Terms of Service",
      content: `<p style="font-size: 13px; color: var(--text-muted); margin-bottom: 16px;">
  <strong>Last Updated: June 4, 2026</strong>
</p>
<p style="margin-bottom: 16px; line-height: 1.7; font-size: 14px; font-style: italic; color: var(--text-secondary)">
  Welcome to the Careers portal of <strong>{{companyName}}</strong>. By using this portal to view job openings and submit your application, you agree to these Terms of Service.
</p>

<h3 style="color: var(--primary); margin-top: 24px; margin-bottom: 12px; font-size: 16px; font-weight: 700">
  1. Portal Usage
</h3>
<p style="margin-bottom: 16px; line-height: 1.7; font-size: 14px; color: var(--text-secondary)">
  This portal is intended for genuine job seekers looking for employment opportunities at <strong>{{companyName}}</strong>. Submitting false, incomplete, or misleading data is strictly prohibited, as is any attempt to interfere with the technical operations of the system.
</p>

<h3 style="color: var(--primary); margin-top: 24px; margin-bottom: 12px; font-size: 16px; font-weight: 700">
  2. Applications
</h3>
<p style="margin-bottom: 16px; line-height: 1.7; font-size: 14px; color: var(--text-secondary)">
  Submitting an application does not constitute a formal offer of employment nor does it guarantee an interview. The recruiting team will evaluate candidate submissions at their sole discretion.
</p>

<h3 style="color: var(--primary); margin-top: 24px; margin-bottom: 12px; font-size: 16px; font-weight: 700">
  3. Intellectual Property
</h3>
<p style="margin-bottom: 16px; line-height: 1.7; font-size: 14px; color: var(--text-secondary)">
  All contents displayed on this portal (logos, texts, job descriptions) are the exclusive property of <strong>{{companyName}}</strong> and may not be reused or distributed without prior written consent.
</p>`
    }
  },
  cookie: {
    it: {
      title: "Informativa sui Cookie",
      content: `<p style="font-size: 13px; color: var(--text-muted); margin-bottom: 16px;">
  <strong>Ultimo aggiornamento: 4 Giugno 2026</strong>
</p>
<p style="margin-bottom: 16px; line-height: 1.7; color: var(--text-secondary)">
  Il portale Careers di <strong>{{companyName}}</strong> utilizza cookie e tecnologie simili per migliorare l'esperienza di navigazione ed analizzare l'uso del nostro portale.
</p>

<h3 style="color: var(--primary); margin-top: 24px; margin-bottom: 12px; font-size: 18px; font-weight: 700">
  1. Cosa sono i Cookie
</h3>
<p style="margin-bottom: 16px; line-height: 1.7; color: var(--text-secondary)">
  I cookie sono piccoli file di testo salvati sul tuo dispositivo durante la visita del sito. Consentono di memorizzare preferenze di navigazione (come la lingua selezionata) e informazioni sulle sessioni.
</p>

<h3 style="color: var(--primary); margin-top: 24px; margin-bottom: 12px; font-size: 18px; font-weight: 700">
  2. Cookie Utilizzati
</h3>
<p style="margin-bottom: 12px; line-height: 1.7; color: var(--text-secondary)">
  Utilizziamo le seguenti tipologie di cookie:
</p>
<ul style="padding-left: 20px; margin-bottom: 16px; color: var(--text-secondary); line-height: 1.7; list-style-type: disc;">
  <li style="margin-bottom: 6px"><strong>Cookie Tecnici Essenziali:</strong> Necessari per il funzionamento di base del portale (es. gestione delle sessioni di candidatura).</li>
  <li style="margin-bottom: 6px"><strong>Cookie Analitici:</strong> Utilizzati in forma anonima per monitorare le statistiche di visita del sito (es. quante visite riceve un annuncio).</li>
</ul>

<h3 style="color: var(--primary); margin-top: 24px; margin-bottom: 12px; font-size: 18px; font-weight: 700">
  3. Gestione dei Cookie
</h3>
<p style="margin-bottom: 16px; line-height: 1.7; color: var(--text-secondary)">
  Puoi scegliere di disabilitare o bloccare i cookie tramite le impostazioni del tuo browser web, ma questo potrebbe compromettere la corretta compilazione ed invio del modulo di candidatura.
</p>`
    },
    en: {
      title: "Cookie Policy",
      content: `<p style="font-size: 13px; color: var(--text-muted); margin-bottom: 16px;">
  <strong>Last Updated: June 4, 2026</strong>
</p>
<p style="margin-bottom: 16px; line-height: 1.7; font-size: 14px; font-style: italic; color: var(--text-secondary)">
  The Careers portal of <strong>{{companyName}}</strong> uses cookies and similar technologies to improve the browsing experience and analyze the usage of our portal.
</p>

<h3 style="color: var(--primary); margin-top: 24px; margin-bottom: 12px; font-size: 16px; font-weight: 700">
  1. What are Cookies
</h3>
<p style="margin-bottom: 16px; line-height: 1.7; font-size: 14px; color: var(--text-secondary)">
  Cookies are small text files saved on your device during your visit to the website. They allow the storage of browsing preferences (such as selected language) and session details.
</p>

<h3 style="color: var(--primary); margin-top: 24px; margin-bottom: 12px; font-size: 16px; font-weight: 700">
  2. Cookies Used
</h3>
<p style="margin-bottom: 12px; line-height: 1.7; font-size: 14px; color: var(--text-secondary)">
  We use the following types of cookies:
</p>
<ul style="padding-left: 20px; margin-bottom: 16px; font-size: 14px; line-height: 1.7; color: var(--text-secondary); list-style-type: disc;">
  <li style="margin-bottom: 6px"><strong>Essential Technical Cookies:</strong> Necessary for the basic functionality of the portal (e.g., managing application sessions).</li>
  <li style="margin-bottom: 6px"><strong>Analytical Cookies:</strong> Used anonymously to monitor website traffic statistics (e.g., how many views a job post receives).</li>
</ul>

<h3 style="color: var(--primary); margin-top: 24px; margin-bottom: 12px; font-size: 16px; font-weight: 700">
  3. Cookie Management
</h3>
<p style="margin-bottom: 16px; line-height: 1.7; font-size: 14px; color: var(--text-secondary)">
  You can choose to disable or block cookies through your web browser settings, but this might affect the correct compilation and submission of the application form.
</p>`
    }
  }
};
