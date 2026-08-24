/** Presentation-only formatters. Framework-agnostic. */

export function pct(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

export function pp(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)} pp`;
}

export function num(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US");
}

export function money(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

export function moneyExact(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export function days(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "—";
  return `${value.toFixed(digits)} d`;
}

export function hours(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}h`;
}

export function titleCase(value: string): string {
  return value
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function featureLabel(feature: string): string {
  return feature
    .replace(/_/g, " ")
    .replace(/\bhist\b/gi, "historical")
    .replace(/\brate\b/gi, "rate")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
