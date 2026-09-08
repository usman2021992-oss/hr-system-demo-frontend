export interface CandidateApplicationProfile {
  availability: string;
  gender: string;
  nationality: string;
  country: string;
  state: string;
  city: string;
  address: string;
  postalCode: string;
  dateOfBirth: string;
  currentEmployer: string;
  currentRole: string;
  hasCurrentEmployer: string;
  maritalStatus: string;
  uniqueId: string;
  password: string;
  hireDate: string;
  contractType: string;
  applicationDate: string;
  availableStartDate: string;
  applicationSource: string;
  applicationChannel: string;
  startDate: string;
}

export const EMPTY_CANDIDATE_PROFILE: CandidateApplicationProfile = {
  availability: '',
  gender: '',
  nationality: '',
  country: '',
  state: '',
  city: '',
  address: '',
  postalCode: '',
  dateOfBirth: '',
  currentEmployer: '',
  currentRole: '',
  hasCurrentEmployer: '',
  maritalStatus: '',
  uniqueId: '',
  password: '',
  hireDate: '',
  contractType: '',
  applicationDate: '',
  availableStartDate: '',
  applicationSource: '',
  applicationChannel: '',
  startDate: '',
};

export function buildCandidateProfile(partial: Record<string, unknown>): CandidateApplicationProfile {
  const next: CandidateApplicationProfile = { ...EMPTY_CANDIDATE_PROFILE };

  (Object.keys(EMPTY_CANDIDATE_PROFILE) as Array<keyof CandidateApplicationProfile>).forEach((key) => {
    const value = partial[key];
    next[key] = typeof value === 'string' ? value.trim() : '';
  });

  const aliases: Array<[keyof CandidateApplicationProfile, string[]]> = [
    ['dateOfBirth', ['date_of_birth']],
    ['currentEmployer', ['current_employer']],
    ['currentRole', ['current_role']],
    ['hasCurrentEmployer', ['has_current_employer', 'current_employer_known']],
    ['maritalStatus', ['marital_status']],
    ['uniqueId', ['unique_id']],
    ['password', ['password']],
    ['hireDate', ['hire_date']],
    ['contractType', ['contract_type']],
    ['applicationDate', ['application_date']],
    ['availableStartDate', ['available_start_date']],
    ['applicationSource', ['application_source']],
    ['applicationChannel', ['application_channel', 'channel', 'utm_source']],
    ['startDate', ['start_date']],
    ['postalCode', ['postal_code', 'postalcode', 'zip', 'zip_code', 'zipcode', 'cap']],
  ];

  for (const [targetKey, aliasKeys] of aliases) {
    if (next[targetKey]) continue;
    for (const aliasKey of aliasKeys) {
      const aliasValue = (partial as Record<string, unknown>)[aliasKey];
      if (typeof aliasValue === 'string' && aliasValue.trim() !== '') {
        next[targetKey] = aliasValue.trim();
        break;
      }
    }
  }

  return next;
}

export function parseCandidateProfile(sourceRef: string | null | undefined): CandidateApplicationProfile {
  if (!sourceRef) return { ...EMPTY_CANDIDATE_PROFILE };

  try {
    const parsed = JSON.parse(sourceRef) as Record<string, unknown>;
    return buildCandidateProfile(parsed);
  } catch {
    return { ...EMPTY_CANDIDATE_PROFILE };
  }
}

export function serializeCandidateProfile(profile: Partial<CandidateApplicationProfile>): string {
  return JSON.stringify(buildCandidateProfile(profile as Record<string, unknown>));
}