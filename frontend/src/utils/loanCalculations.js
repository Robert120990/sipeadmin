/**
 * Financial Calculation Utilities for SIPEOFI Loans and Amortization
 * Modeled after Dinkytown Simple Loan Amortization Calculator
 * Extended with Insurance (Seguro) & Obligatory Savings (Ahorro Obligatorio)
 */

export const FREQUENCIES = {
    mensual: { label: 'Mensual', periodsPerYear: 12, factor: 1 },
    quincenal: { label: 'Quincenal (Bi-semanal)', periodsPerYear: 24, factor: 2 },
    semanal: { label: 'Semanal', periodsPerYear: 52, factor: 4.3333 }
};

export const INSURANCE_TYPES = {
    none: { label: 'Sin Seguro', isPercent: false },
    fixed: { label: 'Cuota Fija ($ por cuota)', isPercent: false, placeholder: 'Ej. 15.00' },
    percent_balance: { label: '% Anual sobre Saldo', isPercent: true, placeholder: 'Ej. 0.60%' },
    percent_original: { label: '% Anual sobre Monto Inicial', isPercent: true, placeholder: 'Ej. 0.50%' }
};

export const SAVINGS_TYPES = {
    none: { label: 'Sin Ahorro Obligatorio', isPercent: false },
    fixed: { label: 'Cuota Fija ($ por cuota)', isPercent: false, placeholder: 'Ej. 20.00' },
    percent_payment: { label: '% sobre la Cuota Regular', isPercent: true, placeholder: 'Ej. 5.00%' }
};

export const COMMISSION_TYPES = {
    none: { label: 'Sin Comisión', isPercent: false },
    percent: { label: '% sobre Monto del Préstamo', isPercent: true, placeholder: 'Ej. 2.00%' },
    fixed: { label: 'Monto Fijo ($)', isPercent: false, placeholder: 'Ej. 500.00' }
};

/**
 * Calculate disbursement commission fee ($)
 */
export const calculateDisbursementCommission = (type, value, principal) => {
    const val = Math.max(0, parseFloat(value) || 0);
    const P = Math.max(0, parseFloat(principal) || 0);
    if (!type || type === 'none' || val <= 0 || P <= 0) return 0;
    if (type === 'percent') {
        return Math.round((P * (val / 100)) * 100) / 100;
    }
    if (type === 'fixed') {
        return Math.round(val * 100) / 100;
    }
    return 0;
};

/**
 * Calculate periodic installment (PMT)
 */
export const calculatePMT = (principal, annualRate, termMonths, frequency = 'mensual') => {
    const P = parseFloat(principal);
    const rate = parseFloat(annualRate);
    const nMonths = parseFloat(termMonths);

    if (!P || P <= 0 || !rate || rate <= 0 || !nMonths || nMonths <= 0) return 0;

    const freqConfig = FREQUENCIES[frequency] || FREQUENCIES.mensual;
    const periodsPerYear = freqConfig.periodsPerYear;
    const totalPeriods = Math.round(nMonths * (periodsPerYear / 12));

    const r = (rate / 100) / periodsPerYear;
    const factor = Math.pow(1 + r, totalPeriods);
    const pmt = (P * r * factor) / (factor - 1);

    return Math.round(pmt * 100) / 100;
};

/**
 * Calculate loan amount (Present Value - PV) from payment
 */
export const calculatePV = (pmt, annualRate, termMonths, frequency = 'mensual') => {
    const payment = parseFloat(pmt);
    const rate = parseFloat(annualRate);
    const nMonths = parseFloat(termMonths);

    if (!payment || payment <= 0 || !rate || rate <= 0 || !nMonths || nMonths <= 0) return 0;

    const freqConfig = FREQUENCIES[frequency] || FREQUENCIES.mensual;
    const periodsPerYear = freqConfig.periodsPerYear;
    const totalPeriods = Math.round(nMonths * (periodsPerYear / 12));

    const r = (rate / 100) / periodsPerYear;
    const factor = Math.pow(1 + r, totalPeriods);
    const pv = payment * ((factor - 1) / (r * factor));

    return Math.round(pv * 100) / 100;
};

/**
 * Format currency amount ($)
 */
