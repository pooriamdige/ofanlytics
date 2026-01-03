// getTehranDateString not used in this file

export interface Plan {
  id: number;
  daily_dd_percent: number;
  max_dd_percent: number;
  daily_dd_is_floating: boolean;
  max_dd_is_floating: boolean;
}

export interface EquityPeak {
  equity: number;
  recorded_at: Date;
  trading_date?: string;
}

export interface DrawdownMetrics {
  // Baselines
  baseline_daily_equity: number;
  baseline_max_equity: number;
  daily_start_equity: number;
  daily_peak_equity: number;
  all_time_peak_equity: number;
  
  // Limits
  daily_limit_amount: number;
  max_limit_amount: number;
  
  // Breach points
  daily_breach_equity: number;
  max_breach_equity: number;
  
  // Usage
  daily_used_amount: number;
  max_used_amount: number;
  daily_usage_percent_of_limit: number;
  max_usage_percent_of_limit: number;
}

/**
 * Calculate daily peak equity
 */
export function calculateDailyPeakEquity(
  dailyStartEquity: number,
  currentEquity: number,
  isFloating: boolean,
  storedPeak?: EquityPeak
): number {
  if (!isFloating) {
    return dailyStartEquity;
  }
  
  return Math.max(
    dailyStartEquity,
    storedPeak?.equity || dailyStartEquity,
    currentEquity
  );
}

/**
 * Calculate all-time peak equity
 */
export function calculateAllTimePeakEquity(
  startingEquity: number,
  currentEquity: number,
  isFloating: boolean,
  storedPeak?: EquityPeak
): number {
  if (!isFloating) {
    return startingEquity;
  }
  
  return Math.max(
    startingEquity,
    storedPeak?.equity || startingEquity,
    currentEquity
  );
}

/**
 * Calculate all drawdown metrics
 */
export function calculateDrawdownMetrics(
  plan: Plan,
  currentEquity: number,
  startingEquity: number,
  dailyStartEquity: number,
  dailyPeak?: EquityPeak,
  allTimePeak?: EquityPeak
): DrawdownMetrics {
  // Calculate peaks
  const dailyPeakEquity = calculateDailyPeakEquity(
    dailyStartEquity,
    currentEquity,
    plan.daily_dd_is_floating,
    dailyPeak
  );
  
  const allTimePeakEquity = calculateAllTimePeakEquity(
    startingEquity,
    currentEquity,
    plan.max_dd_is_floating,
    allTimePeak
  );
  
  // Calculate baselines
  const baselineDailyEquity = plan.daily_dd_is_floating
    ? dailyPeakEquity
    : dailyStartEquity;
  
  const baselineMaxEquity = plan.max_dd_is_floating
    ? allTimePeakEquity
    : startingEquity;
  
  // Calculate limits
  const dailyLimitAmount = baselineDailyEquity * (plan.daily_dd_percent / 100);
  const maxLimitAmount = baselineMaxEquity * (plan.max_dd_percent / 100);
  
  // Calculate breach equity
  const dailyBreachEquity = baselineDailyEquity - dailyLimitAmount;
  const maxBreachEquity = baselineMaxEquity - maxLimitAmount;
  
  // Calculate used amounts
  const dailyUsedAmount = Math.max(0, baselineDailyEquity - currentEquity);
  const maxUsedAmount = Math.max(0, baselineMaxEquity - currentEquity);
  
  // Calculate usage percentages
  const dailyUsagePercentOfLimit = dailyLimitAmount > 0
    ? (dailyUsedAmount / dailyLimitAmount) * 100
    : 0;
  
  const maxUsagePercentOfLimit = maxLimitAmount > 0
    ? (maxUsedAmount / maxLimitAmount) * 100
    : 0;
  
  return {
    baseline_daily_equity: baselineDailyEquity,
    baseline_max_equity: baselineMaxEquity,
    daily_start_equity: dailyStartEquity,
    daily_peak_equity: dailyPeakEquity,
    all_time_peak_equity: allTimePeakEquity,
    daily_limit_amount: dailyLimitAmount,
    max_limit_amount: maxLimitAmount,
    daily_breach_equity: dailyBreachEquity,
    max_breach_equity: maxBreachEquity,
    daily_used_amount: dailyUsedAmount,
    max_used_amount: maxUsedAmount,
    daily_usage_percent_of_limit: dailyUsagePercentOfLimit,
    max_usage_percent_of_limit: maxUsagePercentOfLimit,
  };
}

/**
 * Check if account should enter live monitoring
 */
export function shouldEnterLiveMonitoring(
  dailyUsagePercent: number,
  maxUsagePercent: number
): boolean {
  return dailyUsagePercent >= 97 || maxUsagePercent >= 97;
}

/**
 * Check if account should exit live monitoring
 */
export function shouldExitLiveMonitoring(
  dailyUsagePercent: number,
  maxUsagePercent: number
): boolean {
  return dailyUsagePercent < 90 && maxUsagePercent < 90;
}

/**
 * Check for daily DD violation
 */
export function checkDailyViolation(
  currentEquity: number,
  dailyBreachEquity: number
): boolean {
  return currentEquity <= dailyBreachEquity;
}

/**
 * Check for max DD violation
 */
export function checkMaxViolation(
  currentEquity: number,
  maxBreachEquity: number
): boolean {
  return currentEquity <= maxBreachEquity;
}

