export interface Formatter {
  money(amount: number): string;
  number(value: number): string;
}

export interface MoneyFormatConfig {
  currency: string;
  /** Place the currency code/symbol on the left or right. */
  codeSide: 'left' | 'right';
  decimals: number;
  decimalSeparator: string;
  groupSeparator: string;
}

const defaultConfig: MoneyFormatConfig = {
  currency: '$',
  codeSide: 'left',
  decimals: 2,
  decimalSeparator: '.',
  groupSeparator: ',',
};

function group(intPart: string, sep: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
}

/** A small default formatter so value displays work with zero wiring. */
export function defaultFormatter(config: Partial<MoneyFormatConfig> = {}): Formatter {
  const cfg = { ...defaultConfig, ...config };
  const fmt = (value: number, decimals: number): string => {
    const fixed = Math.abs(value).toFixed(decimals);
    const [int, frac] = fixed.split('.');
    const grouped = group(int ?? '0', cfg.groupSeparator);
    const sign = value < 0 ? '-' : '';
    return frac ? `${sign}${grouped}${cfg.decimalSeparator}${frac}` : `${sign}${grouped}`;
  };
  return {
    number: (value) => fmt(value, 0),
    money: (amount) => {
      const body = fmt(amount, cfg.decimals);
      return cfg.codeSide === 'left' ? `${cfg.currency}${body}` : `${body}${cfg.currency}`;
    },
  };
}
