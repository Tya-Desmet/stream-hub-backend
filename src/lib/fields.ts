// Registre des types de champ d'inscription + validation AUTORITAIRE (serveur).
// Le front a un miroir léger pour les indices de saisie, mais c'est ici que ça fait foi.

export type FieldType =
  | 'discord' | 'riot' | 'minecraft' | 'twitch' | 'email'
  | 'text' | 'textarea' | 'select' | 'checkbox';

export type FieldDef = {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  placeholder?: string;
  help?: string;
  options?: string[]; // pour 'select'
};

export type Winner = { entryId: string; label: string; at: number };

export type EventDef = {
  id: string;
  slug: string;
  title: string;
  description?: string;
  banner?: string;
  type: 'registration' | 'giveaway';
  open: boolean;
  closeAt?: string;          // ISO ; au-delà → fermé
  fields: FieldDef[];
  confirmation?: string;
  webhookUrl?: string;       // override du webhook Discord global
  winners?: Winner[];
};

const MAX = 200;        // longueur max d'un champ court
const MAX_LONG = 2000;  // longueur max d'un textarea

const RE = {
  // Discord moderne (name, 2–32) OU legacy (name#1234).
  discord: /^(@?[^\s@#:]{2,32}|[^\s@#:]{2,32}#\d{2,6})$/u,
  riot: /^.{3,16}#.{2,5}$/u,
  minecraft: /^[A-Za-z0-9_]{3,16}$/,
  twitch: /^[A-Za-z0-9_]{3,25}$/,
  email: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
};

export function validateField(
  field: FieldDef,
  raw: unknown,
): { ok: boolean; value: string | boolean; error?: string } {
  if (field.type === 'checkbox') {
    const v = raw === true || raw === 'true' || raw === 'on';
    if (field.required && !v) return { ok: false, value: false, error: `« ${field.label} » requis.` };
    return { ok: true, value: v };
  }

  const s = (raw == null ? '' : String(raw)).trim();
  if (!s) {
    if (field.required) return { ok: false, value: '', error: `« ${field.label} » requis.` };
    return { ok: true, value: '' };
  }
  if (field.type === 'textarea') {
    if (s.length > MAX_LONG) return { ok: false, value: s, error: `« ${field.label} » trop long.` };
    return { ok: true, value: s };
  }
  if (s.length > MAX) return { ok: false, value: s, error: `« ${field.label} » trop long.` };

  switch (field.type) {
    case 'discord':
      if (!RE.discord.test(s)) return { ok: false, value: s, error: 'Pseudo Discord invalide.' };
      break;
    case 'riot':
      if (!RE.riot.test(s)) return { ok: false, value: s, error: 'Riot ID invalide (ex. Nom#EUW).' };
      break;
    case 'minecraft':
      if (!RE.minecraft.test(s)) return { ok: false, value: s, error: 'Pseudo Minecraft invalide (3–16, lettres/chiffres/_).' };
      break;
    case 'twitch':
      if (!RE.twitch.test(s)) return { ok: false, value: s, error: 'Pseudo Twitch invalide.' };
      break;
    case 'email':
      if (!RE.email.test(s)) return { ok: false, value: s, error: 'Email invalide.' };
      break;
    case 'select':
      if (!(field.options || []).includes(s)) return { ok: false, value: s, error: 'Choix invalide.' };
      break;
    default:
      break; // text
  }
  return { ok: true, value: s };
}

export function validateSubmission(
  event: EventDef,
  values: Record<string, unknown>,
): { ok: boolean; errors: Record<string, string>; clean: Record<string, string | boolean> } {
  const errors: Record<string, string> = {};
  const clean: Record<string, string | boolean> = {};
  const v = values && typeof values === 'object' ? values : {};
  for (const f of event.fields) {
    const r = validateField(f, (v as Record<string, unknown>)[f.key]);
    if (!r.ok) errors[f.key] = r.error || 'Invalide.';
    else if (f.type === 'checkbox') clean[f.key] = r.value;
    else if (r.value !== '') clean[f.key] = r.value;
  }
  return { ok: Object.keys(errors).length === 0, errors, clean };
}

// Étiquette lisible d'une inscription (pour notifications / tirage) : Discord en priorité.
export function submissionLabel(event: EventDef, values: Record<string, string | boolean>): string {
  const discordField = event.fields.find((f) => f.type === 'discord');
  if (discordField && values[discordField.key]) return String(values[discordField.key]);
  const first = event.fields.find((f) => f.type !== 'checkbox' && values[f.key]);
  return first ? String(values[first.key]) : 'Anonyme';
}
