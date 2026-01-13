import {
  norm,
  normalizePriceNumber,
  computeDiscount,
  pickBestTitle,
  addAffiliateTag,
} from "../scrapers/helpers.js";

export function processDeals(collectedItems, limit, onlyDiscounts) {
  const processed = collectedItems.slice(0, limit).map((it) => {
    const title = pickBestTitle({
      imgAlt: it.imgAlt,
      linkTitle: it.linkTitle,
      h2Span: it.h2Span,
      h2Text: it.h2Text,
    });
    const currentNum = normalizePriceNumber(it.priceRaw);
    const oldNum = normalizePriceNumber(it.oldPriceRaw);
    const discount = computeDiscount(oldNum, currentNum);
    const affiliateTag = process.env.AMAZON_TAG;
    const linkWithTag = addAffiliateTag(it.link, affiliateTag);
    return {
      asin: it.asin || null,
      title: title ? norm(title) : null,
      price: currentNum != null ? currentNum.toFixed(2) : null,
      old_price: oldNum != null ? oldNum.toFixed(2) : null,
      discount: discount,
      link: linkWithTag,
      image: it.image,
      source: "amazon",
      posted: "no",
    };
  });

  return onlyDiscounts ? processed.filter((it) => it.discount) : processed;
}
