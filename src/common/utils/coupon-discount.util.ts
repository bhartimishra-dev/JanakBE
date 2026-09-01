import { CouponDiscountType } from '../enums/coupon-discount-type.enum';

export interface CouponDiscountInput {
  discountType: CouponDiscountType;
  discountValue?: number | null;
  /** Legacy field from before discountType existed; used as a fallback for old PERCENTAGE coupons. */
  discountPercent?: number | null;
  /** Caps the computed amount for PERCENTAGE coupons (and a FREE_ITEM's percentage add-on). */
  maxDiscountAmount?: number | null;
  /** Optional flat/percentage discount stacked on top of a FREE_ITEM coupon. */
  additionalDiscountType?: CouponDiscountType | null;
  minimumOrderValue?: number | null;
}

function applyCap(amount: number, maxDiscountAmount?: number | null): number {
  return maxDiscountAmount != null ? Math.min(amount, Number(maxDiscountAmount)) : amount;
}

/**
 * Computes the monetary discount a coupon applies to a cart/order subtotal.
 * The free item itself (FREE_ITEM coupons) is fulfilled as a free line item
 * elsewhere, not as a subtotal reduction — only its optional stacked
 * additionalDiscountType contributes here. Returns 0 if the subtotal doesn't
 * meet the coupon's minimum order value.
 */
export function calculateCouponDiscount(
  coupon: CouponDiscountInput | null | undefined,
  subtotal: number,
): number {
  if (!coupon) return 0;
  if (coupon.minimumOrderValue != null && subtotal < Number(coupon.minimumOrderValue)) return 0;

  if (coupon.discountType === CouponDiscountType.FLAT) {
    return Math.min(Number(coupon.discountValue ?? 0), subtotal);
  }
  if (coupon.discountType === CouponDiscountType.PERCENTAGE) {
    const percent = coupon.discountValue ?? coupon.discountPercent ?? 0;
    const amount = Math.round(subtotal * (Number(percent) / 100));
    return applyCap(amount, coupon.maxDiscountAmount);
  }
  if (coupon.discountType === CouponDiscountType.FREE_ITEM) {
    if (coupon.additionalDiscountType === CouponDiscountType.FLAT) {
      return Math.min(Number(coupon.discountValue ?? 0), subtotal);
    }
    if (coupon.additionalDiscountType === CouponDiscountType.PERCENTAGE) {
      const amount = Math.round(subtotal * (Number(coupon.discountValue ?? 0) / 100));
      return applyCap(amount, coupon.maxDiscountAmount);
    }
    return 0;
  }
  return 0;
}
