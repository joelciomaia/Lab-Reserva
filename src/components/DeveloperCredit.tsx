import { useEffect, useState } from 'react';

interface DeveloperProfile {
  name: string;
  portfolioUrl: string;
}

interface DeveloperCreditProps {
  productName: string;
  className?: string;
}

const FALLBACK_PROFILE: DeveloperProfile = {
  name: 'Joelcio J. Maia',
  portfolioUrl: 'https://joelciomaia.github.io/',
};

let profileRequest: Promise<DeveloperProfile> | null = null;

function isDeveloperProfile(value: unknown): value is DeveloperProfile {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<DeveloperProfile>;
  return (
    typeof candidate.name === 'string' &&
    candidate.name.trim().length > 0 &&
    typeof candidate.portfolioUrl === 'string' &&
    candidate.portfolioUrl.startsWith('https://')
  );
}

async function loadDeveloperProfile(): Promise<DeveloperProfile> {
  if (!profileRequest) {
    profileRequest = fetch('/developer.json', { cache: 'no-cache' })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('Perfil do desenvolvedor indisponível.');
        }

        const payload: unknown = await response.json();
        if (!isDeveloperProfile(payload)) {
          throw new Error('Perfil do desenvolvedor inválido.');
        }

        return {
          name: payload.name.trim(),
          portfolioUrl: payload.portfolioUrl,
        };
      })
      .catch(() => FALLBACK_PROFILE);
  }

  return profileRequest;
}

export function DeveloperCredit({ productName, className }: DeveloperCreditProps) {
  const [profile, setProfile] = useState<DeveloperProfile>(FALLBACK_PROFILE);

  useEffect(() => {
    let isCurrent = true;

    void loadDeveloperProfile().then((loadedProfile) => {
      if (isCurrent) {
        setProfile(loadedProfile);
      }
    });

    return () => {
      isCurrent = false;
    };
  }, []);

  return (
    <span className={className}>
      © {new Date().getFullYear()} {productName} · Desenvolvido por {profile.name} ·{' '}
      <a href={profile.portfolioUrl} target="_blank" rel="noreferrer">
        Portfólio do desenvolvedor
      </a>
    </span>
  );
}
