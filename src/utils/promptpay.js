// src/utils/promptpay.js
// Standard EMVCo PromptPay QR Code Generator for Thailand POS

/**
 * CRC16-CCITT (XModem) with initial value 0xFFFF and polynomial 0x1021.
 * Matches Bank of Thailand (BOT) EMVCo PromptPay specification.
 */
export function crc16(str, init = 0xffff) {
  let crc = init;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    crc ^= code << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return ('0000' + crc.toString(16).toUpperCase()).slice(-4);
}

/**
 * Format a Tag-Length-Value (TLV) segment.
 */
function f(id, value) {
  const len = ('00' + value.length).slice(-2);
  return `${id}${len}${value}`;
}

/**
 * Clean target string, keeping only digits.
 */
export function sanitizeTarget(id) {
  return (id || '').replace(/[^0-9]/g, '');
}

/**
 * Validate PromptPay target format.
 * Returns { valid: boolean, type: 'phone' | 'national_id' | null }
 */
export function validatePromptPayTarget(id) {
  const clean = sanitizeTarget(id);
  if (clean.length === 10 && clean.startsWith('0')) {
    return { valid: true, type: 'phone' };
  }
  if (clean.length === 13) {
    return { valid: true, type: 'national_id' };
  }
  return { valid: false, type: null };
}

/**
 * Format target for human-readable display on screens and receipts.
 */
export function formatPromptPayDisplay(id) {
  const clean = sanitizeTarget(id);
  if (!clean) return '-';
  if (clean.length === 10) {
    return `${clean.slice(0, 3)}-${clean.slice(3, 6)}-${clean.slice(6)}`;
  }
  if (clean.length === 13) {
    return `${clean.slice(0, 1)}-${clean.slice(1, 5)}-${clean.slice(5, 10)}-${clean.slice(10, 12)}-${clean.slice(12)}`;
  }
  return clean;
}

/**
 * Format target for EMVCo Tag 29 payload:
 * - Mobile: 00668XXXXXXXX (13 digits)
 * - National ID / Tax ID: 13 digits
 */
function formatTargetForPayload(id) {
  const numbers = sanitizeTarget(id);
  if (numbers.length >= 13) return numbers;
  return ('0000000000000' + numbers.replace(/^0/, '66')).slice(-13);
}

/**
 * Generate standard Thai PromptPay EMVCo QR code payload.
 *
 * @param {string} target - PromptPay Mobile Phone (10 digits) or National/Tax ID (13 digits)
 * @param {number|string|null} amount - Transaction amount in THB (optional, if omitted or 0 generates Static QR)
 * @returns {string|null} - Standard EMVCo string payload or null if target is invalid
 */
export function generatePromptPayPayload(target, amount) {
  const cleanTarget = sanitizeTarget(target);
  if (!cleanTarget) return null;

  const targetType =
    cleanTarget.length >= 13 ? '02' : '01'; // 01 = Mobile, 02 = Tax ID / National ID

  const formattedTarget = formatTargetForPayload(cleanTarget);

  const numAmount = parseFloat(amount);
  const hasAmount = !isNaN(numAmount) && numAmount > 0;

  // Merchant Information Template (Tag 29)
  const tag29Value =
    f('00', 'A000000677010111') + // PromptPay AID
    f(targetType, formattedTarget);

  const segments = [
    f('00', '01'), // Payload Format Indicator
    f('01', hasAmount ? '12' : '11'), // Point of Initiation: 12 = Dynamic, 11 = Static
    f('29', tag29Value), // Merchant Account Information
    f('58', 'TH'), // Country Code
    f('53', '764'), // Currency THB
  ];

  if (hasAmount) {
    segments.push(f('54', numAmount.toFixed(2))); // Transaction Amount
  }

  const rawData = segments.join('') + '6304';
  const checksum = crc16(rawData);

  return `${rawData}${checksum}`;
}

/**
 * Calculate Subtotal, Service Charge, VAT, and Grand Total with accurate rounding.
 *
 * @param {number} subtotalRaw
 * @param {number} vatRatePct - e.g. 7 for 7%
 * @param {number} serviceChargePct - e.g. 10 for 10%
 * @returns {{ subtotal: number, serviceCharge: number, vat: number, grandTotal: number }}
 */
export function calculateBillBreakdown(subtotalRaw, vatRatePct = 0, serviceChargePct = 0) {
  const subtotal = Math.max(0, parseFloat(subtotalRaw) || 0);
  const vatRate = Math.max(0, parseFloat(vatRatePct) || 0);
  const serviceRate = Math.max(0, parseFloat(serviceChargePct) || 0);

  // Service charge is typically calculated on subtotal
  const serviceCharge = serviceRate > 0 ? Math.round(subtotal * (serviceRate / 100) * 100) / 100 : 0;

  // VAT is calculated on (subtotal + service charge)
  const taxableAmount = subtotal + serviceCharge;
  const vat = vatRate > 0 ? Math.round(taxableAmount * (vatRate / 100) * 100) / 100 : 0;

  const grandTotal = Math.round((subtotal + serviceCharge + vat) * 100) / 100;

  return {
    subtotal,
    serviceCharge,
    vat,
    grandTotal,
  };
}
