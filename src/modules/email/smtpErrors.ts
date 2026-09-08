import type { TFunction } from 'i18next';

/**
 * Turns a mail server's rejection into something a person can act on.
 *
 * SMTP errors are written for machines. "535 5.7.0 Invalid credentials" is
 * precise and completely useless to the person who has to fix it: it does not
 * say which of the two fields is wrong, or that Gmail will reject a normal
 * account password no matter how correct it is.
 *
 * So each recognised failure gets a plain sentence and a next step. The raw
 * text is still shown underneath, never replaced - it is what a mail
 * administrator will ask for, and hiding it would trade one unreadable screen
 * for a different one.
 */

export interface SmtpDiagnosis {
  /** What went wrong, in one sentence. */
  summary: string;
  /** What to do about it. */
  action: string;
  /**
   * Who can fix it, when the answer is not on this screen.
   *
   * Half of these failures are not the operator's to solve - a blocked port or
   * a rejected sender is decided by whoever runs the mail server. Naming them
   * saves an hour of retrying the same password.
   */
  contact?: string;
  /** The server's own words, kept verbatim. */
  raw: string;
}

export function diagnoseSmtpError(raw: string | null | undefined, t: TFunction): SmtpDiagnosis | null {
  if (!raw || !raw.trim()) return null;
  const text = raw.toLowerCase();

  const d = (summary: string, action: string, contact?: string): SmtpDiagnosis => ({
    summary,
    action,
    contact,
    raw,
  });

  // Authentication. By far the most common, and the one whose raw text is
  // most misleading: the credentials can be exactly right and still be
  // refused because the provider wants an app-specific password.
  if (
    text.includes('535') ||
    text.includes('invalid login') ||
    text.includes('invalid credentials') ||
    text.includes('authentication failed') ||
    text.includes('username and password not accepted') ||
    text.includes('eauth')
  ) {
    return d(
      t('email.smtpErrAuth', 'Il server di posta ha rifiutato le credenziali.'),
      t(
        'email.smtpErrAuthAction',
        'Controlla utente e password. Con Gmail, Google Workspace, Outlook o Aruba la password normale dell’account non funziona: serve una “password per le app” generata dal provider.'
      ),
      t(
        'email.smtpErrAuthContact',
        'Se utente e password sono corretti, chiedi al fornitore della casella email (o a chi gestisce il dominio) di abilitare l’accesso SMTP per questo account.'
      )
    );
  }

  if (text.includes('534') || text.includes('application-specific password')) {
    return d(
      t('email.smtpErrAppPassword', 'Il provider richiede una password dedicata alle applicazioni.'),
      t(
        'email.smtpErrAppPasswordAction',
        'Genera una “password per le app” nel pannello del provider di posta e incollala qui al posto della password dell’account.'
      ),
      t(
        'email.smtpErrAppPasswordContact',
        'Su Gmail e Google Workspace occorre prima attivare la verifica in due passaggi sull’account.'
      )
    );
  }

  // The server was never reached. Host, port or a firewall.
  if (text.includes('enotfound') || text.includes('getaddrinfo')) {
    return d(
      t('email.smtpErrHost', 'Il nome del server SMTP non esiste.'),
      t('email.smtpErrHostAction', 'Controlla il campo Host: di solito è simile a smtp.nomeprovider.it.'),
      t(
        'email.smtpErrHostContact',
        'Il nome esatto del server è indicato nel pannello del fornitore della casella email.'
      )
    );
  }

  if (
    text.includes('econnrefused') ||
    text.includes('etimedout') ||
    text.includes('ehostunreach') ||
    text.includes('esocket') ||
    text.includes('connection timeout')
  ) {
    return d(
      t('email.smtpErrUnreachable', 'Il server SMTP non risponde su questa porta.'),
      t(
        'email.smtpErrUnreachableAction',
        'Prova la porta 587 (STARTTLS) o 465 (SSL). Se il server è corretto, il firewall del server applicativo potrebbe bloccare la connessione in uscita.'
      ),
      t(
        'email.smtpErrUnreachableContact',
        'Se entrambe le porte falliscono, chiedi a chi gestisce l’hosting del server di sbloccare le connessioni SMTP in uscita: non è una cosa che si possa risolvere da questa pagina.'
      )
    );
  }

  // TLS.
  if (text.includes('self signed') || text.includes('certificate') || text.includes('tls')) {
    return d(
      t('email.smtpErrTls', 'Problema con il certificato TLS del server di posta.'),
      t('email.smtpErrTlsAction', 'Verifica che host e porta corrispondano al tipo di cifratura previsto dal provider.'),
      t('email.smtpErrTlsContact', 'Il fornitore della casella email può confermare porta e cifratura corrette.')
    );
  }

  // The account works, but is not allowed to send as this address.
  if (
    text.includes('550') ||
    text.includes('553') ||
    text.includes('not allowed') ||
    text.includes('sender rejected') ||
    text.includes('relay')
  ) {
    return d(
      t('email.smtpErrSender', 'Il server ha accettato l’accesso ma ha rifiutato il mittente o il destinatario.'),
      t(
        'email.smtpErrSenderAction',
        'Il campo Mittente deve essere un indirizzo che questo account è autorizzato a usare, di norma lo stesso dell’utente SMTP.'
      ),
      t(
        'email.smtpErrSenderContact',
        'Se il mittente è già corretto, chiedi al fornitore della casella email di autorizzare l’invio da questo indirizzo.'
      )
    );
  }

  if (text.includes('421') || text.includes('too many') || text.includes('rate limit')) {
    return d(
      t('email.smtpErrRate', 'Il server ha applicato un limite temporaneo di invio.'),
      t('email.smtpErrRateAction', 'Riprova tra qualche minuto. Se accade spesso, il provider limita il numero di email.'),
      t('email.smtpErrRateContact', 'Il fornitore della casella email può alzare il limite di invio giornaliero.')
    );
  }

  // Our own message, not the mail server's.
  if (text.includes('platform smtp is not configured')) {
    return d(
      t('email.smtpErrNoPlatform', 'La casella email della piattaforma non è ancora configurata.'),
      t('email.smtpErrNoPlatformAction', 'Compila Impostazioni → Email → Piattaforma e salva.')
    );
  }

  if (text.includes('smtp configuration missing')) {
    return d(
      t('email.smtpErrNoCompany', 'Questa azienda non ha una configurazione SMTP.'),
      t(
        'email.smtpErrNoCompanyAction',
        'Configura la casella della piattaforma (consigliato) oppure l’SMTP di questa azienda nella scheda Aziende.'
      )
    );
  }

  return d(
    t('email.smtpErrUnknown', 'Il server di posta ha rifiutato il messaggio.'),
    t('email.smtpErrUnknownAction', 'Il testo esatto restituito dal server è riportato qui sotto.'),
    t(
      'email.smtpErrUnknownContact',
      'Inoltra questo testo al fornitore della casella email: contiene il codice di errore che serve loro per identificare il problema.'
    )
  );
}

/** One-line version for a toast, where there is no room for the raw text. */
export function smtpErrorSummary(raw: string | null | undefined, t: TFunction): string | null {
  const diagnosis = diagnoseSmtpError(raw, t);
  if (!diagnosis) return null;
  // The contact line is left out of the toast on purpose: a toast is read in
  // two seconds, and the panel that stays on screen carries the full guidance.
  return `${diagnosis.summary} ${diagnosis.action}`;
}
