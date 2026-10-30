const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;

function plural(amount: number, singular: string, pluralForm: string): string {
  return `${amount} ${amount === 1 ? singular : pluralForm}`;
}

export function describeDuration(seconds: number): string {
  if (seconds % SECONDS_PER_HOUR === 0) {
    return plural(seconds / SECONDS_PER_HOUR, 'hora', 'horas');
  }
  return plural(Math.ceil(seconds / SECONDS_PER_MINUTE), 'minuto', 'minutos');
}