export const formatCurrency = (amount) => {
    const num = parseFloat(amount) || 0;
    return num.toLocaleString('es-SV', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
};

/**
 * Add period to a date based on frequency
 */
export const addPeriodToDate = (baseDate, periodIndex, frequency = 'mensual') => {
    const d = new Date(baseDate);
    if (isNaN(d.getTime())) return new Date();

    if (frequency === 'quincenal') {
        d.setDate(d.getDate() + (periodIndex * 15));
    } else if (frequency === 'semanal') {
        d.setDate(d.getDate() + (periodIndex * 7));
    } else {
        d.setMonth(d.getMonth() + periodIndex);
    }
    return d;
};

/**
 * Calculate insurance fee for a period
 */
export const calculatePeriodInsurance = (type, value, balance, principal, periodsPerYear) => {
    const val = Math.max(0, parseFloat(value) || 0);
    if (!type || type === 'none' || val <= 0) return 0;

    if (type === 'fixed') {
        return Math.round(val * 100) / 100;
    }
    if (type === 'percent_balance') {
        return Math.round(((balance * (val / 100)) / periodsPerYear) * 100) / 100;
    }
    if (type === 'percent_original') {
        return Math.round(((principal * (val / 100)) / periodsPerYear) * 100) / 100;
    }
    return 0;
};

/**
 * Calculate savings fee for a period
 */
export const calculatePeriodSavings = (type, value, regularPMT) => {
    const val = Math.max(0, parseFloat(value) || 0);
    if (!type || type === 'none' || val <= 0) return 0;

    if (type === 'fixed') {
        return Math.round(val * 100) / 100;
    }
    if (type === 'percent_payment') {
        return Math.round((regularPMT * (val / 100)) * 100) / 100;
    }
    return 0;
};

/**
 * Generate full amortization schedule with extra payment, insurance & savings support
 */
export const generateAmortizationSchedule = ({
    principal,
    annualRate,
    termMonths,
    frequency = 'mensual',
    startDate = new Date().toISOString().split('T')[0],
    extraPaymentMonthly = 0,
    extraPaymentsCustom = [], // array of { periodNumber, amount }
    insuranceType = 'none',
    insuranceValue = 0,
    savingsType = 'none',
    savingsValue = 0,
    commissionType = 'none',
    commissionValue = 0
}) => {
    const P = parseFloat(principal) || 0;
    const rate = parseFloat(annualRate) || 0;
    const nMonths = parseFloat(termMonths) || 0;
    const extraPerPeriod = Math.max(0, parseFloat(extraPaymentMonthly) || 0);

    const disbursementCommission = calculateDisbursementCommission(commissionType, commissionValue, P);
    const netDisbursedAmount = Math.max(0, Math.round((P - disbursementCommission) * 100) / 100);

    if (P <= 0 || rate <= 0 || nMonths <= 0) {
        return {
            schedule: [],
            originalSchedule: [],
            summary: {
                totalPaid: 0,
                totalInterest: 0,
                totalPrincipal: 0,
                totalExtra: 0,
                totalInsurance: 0,
                totalSavings: 0,
                totalPaidWithCharges: 0,
                disbursementCommission: 0,
                netDisbursedAmount: 0,
                totalCostOfLoan: 0,
                monthsSaved: 0,
                periodsSaved: 0,
                interestSaved: 0,
                originalTotalInterest: 0,
                payoffDate: null,
                originalPayoffDate: null,
                regularPayment: 0,
                firstPeriodInsurance: 0,
                firstPeriodSavings: 0,
                firstPeriodTotalPayment: 0
            }
        };
    }

    const freqConfig = FREQUENCIES[frequency] || FREQUENCIES.mensual;
    const periodsPerYear = freqConfig.periodsPerYear;
    const totalPeriodsOriginal = Math.round(nMonths * (periodsPerYear / 12));
    const r = (rate / 100) / periodsPerYear;

    const regularPMT = calculatePMT(P, rate, nMonths, frequency);

    // 1. Calculate Original Schedule (No extra payments)
    let origBalance = P;
    let origTotalInterest = 0;
    let origTotalPaid = 0;
    const originalSchedule = [];

    for (let i = 1; i <= totalPeriodsOriginal; i++) {
        const interest = Math.round(origBalance * r * 100) / 100;
        let capital = regularPMT - interest;
        let pmt = regularPMT;

        if (origBalance - capital <= 0 || i === totalPeriodsOriginal) {
            capital = origBalance;
            pmt = capital + interest;
            origBalance = 0;
        } else {
            origBalance = Math.max(0, origBalance - capital);
        }

        origTotalInterest += interest;
        origTotalPaid += pmt;

        originalSchedule.push({
            number: i,
            date: addPeriodToDate(startDate, i, frequency).toISOString().split('T')[0],
            payment: pmt,
            principal: capital,
            interest: interest,
            extraPrincipal: 0,
            balance: Math.round(origBalance * 100) / 100
        });

        if (origBalance <= 0) break;
    }

    // 2. Calculate Accelerated Schedule (With extra payments, insurance and savings)
    let balance = P;
    let totalInterest = 0;
    let totalPaid = 0;
    let totalExtra = 0;
    let totalInsurance = 0;
    let totalSavings = 0;
    const schedule = [];
    const customExtraMap = {};
    (extraPaymentsCustom || []).forEach(ep => {
        if (ep.periodNumber && ep.amount) {
            customExtraMap[ep.periodNumber] = parseFloat(ep.amount) || 0;
        }
    });

    for (let i = 1; i <= totalPeriodsOriginal; i++) {
        if (balance <= 0.005) break;

        const currentBalanceBeforePayment = balance;
        const interest = Math.round(balance * r * 100) / 100;
        let regularCapital = regularPMT - interest;
        let extra = extraPerPeriod + (customExtraMap[i] || 0);

        let totalCapForPeriod = regularCapital + extra;
        let actualPayment = regularPMT + extra;

        if (balance <= totalCapForPeriod) {
            totalCapForPeriod = balance;
            extra = Math.max(0, totalCapForPeriod - regularCapital);
            actualPayment = totalCapForPeriod + interest;
            balance = 0;
        } else {
            balance = Math.max(0, balance - totalCapForPeriod);
        }

        const insuranceFee = calculatePeriodInsurance(insuranceType, insuranceValue, currentBalanceBeforePayment, P, periodsPerYear);
        const savingsFee = calculatePeriodSavings(savingsType, savingsValue, regularPMT);
        const totalWithCharges = Math.round((actualPayment + insuranceFee + savingsFee) * 100) / 100;

        totalInterest += interest;
        totalPaid += actualPayment;
        totalExtra += extra;
        totalInsurance += insuranceFee;
        totalSavings += savingsFee;

        schedule.push({
            number: i,
            date: addPeriodToDate(startDate, i, frequency).toISOString().split('T')[0],
            payment: Math.round(actualPayment * 100) / 100,
            principal: Math.round(regularCapital * 100) / 100,
            interest: Math.round(interest * 100) / 100,
            extraPrincipal: Math.round(extra * 100) / 100,
            totalPrincipal: Math.round(totalCapForPeriod * 100) / 100,
            insurance: insuranceFee,
            savings: savingsFee,
            totalWithCharges: totalWithCharges,
            balance: Math.round(balance * 100) / 100,
            accumulatedInterest: Math.round(totalInterest * 100) / 100
        });

        if (balance <= 0) break;
    }

    const periodsSaved = Math.max(0, originalSchedule.length - schedule.length);
    const monthsSaved = Math.round((periodsSaved / (periodsPerYear / 12)) * 10) / 10;
    const interestSaved = Math.max(0, Math.round((origTotalInterest - totalInterest) * 100) / 100);

    const payoffDate = schedule.length > 0 ? schedule[schedule.length - 1].date : null;
    const originalPayoffDate = originalSchedule.length > 0 ? originalSchedule[originalSchedule.length - 1].date : null;

    const firstPeriodInsurance = schedule.length > 0 ? schedule[0].insurance : 0;
    const firstPeriodSavings = schedule.length > 0 ? schedule[0].savings : 0;
    const firstPeriodTotalPayment = Math.round((regularPMT + firstPeriodInsurance + firstPeriodSavings) * 100) / 100;
    const totalPaidWithCharges = Math.round((totalPaid + totalInsurance + totalSavings) * 100) / 100;
    const totalCostOfLoan = Math.round((totalPaidWithCharges + disbursementCommission) * 100) / 100;

    return {
        schedule,
        originalSchedule,
        summary: {
            regularPayment: regularPMT,
            totalPaid: Math.round(totalPaid * 100) / 100,
            totalInterest: Math.round(totalInterest * 100) / 100,
            totalPrincipal: P,
            totalExtra: Math.round(totalExtra * 100) / 100,
            totalInsurance: Math.round(totalInsurance * 100) / 100,
            totalSavings: Math.round(totalSavings * 100) / 100,
            totalPaidWithCharges,
            disbursementCommission,
            netDisbursedAmount,
            totalCostOfLoan,
            periodsSaved,
            monthsSaved,
            interestSaved,
            originalTotalInterest: Math.round(origTotalInterest * 100) / 100,
            payoffDate,
            originalPayoffDate,
            firstPeriodInsurance,
            firstPeriodSavings,
            firstPeriodTotalPayment
        }
    };
};

/**
 * Recalculate remaining schedule for an active loan given registered payments
 */
export const calculateRemainingPayoffFromBalance = (currentBalance, regularPayment, annualRate, frequency = 'mensual', extraPaymentMonthly = 0) => {
    const P = parseFloat(currentBalance) || 0;
    const pmt = (parseFloat(regularPayment) || 0) + (parseFloat(extraPaymentMonthly) || 0);
    const rate = parseFloat(annualRate) || 0;

    if (P <= 0 || pmt <= 0 || rate <= 0) {
        return { remainingPeriods: 0, remainingMonths: 0, totalInterestRemaining: 0 };
    }

    const freqConfig = FREQUENCIES[frequency] || FREQUENCIES.mensual;
    const periodsPerYear = freqConfig.periodsPerYear;
    const r = (rate / 100) / periodsPerYear;

    let balance = P;
    let periods = 0;
    let totalInterest = 0;

    while (balance > 0.01 && periods < 600) {
        periods++;
        const interest = Math.round(balance * r * 100) / 100;
        let cap = pmt - interest;
        if (cap <= 0) {
            return { remainingPeriods: Infinity, remainingMonths: Infinity, totalInterestRemaining: Infinity };
        }
        if (balance <= cap) {
            cap = balance;
            balance = 0;
        } else {
            balance -= cap;
        }
        totalInterest += interest;
    }

    const remainingMonths = Math.round((periods / (periodsPerYear / 12)) * 10) / 10;
    return {
        remainingPeriods: periods,
        remainingMonths,
        totalInterestRemaining: Math.round(totalInterest * 100) / 100
    };
};
