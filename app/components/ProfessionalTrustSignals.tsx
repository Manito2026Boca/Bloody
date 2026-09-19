import { BadgeCheck, Star } from 'lucide-react';
import {
  completedJobsLabel,
  declaredExperienceLabel,
  professionalReputationLabel,
  professionalTrustBadges,
  type ProfessionalTrustData,
} from '../lib/professionalTrust';

export function ProfessionalTrustSignals({
  data,
  detailed = false,
}: {
  data: ProfessionalTrustData | null | undefined;
  detailed?: boolean;
}) {
  const reviewCount = Number(data?.trust_review_count || 0);
  const completedJobs = completedJobsLabel(data);
  const experience = declaredExperienceLabel(data);
  const badges = professionalTrustBadges(data);

  return (
    <span className={`v6-trust-signals${detailed ? ' detailed' : ''}`}>
      <span className="v6-trust-reputation">
        {reviewCount > 0 && <Star size={14} aria-hidden="true" />}
        {professionalReputationLabel(data)}
      </span>
      {completedJobs && <span>{completedJobs}</span>}
      {experience && <span>{experience}</span>}
      {badges.length > 0 && (
        <span className="v6-trust-badges">
          {badges.map((badge) => (
            <span key={badge.id} title={badge.explanation} aria-label={`${badge.label}. ${badge.explanation}`}>
              <BadgeCheck size={14} aria-hidden="true" /> {badge.label}
            </span>
          ))}
        </span>
      )}
      {detailed && badges.length > 0 && (
        <span className="v6-trust-explanation">
          {badges.map((badge) => `${badge.label}: ${badge.explanation}`).join(' ')}
        </span>
      )}
    </span>
  );
}
