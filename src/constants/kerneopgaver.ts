/**
 * The five fixed subsections of a kerneopgave.
 *
 * These live here rather than in kerneopgaverService so that code which only
 * needs to reason about the shape — the .docx importer, in particular — does not
 * transitively import the Supabase client. The importer is deliberately free of
 * database access, and importing the client would both undermine that and make
 * it impossible to run outside a browser session.
 *
 * kerneopgaverService re-exports these, so existing imports keep working.
 */

export type KerneopgaveSectionType =
  | 'almenmedicinske_tilbud'
  | 'speciallaegepraksis'
  | 'sygehus'
  | 'faellesopgaver'
  | 'fremtidig_varetagelse';

export const KERNEOPGAVE_SECTION_LABELS: Record<KerneopgaveSectionType, string> = {
  almenmedicinske_tilbud: 'Almenmedicinske tilbud',
  speciallaegepraksis:    'Speciallægepraksis',
  sygehus:                'Sygehus',
  faellesopgaver:         'Fællesopgaver med andre specialer',
  fremtidig_varetagelse:  'Fremtidig varetagelse',
};

export const KERNEOPGAVE_SECTION_TYPES: KerneopgaveSectionType[] = [
  'almenmedicinske_tilbud',
  'speciallaegepraksis',
  'sygehus',
  'faellesopgaver',
  'fremtidig_varetagelse',
];
