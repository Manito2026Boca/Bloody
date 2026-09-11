'use client';

import {
  BriefcaseBusiness,
  CalendarDays,
  Home,
  MessageCircle,
  RefreshCw,
  Settings,
} from 'lucide-react';
import type { ReactNode } from 'react';

export type ManitoTab =
  | 'home'
  | 'orders'
  | 'messages'
  | 'agenda'
  | 'account'
  | 'profile'
  | 'favorites'
  | 'search';

export type ManitoExperience = 'client' | 'professional';

type NavigationItem = {
  id: ManitoTab;
  label: string;
  icon: ReactNode;
};

const clientNavigation: NavigationItem[] = [
  { id: 'home', label: 'Inicio', icon: <Home size={20} aria-hidden="true" /> },
  { id: 'orders', label: 'Trabajos', icon: <BriefcaseBusiness size={20} aria-hidden="true" /> },
  { id: 'messages', label: 'Mensajes', icon: <MessageCircle size={20} aria-hidden="true" /> },
  { id: 'account', label: 'Cuenta', icon: <Settings size={20} aria-hidden="true" /> },
];

const professionalNavigation: NavigationItem[] = [
  { id: 'home', label: 'Hoy', icon: <Home size={20} aria-hidden="true" /> },
  { id: 'orders', label: 'Trabajos', icon: <BriefcaseBusiness size={20} aria-hidden="true" /> },
  { id: 'agenda', label: 'Agenda', icon: <CalendarDays size={20} aria-hidden="true" /> },
  { id: 'account', label: 'Cuenta', icon: <Settings size={20} aria-hidden="true" /> },
];

export function ManitoBottomNavigation({
  experience,
  activeTab,
  onNavigate,
}: {
  experience: ManitoExperience;
  activeTab: ManitoTab;
  onNavigate: (tab: ManitoTab) => void;
}) {
  const items = experience === 'client' ? clientNavigation : professionalNavigation;

  return (
    <nav className="v6-bottom" aria-label={experience === 'client' ? 'Navegación Cliente' : 'Navegación Profesional'}>
      {items.map((item) => (
        <button
          type="button"
          className={activeTab === item.id ? 'active' : ''}
          aria-current={activeTab === item.id ? 'page' : undefined}
          onClick={() => onNavigate(item.id)}
          key={item.id}
        >
          {item.icon}
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}

export function ExperienceSwitch({
  experience,
  canUseProfessional,
  onChange,
}: {
  experience: ManitoExperience;
  canUseProfessional: boolean;
  onChange: (experience: ManitoExperience) => void;
}) {
  const nextExperience: ManitoExperience = experience === 'client' ? 'professional' : 'client';
  const disabled = nextExperience === 'professional' && !canUseProfessional;
  return (
    <button
      className="v6-experience-switch"
      type="button"
      disabled={disabled}
      aria-label={`Cambiar a experiencia ${nextExperience === 'client' ? 'Cliente' : 'Profesional'}`}
      onClick={() => onChange(nextExperience)}
    >
      <RefreshCw size={14} aria-hidden="true" />
      <span>{experience === 'client' ? 'Cliente' : 'Profesional'}</span>
    </button>
  );
}

export function RequestProgress({
  steps,
  current,
}: {
  steps: readonly string[];
  current: number;
}) {
  return (
    <div className="v6-request-progress" aria-label={`Paso ${current + 1} de ${steps.length}: ${steps[current]}`}>
      <div className="v6-request-progress-copy">
        <span>Paso {current + 1} de {steps.length}</span>
        <strong>{steps[current]}</strong>
      </div>
      <div className="v6-request-progress-track" aria-hidden="true">
        {steps.map((step, index) => (
          <span className={index <= current ? 'active' : ''} key={step} />
        ))}
      </div>
    </div>
  );
}
